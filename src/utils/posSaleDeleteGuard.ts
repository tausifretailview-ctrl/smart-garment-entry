import { isSaleInvoiceCancelled } from "@/utils/saleInvoiceStatus";

export type AutoRollbackDecision =
  | { action: "rollback_empty_header" }
  | { action: "keep_sale"; reason: string };

/**
 * Automatic delete after a failed POS/sale save is allowed only for an empty
 * header (line items never landed). A bill that already has items or is
 * settled must stay — print can have already happened.
 */
export function decidePosSaveAutoRollback(input: {
  saleType?: string | null;
  paymentStatus?: string | null;
  itemCount: number;
}): AutoRollbackDecision {
  if (input.itemCount > 0) {
    return {
      action: "keep_sale",
      reason:
        "Sale already has line items — refusing automatic delete after a later save-step error.",
    };
  }
  const status = String(input.paymentStatus || "").toLowerCase();
  if (status === "completed" || status === "partial") {
    return {
      action: "keep_sale",
      reason: "Sale is already settled — refusing automatic delete.",
    };
  }
  return { action: "rollback_empty_header" };
}

export function typedSaleNumberMatches(
  typed: string,
  saleNumber: string | null | undefined,
): boolean {
  return typed.trim().toUpperCase() === String(saleNumber || "").trim().toUpperCase();
}

/** Completed / partial POS (or DC) bills need the invoice number typed to delete. */
export function requiresTypedPosDeleteConfirm(sale: {
  sale_type?: string | null;
  payment_status?: string | null;
  is_cancelled?: boolean | null;
} | null | undefined): boolean {
  if (!sale || isSaleInvoiceCancelled(sale)) return false;
  const type = String(sale.sale_type || "").toLowerCase();
  if (type !== "pos" && type !== "delivery_challan") return false;
  const status = String(sale.payment_status || "").toLowerCase();
  return status === "completed" || status === "partial";
}

export const POS_BULK_DELETE_CONFIRM_WORD = "DELETE";

export function typedBulkDeleteMatches(typed: string): boolean {
  return typed.trim().toUpperCase() === POS_BULK_DELETE_CONFIRM_WORD;
}

export function selectionIncludesProtectedPosSale(
  sales: Array<{
    sale_type?: string | null;
    payment_status?: string | null;
    is_cancelled?: boolean | null;
  }>,
): boolean {
  return sales.some((sale) => requiresTypedPosDeleteConfirm(sale));
}
