import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueryClient } from "@tanstack/react-query";
import {
  fetchSaleReceiptSplitsForInvoices,
  reconcileSaleInvoiceWithSplit,
} from "@/utils/customerBalanceUtils";
import { fetchCustomerOpeningBalanceRemaining } from "@/utils/customerOpeningBalanceRemaining";

/** Block when proposed settlement exceeds fresh outstanding by more than this (rupees). */
export const INVOICE_OVERPAYMENT_WARN_TOLERANCE_RUPEE = 1;

const fmtInr = (n: number) =>
  `₹${Math.max(0, n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export type FreshInvoiceSettlement = {
  saleId: string;
  saleNumber: string;
  netAmount: number;
  paidSettled: number;
  outstanding: number;
};

export async function fetchFreshInvoiceSettlement(
  client: SupabaseClient,
  organizationId: string,
  saleId: string,
): Promise<FreshInvoiceSettlement | null> {
  const { data: sale, error } = await client
    .from("sales")
    .select(
      "id, sale_number, net_amount, paid_amount, sale_return_adjust, cash_amount, card_amount, upi_amount, customer_id",
    )
    .eq("id", saleId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!sale?.id) return null;

  const splitMap = await fetchSaleReceiptSplitsForInvoices(client, organizationId, [
    {
      id: sale.id,
      sale_number: sale.sale_number,
      customer_id: sale.customer_id,
    },
  ]);
  const split = splitMap.get(sale.id) ?? null;
  const rec = reconcileSaleInvoiceWithSplit(sale, split);

  return {
    saleId: sale.id,
    saleNumber: String(sale.sale_number || sale.id.slice(0, 8)),
    netAmount: Number(sale.net_amount || 0),
    paidSettled: rec.paid_amount,
    outstanding: rec.outstanding,
  };
}

/** True when proposed exceeds cap by more than the ₹1 tolerance. */
export function paymentExceedsOutstandingCap(
  proposedSettlement: number,
  outstandingCap: number,
  toleranceRupee: number = INVOICE_OVERPAYMENT_WARN_TOLERANCE_RUPEE,
): boolean {
  const proposed = Math.max(0, Number(proposedSettlement) || 0);
  const cap = Math.max(0, Number(outstandingCap) || 0);
  return proposed - cap > toleranceRupee;
}

export function formatPaymentExceedsOutstandingMessage(outstandingCap: number): string {
  return `Amount exceeds total outstanding of ${fmtInr(outstandingCap)}`;
}

export class PaymentExceedsOutstandingError extends Error {
  readonly outstandingCap: number;

  constructor(outstandingCap: number) {
    super(formatPaymentExceedsOutstandingMessage(outstandingCap));
    this.name = "PaymentExceedsOutstandingError";
    this.outstandingCap = outstandingCap;
  }
}

/**
 * Fresh cap = sum of selected invoice outstandings (+ opening-balance remaining when requested).
 * Uses the same reconcile basis as receipt allocation (`fetchFreshInvoiceSettlement`).
 */
export async function fetchFreshCustomerPaymentCap(
  client: SupabaseClient,
  params: {
    organizationId: string;
    saleIds: string[];
    customerId?: string | null;
    includeOpeningBalance?: boolean;
    queryClient?: QueryClient;
  },
): Promise<number> {
  const saleIds = [...new Set(params.saleIds.filter(Boolean))];
  let cap = 0;

  if (saleIds.length > 0) {
    const settlements = await Promise.all(
      saleIds.map((id) => fetchFreshInvoiceSettlement(client, params.organizationId, id)),
    );
    for (const s of settlements) {
      if (s) cap += Math.max(0, s.outstanding);
    }
  }

  if (params.includeOpeningBalance && params.customerId) {
    const ob = await fetchCustomerOpeningBalanceRemaining(
      client,
      params.organizationId,
      params.customerId,
      params.queryClient,
    );
    cap += Math.max(0, ob);
  }

  return roundMoney(cap);
}

/**
 * Pre-write guarantee: re-derive outstanding from live data and throw if the
 * entered settlement still exceeds it. Do not auto-create advances here.
 */
export async function assertCustomerPaymentWithinOutstandingCap(
  client: SupabaseClient,
  params: {
    organizationId: string;
    saleIds: string[];
    customerId?: string | null;
    includeOpeningBalance?: boolean;
    /** Cash + settlement discount being recorded. */
    proposedSettlement: number;
    queryClient?: QueryClient;
  },
): Promise<number> {
  const proposed = Math.max(0, Number(params.proposedSettlement) || 0);
  if (proposed <= INVOICE_OVERPAYMENT_WARN_TOLERANCE_RUPEE) {
    return 0;
  }

  const cap = await fetchFreshCustomerPaymentCap(client, {
    organizationId: params.organizationId,
    saleIds: params.saleIds,
    customerId: params.customerId,
    includeOpeningBalance: params.includeOpeningBalance,
    queryClient: params.queryClient,
  });

  if (paymentExceedsOutstandingCap(proposed, cap)) {
    throw new PaymentExceedsOutstandingError(cap);
  }
  return cap;
}
