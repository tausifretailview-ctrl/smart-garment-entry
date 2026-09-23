import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * One idempotency key per POS save attempt. Retries reuse it.
 * Each credit-note chunk appends the note id so a partial FIFO can resume.
 */
export function newPosCreditIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pos-credit-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function posCreditChunkKey(baseKey: string, creditNoteId: string): string {
  const base = String(baseKey || "").trim();
  const note = String(creditNoteId || "").trim();
  if (!base || !note) {
    throw new Error("Credit apply requires an idempotency key and a credit note.");
  }
  return `${base}:${note}`;
}

export type ApplyPosCreditParams = {
  organizationId: string;
  saleId: string;
  idempotencyKey: string;
  sourceDocumentId: string;
  amountApplied: number;
  adjustedBy?: string | null;
  notes?: string | null;
};

export type ApplyPosCreditResult = {
  alreadyApplied: boolean;
  amountApplied: number;
  voucherEntryId: string;
  voucherNumber: string;
  raw: unknown;
};

function readRpcObject(data: unknown): Record<string, unknown> | null {
  if (data == null) return null;
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object" && data[0] !== null) {
    return data[0] as Record<string, unknown>;
  }
  if (typeof data === "object") return data as Record<string, unknown>;
  return null;
}

/**
 * Awaited wrapper around `apply_pos_credit`. The RPC calls `adjust_invoice_balance`
 * once per key. A retry with the same key returns the first result and does not
 * apply the credit again.
 */
export async function applyPosCredit(
  supabase: SupabaseClient,
  params: ApplyPosCreditParams,
): Promise<ApplyPosCreditResult> {
  const key = String(params.idempotencyKey || "").trim();
  if (!key) throw new Error("Credit apply requires an idempotency key.");

  const sb = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };
  const { data, error } = await sb.rpc("apply_pos_credit", {
    p_organization_id: params.organizationId,
    p_sale_id: params.saleId,
    p_idempotency_key: key,
    p_source_document_id: params.sourceDocumentId,
    p_amount_applied: params.amountApplied,
    p_adjusted_by: params.adjustedBy ?? null,
    p_notes: params.notes ?? null,
  });
  if (error) {
    throw new Error(error.message || "Could not apply credit to this bill.");
  }
  const row = readRpcObject(data);
  return {
    alreadyApplied: row?.already_applied === true,
    amountApplied: Number(row?.amount_applied ?? params.amountApplied) || 0,
    voucherEntryId: String(row?.voucher_entry_id ?? row?.voucher_id ?? row?.id ?? ""),
    voucherNumber: String(row?.voucher_number ?? ""),
    raw: data,
  };
}
