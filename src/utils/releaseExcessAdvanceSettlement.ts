/**
 * When an invoice is settled by advance and later reduced via sale_return_adjust (CN/SRA),
 * advance_adjustment vouchers and customer_advances.used_amount are not automatically
 * released. Party ledger goes Cr while From Advance shows ₹0.
 *
 * Release only excess advance while keeping the invoice settled:
 *   maxRelease = nonCnReceipts + sale_return_adjust - net_amount
 *   releasable = min(maxRelease, Σ advance_adjustment on that sale)
 *
 * Does not change computeCustomerOutstanding — restores spendable bookings for From Advance.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultClient } from "@/integrations/supabase/client";
import { reverseCustomerAdvanceFifo } from "@/utils/reverseCustomerAdvanceFifo";
import { applyRecomputedSalePaymentState } from "@/utils/recomputeSalePaymentState";
import { deleteJournalEntryByReference } from "@/utils/accounting/journalService";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";
import { CUSTOMER_RECEIPT_REFERENCE_TYPE_VALUES } from "@/utils/paymentVoucherFilters";

const TOLERANCE = 0.5;

export type ExcessAdvanceOnSale = {
  saleId: string;
  saleNumber: string | null;
  customerId: string;
  netAmount: number;
  saleReturnAdjust: number;
  advanceVoucherTotal: number;
  nonCnReceiptTotal: number;
  maxRelease: number;
  releasable: number;
};

export function computeReleasableAdvanceExcess(params: {
  netAmount: number;
  saleReturnAdjust: number;
  advanceVoucherTotal: number;
  /** Sum of receipt vouchers excluding credit_note_adjustment (includes advance + cash). */
  nonCnReceiptTotal: number;
}): { maxRelease: number; releasable: number } {
  const net = Math.round((Number(params.netAmount) || 0) * 100) / 100;
  const sra = Math.round((Number(params.saleReturnAdjust) || 0) * 100) / 100;
  const adv = Math.round((Number(params.advanceVoucherTotal) || 0) * 100) / 100;
  const nonCn = Math.round((Number(params.nonCnReceiptTotal) || 0) * 100) / 100;

  // After releasing R of advance: (nonCn - R) + sra >= net  ⇒  R <= nonCn + sra - net
  const maxRelease = Math.max(0, Math.round((nonCn + sra - net) * 100) / 100);
  const releasable = Math.max(0, Math.min(maxRelease, adv));

  return {
    maxRelease: maxRelease <= TOLERANCE ? 0 : maxRelease,
    releasable: releasable <= TOLERANCE ? 0 : releasable,
  };
}

type SaleReceiptSplit = {
  advanceTotal: number;
  nonCnTotal: number;
  advanceVouchers: Array<{ id: string; total_amount: number; created_at: string | null }>;
};

async function loadSaleReceiptSplit(
  client: SupabaseClient,
  organizationId: string,
  saleId: string,
): Promise<SaleReceiptSplit> {
  const { data, error } = await client
    .from("voucher_entries")
    .select("id, total_amount, discount_amount, payment_method, created_at")
    .eq("organization_id", organizationId)
    .eq("reference_id", saleId)
    .eq("voucher_type", "receipt")
    .in("reference_type", [...CUSTOMER_RECEIPT_REFERENCE_TYPE_VALUES])
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;

  let advanceTotal = 0;
  let nonCnTotal = 0;
  const advanceVouchers: SaleReceiptSplit["advanceVouchers"] = [];

  for (const raw of data || []) {
    const pm = String(raw.payment_method || "").toLowerCase();
    const amt =
      Math.round(
        (Number(raw.total_amount || 0) + Number(raw.discount_amount || 0)) * 100,
      ) / 100;
    if (pm === "credit_note_adjustment") continue;
    nonCnTotal += amt;
    if (pm === "advance_adjustment") {
      advanceTotal += amt;
      advanceVouchers.push({
        id: raw.id as string,
        total_amount: amt,
        created_at: (raw.created_at as string | null) ?? null,
      });
    }
  }

  return {
    advanceTotal: Math.round(advanceTotal * 100) / 100,
    nonCnTotal: Math.round(nonCnTotal * 100) / 100,
    advanceVouchers,
  };
}

/** Diagnose one sale — no writes. */
export async function diagnoseExcessAdvanceOnSale(
  organizationId: string,
  saleId: string,
  client: SupabaseClient = defaultClient,
): Promise<ExcessAdvanceOnSale | null> {
  const { data: sale, error } = await client
    .from("sales")
    .select("id, sale_number, customer_id, net_amount, sale_return_adjust")
    .eq("id", saleId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!sale?.customer_id) return null;

  const split = await loadSaleReceiptSplit(client, organizationId, saleId);
  const { maxRelease, releasable } = computeReleasableAdvanceExcess({
    netAmount: Number(sale.net_amount || 0),
    saleReturnAdjust: Number(sale.sale_return_adjust || 0),
    advanceVoucherTotal: split.advanceTotal,
    nonCnReceiptTotal: split.nonCnTotal,
  });

  return {
    saleId: sale.id,
    saleNumber: sale.sale_number ?? null,
    customerId: sale.customer_id,
    netAmount: Number(sale.net_amount || 0),
    saleReturnAdjust: Number(sale.sale_return_adjust || 0),
    advanceVoucherTotal: split.advanceTotal,
    nonCnReceiptTotal: split.nonCnTotal,
    maxRelease,
    releasable,
  };
}

/** Scan customer sales with SRA that still hold releasable advance. */
export async function diagnoseExcessAdvanceForCustomer(
  organizationId: string,
  customerId: string,
  client: SupabaseClient = defaultClient,
): Promise<{ totalReleasable: number; sales: ExcessAdvanceOnSale[] }> {
  const { data: sales, error } = await client
    .from("sales")
    .select("id, sale_number, customer_id, net_amount, sale_return_adjust")
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .gt("sale_return_adjust", 0);
  if (error) throw error;

  const results: ExcessAdvanceOnSale[] = [];
  for (const sale of sales || []) {
    if (!sale.customer_id) continue;
    const split = await loadSaleReceiptSplit(client, organizationId, sale.id);
    if (split.advanceTotal <= TOLERANCE) continue;
    const { maxRelease, releasable } = computeReleasableAdvanceExcess({
      netAmount: Number(sale.net_amount || 0),
      saleReturnAdjust: Number(sale.sale_return_adjust || 0),
      advanceVoucherTotal: split.advanceTotal,
      nonCnReceiptTotal: split.nonCnTotal,
    });
    if (releasable <= TOLERANCE) continue;
    results.push({
      saleId: sale.id,
      saleNumber: sale.sale_number ?? null,
      customerId: sale.customer_id,
      netAmount: Number(sale.net_amount || 0),
      saleReturnAdjust: Number(sale.sale_return_adjust || 0),
      advanceVoucherTotal: split.advanceTotal,
      nonCnReceiptTotal: split.nonCnTotal,
      maxRelease,
      releasable,
    });
  }

  const totalReleasable =
    Math.round(results.reduce((s, r) => s + r.releasable, 0) * 100) / 100;
  return { totalReleasable, sales: results };
}

/**
 * Soft-delete LIFO whole advance_adjustment vouchers on a sale up to releasable,
 * reverse customer_advances.used_amount, recompute paid_amount/status.
 */
export async function releaseExcessAdvanceOnSale(
  organizationId: string,
  saleId: string,
  client: SupabaseClient = defaultClient,
  options?: { amountCap?: number },
): Promise<{ released: number }> {
  const diagnosis = await diagnoseExcessAdvanceOnSale(organizationId, saleId, client);
  if (!diagnosis || diagnosis.releasable <= TOLERANCE) {
    return { released: 0 };
  }

  let left =
    Math.round(
      Math.min(diagnosis.releasable, options?.amountCap ?? diagnosis.releasable) * 100,
    ) / 100;
  if (left <= TOLERANCE) return { released: 0 };

  const split = await loadSaleReceiptSplit(client, organizationId, saleId);

  const { data: acct } = await client
    .from("settings")
    .select("accounting_engine_enabled")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const engineOn = isAccountingEngineEnabled(
    acct as { accounting_engine_enabled?: boolean } | null,
  );

  let released = 0;
  for (const v of split.advanceVouchers) {
    if (left <= TOLERANCE) break;
    const voucherAmt = Math.round(v.total_amount * 100) / 100;
    // Whole-voucher LIFO only (matches receipt-delete advance reverse).
    if (voucherAmt > left + TOLERANCE) break;

    if (engineOn) {
      await deleteJournalEntryByReference(
        organizationId,
        "CustomerAdvanceApplication",
        v.id,
        client,
      );
    }

    const { error: delErr } = await client
      .from("voucher_entries")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", v.id)
      .eq("organization_id", organizationId);
    if (delErr) throw delErr;

    await reverseCustomerAdvanceFifo(
      client,
      organizationId,
      diagnosis.customerId,
      voucherAmt,
    );

    released = Math.round((released + voucherAmt) * 100) / 100;
    left = Math.round((left - voucherAmt) * 100) / 100;
  }

  if (released > TOLERANCE) {
    await applyRecomputedSalePaymentState(saleId, organizationId, client);
  }

  return { released };
}

/** Release excess advance on all of a customer's over-settled invoices. */
export async function releaseExcessAdvanceForCustomer(
  organizationId: string,
  customerId: string,
  client: SupabaseClient = defaultClient,
): Promise<{ released: number; saleCount: number }> {
  const { sales } = await diagnoseExcessAdvanceForCustomer(
    organizationId,
    customerId,
    client,
  );
  let released = 0;
  let saleCount = 0;
  for (const sale of sales) {
    const result = await releaseExcessAdvanceOnSale(organizationId, sale.saleId, client);
    if (result.released > TOLERANCE) {
      released = Math.round((released + result.released) * 100) / 100;
      saleCount += 1;
    }
  }
  return { released, saleCount };
}
