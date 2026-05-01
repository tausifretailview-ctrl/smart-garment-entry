import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const extractStateCode = (...candidates: Array<string | null | undefined>): string => {
  for (const raw of candidates) {
    const value = (raw || "").trim();
    if (!value) continue;
    const direct = value.match(/^(\d{2})$/);
    if (direct) return direct[1];
    const posLike = value.match(/^(\d{2})-/);
    if (posLike) return posLike[1];
    const inAddress = value.match(/\b(\d{2})\b/);
    if (inAddress) return inAddress[1];
  }
  return "";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    // --- Body ---
    const { organization_id, from_date, to_date } = await req.json();
    if (!organization_id || !from_date || !to_date) {
      return new Response(
        JSON.stringify({ error: "organization_id, from_date, to_date are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Service client for data queries
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user belongs to org
    const { data: membership } = await admin
      .from("organization_members")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Fetch org settings ---
    const { data: settings } = await admin
      .from("settings")
      .select("gst_number, business_name, address, state")
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (!settings?.gst_number || String(settings.gst_number).trim().length !== 15) {
      throw new Error("Organization GSTIN is missing or invalid. Configure GSTIN in Settings before generating GSTR-1.");
    }

    // --- Fetch sales with customer GST ---
    const toDateEnd = `${to_date}T23:59:59.999Z`;
    const { data: sales, error: salesErr } = await admin
      .from("sales")
      .select(
        `id, sale_number, sale_date, customer_name, net_amount, gross_amount, discount_amount,
         customer_id, customer_address, pos, customers(gst_number, address)`
      )
      .eq("organization_id", organization_id)
      .is("deleted_at", null)
      .eq("is_cancelled", false)
      .gte("sale_date", from_date)
      .lte("sale_date", toDateEnd)
      .order("sale_date", { ascending: true });

    if (salesErr) throw salesErr;

    // --- Fetch sale items (paginated) ---
    const saleIds = (sales || []).map((s: any) => s.id);
    let allItems: any[] = [];
    const PAGE = 500;
    for (let i = 0; i < saleIds.length; i += PAGE) {
      const batch = saleIds.slice(i, i + PAGE);
      const { data: items, error: itemsErr } = await admin
        .from("sale_items")
        .select("sale_id, product_name, hsn_code, quantity, unit_price, gst_percent, line_total, discount_percent, is_dc_item")
        .in("sale_id", batch)
        .is("deleted_at", null);
      if (itemsErr) throw new Error(`Failed to fetch sale items: ${itemsErr.message}`);
      if (items) allItems = allItems.concat(items);
    }

    // Group items by sale
    const itemsBySale = new Map<string, any[]>();
    allItems.forEach((it) => {
      const arr = itemsBySale.get(it.sale_id) || [];
      arr.push(it);
      itemsBySale.set(it.sale_id, arr);
    });

    // --- Build GSTR-1 JSON ---
    // Filing period e.g. "032026" for March 2026
    const fpDate = new Date(from_date);
    const fp = String(fpDate.getMonth() + 1).padStart(2, "0") + String(fpDate.getFullYear());

    // B2B grouped by customer GSTIN
    const b2bMap = new Map<string, any>();
    // B2CS grouped by supply type + GST rate
    const b2csMap = new Map<string, { sply_ty: "INTRA" | "INTER"; rt: number; txval: number; camt: number; samt: number; iamt: number }>();
    // B2CL grouped by place-of-supply state code
    const b2clMap = new Map<string, { pos: string; inv: any[] }>();
    // HSN map
    const hsnMap = new Map<string, any>();

    const orgStateCode = extractStateCode(settings?.gst_number?.slice(0, 2), settings?.state);

    (sales || []).forEach((sale: any) => {
      const customerGSTIN = sale.customers?.gst_number || "";
      const items = itemsBySale.get(sale.id) || [];
      const isB2B = customerGSTIN && customerGSTIN.length === 15;
      const customerStateCode = extractStateCode(
        customerGSTIN ? String(customerGSTIN).slice(0, 2) : "",
        sale.pos,
        sale.customer_address,
        sale.customers?.address
      );
      const isInterState = !!orgStateCode && !!customerStateCode && customerStateCode !== orgStateCode;

      // Build invoice items grouped by GST rate
      const rateGrouped = new Map<number, { txval: number; camt: number; samt: number; iamt: number }>();

      items.forEach((item: any) => {
        if (item.is_dc_item) return; // DC items excluded from GST reporting
        const rate = item.gst_percent || 0;
        const lineTotal = item.line_total || 0;
        const taxableValue = lineTotal / (1 + rate / 100);
        const gstAmt = lineTotal - taxableValue;
        const iamt = isInterState ? gstAmt : 0;
        const cgst = isInterState ? 0 : gstAmt / 2;
        const sgst = isInterState ? 0 : gstAmt / 2;

        const rg = rateGrouped.get(rate) || { txval: 0, camt: 0, samt: 0, iamt: 0 };
        rg.txval += taxableValue;
        rg.camt += cgst;
        rg.samt += sgst;
        rg.iamt += iamt;
        rateGrouped.set(rate, rg);

        // HSN
        const hsn = item.hsn_code || "0000";
        const h = hsnMap.get(hsn) || {
          num: 0, hsn_sc: hsn, desc: item.product_name || "", uqc: "NOS",
          qty: 0, val: 0, txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0,
        };
        h.qty += item.quantity || 1;
        h.val += lineTotal;
        h.txval += taxableValue;
        h.iamt += iamt;
        h.camt += cgst;
        h.samt += sgst;
        hsnMap.set(hsn, h);
      });

      const saleDate = new Date(sale.sale_date);
      const idt = `${String(saleDate.getDate()).padStart(2, "0")}-${String(saleDate.getMonth() + 1).padStart(2, "0")}-${saleDate.getFullYear()}`;

      if (isB2B) {
        const entry = b2bMap.get(customerGSTIN) || { ctin: customerGSTIN, inv: [] };
        const invItems: any[] = [];
        let slNo = 1;
        rateGrouped.forEach((det, rate) => {
          invItems.push({
            num: slNo++,
            itm_det: {
              rt: rate,
              txval: Math.round(det.txval * 100) / 100,
              iamt: Math.round(det.iamt * 100) / 100,
              camt: Math.round(det.camt * 100) / 100,
              samt: Math.round(det.samt * 100) / 100,
              csamt: 0,
            },
          });
        });

        entry.inv.push({
          inum: sale.sale_number,
          idt,
          val: sale.net_amount,
          pos: customerStateCode || orgStateCode || "",
          rchrg: "N",
          inv_typ: "R",
          itms: invItems,
        });
        b2bMap.set(customerGSTIN, entry);
      } else {
        // Inter-state non-B2B invoices above 2.5L are B2CL (invoice-wise)
        if (isInterState && Number(sale.net_amount || 0) > 250000) {
          const pos = customerStateCode || orgStateCode || "";
          const bucket = b2clMap.get(pos) || { pos, inv: [] as any[] };
          const invItems: any[] = [];
          let slNo = 1;
          rateGrouped.forEach((det, rate) => {
            invItems.push({
              num: slNo++,
              itm_det: {
                rt: rate,
                txval: Math.round(det.txval * 100) / 100,
                iamt: Math.round(det.iamt * 100) / 100,
                camt: Math.round(det.camt * 100) / 100,
                samt: Math.round(det.samt * 100) / 100,
                csamt: 0,
              },
            });
          });
          bucket.inv.push({
            inum: sale.sale_number,
            idt,
            val: sale.net_amount,
            pos,
            inv_typ: "R",
            itms: invItems,
          });
          b2clMap.set(pos, bucket);
          return;
        }

        // Aggregate into B2CS by rate and supply type
        rateGrouped.forEach((det, rate) => {
          const sply_ty = isInterState ? "INTER" : "INTRA";
          const key = `${sply_ty}-${rate}`;
          const existing = b2csMap.get(key) || { sply_ty, rt: rate, txval: 0, camt: 0, samt: 0, iamt: 0 };
          existing.txval += det.txval;
          existing.camt += det.camt;
          existing.samt += det.samt;
          existing.iamt += det.iamt;
          b2csMap.set(key, existing);
        });
      }
    });

    // Round B2CS values
    const b2cs = Array.from(b2csMap.values()).map((r) => ({
      sply_ty: r.sply_ty,
      rt: r.rt,
      typ: "OE",
      txval: Math.round(r.txval * 100) / 100,
      iamt: Math.round(r.iamt * 100) / 100,
      camt: Math.round(r.camt * 100) / 100,
      samt: Math.round(r.samt * 100) / 100,
      csamt: 0,
    }));

    const b2cl = Array.from(b2clMap.values());
    const b2bArr = Array.from(b2bMap.values());

    // Number HSN rows
    let hsnIdx = 1;
    const hsnArr = Array.from(hsnMap.values()).map((h) => ({
      ...h,
      num: hsnIdx++,
      val: Math.round(h.val * 100) / 100,
      txval: Math.round(h.txval * 100) / 100,
      camt: Math.round(h.camt * 100) / 100,
      samt: Math.round(h.samt * 100) / 100,
    }));

    const gstr1 = {
      gstin: settings?.gst_number || "",
      fp,
      b2b: b2bArr,
      b2cl,
      b2cs,
      hsn: { data: hsnArr },
    };

    const totalB2B = b2bArr.reduce((sum, c) => sum + c.inv.reduce((s: number, i: any) => s + Number(i.val || 0), 0), 0);
    const totalB2CS = b2cs.reduce((sum, r) => sum + Number(r.txval || 0) + Number(r.camt || 0) + Number(r.samt || 0) + Number(r.iamt || 0), 0);
    const totalB2CL = b2cl.reduce((sum, c) => sum + c.inv.reduce((s: number, i: any) => s + Number(i.val || 0), 0), 0);
    const totalSalesAmount = (sales || []).reduce((sum, s: any) => sum + (Number(s.net_amount) || 0), 0);

    const validation = {
      gstin_present: !!gstr1.gstin && gstr1.gstin.length === 15,
      b2b_invoices_with_items: b2bArr.every((c) => c.inv.every((i: any) => (i.itms || []).length > 0)),
      has_data: totalB2B + totalB2CS + totalB2CL > 0 || totalSalesAmount === 0,
      totals_match: Math.abs((totalB2B + totalB2CS + totalB2CL) - totalSalesAmount) < 100,
    };

    if (!validation.gstin_present || !validation.b2b_invoices_with_items || !validation.has_data) {
      return new Response(JSON.stringify({
        error: "GSTR-1 generation incomplete",
        validation,
        details: "GSTIN missing or B2B invoices have no items or no data — check organization settings and sale_items records.",
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fileName = `GSTR1_${from_date}_${to_date}.json`;

    return new Response(JSON.stringify(gstr1, null, 2), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (err: any) {
    console.error("generate-gstr1 error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
