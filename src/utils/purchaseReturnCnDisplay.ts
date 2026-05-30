import { purchaseCnAppliedToBillAmount } from "@/utils/purchaseBillSettlement";

export type PurchaseReturnCnRow = {
  credit_status?: string | null;
  linked_bill_id?: string | null;
  original_bill_number?: string | null;
  credit_available_balance?: number | null;
  net_amount?: number | null;
};

export type LinkedBillLabel = {
  software_bill_no?: string | null;
  supplier_invoice_no?: string | null;
};

export function linkedBillDisplayNo(bill?: LinkedBillLabel | null): string {
  if (!bill) return "";
  return bill.supplier_invoice_no || bill.software_bill_no || "";
}

/** Orig. bill column: when adjusted to a bill, show that bill number. */
export function formatPurchaseReturnOrigBill(
  row: PurchaseReturnCnRow,
  linkedBill?: LinkedBillLabel | null
): string {
  const linked = linkedBillDisplayNo(linkedBill);
  if (row.credit_status === "adjusted" && linked) return linked;
  return row.original_bill_number || "N/A";
}

export function formatPurchaseReturnCreditStatusLabel(
  row: PurchaseReturnCnRow,
  linkedBill?: LinkedBillLabel | null,
  cnVoucherAmount?: number | null
): string {
  const st = row.credit_status || "";
  const linked = linkedBillDisplayNo(linkedBill);
  if (st === "adjusted" && linked) {
    const applied =
      cnVoucherAmount != null
        ? purchaseCnAppliedToBillAmount(cnVoucherAmount, row.credit_available_balance)
        : Number(row.net_amount ?? 0);
    return `Adj. → ${linked} (₹${Math.round(applied).toLocaleString("en-IN")})`;
  }
  if (st === "adjusted_outstanding") return "Adj. (O/S)";
  if (st === "adjusted") return linked ? `Adj. → ${linked}` : "Adjusted";
  if (st === "refunded") return "Refunded";
  if (st === "pending" || !st) return "Pending";
  return st;
}
