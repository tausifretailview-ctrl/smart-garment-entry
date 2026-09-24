/**
 * Parent sale_returns row for a credit note issued by POS Mix "Issue C/Note"
 * or the auto credit note on a negative bill net.
 *
 * linked_sale_id stays null. The issuing bill already stores the applied
 * portion in sale_return_adjust. Linking this excess row to that bill makes
 * the dashboard treat the excess as absorbed (remaining 0) and hides Refund.
 *
 * credit_status pending puts the row in the Sale Return Dashboard refund
 * action and in getAvailableCN (pending / partially_adjusted /
 * adjusted_outstanding). partially_adjusted is the wrong state: nothing has
 * been applied to a later invoice yet.
 */

export const EXCHANGE_EXCESS_SALE_RETURN_TAG =
  "Exchange excess credit note";

export interface ExchangeExcessSaleReturnInput {
  organizationId: string;
  creditNoteId: string;
  creditNoteNumber: string;
  customerId?: string | null;
  customerName: string;
  /** Unused balance. New notes pass the face amount. */
  amount: number;
  /** yyyy-mm-dd */
  returnDate: string;
  returnNumber: string;
  /** Issuing invoice number. Stored as original_sale_number only. */
  saleNumber?: string | null;
}

export function roundExchangeExcessAmount(amount: number): number {
  return Math.round((Number(amount) || 0) * 100) / 100;
}

export function buildExchangeExcessSaleReturn(
  input: ExchangeExcessSaleReturnInput,
): Record<string, unknown> | null {
  const amount = roundExchangeExcessAmount(input.amount);
  if (!input.organizationId || !input.creditNoteId || !input.returnNumber) return null;
  if (!(amount > 0.005)) return null;
  const saleNumber = String(input.saleNumber || "").trim();
  const noteNumber = String(input.creditNoteNumber || "").trim();
  const notes = [
    EXCHANGE_EXCESS_SALE_RETURN_TAG,
    noteNumber,
    saleNumber ? `against invoice ${saleNumber}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    organization_id: input.organizationId,
    customer_id: input.customerId || null,
    customer_name: String(input.customerName || "").trim() || "Walk-in Customer",
    return_date: input.returnDate,
    return_number: input.returnNumber,
    gross_amount: amount,
    gst_amount: 0,
    net_amount: amount,
    credit_available_balance: amount,
    credit_status: "pending",
    credit_note_id: input.creditNoteId,
    refund_type: "credit_note",
    linked_sale_id: null,
    original_sale_number: saleNumber || null,
    notes,
  };
}
