import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchSaleReceiptSplitsForInvoices,
  reconcileSaleInvoiceWithSplit,
} from "@/utils/customerBalanceUtils";

/** Warn when proposed settlement exceeds fresh outstanding by more than this (rupees). */
export const INVOICE_OVERPAYMENT_WARN_TOLERANCE_RUPEE = 1;

const fmtInr = (n: number) =>
  `₹${Math.max(0, n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

export function formatInvoiceOverpaymentConfirmMessage(params: {
  saleNumber: string;
  netAmount: number;
  paidSettled: number;
  proposedSettlement: number;
  excess: number;
}): string {
  const { saleNumber, netAmount, paidSettled, proposedSettlement, excess } = params;
  return (
    `Invoice ${saleNumber} already has ${fmtInr(paidSettled)} paid of ${fmtInr(netAmount)}.\n` +
    `This payment of ${fmtInr(proposedSettlement)} exceeds the balance by ${fmtInr(excess)} and will create an advance.\n\n` +
    `Continue?`
  );
}

/**
 * Fresh server-side remaining balance check + warn/confirm before allocating to an invoice.
 * Returns true to proceed, false if user cancelled.
 */
export async function confirmInvoiceOverpaymentIfNeeded(
  client: SupabaseClient,
  params: {
    organizationId: string;
    saleId: string;
    saleNumber?: string;
    /** Cash + settlement discount being applied to this invoice. */
    proposedSettlement: number;
  },
): Promise<boolean> {
  const proposed = Math.max(0, Number(params.proposedSettlement) || 0);
  if (proposed <= INVOICE_OVERPAYMENT_WARN_TOLERANCE_RUPEE) return true;

  const fresh = await fetchFreshInvoiceSettlement(client, params.organizationId, params.saleId);
  if (!fresh) return true;

  const outstanding = Math.max(0, fresh.outstanding);
  const excess = proposed - outstanding;
  if (excess <= INVOICE_OVERPAYMENT_WARN_TOLERANCE_RUPEE) return true;

  const saleNumber = params.saleNumber || fresh.saleNumber;
  const message = formatInvoiceOverpaymentConfirmMessage({
    saleNumber,
    netAmount: fresh.netAmount,
    paidSettled: fresh.paidSettled,
    proposedSettlement: proposed,
    excess,
  });

  return window.confirm(message);
}
