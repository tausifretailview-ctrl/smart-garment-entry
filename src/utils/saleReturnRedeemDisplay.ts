import type {
  CreditNoteSrRedeemedBill,
  CreditNoteSrRegisterRow,
} from "@/utils/creditNoteSrRegister";

/**
 * Copy the CN / S-R register redeem and balance onto a Sale Return Management row.
 * Remaining stays the register figure (allocated credit-note FIFO).
 */
export function saleReturnRedeemFromRegister<
  T extends {
    id: string;
    actual_adjusted_amt?: number;
    remaining_cn_amt?: number;
    adjusted_sale_number?: string | null;
    adjusted_sale_type?: string | null;
    adjusted_sale_date?: string | null;
  },
>(
  ret: T,
  row: CreditNoteSrRegisterRow | undefined,
): T & { redeemed_bills: CreditNoteSrRedeemedBill[] } {
  if (!row) return { ...ret, redeemed_bills: [] };
  const kind = row.redeemedBills[0]?.billKind;
  return {
    ...ret,
    actual_adjusted_amt: row.appliedAmount,
    remaining_cn_amt: row.remainingAmount,
    adjusted_sale_number:
      row.redeemedBills.map((bill) => bill.saleNumber).filter(Boolean).join(", ") || null,
    adjusted_sale_type: kind === "POS" ? "pos" : kind === "Sale" ? "sale_invoice" : null,
    adjusted_sale_date: row.cnAppliedDate,
    redeemed_bills: row.redeemedBills,
  };
}
