import { purchaseCnAppliedToBillAmount } from "@/utils/purchaseBillSettlement";
import { linkedBillDisplayNo, type LinkedBillLabel } from "@/utils/purchaseReturnCnDisplay";

export type PurchaseReturnCnLink = {
  credit_note_id?: string | null;
  credit_status?: string | null;
  linked_bill_id?: string | null;
  credit_available_balance?: number | null;
  return_number?: string | null;
};

export type CnVoucherRow = {
  id: string;
  total_amount?: number | null;
  description?: string | null;
  voucher_number?: string | null;
};

/**
 * Ledger debit for a supplier CN voucher: always the full voucher amount.
 * When the CN is applied to a bill, the applied part also sits in the bill's paid_amount;
 * the ledger and balance strip it from "Payment at purchase" / Paid instead
 * (buildPurchaseReturnAdjustByBillId), so the return shows once, as a CN, not as cash.
 */
export function supplierCreditNoteLedgerDebit(
  cnVoucherAmount: number,
  _linkedReturns: PurchaseReturnCnLink[]
): number {
  return Math.max(0, Number(cnVoucherAmount) || 0);
}

export function supplierCreditNoteLedgerDescriptionFromCn(
  cn: CnVoucherRow,
  linkedReturns: PurchaseReturnCnLink[],
  billById: Map<string, LinkedBillLabel>
): string {
  const onBill = linkedReturns.filter(
    (pr) => pr.credit_status === "adjusted" && pr.linked_bill_id
  );
  if (onBill.length === 0) {
    return cn.description || "Supplier Credit Note (Purchase Return)";
  }
  const billLabels = onBill
    .map((pr) => linkedBillDisplayNo(billById.get(pr.linked_bill_id!)))
    .filter(Boolean);
  const unique = [...new Set(billLabels)];
  const gross = Number(cn.total_amount ?? 0) || 0;
  const applied = onBill.reduce((sum, pr) => {
    return (
      sum +
      purchaseCnAppliedToBillAmount(gross, pr.credit_available_balance)
    );
  }, 0);
  if (unique.length > 0) {
    return `CN adjusted against Bill ${unique.join(", ")} (₹${applied.toFixed(2)} applied on bill)`;
  }
  return cn.description || "Supplier Credit Note (Purchase Return)";
}
