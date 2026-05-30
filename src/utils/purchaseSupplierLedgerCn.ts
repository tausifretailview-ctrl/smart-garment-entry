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
 * Ledger debit for a supplier CN voucher.
 * When CN is applied to a bill, only the unapplied remainder (credit_available_balance) hits the ledger;
 * the applied portion is already reflected in the bill's paid_amount.
 */
export function supplierCreditNoteLedgerDebit(
  cnVoucherAmount: number,
  linkedReturns: PurchaseReturnCnLink[]
): number {
  const gross = Number(cnVoucherAmount) || 0;
  const onBill = linkedReturns.filter(
    (pr) => pr.credit_status === "adjusted" && pr.linked_bill_id
  );
  if (onBill.length === 0) return gross;

  if (onBill.every((pr) => pr.credit_available_balance != null)) {
    return onBill.reduce((s, pr) => s + (Number(pr.credit_available_balance) || 0), 0);
  }
  return 0;
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
