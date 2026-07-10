import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";
import { recordCustomerReceiptJournalEntry } from "@/utils/accounting/journalService";
import { applyRecomputedSalePaymentState } from "@/utils/recomputeSalePaymentState";
import { createReceiptVoucher } from "@/utils/saleSettlement";

export type BulkCashPaymentInvoice = {
  id: string;
  sale_number: string;
  net_amount: number;
  paid_amount?: number | null;
  sale_return_adjust?: number | null;
  credit_applied?: number | null;
  outstanding?: number | null;
  payment_status?: string | null;
};

export function invoiceOutstandingAmount(inv: BulkCashPaymentInvoice): number {
  const raw =
    inv.outstanding ??
    Math.max(
      0,
      Number(inv.net_amount || 0) -
        Number(inv.paid_amount || 0) -
        Math.max(Number(inv.sale_return_adjust || 0), Number(inv.credit_applied || 0)),
    );
  return Math.round(Number(raw) * 100) / 100;
}

export type RecordInvoiceCashPaymentResult =
  | {
      ok: true;
      amount: number;
      voucherId: string;
      paidAmount: number;
      paymentStatus: string;
      outstanding: number;
    }
  | { ok: false; reason: "no_balance" | "already_paid" | "error"; message?: string };

/**
 * Record a full cash receipt for the invoice's remaining balance — same voucher +
 * GL + recompute path as the dashboard payment dialog (cash mode).
 */
export async function recordInvoiceFullCashPayment(
  client: SupabaseClient,
  params: {
    organizationId: string;
    invoice: BulkCashPaymentInvoice;
    createdBy?: string | null;
    paymentDate?: Date;
    narrationSuffix?: string;
  },
): Promise<RecordInvoiceCashPaymentResult> {
  const { organizationId, invoice, createdBy, paymentDate = new Date(), narrationSuffix } =
    params;

  if (invoice.payment_status === "completed") {
    return { ok: false, reason: "already_paid" };
  }

  const outstanding = invoiceOutstandingAmount(invoice);
  if (outstanding <= 0.5) {
    return { ok: false, reason: "no_balance" };
  }

  const payYmd = format(paymentDate, "yyyy-MM-dd");
  const suffix = narrationSuffix ? ` ${narrationSuffix}` : "";

  try {
    const created = await createReceiptVoucher(client, {
      organizationId,
      referenceId: invoice.id,
      amount: outstanding,
      paymentMethod: "cash",
      description: `Payment received for invoice ${invoice.sale_number}${suffix}`,
      voucherDate: payYmd,
      createdBy: createdBy ?? null,
    });

    const { data: acctGlRow } = await client
      .from("settings")
      .select("accounting_engine_enabled")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (isAccountingEngineEnabled(acctGlRow as { accounting_engine_enabled?: boolean } | null)) {
      await recordCustomerReceiptJournalEntry(
        created.id,
        organizationId,
        outstanding,
        0,
        "cash",
        payYmd,
        `Payment received for invoice ${invoice.sale_number}${suffix}`,
        client,
      );
    }

    const recomputed = await applyRecomputedSalePaymentState(invoice.id, organizationId, client);

    await client
      .from("sales")
      .update({
        payment_date: payYmd,
        payment_method: "cash",
      })
      .eq("id", invoice.id)
      .eq("organization_id", organizationId);

    const paidAmount = recomputed.skipped
      ? Number(invoice.paid_amount || 0) + outstanding
      : recomputed.paidAmount;
    const paymentStatus = recomputed.skipped ? "completed" : recomputed.paymentStatus;
    const sra = Math.max(
      Number(invoice.sale_return_adjust || 0),
      Number(invoice.credit_applied || 0),
    );
    const net = Number(invoice.net_amount || 0);
    const outstandingAfter =
      paymentStatus === "completed"
        ? 0
        : Math.max(0, Math.round((net - paidAmount - sra) * 100) / 100);

    return {
      ok: true,
      amount: outstanding,
      voucherId: created.id,
      paidAmount,
      paymentStatus,
      outstanding: outstandingAfter,
    };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
