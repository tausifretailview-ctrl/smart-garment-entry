import type { SupabaseClient } from "@supabase/supabase-js";
import { extractSaleNumbersFromReceiptDescription } from "@/utils/customerBalanceUtils";

/** Receipt row the Customer Payment tab can delete. */
export type ReceiptForDelete = {
  reference_type?: string | null;
  reference_id?: string | null;
  description?: string | null;
  total_amount?: number | null;
  discount_amount?: number | null;
  payment_method?: string | null;
};

export type SaleTouchedByReceipt = {
  id: string;
  sale_number?: string | null;
  customer_id?: string | null;
  paid_amount?: number | null;
  net_amount?: number | null;
  sale_return_adjust?: number | null;
  cash_amount?: number | null;
  card_amount?: number | null;
  upi_amount?: number | null;
};

const SALE_TOUCHED_SELECT =
  "id, sale_number, customer_id, paid_amount, net_amount, sale_return_adjust, cash_amount, card_amount, upi_amount";

/** Cash collected plus settlement discount — both reduce what the customer owes. */
export function customerReceiptReversedAmount(payment: ReceiptForDelete): number {
  return (
    Math.max(0, Number(payment.total_amount) || 0) +
    Math.max(0, Number(payment.discount_amount) || 0)
  );
}

export function isCreditNoteAdjustmentReceipt(payment: ReceiptForDelete): boolean {
  return String(payment.payment_method || "").toLowerCase() === "credit_note_adjustment";
}

export function isAdvanceAdjustmentReceipt(payment: ReceiptForDelete): boolean {
  return String(payment.payment_method || "").toLowerCase() === "advance_adjustment";
}

/**
 * Sales whose paid_amount / payment_status must be recomputed after this receipt is gone.
 *
 * A match is the receipt's reference_id when that id is a real sale, or a full
 * prefixed bill number in the description (INV/… or POS/…). A shorter bill
 * number that is only a substring of that token is not a match.
 */
export function collectSaleIdsForReceiptDelete(
  payment: ReceiptForDelete,
  sales: Array<{ id: string; sale_number?: string | null }>,
): string[] {
  const ids = new Set<string>();
  const refId = String(payment.reference_id || "").trim();
  const byId = new Map(sales.filter((sale) => sale.id).map((sale) => [sale.id, sale]));
  if (refId && byId.has(refId)) ids.add(refId);

  const tokens = new Set(
    extractSaleNumbersFromReceiptDescription(String(payment.description || "")),
  );
  if (tokens.size > 0) {
    for (const sale of sales) {
      const num = String(sale.sale_number || "").trim().toUpperCase();
      if (num && tokens.has(num)) ids.add(sale.id);
    }
  }
  return [...ids];
}

/** Customer whose outstanding snapshot must refresh after the receipt is removed. */
export function customerIdForReceiptBalanceRefresh(
  payment: ReceiptForDelete,
  sales: Array<{ id: string; customer_id?: string | null }>,
  saleIds: string[],
): string | null {
  for (const id of saleIds) {
    const customerId = sales.find((sale) => sale.id === id)?.customer_id;
    if (customerId) return String(customerId);
  }
  const refType = String(payment.reference_type || "").trim().toLowerCase();
  const refId = String(payment.reference_id || "").trim();
  const pointsAtSale = !!refId && saleIds.includes(refId);
  if (
    !pointsAtSale &&
    refId &&
    (refType === "customer" || refType === "customer_payment" || refType === "customerreceipt")
  ) {
    return refId;
  }
  return null;
}

/**
 * Sale the credit-note voucher was applied to. Description matches are used
 * only when they resolve to exactly one bill, so a multi-invoice narration
 * cannot lower sale_return_adjust on the wrong invoice.
 */
export function creditNoteSaleForReceiptDelete(
  payment: ReceiptForDelete,
  sales: SaleTouchedByReceipt[],
  saleIds: string[],
): SaleTouchedByReceipt | null {
  if (!isCreditNoteAdjustmentReceipt(payment)) return null;
  const refId = String(payment.reference_id || "").trim();
  const byId = new Map(sales.map((sale) => [sale.id, sale]));
  if (refId && byId.has(refId) && saleIds.includes(refId)) {
    return byId.get(refId) ?? null;
  }
  if (saleIds.length === 1) return byId.get(saleIds[0]) ?? null;
  return null;
}

/** Load sale rows this receipt can affect. Scoped by organization_id. */
export async function loadSalesTouchedByReceipt(
  client: SupabaseClient,
  organizationId: string,
  payment: ReceiptForDelete,
): Promise<SaleTouchedByReceipt[]> {
  const byId = new Map<string, SaleTouchedByReceipt>();
  const refId = String(payment.reference_id || "").trim();
  if (refId) {
    const { data, error } = await client
      .from("sales")
      .select(SALE_TOUCHED_SELECT)
      .eq("organization_id", organizationId)
      .eq("id", refId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) byId.set(String(data.id), data as SaleTouchedByReceipt);
  }

  const tokens = extractSaleNumbersFromReceiptDescription(String(payment.description || ""));
  if (tokens.length > 0) {
    const { data, error } = await client
      .from("sales")
      .select(SALE_TOUCHED_SELECT)
      .eq("organization_id", organizationId)
      .in("sale_number", tokens)
      .is("deleted_at", null);
    if (error) throw error;
    for (const row of data || []) {
      if (row?.id) byId.set(String(row.id), row as SaleTouchedByReceipt);
    }
  }
  return [...byId.values()];
}
