import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultClient } from "@/integrations/supabase/client";
import { applyRecomputedSalePaymentState } from "@/utils/recomputeSalePaymentState";
import { createReceiptVoucher, type SalePaymentStatus } from "@/utils/saleSettlement";

export const BALANCE_ADJUSTMENT_PAYMENT_METHOD = "balance_adjustment";

/** Marker embedded in voucher description for reversal lookup (Step 3). */
export function balanceAdjustmentAdjIdMarker(adjustmentRowId: string): string {
  return `adj_id:${adjustmentRowId}`;
}

export function balanceAdjustmentVoucherDescription(
  saleNumber: string,
  adjustmentRowId: string,
  reason: string,
): string {
  return `Balance adjustment to ${saleNumber} | ${balanceAdjustmentAdjIdMarker(adjustmentRowId)} | ${reason}`;
}

export interface AdjustmentAllocation {
  saleId: string;
  saleNumber: string;
  appliedAmount: number;
  newStatus: SalePaymentStatus;
}

export interface AdjustmentResult {
  allocations: AdjustmentAllocation[];
  totalVouchersWritten: number;
  /** Portion not allocated to open invoices (= adjustmentAmount − totalVouchersWritten). */
  uncoveredAmount: number;
}

export type ApplyAdjustmentToInvoicesParams = {
  organizationId: string;
  customerId: string;
  /** Positive amount to reduce customer Dr outstanding. */
  adjustmentAmount: number;
  reason: string;
  adjustmentRowId: string;
  createdBy?: string | null;
  client?: SupabaseClient;
};

/**
 * FIFO-settle open invoices via balance_adjustment receipt vouchers.
 * Vouchers count in reconcile receipt_payments; caller must store only
 * uncoveredAmount as customer_balance_adjustments.outstanding_difference.
 */
export async function applyAdjustmentToInvoices(
  params: ApplyAdjustmentToInvoicesParams,
): Promise<AdjustmentResult> {
  const {
    organizationId,
    customerId,
    adjustmentAmount,
    reason,
    adjustmentRowId,
    createdBy,
    client = defaultClient,
  } = params;

  const empty: AdjustmentResult = {
    allocations: [],
    totalVouchersWritten: 0,
    uncoveredAmount: adjustmentAmount,
  };

  if (adjustmentAmount <= 0.5) return empty;

  const { data: invoices, error } = await client
    .from("sales")
    .select(
      "id, sale_number, net_amount, paid_amount, sale_return_adjust, payment_status, sale_date, created_at",
    )
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .eq("sale_type", "invoice")
    .is("deleted_at", null)
    .eq("is_cancelled", false)
    .in("payment_status", ["pending", "partial"])
    .order("sale_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!invoices?.length) return empty;

  const voucherDate = new Date().toISOString().split("T")[0];
  const allocations: AdjustmentAllocation[] = [];
  let remaining = adjustmentAmount;
  let totalVouchersWritten = 0;

  for (const invoice of invoices) {
    if (remaining <= 0.5) break;

    const invoicePending = Math.max(
      0,
      Math.round(
        (Number(invoice.net_amount) || 0) -
          (Number(invoice.paid_amount) || 0) -
          (Number(invoice.sale_return_adjust) || 0),
      ),
    );

    if (invoicePending <= 0.5) continue;

    const applyAmount = Math.min(remaining, invoicePending);

    await createReceiptVoucher(client, {
      organizationId,
      referenceId: invoice.id,
      referenceType: "sale",
      amount: applyAmount,
      paymentMethod: BALANCE_ADJUSTMENT_PAYMENT_METHOD,
      description: balanceAdjustmentVoucherDescription(
        invoice.sale_number,
        adjustmentRowId,
        reason,
      ),
      voucherDate,
      createdBy: createdBy ?? null,
    });

    const recomputed = await applyRecomputedSalePaymentState(
      invoice.id,
      organizationId,
      client,
    );

    allocations.push({
      saleId: invoice.id,
      saleNumber: invoice.sale_number,
      appliedAmount: applyAmount,
      newStatus: recomputed.skipped ? "partial" : recomputed.paymentStatus,
    });

    totalVouchersWritten = Math.round((totalVouchersWritten + applyAmount) * 100) / 100;
    remaining = Math.round((remaining - applyAmount) * 100) / 100;
  }

  return {
    allocations,
    totalVouchersWritten,
    uncoveredAmount: Math.max(0, Math.round((adjustmentAmount - totalVouchersWritten) * 100) / 100),
  };
}

export type ReverseBalanceAdjustmentVouchersParams = {
  organizationId: string;
  adjustmentRowId: string;
  deletedBy?: string | null;
  client?: SupabaseClient;
};

/**
 * Soft-delete balance_adjustment receipt vouchers linked to an adjustment row
 * and recompute affected invoice payment state.
 */
export async function reverseBalanceAdjustmentVouchers(
  params: ReverseBalanceAdjustmentVouchersParams,
): Promise<{ reversedCount: number; saleIds: string[] }> {
  const { organizationId, adjustmentRowId, deletedBy, client = defaultClient } = params;
  const marker = balanceAdjustmentAdjIdMarker(adjustmentRowId);

  const { data: vouchers, error } = await client
    .from("voucher_entries")
    .select("id, reference_id, description")
    .eq("organization_id", organizationId)
    .eq("voucher_type", "receipt")
    .eq("payment_method", BALANCE_ADJUSTMENT_PAYMENT_METHOD)
    .is("deleted_at", null)
    .like("description", `%${marker}%`);

  if (error) throw error;
  if (!vouchers?.length) return { reversedCount: 0, saleIds: [] };

  const now = new Date().toISOString();
  const saleIds = new Set<string>();

  for (const voucher of vouchers) {
    const updatePayload: Record<string, unknown> = {
      deleted_at: now,
      description: `${voucher.description || ""} [reversed ${now}]`.trim(),
    };
    if (deletedBy) updatePayload.deleted_by = deletedBy;

    const { error: updErr } = await client
      .from("voucher_entries")
      .update(updatePayload)
      .eq("id", voucher.id);
    if (updErr) throw updErr;

    if (voucher.reference_id) saleIds.add(String(voucher.reference_id));
  }

  for (const saleId of saleIds) {
    await applyRecomputedSalePaymentState(saleId, organizationId, client);
  }

  return { reversedCount: vouchers.length, saleIds: [...saleIds] };
}
