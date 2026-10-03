import type { SupabaseClient } from "@supabase/supabase-js";
import { newPosCreditIdempotencyKey } from "@/utils/applyPosCredit";
import { applyRecomputedSalePaymentState } from "@/utils/recomputeSalePaymentState";
import {
  applyCreditNoteFifoToSale,
  fetchLiveCreditNoteAdjustTotal,
  getAvailableCN,
} from "@/utils/saleSettlement";

const TOLERANCE = 0.01;

function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function formatInr(value: number): string {
  return `₹${roundMoney(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export type PosEditCreditPlan =
  | { kind: "unchanged" }
  | { kind: "reject"; message: string }
  | { kind: "release"; resultingAdjust: number; payable: number }
  | {
      kind: "apply";
      releaseFirst: boolean;
      /** Amount this save sends to adjust_invoice_balance (delta, or full amount after a release). */
      amount: number;
      resultingAdjust: number;
      payable: number;
    };

/**
 * Decide how Save Changes should move a pending credit note on an open invoice.
 * A notes-only save (field still equal to the stored adjust) does not touch credit,
 * even if live vouchers have drifted. Increasing a consistent bill applies only
 * the extra amount. A lower amount, or a row that disagrees with its vouchers,
 * releases this bill's credit and applies the new total.
 */
export function planPosEditCreditSave(input: {
  requested: number;
  storedSaleReturnAdjust: number;
  liveCreditNoteAdjust: number;
  netAmount: number;
  paidAmount: number;
  customerId: string | null;
  paymentStatus?: string | null;
}): PosEditCreditPlan {
  const requested = roundMoney(Math.max(0, input.requested));
  const stored = roundMoney(Math.max(0, input.storedSaleReturnAdjust));
  const live = roundMoney(Math.max(0, input.liveCreditNoteAdjust));
  const current = roundMoney(Math.max(stored, live));
  const net = roundMoney(input.netAmount);
  const paid = roundMoney(Math.max(0, input.paidAmount));
  const payableFor = (adjust: number) => roundMoney(Math.max(0, net - adjust));

  if (Math.abs(requested - stored) <= TOLERANCE) {
    return { kind: "unchanged" };
  }

  const status = String(input.paymentStatus || "").toLowerCase();
  if (status === "hold" || status === "cancelled") {
    return {
      kind: "reject",
      message: "Complete this bill with payment before applying a credit note.",
    };
  }

  if (requested > TOLERANCE && !input.customerId) {
    return {
      kind: "reject",
      message: "Select the customer before applying a pending credit note.",
    };
  }

  const consistent = Math.abs(live - stored) <= TOLERANCE;
  const increasing = consistent && requested > current + TOLERANCE;

  if (increasing) {
    const delta = roundMoney(requested - current);
    const room = roundMoney(Math.max(0, net - paid - current));
    if (delta > room + TOLERANCE) {
      return {
        kind: "reject",
        message:
          room <= TOLERANCE
            ? "This invoice has no balance left for a credit note."
            : `Only ${formatInr(room)} of this invoice can be adjusted with a credit note.`,
      };
    }
    return {
      kind: "apply",
      releaseFirst: false,
      amount: delta,
      resultingAdjust: requested,
      payable: payableFor(requested),
    };
  }

  const roomAfterRelease = roundMoney(Math.max(0, net - paid));
  if (requested > roomAfterRelease + TOLERANCE) {
    return {
      kind: "reject",
      message:
        roomAfterRelease <= TOLERANCE
          ? "This invoice has no balance left for a credit note."
          : `Only ${formatInr(roomAfterRelease)} of this invoice can be adjusted with a credit note.`,
    };
  }

  if (requested <= TOLERANCE) {
    return { kind: "release", resultingAdjust: 0, payable: payableFor(0) };
  }

  return {
    kind: "apply",
    releaseFirst: current > TOLERANCE,
    amount: requested,
    resultingAdjust: requested,
    payable: payableFor(requested),
  };
}

export function posEditCreditSaveMessage(result: {
  applied: number;
  payable: number;
}): string {
  if (result.applied <= TOLERANCE) {
    return `Credit note removed. Invoice total is now ${formatInr(result.payable)}.`;
  }
  return `Credit note ${formatInr(result.applied)} applied. Invoice total is now ${formatInr(result.payable)}.`;
}

export type PosEditCreditSaveResult =
  | { ok: true; changed: false }
  | { ok: true; changed: true; applied: number; payable: number }
  | { ok: false; message: string };

type SaleCreditRow = {
  customer_id: string | null;
  net_amount: number | null;
  paid_amount: number | null;
  sale_return_adjust: number | null;
  payment_status: string | null;
};

/**
 * Persist the S/R field from POS edit onto the invoice.
 * Credit moves only through release_sale_credit and applyCreditNoteFifoToSale
 * (adjust_invoice_balance). The sale row's sale_return_adjust is not written here.
 */
export async function persistPosEditCreditAdjust(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    saleId: string;
    customerId: string | null;
    requested: number;
    adjustedBy?: string | null;
    customerName?: string | null;
  },
): Promise<PosEditCreditSaveResult> {
  const { data, error } = await supabase
    .from("sales")
    .select("customer_id, net_amount, paid_amount, sale_return_adjust, payment_status")
    .eq("id", params.saleId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return { ok: false, message: "Invoice not found." };
  }

  const sale = data as SaleCreditRow;
  const customerId = params.customerId || sale.customer_id || null;
  const live =
    customerId != null
      ? await fetchLiveCreditNoteAdjustTotal(supabase, params.saleId)
      : 0;
  const plan = planPosEditCreditSave({
    requested: params.requested,
    storedSaleReturnAdjust: Number(sale.sale_return_adjust) || 0,
    liveCreditNoteAdjust: live,
    netAmount: Number(sale.net_amount) || 0,
    paidAmount: Number(sale.paid_amount) || 0,
    customerId,
    paymentStatus: sale.payment_status,
  });

  if (plan.kind === "unchanged") return { ok: true, changed: false };
  if (plan.kind === "reject") return { ok: false, message: plan.message };
  if (!customerId) {
    return { ok: false, message: "Select the customer before applying a pending credit note." };
  }

  const release = async () => {
    const { error: releaseError } = await (
      supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ error: { message?: string } | null }>;
      }
    ).rpc("release_sale_credit", { p_sale_id: params.saleId });
    if (releaseError) throw releaseError;
    await applyRecomputedSalePaymentState(params.saleId, params.organizationId, supabase);
  };

  if (plan.kind === "release") {
    await release();
    return { ok: true, changed: true, applied: 0, payable: plan.payable };
  }

  if (plan.releaseFirst) await release();

  const { returns: cnPool } = await getAvailableCN(supabase, customerId, params.organizationId, {
    includeUnlinkedAdjusted: true,
  });
  if (!cnPool.length) {
    return {
      ok: false,
      message: "No pending credit note is available for this customer.",
    };
  }

  await applyCreditNoteFifoToSale(supabase, {
    organizationId: params.organizationId,
    saleId: params.saleId,
    amount: plan.amount,
    cnPool,
    adjustedBy: params.adjustedBy ?? null,
    customerNameFallback: params.customerName || undefined,
    notes: "POS edit credit apply",
    idempotencyKey: newPosCreditIdempotencyKey(),
  });

  return {
    ok: true,
    changed: true,
    applied: plan.resultingAdjust,
    payable: plan.payable,
  };
}
