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

export type RemainingClass =
  | "cn_leftover_incl_all_matches_party"
  | "cn_partial_leftover"
  | "gap_equals_twice_used_minus_adv"
  | "used_amount_without_adv_voucher"
  | "gap_equals_paid_amount"
  | "unexplained";

export type RemainingRow = {
  partySigned: number;
  recInclAll: number;
  recPlusUsed: number;
  gapInclAdvance: number;
  cnMemos: number;
  usedAmount: number;
  advanceMemos: number;
  paidAmountSum: number;
};

/**
 * Mutually exclusive class for a Step 6e remaining row.
 * Order is load-bearing: CN leftover (incl-all = party) first, then any other
 * CN, then twice-(used-adv), then plus-used closes, then gap=paid.
 */
export function classifyRemainingRow(r: RemainingRow): RemainingClass {
  const usedMinusAdv = r.usedAmount - r.advanceMemos;
  if (
    Math.abs(r.gapInclAdvance - r.cnMemos) <= DRIFT_THRESHOLD
    && r.cnMemos > DRIFT_THRESHOLD
    && Math.abs(r.recInclAll - r.partySigned) <= DRIFT_THRESHOLD
  ) {
    return "cn_leftover_incl_all_matches_party";
  }
  if (r.cnMemos > DRIFT_THRESHOLD) return "cn_partial_leftover";
  if (
    Math.abs(r.gapInclAdvance - 2 * usedMinusAdv) <= DRIFT_THRESHOLD
    && Math.abs(usedMinusAdv) > DRIFT_THRESHOLD
  ) {
    return "gap_equals_twice_used_minus_adv";
  }
  if (Math.abs(r.recPlusUsed - r.partySigned) <= DRIFT_THRESHOLD) {
    return "used_amount_without_adv_voucher";
  }
  if (
    Math.abs(r.gapInclAdvance - r.paidAmountSum) <= DRIFT_THRESHOLD
    && r.paidAmountSum > DRIFT_THRESHOLD
  ) {
    return "gap_equals_paid_amount";
  }
  return "unexplained";
}

export const STEP7_OFFLINE_HEADLINE = {
  nRemaining: 136,
  absRemaining: 905_800,
  nCnLeftover: 74,
  absCnLeftover: 517_700,
  nTwiceUsed: 33,
  absTwiceUsed: 231_350,
  nCnPartial: 9,
  absCnPartial: 85_300,
  nUsedWithoutVoucher: 6,
  absUsedWithoutVoucher: 28_800,
  nGapEqualsPaid: 3,
  absGapEqualsPaid: 9_650,
  nUnexplained: 11,
  absUnexplained: 33_000,
} as const;

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
  const step7 = readFileSync(
    resolve(__dirname, "../../scripts/ella-noor-step7-remaining.sql"),
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
    expect(step7).toMatch(/named_remaining_class/);
    expect(step7).toMatch(/n_cn_leftover_gap_equals_sra_gated_away/);
    expect(step7).toMatch(/Do not include credit_note_adjustment/);
    expect(step7).not.toMatch(/^\s*(INSERT|UPDATE|DELETE)\b/im);
  });
});

function parseCsv(text: string, delimiter: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(delimiter);
  return lines.slice(1).map((line) => {
    const cells = line.split(delimiter);
    const row: Record<string, string> = {};
    header.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim();
    });
    return row;
  });
}

function numField(s: string): number {
  return Number((s || "0").replace(/,/g, "").replace(/\t/g, "").trim() || "0");
}

describe("Step 6d derived headline stays consistent with live 6e", () => {
  const remaining = parseCsv(
    readFileSync(
      resolve(__dirname, "../../docs/ella-noor-customer-balance-audit-2026-08/step6e-remaining-2026-08-25.csv"),
      "utf8",
    ),
    ";",
  );
  const derived = parseCsv(
    readFileSync(
      resolve(
        __dirname,
        "../../docs/ella-noor-customer-balance-audit-2026-08/step6d-org-headline-derived-2026-08-25.csv",
      ),
      "utf8",
    ),
    ",",
  );
  const byField = Object.fromEntries(derived.map((r) => [r.field, r]));

  it("labels itself derived, not a 6d paste, and leaves identity columns empty", () => {
    expect(byField.provenance.value).toBe("derived_not_6d_paste");
    expect(byField.n_zero_memo_formulas_differ.value).toBe("");
    expect(byField.n_zero_memo_formulas_differ.source).toMatch(/unknown/);
  });

  it("6e remaining is complete: 136 rows, P0=1 Shumama, Sana Nasir absent, no overshoot", () => {
    expect(remaining.length).toBe(136);
    const p0 = remaining.filter((r) => r.queue_tier_after_correction === "P0");
    expect(p0).toHaveLength(1);
    expect(p0[0].customer_name).toBe("SHUMAMA BAIRELI");
    expect(remaining.some((r) => /sana/i.test(r.customer_name) && /nasir/i.test(r.customer_name))).toBe(false);
    const overshoot = remaining.filter((r) => Math.abs(numField(r.gap_excl_minus_party)) <= DRIFT_THRESHOLD);
    expect(overshoot).toHaveLength(0);
    expect(remaining.every((r) => numField(r.gap_incl_advance_minus_party) > 0)).toBe(true);
  });

  it("derived closed count = morning 717 minus 6e remaining, because 6e has 0 overshoot", () => {
    const morningExcl = numField(byField.n_mismatch_excl_memo.value);
    const remainingIncl = numField(byField.n_mismatch_incl_advance_memo.value);
    const closed = numField(byField.n_closed_by_incl_advance_memo.value);
    expect(morningExcl).toBe(717);
    expect(remainingIncl).toBe(remaining.length);
    expect(closed).toBe(morningExcl - remainingIncl);
    expect(closed).toBe(581);
    expect(numField(byField.n_p0_after_incl_advance.value)).toBe(1);
  });

  it("derived abs remaining matches SUM of 6e |gap_incl_advance|", () => {
    const absIncl = remaining.reduce((s, r) => s + Math.abs(numField(r.gap_incl_advance_minus_party)), 0);
    expect(absIncl).toBe(905800);
    expect(numField(byField.abs_drift_incl_advance_memo.value)).toBe(absIncl);
    expect(numField(byField.abs_drift_excl_memo.value)).toBe(11_559_763);
    expect(numField(byField.implied_abs_rupees_closed.value)).toBe(11_559_763 - 905800);
  });
});

function remainingFromCsv(r: Record<string, string>): RemainingRow {
  return {
    partySigned: numField(r.party_signed),
    recInclAll: numField(r.recomputed_7_incl_all_memo),
    recPlusUsed: numField(r.recomputed_7_plus_used_amount),
    gapInclAdvance: numField(r.gap_incl_advance_minus_party),
    cnMemos: numField(r.cn_memos),
    usedAmount: numField(r.used_amount),
    advanceMemos: numField(r.advance_memos),
    paidAmountSum: numField(r.sum_paid_amount),
  };
}

describe("Step 7 — 136 remaining classified from live 6e", () => {
  const remaining = parseCsv(
    readFileSync(
      resolve(__dirname, "../../docs/ella-noor-customer-balance-audit-2026-08/step6e-remaining-2026-08-25.csv"),
      "utf8",
    ),
    ";",
  );
  const classified = parseCsv(
    readFileSync(
      resolve(
        __dirname,
        "../../docs/ella-noor-customer-balance-audit-2026-08/step7-remaining-classified-2026-08-25.csv",
      ),
      "utf8",
    ),
    ";",
  );
  const headline = parseCsv(
    readFileSync(
      resolve(
        __dirname,
        "../../docs/ella-noor-customer-balance-audit-2026-08/step7-remaining-headline-2026-08-25.csv",
      ),
      "utf8",
    ),
    ",",
  );
  const byField = Object.fromEntries(headline.map((r) => [r.field, r]));

  it("classifies every 6e row, counts match the committed headline, and does not force-fit the 11", () => {
    expect(remaining.length).toBe(STEP7_OFFLINE_HEADLINE.nRemaining);
    expect(classified.length).toBe(STEP7_OFFLINE_HEADLINE.nRemaining);
    const counts: Record<string, number> = {};
    const abs: Record<string, number> = {};
    remaining.forEach((r, i) => {
      const cls = classifyRemainingRow(remainingFromCsv(r));
      expect(classified[i].named_remaining_class).toBe(cls);
      expect(classified[i].customer_name).toBe(r.customer_name);
      counts[cls] = (counts[cls] || 0) + 1;
      abs[cls] = (abs[cls] || 0) + Math.abs(numField(r.gap_incl_advance_minus_party));
    });
    expect(counts.cn_leftover_incl_all_matches_party).toBe(STEP7_OFFLINE_HEADLINE.nCnLeftover);
    expect(abs.cn_leftover_incl_all_matches_party).toBe(STEP7_OFFLINE_HEADLINE.absCnLeftover);
    expect(counts.gap_equals_twice_used_minus_adv).toBe(STEP7_OFFLINE_HEADLINE.nTwiceUsed);
    expect(abs.gap_equals_twice_used_minus_adv).toBe(STEP7_OFFLINE_HEADLINE.absTwiceUsed);
    expect(counts.cn_partial_leftover).toBe(STEP7_OFFLINE_HEADLINE.nCnPartial);
    expect(abs.cn_partial_leftover).toBe(STEP7_OFFLINE_HEADLINE.absCnPartial);
    expect(counts.used_amount_without_adv_voucher).toBe(STEP7_OFFLINE_HEADLINE.nUsedWithoutVoucher);
    expect(abs.used_amount_without_adv_voucher).toBe(STEP7_OFFLINE_HEADLINE.absUsedWithoutVoucher);
    expect(counts.gap_equals_paid_amount).toBe(STEP7_OFFLINE_HEADLINE.nGapEqualsPaid);
    expect(abs.gap_equals_paid_amount).toBe(STEP7_OFFLINE_HEADLINE.absGapEqualsPaid);
    expect(counts.unexplained).toBe(STEP7_OFFLINE_HEADLINE.nUnexplained);
    expect(abs.unexplained).toBe(STEP7_OFFLINE_HEADLINE.absUnexplained);
    expect(numField(byField.n_unexplained.value)).toBe(11);
    expect(numField(byField.n_classified.value)).toBe(125);
  });

  it("places Shumama and Farhaan in CN leftover, and does not treat that as permission to include CN memos", () => {
    const shumama = remaining.find((r) => r.customer_name === "SHUMAMA BAIRELI");
    const farhaan = remaining.find((r) => r.customer_name === "Farhaan Fab");
    expect(shumama).toBeTruthy();
    expect(farhaan).toBeTruthy();
    expect(classifyRemainingRow(remainingFromCsv(shumama!))).toBe("cn_leftover_incl_all_matches_party");
    expect(classifyRemainingRow(remainingFromCsv(farhaan!))).toBe("cn_leftover_incl_all_matches_party");
    expect(numField(farhaan!.recomputed_7_incl_all_memo)).toBe(numField(farhaan!.party_signed));
    expect(numField(farhaan!.recomputed_7_incl_advance_memo)).toBe(-100);
    expect(numField(farhaan!.party_signed)).toBe(-2800);
  });

  it("names the twice-used and used-without-voucher worked examples", () => {
    const khushi = remaining.find((r) => r.customer_name === "KHUSHI GOPIKRISHNA VASIYA");
    const pitodia = remaining.find((r) => r.customer_name === "Fatima Pitodia");
    const sibgah = remaining.find((r) => r.customer_name === "SIBGAH GEELANI");
    expect(classifyRemainingRow(remainingFromCsv(khushi!))).toBe("gap_equals_twice_used_minus_adv");
    expect(numField(khushi!.gap_incl_advance_minus_party)).toBe(2 * numField(khushi!.used_amount));
    expect(classifyRemainingRow(remainingFromCsv(pitodia!))).toBe("used_amount_without_adv_voucher");
    expect(classifyRemainingRow(remainingFromCsv(sibgah!))).toBe("cn_partial_leftover");
  });
});

describe("Step 7a/7c live SQL-editor CSVs", () => {
  const headline7a = parseCsv(
    readFileSync(
      resolve(
        __dirname,
        "../../docs/ella-noor-customer-balance-audit-2026-08/step7a-headline-live-2026-08-25.csv",
      ),
      "utf8",
    ),
    ";",
  )[0];
  const examples = parseCsv(
    readFileSync(
      resolve(
        __dirname,
        "../../docs/ella-noor-customer-balance-audit-2026-08/step7c-examples-live-2026-08-25.csv",
      ),
      "utf8",
    ),
    ";",
  );
  const byName = Object.fromEntries(examples.map((r) => [r.customer_name, r]));

  it("confirms offline class counts and splits class 1 as 72 Farhaan / 2 AMNA / 0 gated-away", () => {
    expect(numField(headline7a.n_remaining)).toBe(STEP7_OFFLINE_HEADLINE.nRemaining);
    expect(numField(headline7a.abs_remaining)).toBe(STEP7_OFFLINE_HEADLINE.absRemaining);
    expect(numField(headline7a.n_cn_leftover_incl_all_matches_party)).toBe(STEP7_OFFLINE_HEADLINE.nCnLeftover);
    expect(numField(headline7a.abs_cn_leftover)).toBe(STEP7_OFFLINE_HEADLINE.absCnLeftover);
    expect(numField(headline7a.n_gap_equals_twice_used_minus_adv)).toBe(STEP7_OFFLINE_HEADLINE.nTwiceUsed);
    expect(numField(headline7a.n_cn_partial_leftover)).toBe(STEP7_OFFLINE_HEADLINE.nCnPartial);
    expect(numField(headline7a.n_used_amount_without_adv_voucher)).toBe(STEP7_OFFLINE_HEADLINE.nUsedWithoutVoucher);
    expect(numField(headline7a.n_gap_equals_paid_amount)).toBe(STEP7_OFFLINE_HEADLINE.nGapEqualsPaid);
    expect(numField(headline7a.n_unexplained)).toBe(STEP7_OFFLINE_HEADLINE.nUnexplained);
    expect(numField(headline7a.n_p0_remaining)).toBe(1);
    expect(numField(headline7a.n_cn_leftover_gap_equals_sra_gated_away)).toBe(0);
    expect(numField(headline7a.n_cn_leftover_sra_fully_in_7sum)).toBe(72);
    expect(numField(headline7a.n_cn_leftover_cn_without_sra)).toBe(2);
    expect(
      numField(headline7a.n_cn_leftover_sra_fully_in_7sum)
        + numField(headline7a.n_cn_leftover_cn_without_sra)
        + numField(headline7a.n_cn_leftover_gap_equals_sra_gated_away),
    ).toBe(STEP7_OFFLINE_HEADLINE.nCnLeftover);
  });

  it("shows Shumama as Farhaan shape: SRA already in the 7-sum, party = incl-all, not gated-away", () => {
    const s = byName["SHUMAMA BAIRELI"];
    expect(s.named_remaining_class).toBe("cn_leftover_incl_all_matches_party");
    expect(s.gap_equals_sra_gated_away).toBe("false");
    expect(numField(s.sra_gated_away)).toBe(0);
    expect(numField(s.sra_raw)).toBe(numField(s.sra_gated));
    expect(numField(s.sra_raw)).toBe(numField(s.cn_memos));
    expect(numField(s.total_invoiced) - numField(s.sra_gated) - numField(s.advance_memos)).toBe(
      numField(s.recomputed_7_incl_advance_memo),
    );
    expect(numField(s.recomputed_7_incl_advance_memo) - numField(s.cn_memos)).toBe(
      numField(s.recomputed_7_incl_all_memo),
    );
    expect(numField(s.recomputed_7_incl_all_memo)).toBe(numField(s.party_signed));
  });

  it("keeps KHUSHI twice-used distinct from Pitodia plus-used, both with unused=0", () => {
    const k = byName["KHUSHI GOPIKRISHNA VASIYA"];
    const p = byName["Fatima Pitodia"];
    expect(numField(k.advance_deposited)).toBe(numField(k.used_amount));
    expect(numField(k.unused_advances)).toBe(0);
    expect(numField(k.party_signed)).toBe(-2 * numField(k.used_amount));
    expect(numField(k.recomputed_7_plus_used_amount)).toBe(-numField(k.used_amount));
    expect(numField(p.advance_deposited)).toBe(numField(p.used_amount));
    expect(numField(p.unused_advances)).toBe(0);
    expect(numField(p.party_signed)).toBe(numField(p.recomputed_7_plus_used_amount));
    expect(numField(p.party_signed)).not.toBe(-2 * numField(p.used_amount));
  });
});
