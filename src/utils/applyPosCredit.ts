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
 *
 * Interim resilience (2026-09): the `apply_pos_credit` migration
 * (20261223120000) may not be applied in production yet, in which case PostgREST
 * answers PGRST202 "Could not find the function ... in the schema cache". When
 * that specific error is seen, fall back to calling the long-deployed
 * `adjust_invoice_balance` RPC directly with the same arguments. That is the
 * canonical credit-note write path, so the landmine rule (CN adjustments only
 * via `adjust_invoice_balance`) still holds. The fallback cannot stamp the
 * idempotency key (that column ships in the same pending migration), so a
 * retried save after a fallback apply relies on `used_amount` headroom instead
 * of key dedupe. Once the migration is applied in prod the primary path
 * succeeds and this fallback never fires. Remove it then if desired.
 */
export async function applyPosCredit(
  supabase: SupabaseClient,
  params: ApplyPosCreditParams,
): Promise<ApplyPosCreditResult> {
  const key = String(params.idempotencyKey || "").trim();
  if (!key) throw new Error("Credit apply requires an idempotency key.");

  const sb = supabase as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
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
  if (!error) {
    return readApplyResult(data, params.amountApplied);
  }
  if (!isMissingRpcError(error, "apply_pos_credit")) {
    throw new Error(error.message || "Could not apply credit to this bill.");
  }
  // apply_pos_credit is unknown to PostgREST (migration not applied or stale
  // schema cache): apply through the deployed adjust_invoice_balance instead.
  const fallback = await sb.rpc("adjust_invoice_balance", {
    p_organization_id: params.organizationId,
    p_invoice_id: params.saleId,
    p_adjustment_type: "CREDIT_NOTE",
    p_source_document_id: params.sourceDocumentId,
    p_amount_applied: params.amountApplied,
    p_adjusted_by: params.adjustedBy ?? null,
    p_notes: params.notes ?? null,
  });
  if (fallback.error) {
    throw new Error(fallback.error.message || "Could not apply credit to this bill.");
  }
  return readApplyResult(fallback.data, params.amountApplied);
}

/**
 * True only for PostgREST "unknown function" errors (PGRST202 / schema-cache
 * message mentioning the function). Business errors from inside the RPC must
 * never trigger the fallback.
 */
function isMissingRpcError(
  error: { message?: string; code?: string } | null,
  fnName: string,
): boolean {
  if (!error) return false;
  if (typeof error.code === "string" && error.code === "PGRST202") return true;
  const msg = String(error.message || "");
  return msg.includes(fnName) && /schema cache/i.test(msg);
}

function readApplyResult(data: unknown, requestedAmount: number): ApplyPosCreditResult {
  const row = readRpcObject(data);
  return {
    alreadyApplied: row?.already_applied === true,
    amountApplied: Number(row?.amount_applied ?? requestedAmount) || 0,
    voucherEntryId: String(row?.voucher_entry_id ?? row?.voucher_id ?? row?.id ?? ""),
    voucherNumber: String(row?.voucher_number ?? ""),
    raw: data,
  };
}
