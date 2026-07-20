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
  /** Portion not allocated to open invoices/OB (= adjustmentAmount − totalVouchersWritten). */
  uncoveredAmount: number;
  voucherIds: string[];
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

async function fetchOpeningBalancePending(
  client: SupabaseClient,
  organizationId: string,
  customerId: string,
): Promise<number> {
  const { data: customer, error } = await client
    .from("customers")
    .select("id, opening_balance")
    .eq("id", customerId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  const opening = Number(customer?.opening_balance || 0);
  if (opening <= 0.5) return 0;

  const { data: vouchers, error: vErr } = await client
    .from("voucher_entries")
    .select("id, total_amount, discount_amount, reference_id")
    .eq("organization_id", organizationId)
    .eq("voucher_type", "receipt")
    .eq("reference_type", "customer")
    .eq("reference_id", customerId)
    .is("deleted_at", null);
  if (vErr) throw vErr;

  // Ignore legacy mis-tags where reference_id is actually a sale id
  const { data: saleHit } = await client
    .from("sales")
    .select("id")
    .eq("id", customerId)
    .maybeSingle();
  if (saleHit?.id) return Math.max(0, opening);

  const paid = (vouchers || []).reduce(
    (sum, ve) =>
      sum + Math.max(0, Number(ve.total_amount || 0) + Number(ve.discount_amount || 0)),
    0,
  );

  return Math.max(0, Math.round((opening - paid) * 100) / 100);
}

/**
 * FIFO-settle Opening Balance then open invoices via balance_adjustment receipts.
 * Caller must store only uncoveredAmount as customer_balance_adjustments.outstanding_difference
 * and mark materialized when uncoveredAmount ≈ 0 and vouchers were written.
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
    voucherIds: [],
  };

  if (adjustmentAmount <= 0.5) return empty;

  const voucherDate = new Date().toISOString().split("T")[0];
  const allocations: AdjustmentAllocation[] = [];
  const voucherIds: string[] = [];
  let remaining = adjustmentAmount;
  let totalVouchersWritten = 0;

  // Step 1 — Opening Balance
  const obPending = await fetchOpeningBalancePending(client, organizationId, customerId);
  if (obPending > 0.5 && remaining > 0.5) {
    const applyAmount = Math.min(remaining, obPending);
    const voucher = await createReceiptVoucher(client, {
      organizationId,
      referenceId: customerId,
      referenceType: "customer",
      amount: applyAmount,
      paymentMethod: BALANCE_ADJUSTMENT_PAYMENT_METHOD,
      description: balanceAdjustmentVoucherDescription(
        "Opening Balance",
        adjustmentRowId,
        reason,
      ),
      voucherDate,
      createdBy: createdBy ?? null,
    });
    if (voucher?.id) voucherIds.push(String(voucher.id));
    allocations.push({
      saleId: customerId,
      saleNumber: "Opening Balance",
      appliedAmount: applyAmount,
      newStatus: "completed",
    });
    totalVouchersWritten = Math.round((totalVouchersWritten + applyAmount) * 100) / 100;
    remaining = Math.round((remaining - applyAmount) * 100) / 100;
  }

  // Step 2 — oldest unpaid invoices
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

  for (const invoice of invoices || []) {
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

    const voucher = await createReceiptVoucher(client, {
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
    if (voucher?.id) voucherIds.push(String(voucher.id));

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
    voucherIds,
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
    .select("id, reference_id, reference_type, description")
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

    if (voucher.reference_id && voucher.reference_type === "sale") {
      saleIds.add(String(voucher.reference_id));
    }
  }

  for (const saleId of saleIds) {
    await applyRecomputedSalePaymentState(saleId, organizationId, client);
  }

  return { reversedCount: vouchers.length, saleIds: [...saleIds] };
}
