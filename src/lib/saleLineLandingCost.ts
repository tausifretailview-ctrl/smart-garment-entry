import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/data/fetchInIdBatches";

/**
 * Purchase rate and landing cost per piece for a Sale Bill line, from the product's latest
 * purchase line. Same rules as computePurchaseBillTotals (src/utils/excelImportUtils.ts):
 *  - the bill discount is shared across lines by line value (line_total, after line discount);
 *  - GST is on the line after that share (none on a DC purchase);
 *  - other charges and round-off are shared by line value too.
 * Landing cost = (line after bill discount + its share of charges) / qty, without GST and with.
 */
export type PurchaseLineForCost = {
  pur_price: number | null;
  qty: number | null;
  line_total: number | null;
  gst_per: number | null;
};

export type PurchaseBillForCost = {
  gross_amount: number | null;
  discount_amount: number | null;
  other_charges: number | null;
  round_off: number | null;
  is_dc_purchase?: boolean | null;
};

export type LandingCost = {
  purchaseRate: number;
  landingWithoutGst: number;
  landingWithGst: number;
};

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * @param billLinesTotal sum of line_total of all (not deleted) lines on the same bill.
 * Null when the line has no quantity or value to divide.
 */
export function landingCostFromPurchase(
  line: PurchaseLineForCost,
  bill: PurchaseBillForCost,
  billLinesTotal: number,
): LandingCost | null {
  const qty = n(line.qty);
  const lineTotal = n(line.line_total);
  if (qty <= 0 || lineTotal <= 0) return null;

  const linesTotal = n(billLinesTotal) > 0 ? n(billLinesTotal) : lineTotal;
  const share = Math.min(1, lineTotal / linesTotal);
  // gross_amount − discount_amount is the bill's taxable amount; what the lines add up to above
  // it is the bill-level discount.
  const taxableBill = n(bill.gross_amount) - n(bill.discount_amount);
  const billDiscount = Math.max(0, linesTotal - taxableBill);
  const taxableLine = lineTotal - billDiscount * share;
  const gst = bill.is_dc_purchase ? 0 : (taxableLine * n(line.gst_per)) / 100;
  const charges = (n(bill.other_charges) + n(bill.round_off)) * share;

  return {
    purchaseRate: round2(n(line.pur_price)),
    landingWithoutGst: round2((taxableLine + charges) / qty),
    landingWithGst: round2((taxableLine + gst + charges) / qty),
  };
}


export type SaleLineCostInfo =
  | ({ source: "purchase"; billNo: string; supplierName: string; billDate: string | null } & LandingCost)
  /** Never bought on a purchase bill (opening stock): only the product's purchase rate. */
  | { source: "product"; purchaseRate: number }
  | { source: "none" };

type PurchaseRow = PurchaseLineForCost & {
  created_at: string | null;
  bill_id: string;
  purchase_bills: PurchaseBillForCost & {
    software_bill_no: string | null;
    supplier_name: string | null;
    bill_date: string | null;
    created_at: string | null;
    is_cancelled: boolean | null;
  };
};

/** Latest first: bill date, then when the bill and the line were saved (as the Stock Report). */
export function pickLatestPurchaseLine<T extends { created_at: string | null; purchase_bills: { bill_date: string | null; created_at: string | null } }>(
  rows: T[],
): T | null {
  const key = (r: T) => [
    r.purchase_bills.bill_date || (r.purchase_bills.created_at || r.created_at || "").slice(0, 10),
    r.purchase_bills.created_at || r.created_at || "",
    r.created_at || "",
  ];
  let best: T | null = null;
  for (const r of rows) {
    if (!best) {
      best = r;
      continue;
    }
    const a = key(r);
    const b = key(best);
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      if (a[i] > b[i]) best = r;
      break;
    }
  }
  return best;
}

/** Read only when the user opens the cost pop-up on a Sale Bill line. */
export async function fetchSaleLineCost(organizationId: string, variantId: string): Promise<SaleLineCostInfo> {
  const { data, error } = await supabase
    .from("purchase_items")
    .select(
      "pur_price, qty, line_total, gst_per, created_at, bill_id, purchase_bills!inner(software_bill_no, supplier_name, bill_date, created_at, gross_amount, discount_amount, other_charges, round_off, is_dc_purchase, is_cancelled, organization_id, deleted_at)",
    )
    .eq("sku_id", variantId)
    .is("deleted_at", null)
    .eq("purchase_bills.organization_id", organizationId)
    .is("purchase_bills.deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  const rows = ((data ?? []) as unknown as PurchaseRow[]).filter((r) => r.purchase_bills && r.purchase_bills.is_cancelled !== true);
  const latest = pickLatestPurchaseLine(rows);

  if (latest) {
    const billLines = await fetchAllRows(() =>
      supabase.from("purchase_items").select("line_total").eq("bill_id", latest.bill_id).is("deleted_at", null).order("id"),
    );
    const billLinesTotal = billLines.reduce((s, r) => s + (Number((r as { line_total: number | null }).line_total) || 0), 0);
    const cost = landingCostFromPurchase(latest, latest.purchase_bills, billLinesTotal);
    if (cost) {
      return {
        source: "purchase",
        billNo: latest.purchase_bills.software_bill_no || "",
        supplierName: latest.purchase_bills.supplier_name || "",
        billDate: latest.purchase_bills.bill_date,
        ...cost,
      };
    }
  }

  const { data: variant, error: vErr } = await supabase
    .from("product_variants")
    .select("pur_price")
    .eq("id", variantId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (vErr) throw vErr;
  const rate = Number((variant as { pur_price?: number | null } | null)?.pur_price) || 0;
  return rate > 0 ? { source: "product", purchaseRate: round2(rate) } : { source: "none" };
}
