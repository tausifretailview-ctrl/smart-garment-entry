/**
 * Issuance voucher for directly-issued customer credit notes.
 *
 * Background: credit notes created by `useCreditNotes.createCreditNote`
 * (POS "issue leftover as CN" + auto-CN for negative S/R-adjusted bills)
 * have no `sale_returns` row, so balance paths that detect CNs via the
 * `sale_returns.credit_note_id` join never see them. Writing one
 * `voucher_entries` row (type `credit_note`, ref `customer`) puts them on
 * the RPC's `credit_note_vouchers` path instead — the same input the
 * canonical outstanding, audit bundle, and reconciliation already consume.
 *
 * Deliberately OMITTED from the row (trigger semantics depend on it):
 * - `payment_method`: must stay clear of CN-adjust / advance / cash
 *   meanings (`trg_cn_adjust_sync`, advance guards, settlement sync all
 *   key off it and ignore rows without it).
 * - `source_document_id`: means "the CN this voucher *applies*"
 *   (adjustment-application semantics owned by the adjust RPC + trigger);
 *   an issuance voucher applies nothing, so it stays NULL.
 */

export interface CreditNoteIssuanceVoucherInput {
  organizationId: string;
  voucherNumber: string;
  customerId: string;
  creditNoteNumber: string;
  saleNumber?: string | null;
  creditAmount: number;
  /** yyyy-mm-dd */
  voucherDate: string;
  createdBy?: string | null;
}

export function buildCreditNoteIssuanceVoucher(
  input: CreditNoteIssuanceVoucherInput,
): Record<string, unknown> | null {
  const amount = Math.round(Number(input.creditAmount) * 100) / 100;
  if (!input.organizationId || !input.customerId || !input.voucherNumber) return null;
  if (!(amount > 0.005)) return null;
  const saleRef = String(input.saleNumber || "").trim();
  return {
    organization_id: input.organizationId,
    voucher_number: input.voucherNumber,
    voucher_type: "credit_note",
    voucher_date: input.voucherDate,
    reference_type: "customer",
    reference_id: input.customerId,
    description:
      `Credit Note ${input.creditNoteNumber} issued` +
      (saleRef ? ` against invoice ${saleRef}` : "") +
      " (leftover change)",
    total_amount: amount,
    created_by: input.createdBy ?? null,
  };
}
