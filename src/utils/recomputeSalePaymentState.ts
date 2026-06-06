/**
 * Single source of truth helper for sales.paid_amount / payment_status.
 *
 * Delegates to the canonical DB function `compute_sale_settlement(sale_id, org_id)`,
 * which mirrors `derivePaidAndStatus` (₹0.50 tolerance + CN-dedupe + pay_later
 * short-circuit). Callers should prefer this helper over inline math whenever
 * the sale already exists in the database — it guarantees the figure matches
 * what `trg_sync_sale_payment_status_from_receipts` will write on the next
 * voucher event.
 *
 * For pre-insert sales (no DB row yet), keep using `derivePaidAndStatus`
 * directly from `saleSettlement.ts` — both use the same formula.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultClient } from "@/integrations/supabase/client";
import type { SalePaymentStatus } from "@/utils/saleSettlement";

export interface RecomputeSalePaymentStateResult {
  paidAmount: number;
  paymentStatus: SalePaymentStatus;
  /** True when the DB returned no row (sale missing / cancelled / hold / soft-deleted). */
  skipped: boolean;
}

/**
 * Recompute paid_amount / payment_status for an existing sale by id.
 * Pure read — does NOT write to `sales`. Use {@link applyRecomputedSalePaymentState}
 * to persist the result.
 */
export async function recomputeSalePaymentState(
  saleId: string,
  organizationId: string,
  client: SupabaseClient = defaultClient,
): Promise<RecomputeSalePaymentStateResult> {
  if (!saleId || !organizationId) {
    return { paidAmount: 0, paymentStatus: "pending", skipped: true };
  }

  const sb = client as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: Error | null }>;
  };

  const { data, error } = await sb.rpc("compute_sale_settlement", {
    p_sale_id: saleId,
    p_org_id: organizationId,
  });
  if (error) throw error;

  const row = Array.isArray(data) && data.length > 0
    ? (data[0] as Record<string, unknown>)
    : null;

  if (!row || row.new_paid == null) {
    return { paidAmount: 0, paymentStatus: "pending", skipped: true };
  }

  const paidAmount = Math.round((Number(row.new_paid) || 0) * 100) / 100;
  const paymentStatus = String(row.new_status || "pending") as SalePaymentStatus;
  return { paidAmount, paymentStatus, skipped: false };
}

/**
 * Recompute + persist. No-op when the DB recompute is skipped or the existing
 * values already match (within ₹0.01 / status equality).
 */
export async function applyRecomputedSalePaymentState(
  saleId: string,
  organizationId: string,
  client: SupabaseClient = defaultClient,
): Promise<RecomputeSalePaymentStateResult> {
  const result = await recomputeSalePaymentState(saleId, organizationId, client);
  if (result.skipped) return result;

  const { data: current, error: readErr } = await client
    .from("sales")
    .select("paid_amount, payment_status")
    .eq("id", saleId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (readErr) throw readErr;

  const prevPaid = Number(current?.paid_amount ?? 0);
  const prevStatus = String(current?.payment_status ?? "");
  if (
    Math.abs(prevPaid - result.paidAmount) <= 0.009 &&
    prevStatus === result.paymentStatus
  ) {
    return result;
  }

  const { error: updErr } = await client
    .from("sales")
    .update({
      paid_amount: result.paidAmount,
      payment_status: result.paymentStatus,
    })
    .eq("id", saleId)
    .eq("organization_id", organizationId);
  if (updErr) throw updErr;

  return result;
}