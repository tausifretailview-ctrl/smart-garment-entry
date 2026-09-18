/**
 * Duplicate-receipt protection (Step 2 of the 2026-09 duplicate-receipt audit).
 *
 * Two independent mechanisms back this up:
 *  1. `voucher_entries.client_request_id` + partial unique index
 *     `uq_voucher_entries_client_request_active` — dedupes *retries of one
 *     submission*. A new, deliberate second payment gets a new submission id
 *     and is never blocked (see docs/duplicate-receipt-steps-1-3-2026-09-19.md
 *     for why a value/time signature key would reject legitimate patterns such
 *     as two different advances applied to one invoice in the same second).
 *  2. Trigger `trg_enforce_receipt_within_invoice_cap` — atomic, in-transaction
 *     cap (`FOR UPDATE` on the sale) so two racing submissions cannot both pass
 *     the client-side outstanding check.
 */

/** One id per user submit. Every voucher of that submit derives from it. */
export function newReceiptSubmissionId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof g.crypto?.randomUUID === "function") return g.crypto.randomUUID();
  return `rcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Stable per-voucher key inside one submission.
 * `part` distinguishes the vouchers of a multi-invoice / OB+invoice submit, so a
 * retry of the same submit collides row-for-row instead of half-inserting.
 */
export function receiptRequestId(submissionId: string, part: string | number): string {
  return `${submissionId}:${part}`;
}

/** Postgres unique violation on the receipt idempotency index. */
export function isDuplicateReceiptSubmission(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  const msg = String(e.message || "");
  return (
    e.code === "23505" && msg.includes("uq_voucher_entries_client_request_active")
  );
}

/** Server-side invoice cap rejection (`trg_enforce_receipt_within_invoice_cap`). */
export function isReceiptOverCreditRejection(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  return e.code === "P0431" || /RECEIPT_OVER_CREDIT/i.test(String(e.message || ""));
}

export const DUPLICATE_RECEIPT_MESSAGE =
  "This payment was already recorded — it was not saved twice.";

export const RECEIPT_OVER_CREDIT_MESSAGE =
  "This bill is already fully settled, so the payment was not recorded. Refresh and check the bill before collecting again.";

/** Friendly text for either duplicate-protection rejection, else null. */
export function describeReceiptGuardError(err: unknown): string | null {
  if (isDuplicateReceiptSubmission(err)) return DUPLICATE_RECEIPT_MESSAGE;
  if (isReceiptOverCreditRejection(err)) return RECEIPT_OVER_CREDIT_MESSAGE;
  return null;
}

export class DuplicateReceiptSubmissionError extends Error {
  constructor() {
    super(DUPLICATE_RECEIPT_MESSAGE);
    this.name = "DuplicateReceiptSubmissionError";
  }
}

export class ReceiptOverCreditError extends Error {
  constructor(detail?: string) {
    super(detail || RECEIPT_OVER_CREDIT_MESSAGE);
    this.name = "ReceiptOverCreditError";
  }
}

/** Map a raw insert error onto the typed guard errors; returns null when unrelated. */
export function toReceiptGuardError(err: unknown): Error | null {
  if (isDuplicateReceiptSubmission(err)) return new DuplicateReceiptSubmissionError();
  if (isReceiptOverCreditRejection(err)) return new ReceiptOverCreditError();
  return null;
}
