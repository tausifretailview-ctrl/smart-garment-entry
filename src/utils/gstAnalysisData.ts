/**
 * Loads one period of GST documents for the GST Analysis page.
 *
 * Every id list goes out 200 at a time (500 UUIDs in one `.in()` is over the gateway URL
 * limit) and every list is paged past PostgREST's 1000-row cap.
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchAllSaleItems } from "@/utils/fetchAllRows";
import { allDcDocumentIds, isMissingDcColumnError, saleReturnAmountsWithoutDc, withoutDcLines } from "@/utils/gstDcExclusion";
import {
  normalizeGstTaxType,
  resolvePosDefaultTaxType,
  resolveSaleDefaultTaxType,
  type GstTaxType,
  type SaleSettingsTaxDefaults,
} from "@/utils/gstRegisterUtils";
import {
  hasValidGstinLength,
  purchaseDocTaxes,
  saleDocTaxes,
  saleReturnDocTaxes,
  type GstDocRow,
} from "@/utils/gstAnalysis";

const db = supabase as any;
const PAGE = 1000;
const ID_BATCH = 200;

async function allPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

async function rowsByIds(table: string, column: string, ids: string[], select: string): Promise<any[]> {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_BATCH) batches.push(ids.slice(i, i + ID_BATCH));
  const results = await Promise.all(
    batches.map((batch) =>
      allPages<any>((from, to) =>
        db.from(table).select(select).in(column, batch).is("deleted_at", null).order("id").range(from, to),
      ),
    ),
  );
  return results.flat();
}

/** Bill time (timestamptz) as the IST calendar day. */
function istYmd(value: string | null | undefined): string {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return String(value || "").slice(0, 10);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function groupBy<T>(rows: readonly T[], key: (r: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  return map;
}

export type GstAnalysisData = {
  shopGstin: string;
  sales: GstDocRow[];
  saleReturns: GstDocRow[];
  purchases: GstDocRow[];
  purchaseReturns: GstDocRow[];
  /** DC bills / returns left out, for the note on the page. */
  dcLeftOut: { sales: number; saleReturns: number; purchases: number; purchaseReturns: number };
};

export async function loadGstAnalysis(orgId: string, fromYmd: string, toYmd: string): Promise<GstAnalysisData> {
  const { data: settings } = await db
    .from("settings")
    .select("gst_number, sale_settings")
    .eq("organization_id", orgId)
    .maybeSingle();
  const shopGstin = String(settings?.gst_number || "").trim().toUpperCase();
  const saleSettings = (settings?.sale_settings || null) as SaleSettingsTaxDefaults | null;

  const saleTaxType = (taxType: string | null | undefined, saleType: string | null | undefined): GstTaxType => {
    if (String(taxType ?? "").trim()) return normalizeGstTaxType(taxType);
    return String(saleType || "").toLowerCase() === "pos"
      ? resolvePosDefaultTaxType(saleSettings)
      : resolveSaleDefaultTaxType(saleSettings);
  };

  const [salesRows, saleReturnRows, purchaseRows, purchaseReturnRows, dcPurchaseCount, dcPurchaseReturnCount] =
    await Promise.all([
      allPages<any>((from, to) =>
        db
          .from("sales")
          .select("id, sale_number, sale_date, sale_type, customer_name, net_amount, tax_type, customers(gst_number)")
          .eq("organization_id", orgId)
          .is("deleted_at", null)
          .eq("is_cancelled", false)
          .gte("net_amount", 0)
          .gte("sale_date", `${fromYmd}T00:00:00.000+05:30`)
          .lte("sale_date", `${toYmd}T23:59:59.999+05:30`)
          .order("sale_date", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      ),
      allPages<any>((from, to) =>
        db
          .from("sale_returns")
          .select("id, return_number, original_sale_number, return_date, customer_id, customer_name, net_amount, gst_amount, linked_sale_id")
          .eq("organization_id", orgId)
          .is("deleted_at", null)
          .gte("return_date", fromYmd)
          .lte("return_date", toYmd)
          .order("return_date", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      ),
      allPages<any>((from, to) =>
        db
          .from("purchase_bills")
          .select("id, supplier_invoice_no, software_bill_no, bill_date, supplier_name, gross_amount, discount_amount, net_amount, suppliers(gst_number)")
          .eq("organization_id", orgId)
          .is("deleted_at", null)
          .eq("is_cancelled", false)
          .or("is_dc_purchase.is.null,is_dc_purchase.eq.false")
          .gte("bill_date", fromYmd)
          .lte("bill_date", toYmd)
          .order("bill_date", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      ),
      allPages<any>((from, to) =>
        db
          .from("purchase_returns")
          .select("id, return_number, original_bill_number, return_date, supplier_name, gross_amount, discount_amount, net_amount, suppliers(gst_number)")
          .eq("organization_id", orgId)
          .is("deleted_at", null)
          .eq("is_dc", false)
          .gte("return_date", fromYmd)
          .lte("return_date", toYmd)
          .order("return_date", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      ),
      db
        .from("purchase_bills")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .eq("is_dc_purchase", true)
        .gte("bill_date", fromYmd)
        .lte("bill_date", toYmd)
        .then((r: { count: number | null }) => r.count || 0),
      db
        .from("purchase_returns")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .eq("is_dc", true)
        .gte("return_date", fromYmd)
        .lte("return_date", toYmd)
        .then((r: { count: number | null }) => r.count || 0),
    ]);

  // ── Sales ──
  const allSaleItems = salesRows.length ? await fetchAllSaleItems(salesRows.map((s) => String(s.id))) : [];
  const allDcSales = allDcDocumentIds(allSaleItems, "sale_id");
  const saleItemsBySale = groupBy(withoutDcLines(allSaleItems), (i: any) => String(i.sale_id));
  const sales = salesRows
    .filter((s) => !allDcSales.has(String(s.id)))
    .map((s) =>
      saleDocTaxes(
        {
          id: String(s.id),
          date: istYmd(s.sale_date),
          number: s.sale_number || "",
          party: s.customer_name || "",
          gstin: s.customers?.gst_number || "",
          billValue: Number(s.net_amount) || 0,
        },
        saleItemsBySale.get(String(s.id)) || [],
        saleTaxType(s.tax_type, s.sale_type),
        shopGstin,
      ),
    );

  // ── Sale returns (credit notes) ──
  const returnIds = saleReturnRows.map((r) => String(r.id));
  let returnLines: any[] = [];
  if (returnIds.length) {
    try {
      returnLines = await rowsByIds("sale_return_items", "return_id", returnIds, "return_id, gst_percent, line_total, is_dc_item");
    } catch (error) {
      if (!isMissingDcColumnError(error)) throw error;
      returnLines = await rowsByIds("sale_return_items", "return_id", returnIds, "return_id, gst_percent, line_total");
    }
  }
  const linkedIds = [...new Set(saleReturnRows.map((r) => r.linked_sale_id).filter(Boolean).map(String))];
  const linkedSales = linkedIds.length
    ? await (async () => {
        const out: any[] = [];
        for (let i = 0; i < linkedIds.length; i += ID_BATCH) {
          const { data, error } = await db
            .from("sales")
            .select("id, tax_type, sale_type")
            .eq("organization_id", orgId)
            .in("id", linkedIds.slice(i, i + ID_BATCH));
          if (error) throw error;
          out.push(...(data || []));
        }
        return out;
      })()
    : [];
  // sale_returns has no foreign key to customers, so a customers(...) embed fails: look GSTINs up by id.
  const returnCustomerIds = [...new Set(saleReturnRows.map((r) => r.customer_id).filter(Boolean).map(String))];
  const gstinByCustomer = new Map<string, string>();
  for (let i = 0; i < returnCustomerIds.length; i += ID_BATCH) {
    const { data, error } = await db
      .from("customers")
      .select("id, gst_number")
      .eq("organization_id", orgId)
      .in("id", returnCustomerIds.slice(i, i + ID_BATCH));
    if (error) throw error;
    for (const c of data || []) gstinByCustomer.set(String(c.id), String(c.gst_number || ""));
  }
  const linkedTaxType = new Map(linkedSales.map((s) => [String(s.id), saleTaxType(s.tax_type, s.sale_type)]));
  const linesByReturn = groupBy(returnLines, (l: any) => String(l.return_id));
  let dcSaleReturns = 0;
  const saleReturns: GstDocRow[] = [];
  for (const r of saleReturnRows) {
    const lines = linesByReturn.get(String(r.id)) || [];
    const amounts = saleReturnAmountsWithoutDc(r, lines);
    if (!amounts) {
      dcSaleReturns += 1;
      continue;
    }
    const taxType = (r.linked_sale_id && linkedTaxType.get(String(r.linked_sale_id))) || resolveSaleDefaultTaxType(saleSettings);
    saleReturns.push(
      saleReturnDocTaxes(
        {
          id: String(r.id),
          date: String(r.return_date || "").slice(0, 10),
          number: r.return_number || r.original_sale_number || "",
          party: r.customer_name || "",
          gstin: gstinByCustomer.get(String(r.customer_id)) || "",
          billValue: amounts.net_amount,
          headerGst: amounts.gst_amount,
        },
        withoutDcLines(lines),
        taxType,
        shopGstin,
      ),
    );
  }

  // ── Purchase bills ──
  const purchaseLines = purchaseRows.length
    ? await rowsByIds("purchase_items", "bill_id", purchaseRows.map((p) => String(p.id)), "bill_id, gst_per, line_total, is_dc_item")
    : [];
  const linesByBill = groupBy(withoutDcLines(purchaseLines), (l: any) => String(l.bill_id));
  const purchases = purchaseRows.map((p) =>
    purchaseDocTaxes(
      {
        id: String(p.id),
        date: String(p.bill_date || "").slice(0, 10),
        number: p.supplier_invoice_no || p.software_bill_no || "",
        party: p.supplier_name || "",
        gstin: p.suppliers?.gst_number || "",
        billValue: Number(p.net_amount) || 0,
        headerTaxable: (Number(p.gross_amount) || 0) - (Number(p.discount_amount) || 0),
      },
      linesByBill.get(String(p.id)) || [],
      shopGstin,
    ),
  );

  // ── Purchase returns (debit notes) ──
  const purchaseReturnLines = purchaseReturnRows.length
    ? await rowsByIds("purchase_return_items", "return_id", purchaseReturnRows.map((p) => String(p.id)), "return_id, gst_per, line_total")
    : [];
  const linesByPurchaseReturn = groupBy(purchaseReturnLines, (l: any) => String(l.return_id));
  const purchaseReturns = purchaseReturnRows.map((p) =>
    purchaseDocTaxes(
      {
        id: String(p.id),
        date: String(p.return_date || "").slice(0, 10),
        number: p.return_number || p.original_bill_number || "",
        party: p.supplier_name || "",
        gstin: p.suppliers?.gst_number || "",
        billValue: Number(p.net_amount) || 0,
        headerTaxable: (Number(p.gross_amount) || 0) - (Number(p.discount_amount) || 0),
      },
      linesByPurchaseReturn.get(String(p.id)) || [],
      shopGstin,
    ),
  );

  return {
    shopGstin: hasValidGstinLength(shopGstin) ? shopGstin : "",
    sales,
    saleReturns,
    purchases,
    purchaseReturns,
    dcLeftOut: {
      sales: allDcSales.size,
      saleReturns: dcSaleReturns,
      purchases: dcPurchaseCount,
      purchaseReturns: dcPurchaseReturnCount,
    },
  };
}
