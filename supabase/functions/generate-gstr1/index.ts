import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    // --- Fetch sales with customer GST ---
    const toDateEnd = `${to_date}T23:59:59.999Z`;
    const { data: sales, error: salesErr } = await admin
      .from("sales")
      .select(
        `id, sale_number, sale_date, customer_name, net_amount, gross_amount, discount_amount,
         customer_id, customers(gst_number, address)`
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
      const { data: items } = await admin
        .from("sale_items")
        .select("sale_id, product_name, hsn_code, quantity, unit_price, mrp, gst_percent, line_total, discount_percent")
        .in("sale_id", batch)
        .is("deleted_at", null);
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
    // B2CS grouped by GST rate
    const b2csMap = new Map<number, { rt: number; txval: number; camt: number; samt: number; iamt: number }>();
    // HSN map
    const hsnMap = new Map<string, any>();

    (sales || []).forEach((sale: any) => {
      const customerGSTIN = sale.customers?.gst_number || "";
      const items = itemsBySale.get(sale.id) || [];
      const isB2B = customerGSTIN && customerGSTIN.length === 15;

      // Build invoice items grouped by GST rate
      const rateGrouped = new Map<number, { txval: number; camt: number; samt: number; iamt: number }>();

      items.forEach((item: any) => {
        const rate = item.gst_percent || 0;
        const lineTotal = item.line_total || 0;
        const taxableValue = lineTotal / (1 + rate / 100);
        const gstAmt = lineTotal - taxableValue;
        const cgst = gstAmt / 2;
        const sgst = gstAmt / 2;

        const rg = rateGrouped.get(rate) || { txval: 0, camt: 0, samt: 0, iamt: 0 };
        rg.txval += taxableValue;
        rg.camt += cgst;
        rg.samt += sgst;
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
              iamt: 0,
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
          pos: (settings?.state || "").substring(0, 2),
          rchrg: "N",
          inv_typ: "R",
          itms: invItems,
        });
        b2bMap.set(customerGSTIN, entry);
      } else {
        // Aggregate into B2CS by rate
        rateGrouped.forEach((det, rate) => {
          const existing = b2csMap.get(rate) || { rt: rate, txval: 0, camt: 0, samt: 0, iamt: 0 };
          existing.txval += det.txval;
          existing.camt += det.camt;
          existing.samt += det.samt;
          b2csMap.set(rate, existing);
        });
      }
    });

    // Round B2CS values
    const b2cs = Array.from(b2csMap.values()).map((r) => ({
      sply_ty: "INTRA",
      rt: r.rt,
      typ: "OE",
      txval: Math.round(r.txval * 100) / 100,
      iamt: 0,
      camt: Math.round(r.camt * 100) / 100,
      samt: Math.round(r.samt * 100) / 100,
      csamt: 0,
    }));

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
      b2b: Array.from(b2bMap.values()),
      b2cs,
      hsn: { data: hsnArr },
    };

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
