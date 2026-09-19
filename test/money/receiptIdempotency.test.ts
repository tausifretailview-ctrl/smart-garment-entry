import { describe, expect, it } from "vitest";
import {
  DUPLICATE_RECEIPT_MESSAGE,
  DuplicateReceiptSubmissionError,
  RECEIPT_OVER_CREDIT_MESSAGE,
  ReceiptOverCreditError,
  describeReceiptGuardError,
  isDuplicateReceiptSubmission,
  isReceiptOverCreditRejection,
  newReceiptSubmissionId,
  receiptRequestId,
  toReceiptGuardError,
} from "../../src/utils/receiptIdempotency";

describe("receipt idempotency keys", () => {
  it("mints a distinct id per submission", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newReceiptSubmissionId()));
    expect(ids.size).toBe(200);
  });

  it("is stable per voucher part within one submission (retry collides row-for-row)", () => {
    const sub = "sub-1";
    expect(receiptRequestId(sub, 0)).toBe(receiptRequestId(sub, 0));
    expect(receiptRequestId(sub, 0)).not.toBe(receiptRequestId(sub, 1));
    expect(receiptRequestId(sub, "ob")).not.toBe(receiptRequestId("sub-2", "ob"));
  });

  it("does NOT dedupe two deliberate payments on the same invoice/amount/method", () => {
    // Legitimate pattern: cashier takes ₹500 now and another ₹500 later.
    const first = receiptRequestId(newReceiptSubmissionId(), "sale-1");
    const second = receiptRequestId(newReceiptSubmissionId(), "sale-1");
    expect(first).not.toBe(second);
  });
});

describe("receipt guard error mapping", () => {
  const dupErr = {
    code: "23505",
    message:
      'duplicate key value violates unique constraint "uq_voucher_entries_client_request_active"',
  };
  const capErr = {
    code: "P0431",
    message: "RECEIPT_OVER_CREDIT: invoice POS/26-27/765 is already settled to 9500",
  };

  it("detects the idempotency-key collision only", () => {
    expect(isDuplicateReceiptSubmission(dupErr)).toBe(true);
    expect(
      isDuplicateReceiptSubmission({
        code: "23505",
        message: 'duplicate key value violates unique constraint "uq_voucher_entries_number_active"',
      }),
    ).toBe(false);
    expect(isDuplicateReceiptSubmission(null)).toBe(false);
  });

  it("detects the server-side invoice cap rejection", () => {
    expect(isReceiptOverCreditRejection(capErr)).toBe(true);
    expect(isReceiptOverCreditRejection({ code: "23505", message: "x" })).toBe(false);
  });

  it("returns friendly, non-technical messages", () => {
    expect(describeReceiptGuardError(dupErr)).toBe(DUPLICATE_RECEIPT_MESSAGE);
    expect(describeReceiptGuardError(capErr)).toBe(RECEIPT_OVER_CREDIT_MESSAGE);
    expect(describeReceiptGuardError(new Error("network"))).toBeNull();
  });

  it("maps to typed errors and passes unrelated errors through", () => {
    expect(toReceiptGuardError(dupErr)).toBeInstanceOf(DuplicateReceiptSubmissionError);
    expect(toReceiptGuardError(capErr)).toBeInstanceOf(ReceiptOverCreditError);
    expect(toReceiptGuardError(new Error("timeout"))).toBeNull();
  });
});

describe("live-status SQL — do not roll the guard back", () => {
  it("pastes the go-live window and never drops the trigger or unique index", async () => {
    const { readFile } = await import("node:fs/promises");
    const sql = await readFile(
      new URL("../../scripts/receipt-guard-live-status-2026-09-19.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("2026-09-18 20:10:54");
    expect(sql).toContain("uq_voucher_entries_client_request_active");
    expect(sql).toContain("trg_enforce_receipt_within_invoice_cap");
    expect(sql).toContain("remaining_before");
    expect(sql.toUpperCase()).not.toMatch(/DROP\s+TRIGGER/);
    expect(sql.toUpperCase()).not.toMatch(/DROP\s+INDEX/);
    expect(sql.toUpperCase()).not.toMatch(/\bDELETE\b/);
    expect(sql.toUpperCase()).not.toMatch(/\bUPDATE\b/);
    expect(sql).toContain("fn_stats.calls");
    expect(sql).toContain("db_stats.stats_reset");
    expect(sql).not.toMatch(/^\s+p\.calls,/m);
  });

  it("B2-ACD follow-up names the 14 receipts and stays read-only", async () => {
    const { readFile } = await import("node:fs/promises");
    const sql = await readFile(
      new URL("../../scripts/receipt-guard-live-status-B2-ACD-2026-09-19.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("2026-09-18 20:10:54");
    expect(sql).toContain("Name the 14 receipts");
    expect(sql).toContain("remaining_before");
    expect(sql).toContain("customer_payment");
    expect(sql).toContain("uq_voucher_entries_client_request_active");
    expect(sql).toContain("trg_enforce_receipt_within_invoice_cap");
    expect(sql.toUpperCase()).not.toMatch(/DROP\s+TRIGGER/);
    expect(sql.toUpperCase()).not.toMatch(/DROP\s+INDEX/);
    expect(sql.toUpperCase()).not.toMatch(/\bDELETE\b/);
    expect(sql.toUpperCase()).not.toMatch(/\bUPDATE\b/);
  });

  it("ACD follow-up stays read-only and splits advance FIFO from cash/UPI already-zero", async () => {
    const { readFile } = await import("node:fs/promises");
    const sql = await readFile(
      new URL("../../scripts/receipt-guard-live-status-ACD-2026-09-19.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("2026-09-18 20:10:54");
    expect(sql).toContain("remaining_before");
    expect(sql).toContain("advance_adjustment");
    expect(sql).toContain("C2. SHREEVASTAV shape only");
    expect(sql).toContain("uq_voucher_entries_client_request_active");
    expect(sql).toContain("trg_enforce_receipt_within_invoice_cap");
    expect(sql.toUpperCase()).not.toMatch(/DROP\s+TRIGGER/);
    expect(sql.toUpperCase()).not.toMatch(/DROP\s+INDEX/);
    expect(sql.toUpperCase()).not.toMatch(/\bDELETE\b/);
    expect(sql.toUpperCase()).not.toMatch(/\bUPDATE\b/);
  });
});
