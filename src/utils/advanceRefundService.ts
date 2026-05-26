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

function isRecoverableSchemaError(err: unknown): boolean {
  const m = String((err as { message?: string })?.message || "").toLowerCase();
  return (
    m.includes("schema cache") ||
    (m.includes("column") && m.includes("does not exist")) ||
    m.includes("could not find") ||
    (err as { code?: string })?.code === "42703" ||
    (err as { code?: string })?.code === "PGRST204"
  );
}

function financialYearLabel(pDate: string): string {
  const d = new Date(`${pDate}T12:00:00`);
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const start = month >= 4 ? year : year - 1;
  const end = start + 1;
  const yy = (y: number) => String(y).slice(-2);
  return `${yy(start)}-${yy(end)}`;
}

/** ARF/YY-YY/N — RPC when migrated, else count existing voucher_entries. */
async function generateArfNumber(
  client: SupabaseClient,
  organizationId: string,
  refundYmd: string,
): Promise<string> {
  const { data: rpcNum, error: rpcErr } = await client.rpc("generate_voucher_number", {
    p_type: "advance_refund",
    p_date: refundYmd,
  });
  if (!rpcErr && rpcNum) return String(rpcNum);

  const fy = financialYearLabel(refundYmd);
  const prefix = `ARF/${fy}/`;

  const { data: existing } = await client
    .from("voucher_entries")
    .select("voucher_number")
    .eq("organization_id", organizationId)
    .like("voucher_number", `${prefix}%`)
    .is("deleted_at", null);

  let maxSeq = 0;
  for (const row of existing || []) {
    const m = String(row.voucher_number || "").match(/ARF\/\d+-\d+\/(\d+)$/i);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }

  const { data: legacyRefunds, error: arErr } = await client
    .from("advance_refunds")
    .select("refund_number")
    .eq("organization_id", organizationId)
    .like("refund_number", `${prefix}%`);

  if (!arErr) {
    for (const row of legacyRefunds || []) {
      const m = String((row as { refund_number?: string }).refund_number || "").match(
        /ARF\/\d+-\d+\/(\d+)$/i,
      );
      if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
    }
  }

  return `${prefix}${maxSeq + 1}`;
}

async function insertAdvanceRefundRow(
  client: SupabaseClient,
  payload: {
    organization_id: string;
    advance_id: string;
    refund_amount: number;
    payment_method: string;
    reason: string | null;
    created_by: string | null;
    refund_date: string;
    refund_number: string;
    voucher_entry_id: string;
  },
): Promise<{ id: string; usedExtendedColumns: boolean }> {
  const extended = {
    organization_id: payload.organization_id,
    advance_id: payload.advance_id,
    refund_amount: payload.refund_amount,
    payment_method: payload.payment_method,
    reason: payload.reason,
    created_by: payload.created_by,
    refund_date: payload.refund_date,
    refund_number: payload.refund_number,
    voucher_entry_id: payload.voucher_entry_id,
  };

  const { data, error } = await client
    .from("advance_refunds")
    .insert(extended)
    .select("id")
    .single();

  if (!error && data?.id) {
    return { id: String(data.id), usedExtendedColumns: true };
  }

  if (!isRecoverableSchemaError(error)) throw error;

  const legacy = {
    organization_id: payload.organization_id,
    advance_id: payload.advance_id,
    refund_amount: payload.refund_amount,
    payment_method: payload.payment_method,
    reason: payload.reason,
    created_by: payload.created_by,
    refund_date: payload.refund_date,
  };

  const { data: legacyRow, error: legacyErr } = await client
    .from("advance_refunds")
    .insert(legacy)
    .select("id")
    .single();

  if (legacyErr) throw legacyErr;
  if (!legacyRow?.id) throw new Error("Refund record not created");

  return { id: String(legacyRow.id), usedExtendedColumns: false };
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

  const refundNumber = await generateArfNumber(client, params.organizationId, refundYmd);

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

  const { id: refundId, usedExtendedColumns } = await insertAdvanceRefundRow(client, {
    organization_id: params.organizationId,
    advance_id: params.advanceId,
    refund_amount: amount,
    payment_method: params.method,
    reason: params.reason?.trim() || null,
    created_by: params.createdBy ?? null,
    refund_date: refundYmd,
    refund_number: refundNumber,
    voucher_entry_id: voucherEntryId,
  });

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

  if (!usedExtendedColumns) {
    console.warn(
      "[advance_refund] Run migration 20260630120000_advance_refund_arf_series.sql in Supabase for refund_number / voucher_entry_id on advance_refunds.",
    );
  }

  return { refundId, refundNumber, voucherEntryId };
}

/** Load advance_refunds rows (works before/after ARF migration). */
export async function fetchAdvanceRefundsForAdvances(
  client: SupabaseClient,
  organizationId: string,
  advanceIds: string[],
  options?: { startDate?: string; endDate?: string; includeAdvanceNumber?: boolean },
): Promise<Record<string, unknown>[]> {
  if (advanceIds.length === 0) return [];

  const base =
    "id, advance_id, refund_amount, refund_date, payment_method, reason, created_at";
  const extended = `${base}, refund_number, voucher_entry_id`;
  const join = options?.includeAdvanceNumber ? ", customer_advances(advance_number)" : "";

  const run = async (select: string) => {
    let q = client
      .from("advance_refunds")
      .select(select + join)
      .eq("organization_id", organizationId)
      .in("advance_id", advanceIds)
      .order("refund_date", { ascending: true });
    if (options?.startDate) q = q.gte("refund_date", options.startDate);
    if (options?.endDate) q = q.lte("refund_date", options.endDate);
    return q;
  };

  const ext = await run(extended);
  if (!ext.error) return (ext.data || []) as Record<string, unknown>[];

  if (!isRecoverableSchemaError(ext.error)) throw ext.error;

  const leg = await run(base);
  if (leg.error) throw leg.error;
  return (leg.data || []) as Record<string, unknown>[];
}

/** Reverse mistaken advance refund (restores advance available balance). */
export async function deleteAdvanceRefund(params: {
  organizationId: string;
  refundId: string;
  client?: SupabaseClient;
}): Promise<void> {
  const client = params.client ?? defaultClient;

  let refund: {
    id: string;
    advance_id: string;
    refund_amount: number;
    voucher_entry_id?: string | null;
    customer_advances?: { amount?: number; used_amount?: number; status?: string };
  } | null = null;

  const fullSelect = await client
    .from("advance_refunds")
    .select(
      "id, advance_id, refund_amount, voucher_entry_id, organization_id, customer_advances(amount, used_amount, status)",
    )
    .eq("id", params.refundId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();

  if (!fullSelect.error && fullSelect.data) {
    refund = fullSelect.data as typeof refund;
  } else if (isRecoverableSchemaError(fullSelect.error)) {
    const legacySelect = await client
      .from("advance_refunds")
      .select(
        "id, advance_id, refund_amount, organization_id, customer_advances(amount, used_amount, status)",
      )
      .eq("id", params.refundId)
      .eq("organization_id", params.organizationId)
      .maybeSingle();
    if (legacySelect.error) throw legacySelect.error;
    refund = legacySelect.data as typeof refund;
    if (refund) {
      const { data: voucher } = await client
        .from("voucher_entries")
        .select("id")
        .eq("organization_id", params.organizationId)
        .eq("reference_type", "customer")
        .eq("voucher_type", "payment")
        .ilike("description", `%${refund.advance_id}%`)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      refund.voucher_entry_id = voucher?.id ?? null;
    }
  } else if (fullSelect.error) {
    throw fullSelect.error;
  }

  if (!refund) throw new Error("Refund not found");

  const advance = refund.customer_advances;
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
