import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import { supabase as defaultClient } from "@/integrations/supabase/client";
import {
  deleteJournalEntryByReference,
  recordCustomerAdvanceRefundJournalEntry,
} from "@/utils/accounting/journalService";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";
import { buildAdvanceRefundDescription } from "@/utils/advanceRefundVoucher";

export type AdvanceRefundRow = {
  id: string;
  organization_id: string;
  advance_id: string;
  refund_amount: number;
  refund_date: string;
  payment_method: string | null;
  reason: string | null;
  refund_number: string | null;
  voucher_entry_id: string | null;
  created_at: string | null;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function deriveAdvanceStatus(amount: number, usedAmount: number): string {
  const available = roundMoney(amount - usedAmount);
  if (available <= 0.01) return "refunded";
  if (usedAmount > 0.01) return "partially_used";
  return "active";
}

/** Record advance refund: ARF voucher + advance_refunds row + advance used_amount bump. */
export async function createAdvanceRefund(params: {
  organizationId: string;
  advanceId: string;
  amount: number;
  method: string;
  reason?: string | null;
  refundDate?: string;
  createdBy?: string | null;
  client?: SupabaseClient;
}): Promise<{ refundId: string; refundNumber: string; voucherEntryId: string }> {
  const client = params.client ?? defaultClient;
  const refundYmd = params.refundDate ?? format(new Date(), "yyyy-MM-dd");
  const amount = roundMoney(params.amount);
  if (amount <= 0) throw new Error("Refund amount must be greater than zero");

  const { data: adv, error: fetchErr } = await client
    .from("customer_advances")
    .select("id, customer_id, advance_number, amount, used_amount, status, customers(customer_name)")
    .eq("id", params.advanceId)
    .single();
  if (fetchErr) throw fetchErr;

  const customerId = (adv as { customer_id?: string }).customer_id;
  if (!customerId) throw new Error("Advance has no linked customer");

  const available = roundMoney(
    Number(adv.amount || 0) - Number(adv.used_amount || 0),
  );
  if (amount > available + 0.01) {
    throw new Error("Refund amount exceeds available balance");
  }

  const snapUsed = Number(adv.used_amount || 0);
  const snapStatus = String(adv.status || "active");
  const newUsed = roundMoney(snapUsed + amount);
  const newStatus = deriveAdvanceStatus(Number(adv.amount || 0), newUsed);

  const { data: arfNumber, error: arfErr } = await client.rpc("generate_voucher_number", {
    p_type: "advance_refund",
    p_date: refundYmd,
  });
  if (arfErr) throw arfErr;
  const refundNumber = String(arfNumber || `ARF/${refundYmd}/1`);

  const customerName =
    (adv as { customers?: { customer_name?: string } }).customers?.customer_name ?? "";
  const advanceNumber = String((adv as { advance_number?: string }).advance_number || "");
  const voucherDescription = buildAdvanceRefundDescription({
    advanceNumber,
    customerName,
    reason: params.reason,
  });

  const { data: voucherRow, error: voucherErr } = await client
    .from("voucher_entries")
    .insert({
      organization_id: params.organizationId,
      voucher_type: "payment",
      voucher_number: refundNumber,
      voucher_date: refundYmd,
      reference_type: "customer",
      reference_id: customerId,
      total_amount: amount,
      payment_method: params.method,
      description: voucherDescription,
      created_by: params.createdBy ?? null,
    })
    .select("id")
    .single();
  if (voucherErr) throw voucherErr;
  const voucherEntryId = voucherRow?.id as string;
  if (!voucherEntryId) throw new Error("Payment voucher not created");

  const { data: refundRow, error: refundErr } = await client
    .from("advance_refunds")
    .insert({
      organization_id: params.organizationId,
      advance_id: params.advanceId,
      refund_amount: amount,
      payment_method: params.method,
      reason: params.reason?.trim() || null,
      created_by: params.createdBy ?? null,
      refund_date: refundYmd,
      refund_number: refundNumber,
      voucher_entry_id: voucherEntryId,
    })
    .select("id")
    .single();
  if (refundErr) {
    await client
      .from("voucher_entries")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", voucherEntryId);
    throw refundErr;
  }
  const refundId = refundRow?.id as string;
  if (!refundId) throw new Error("Refund record not created");

  const { error: updateErr } = await client
    .from("customer_advances")
    .update({ used_amount: newUsed, status: newStatus })
    .eq("id", params.advanceId);
  if (updateErr) {
    await client.from("advance_refunds").delete().eq("id", refundId);
    await client
      .from("voucher_entries")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", voucherEntryId);
    throw updateErr;
  }

  const { data: acctRef } = await client
    .from("settings")
    .select("accounting_engine_enabled")
    .eq("organization_id", params.organizationId)
    .maybeSingle();
  if (isAccountingEngineEnabled(acctRef as { accounting_engine_enabled?: boolean } | null)) {
    try {
      await recordCustomerAdvanceRefundJournalEntry(
        refundId,
        params.organizationId,
        amount,
        params.method,
        refundYmd,
        voucherDescription,
        client,
      );
    } catch (glErr) {
      await deleteJournalEntryByReference(
        params.organizationId,
        "CustomerAdvanceRefund",
        refundId,
        client,
      );
      await client
        .from("customer_advances")
        .update({ used_amount: snapUsed, status: snapStatus })
        .eq("id", params.advanceId);
      await client.from("advance_refunds").delete().eq("id", refundId);
      await client
        .from("voucher_entries")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", voucherEntryId);
      throw glErr;
    }
  }

  return { refundId, refundNumber, voucherEntryId };
}

/** Reverse mistaken advance refund (restores advance available balance). */
export async function deleteAdvanceRefund(params: {
  organizationId: string;
  refundId: string;
  client?: SupabaseClient;
}): Promise<void> {
  const client = params.client ?? defaultClient;

  const { data: refund, error: refErr } = await client
    .from("advance_refunds")
    .select(
      "id, advance_id, refund_amount, voucher_entry_id, organization_id, customer_advances(amount, used_amount, status)",
    )
    .eq("id", params.refundId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();
  if (refErr) throw refErr;
  if (!refund) throw new Error("Refund not found");

  const advance = (refund as { customer_advances?: { amount?: number; used_amount?: number; status?: string } })
    .customer_advances;
  if (!advance) throw new Error("Linked advance not found");

  const refundAmount = Number(refund.refund_amount || 0);
  const snapUsed = Number(advance.used_amount || 0);
  const snapStatus = String(advance.status || "active");
  const newUsed = roundMoney(Math.max(0, snapUsed - refundAmount));
  const newStatus = deriveAdvanceStatus(Number(advance.amount || 0), newUsed);

  const { error: advErr } = await client
    .from("customer_advances")
    .update({ used_amount: newUsed, status: newStatus })
    .eq("id", refund.advance_id);
  if (advErr) throw advErr;

  if (refund.voucher_entry_id) {
    await client
      .from("voucher_entries")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", refund.voucher_entry_id);
  }

  const { data: acctRef } = await client
    .from("settings")
    .select("accounting_engine_enabled")
    .eq("organization_id", params.organizationId)
    .maybeSingle();
  if (isAccountingEngineEnabled(acctRef as { accounting_engine_enabled?: boolean } | null)) {
    await deleteJournalEntryByReference(
      params.organizationId,
      "CustomerAdvanceRefund",
      params.refundId,
      client,
    );
  }

  const { error: delErr } = await client.from("advance_refunds").delete().eq("id", params.refundId);
  if (delErr) {
    await client
      .from("customer_advances")
      .update({ used_amount: snapUsed, status: snapStatus })
      .eq("id", refund.advance_id);
    throw delErr;
  }
}
