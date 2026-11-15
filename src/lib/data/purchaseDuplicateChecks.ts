import { supabase } from "@/integrations/supabase/client";
import { incrementSupplierInvoiceNumber } from "@/utils/purchaseSupplierInvoiceNumber";

/**
 * Purchase Entry's duplicate-bill checks before a save (Plan Phase 4, S4 + D6).
 * "Active" = not in the recycle bin and not cancelled (a cancelled bill's number may be reused).
 */
const ACTIVE_BILL = "is_cancelled.is.null,is_cancelled.eq.false";

export type BillWithInvoiceNo = { id: string; software_bill_no: string | null; supplier_invoice_no: string | null };

/** An active bill of this supplier that already has this supplier invoice number (other than `excludeBillId`). */
export async function findActiveBillWithSupplierInvoice(
  orgId: string,
  supplierId: string,
  invoiceNo: string,
  excludeBillId?: string | null,
): Promise<BillWithInvoiceNo | null> {
  let query = supabase
    .from("purchase_bills")
    .select("id, software_bill_no, supplier_invoice_no")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId)
    .eq("supplier_invoice_no", invoiceNo)
    .is("deleted_at", null)
    .or(ACTIVE_BILL)
    .limit(1);
  if (excludeBillId) query = query.neq("id", excludeBillId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? [])[0] as BillWithInvoiceNo | undefined) ?? null;
}

export type BillTotals = { id: string; software_bill_no: string | null; total_qty: number | null; net_amount: number | null };

/** Qty and amount of one bill of this shop (to tell "already saved" from a real clash). */
export async function fetchPurchaseBillTotals(orgId: string, billId: string): Promise<BillTotals | null> {
  const { data, error } = await supabase
    .from("purchase_bills")
    .select("id, software_bill_no, total_qty, net_amount")
    .eq("id", billId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return (data as BillTotals | null) ?? null;
}

/**
 * The first number from `start` on (start, start+1, …, at most `maxTries`) that no active bill
 * of this supplier uses. One read of the supplier's numbers instead of one request per try
 * (the save used to make up to 50 round trips here).
 */
export async function nextFreeSupplierInvoiceNumber(
  orgId: string,
  supplierId: string,
  start: string,
  maxTries = 50,
): Promise<string> {
  const { data, error } = await supabase
    .from("purchase_bills")
    .select("supplier_invoice_no")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId)
    .is("deleted_at", null)
    .or(ACTIVE_BILL)
    .not("supplier_invoice_no", "is", null);
  if (error) throw error;
  const used = new Set((data ?? []).map((r) => String((r as { supplier_invoice_no: unknown }).supplier_invoice_no).trim()));
  let candidate = start;
  for (let i = 0; i < maxTries && used.has(candidate); i++) candidate = incrementSupplierInvoiceNumber(candidate);
  return candidate;
}

export type SameDayBill = {
  id: string;
  software_bill_no: string | null;
  supplier_name: string | null;
  supplier_invoice_no: string | null;
  bill_date: string | null;
  net_amount: number | null;
  created_at: string;
  total_qty: number | null;
};

/** This supplier's active bills on that date, newest 20. */
export async function fetchSameDaySupplierBills(orgId: string, supplierId: string, billDateYmd: string): Promise<SameDayBill[]> {
  const { data, error } = await supabase
    .from("purchase_bills")
    .select("id, software_bill_no, supplier_name, supplier_invoice_no, bill_date, net_amount, created_at, total_qty")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId)
    .eq("bill_date", billDateYmd)
    .is("deleted_at", null)
    .or(ACTIVE_BILL)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as SameDayBill[];
}

/**
 * The same-day bill this save probably duplicates, with the reason to show, or null.
 * Blocks when qty AND amount match, or when one of them matches a bill saved in the last
 * 60 minutes — unless both bills carry different supplier invoice numbers (a real new bill).
 */
export function findLikelyDuplicateBill(
  sameDayBills: SameDayBill[],
  current: { filledQty: number; netAmount: number; supplierInvoiceNo: string },
  now: number = Date.now(),
): { bill: SameDayBill; reason: string } | null {
  if (sameDayBills.length === 0) return null;
  const { filledQty, netAmount } = current;
  const qtyOf = (b: SameDayBill) => b.total_qty != null && Math.abs(Number(b.total_qty) - filledQty) < 0.001;
  const amtOf = (b: SameDayBill) => Math.abs(Number(b.net_amount || 0) - netAmount) < 1;

  const match = sameDayBills.find((b) => qtyOf(b) || amtOf(b)) || sameDayBills[0];
  const matchedQty = qtyOf(match);
  const matchedAmt = amtOf(match);
  const minsAgo = (now - new Date(match.created_at).getTime()) / 60000;
  const recent = minsAgo < 60;
  if (!((matchedQty && matchedAmt) || (recent && (matchedQty || matchedAmt)))) return null;

  const currentInv = current.supplierInvoiceNo.trim();
  const matchInv = String(match.supplier_invoice_no || "").trim();
  if (currentInv && matchInv && currentInv !== matchInv) return null;

  const amount = `₹${Math.round(netAmount).toLocaleString("en-IN")}`;
  const reason =
    matchedQty && matchedAmt
      ? `Same supplier, same date, same total qty (${filledQty}) and net amount (${amount}).`
      : matchedQty
        ? `Same supplier, same date, same total qty (${filledQty}) — saved ${Math.round(minsAgo)} min ago.`
        : `Same supplier, same date, same net amount (${amount}) — saved ${Math.round(minsAgo)} min ago.`;
  return { bill: match, reason };
}
