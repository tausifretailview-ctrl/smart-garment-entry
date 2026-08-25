import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Step 6 — the 2026-08-25 717 / 647 / ₹1,10,91,413 headline measured a
 * recompute hole, not (necessarily) live ELLA NOOR balances.
 *
 * Live party (_get_customer_party_balances_rows / reconcile) subtracts BOTH
 * customer_advances.used_amount (advances_applied) AND unused_advances, and
 * excludes advance_adjustment memos from receipt_payments.
 *
 * Today's seven-component audit subtracted unused_advances only and excluded
 * the same memos from receipts. Consumed used_amount therefore sat in a hole
 * between the two components. Sana Nasir: gap ₹11,00,900 = used_amount.
 *
 * pending_sale_returns is remaining credit (like unused_advances). CN
 * consumption is sale_return_adjust (like used_amount). Including
 * credit_note_adjustment in receipts AND subtracting SRA reintroduces the
 * Farhaan Fab double-count. Do not copy the advance fix onto CN without a
 * live CN-heavy close check (STEP 6b).
 */

export const DRIFT_THRESHOLD = 1;

export type RecomputeParts = {
  opening: number;
  invoiced: number;
  sra: number;
  receiptsExclMemo: number;
  adjustment: number;
  pendingSaleReturns: number;
  unusedAdvances: number;
};

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isAdvanceMemo(paymentMethod: string | null, description: string | null): boolean {
  const pm = (paymentMethod || "").toLowerCase();
  const desc = (description || "").toLowerCase().trim();
  if (pm === "advance_adjustment") return true;
  return desc.startsWith("adjusted from advance balance") || desc.startsWith("advance applied to ");
}

export function isCreditNoteMemo(paymentMethod: string | null, description: string | null): boolean {
  const pm = (paymentMethod || "").toLowerCase();
  const desc = (description || "").toLowerCase().trim();
  if (pm === "credit_note_adjustment") return true;
  return (
    desc.includes("credit note adjusted")
    || desc.includes("cn adjusted")
    || desc.startsWith("credit note adjusted against invoice")
    || desc.startsWith("credit note from sale return")
    || /credit note .*(->|\u2192)/.test(desc)
  );
}

export function isSettlementMemo(paymentMethod: string | null, description: string | null): boolean {
  return isAdvanceMemo(paymentMethod, description) || isCreditNoteMemo(paymentMethod, description);
}

/** Remaining CN credit — same shape as unused_advances (pool leftover, not consumption). */
export function remainingSaleReturnCredit(
  netAmount: number,
  creditAvailableBalance: number | null,
  linkedSaleReturnAdjust: number,
): number {
  const raw = creditAvailableBalance != null
    ? creditAvailableBalance
    : netAmount - linkedSaleReturnAdjust;
  return Math.max(0, raw);
}

export function recomputed7ExclMemo(p: RecomputeParts): number {
  return round2(
    p.opening + p.invoiced - p.sra - p.receiptsExclMemo + p.adjustment
    - p.pendingSaleReturns - p.unusedAdvances,
  );
}

/** User's correction: put advance_adjustment vouchers into receipts. unused_advances stays remaining-only. */
export function recomputed7InclAdvanceMemo(p: RecomputeParts, advanceMemoReceipts: number): number {
  return recomputed7ExclMemo({ ...p, receiptsExclMemo: p.receiptsExclMemo + advanceMemoReceipts });
}

/** Party-parity for advances: keep memo exclusion, also subtract used_amount (reconcile advances_applied). */
export function recomputed7PlusUsedAmount(p: RecomputeParts, usedAmount: number): number {
  return round2(recomputed7ExclMemo(p) - usedAmount);
}

/** Includes CN memos too. Farhaan Fab: this double-counts when SRA already holds the apply. */
export function recomputed7InclAllMemo(
  p: RecomputeParts,
  advanceMemoReceipts: number,
  cnMemoReceipts: number,
): number {
  return recomputed7ExclMemo({
    ...p,
    receiptsExclMemo: p.receiptsExclMemo + advanceMemoReceipts + cnMemoReceipts,
  });
}

export function formulasIdenticalWhenNoMemos(
  p: RecomputeParts,
  advanceMemoReceipts: number,
  cnMemoReceipts: number,
): boolean {
  if (advanceMemoReceipts > DRIFT_THRESHOLD || cnMemoReceipts > DRIFT_THRESHOLD) return false;
  const excl = recomputed7ExclMemo(p);
  return (
    Math.abs(excl - recomputed7InclAdvanceMemo(p, advanceMemoReceipts)) <= DRIFT_THRESHOLD
    && Math.abs(excl - recomputed7InclAllMemo(p, advanceMemoReceipts, cnMemoReceipts)) <= DRIFT_THRESHOLD
  );
}

/** Sana Nasir — hand-checked 2026-08-25 from raw vouchers / advances. Opening and SRA = 0. */
export const SANA_NASIR = {
  invoiced: 1_114_450,
  cashUpi: 13_550,
  advanceDeposited: 1_120_900,
  usedAmount: 1_100_900,
  unusedAdvance: 20_000,
  advanceMemoVouchers: 1_100_900,
  nAdvanceMemoVouchers: 93,
  nRealCashVouchers: 1,
  partySigned: -20_000,
} as const;

describe("Sana Nasir — recompute hole, not live party", () => {
  const parts: RecomputeParts = {
    opening: 0,
    invoiced: SANA_NASIR.invoiced,
    sra: 0,
    receiptsExclMemo: SANA_NASIR.cashUpi,
    adjustment: 0,
    pendingSaleReturns: 0,
    unusedAdvances: SANA_NASIR.unusedAdvance,
  };

  it("used_amount + real cash equals total invoiced (every billed rupee accounted for)", () => {
    expect(SANA_NASIR.usedAmount + SANA_NASIR.cashUpi).toBe(SANA_NASIR.invoiced);
  });

  it("unused advance equals the live −₹20,000 Cr", () => {
    expect(SANA_NASIR.advanceDeposited - SANA_NASIR.usedAmount).toBe(SANA_NASIR.unusedAdvance);
    expect(-SANA_NASIR.unusedAdvance).toBe(SANA_NASIR.partySigned);
  });

  it("today's excl-memo recompute overstates her debt by used_amount (₹11,00,900)", () => {
    const excl = recomputed7ExclMemo(parts);
    expect(excl).toBe(1_080_900);
    expect(round2(excl - SANA_NASIR.partySigned)).toBe(SANA_NASIR.usedAmount);
    expect(round2(excl - SANA_NASIR.partySigned)).toBe(SANA_NASIR.advanceMemoVouchers);
  });

  it("including advance_adjustment in receipts matches the live page exactly", () => {
    const incl = recomputed7InclAdvanceMemo(parts, SANA_NASIR.advanceMemoVouchers);
    expect(incl).toBe(SANA_NASIR.partySigned);
  });

  it("subtracting used_amount (party advances_applied) is equivalent when vouchers match used", () => {
    expect(recomputed7PlusUsedAmount(parts, SANA_NASIR.usedAmount)).toBe(SANA_NASIR.partySigned);
    expect(recomputed7PlusUsedAmount(parts, SANA_NASIR.usedAmount)).toBe(
      recomputed7InclAdvanceMemo(parts, SANA_NASIR.advanceMemoVouchers),
    );
  });

  it("does not double-count: unused_advances is remaining pool, not consumption", () => {
    const usedPlusUnused = SANA_NASIR.usedAmount + SANA_NASIR.unusedAdvance;
    expect(usedPlusUnused).toBe(SANA_NASIR.advanceDeposited);
    const incl = recomputed7InclAdvanceMemo(parts, SANA_NASIR.advanceMemoVouchers);
    expect(incl).toBe(parts.invoiced - parts.receiptsExclMemo - SANA_NASIR.usedAmount - parts.unusedAdvances);
  });

  it("the 1e paid_amount join would mis-tag this hole as party_trusts_paid_amount", () => {
    const gap = recomputed7ExclMemo(parts) - SANA_NASIR.partySigned;
    expect(Math.abs(gap - SANA_NASIR.usedAmount) <= DRIFT_THRESHOLD).toBe(true);
  });
});

describe("pending_sale_returns is remaining-balance, like unused_advances", () => {
  it("prefers credit_available_balance when set (remainder after apply)", () => {
    expect(remainingSaleReturnCredit(10_000, 2_000, 8_000)).toBe(2_000);
  });

  it("falls back to net minus linked SRA when CAB is null", () => {
    expect(remainingSaleReturnCredit(10_000, null, 6_000)).toBe(4_000);
  });

  it("never returns the consumed slice — that is SRA / CN apply, not pending_sr", () => {
    const net = 10_000;
    const sra = 8_000;
    const remaining = remainingSaleReturnCredit(net, 2_000, sra);
    expect(remaining).toBe(2_000);
    expect(remaining).not.toBe(sra);
    expect(remaining + sra).toBe(net);
  });
});

describe("credit_note_adjustment is NOT the same hole as advance_adjustment", () => {
  const farhaan: RecomputeParts = {
    opening: 0,
    invoiced: 17_300,
    sra: 2_700,
    receiptsExclMemo: 14_600,
    adjustment: 0,
    pendingSaleReturns: 100,
    unusedAdvances: 0,
  };
  const cnMemo = 2_700;

  it("Farhaan Fab: SRA already holds the CN apply; excl-memo recompute is −₹100", () => {
    expect(recomputed7ExclMemo(farhaan)).toBe(-100);
  });

  it("including credit_note_adjustment on top of SRA restores the −₹2,800 double-count", () => {
    expect(recomputed7InclAllMemo(farhaan, 0, cnMemo)).toBe(-2_800);
  });

  it("including only advance memos leaves Farhaan unchanged (no advance activity)", () => {
    expect(recomputed7InclAdvanceMemo(farhaan, 0)).toBe(recomputed7ExclMemo(farhaan));
  });
});

describe("zero advance/CN activity: corrected formula is identical", () => {
  const ordinary: RecomputeParts = {
    opening: 500,
    invoiced: 8_000,
    sra: 0,
    receiptsExclMemo: 3_000,
    adjustment: 0,
    pendingSaleReturns: 0,
    unusedAdvances: 0,
  };

  it("excl / incl-advance / incl-all agree when memo receipts are 0", () => {
    expect(formulasIdenticalWhenNoMemos(ordinary, 0, 0)).toBe(true);
    expect(recomputed7ExclMemo(ordinary)).toBe(5_500);
  });

  it("used_amount without vouchers still moves plus-used (measure that drift in STEP 6d)", () => {
    expect(recomputed7PlusUsedAmount(ordinary, 1_000)).toBe(4_500);
    expect(recomputed7InclAdvanceMemo(ordinary, 0)).toBe(5_500);
  });
});

describe("STEP 6 SQL is SELECT-only and keeps the excl-memo columns", () => {
  const memoHole = readFileSync(
    resolve(__dirname, "../../scripts/ella-noor-step6-memo-hole.sql"),
    "utf8",
  );
  const org = readFileSync(
    resolve(__dirname, "../../scripts/ella-noor-step6-org.sql"),
    "utf8",
  );

  it("does not write, and exposes both excl-memo and incl-advance recomputes", () => {
    expect(memoHole).toMatch(/recomputed_7_excl_memo/);
    expect(memoHole).toMatch(/recomputed_7_incl_advance_memo/);
    expect(memoHole).toMatch(/recomputed_7_plus_used_amount/);
    expect(memoHole).toMatch(/Sana Nasir|sana%nasir/i);
    expect(memoHole).not.toMatch(/^\s*(INSERT|UPDATE|DELETE)\b/im);
    expect(memoHole).toMatch(/Do not write paid_amount/);
    expect(org).toMatch(/n_mismatch_incl_advance_memo/);
    expect(org).toMatch(/n_zero_memo_formulas_differ/);
    expect(org).toMatch(/n_closed_by_incl_advance_memo/);
    expect(org).toMatch(/n_p0_after_incl_advance/);
    expect(org).not.toMatch(/^\s*(INSERT|UPDATE|DELETE)\b/im);
  });
});
