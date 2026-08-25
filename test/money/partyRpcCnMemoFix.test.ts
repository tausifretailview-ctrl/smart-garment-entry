import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeCustomerBalanceCore,
  computePendingStandaloneSaleReturns,
  isReceiptMemoApplicationLedgerAligned,
} from "@/utils/customerBalanceCore";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function remainingSaleReturnCredit(
  netAmount: number,
  creditAvailableBalance: number | null,
  linkedSaleReturnAdjust: number,
): number {
  const raw = creditAvailableBalance != null
    ? creditAvailableBalance
    : netAmount - linkedSaleReturnAdjust;
  return Math.max(0, raw);
}

type RecomputeParts = {
  opening: number;
  invoiced: number;
  sra: number;
  receiptsExclMemo: number;
  adjustment: number;
  pendingSaleReturns: number;
  unusedAdvances: number;
};

function recomputed7ExclMemo(p: RecomputeParts): number {
  return round2(
    p.opening + p.invoiced - p.sra - p.receiptsExclMemo + p.adjustment
      - p.pendingSaleReturns - p.unusedAdvances,
  );
}

function recomputed7InclAllMemo(
  p: RecomputeParts,
  advanceMemoReceipts: number,
  cnMemoReceipts: number,
): number {
  return recomputed7ExclMemo({
    ...p,
    receiptsExclMemo: p.receiptsExclMemo + advanceMemoReceipts + cnMemoReceipts,
  });
}

/**
 * Phase 1 step 1 — party RPC CN fix, offline.
 * Live `_get_customer_party_balances_rows` cannot be executed here (production
 * backend, no staging). These tests lock (1) the SQL source now calls the
 * shared helper, (2) the SQL-shaped 7-sum for Farhaan, (3) the 74 ELLA NOOR
 * leftover rows' post-fix target = party_signed + cn_memos.
 */

const MIGRATIONS_DIR = resolve(__dirname, "../../supabase/migrations");
const PARTY_ROWS_FN = "CREATE OR REPLACE FUNCTION public._get_customer_party_balances_rows";
const FARHAAN_PHONE = "7977353244";
const DRIFT = 1;

const FARHAAN_PARTS: RecomputeParts = {
  opening: 0,
  invoiced: 17_300,
  sra: 2_700,
  receiptsExclMemo: 14_600,
  adjustment: 0,
  pendingSaleReturns: 100,
  unusedAdvances: 0,
};

const FARHAAN_CN_MEMO = 2_700;

/** JS mirror of public._is_settlement_memo_receipt (20260823180000). */
export function isSettlementMemoReceiptSql(
  paymentMethod: string | null,
  description: string | null,
): boolean {
  const pm = (paymentMethod ?? "").toLowerCase();
  const d = (description ?? "").trim().toLowerCase();
  const arrow = String.fromCharCode(8594);
  return (
    pm === "advance_adjustment"
    || pm === "credit_note_adjustment"
    || d.startsWith("adjusted from advance balance")
    || d.startsWith("advance applied to ")
    || d.startsWith("credit note adjusted against invoice")
    || /^credit note .+->/.test(d)
    || (d.includes("credit note ") && d.includes(arrow))
    || d.startsWith("credit note from sale return")
    || d.includes("credit note adjusted")
    || d.includes("cn adjusted")
  );
}

function gatedSraSql(net: number, sra: number, itemsGross: number): number {
  if (itemsGross > 0 && sra > 0 && net + sra <= itemsGross + 1) return 0;
  return sra;
}

/** Mirrors the signed_balance sum in `_get_customer_party_balances_rows`. */
export function partySqlSignedBalance(p: {
  opening: number;
  invoicedNet: number;
  sraGated: number;
  receiptsExclMemo: number;
  paidAtSaleDrift: number;
  pendingRemainingCredit: number;
  creditNoteVouchers: number;
  paymentRefunds: number;
  advanceUsed: number;
  unusedAdvance: number;
}): number {
  return round2(
    p.opening
      + p.invoicedNet
      - p.sraGated
      - p.receiptsExclMemo
      - p.paidAtSaleDrift
      - p.pendingRemainingCredit
      - p.creditNoteVouchers
      - p.paymentRefunds
      - p.advanceUsed
      - p.unusedAdvance,
  );
}

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

function latestPartyRowsSql(): { file: string; body: string } {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const defining = files.filter((f) =>
    readFileSync(resolve(MIGRATIONS_DIR, f), "utf8").includes(PARTY_ROWS_FN),
  );
  const file = defining[defining.length - 1]!;
  return { file, body: readFileSync(resolve(MIGRATIONS_DIR, file), "utf8") };
}

const FARHAAN_CORE_PARAMS = {
  openingBalance: 0,
  sales: [
    { id: "inv-a", net_amount: 11800, paid_amount: 11800, sale_return_adjust: 0, items_gross: 11800 },
    { id: "inv-b", net_amount: 2800, paid_amount: 2800, sale_return_adjust: 0, items_gross: 2800 },
    { id: "inv-c", net_amount: 2700, paid_amount: 0, sale_return_adjust: 2700, items_gross: 2700 },
  ],
  voucherEntries: [
    { voucher_type: "receipt" as const, reference_type: "sale", reference_id: "inv-a", total_amount: 11800, discount_amount: 0, payment_method: "cash" },
    { voucher_type: "receipt" as const, reference_type: "sale", reference_id: "inv-b", total_amount: 1700, discount_amount: 0, payment_method: "cash" },
    { voucher_type: "receipt" as const, reference_type: "sale", reference_id: "inv-b", total_amount: 1100, discount_amount: 0, payment_method: "cash" },
    {
      voucher_type: "receipt" as const,
      reference_type: "sale",
      reference_id: "inv-c",
      total_amount: 2700,
      discount_amount: 0,
      payment_method: "credit_note_adjustment",
      description: "Credit note adjusted against invoice INV/26-27/xxx",
    },
  ],
  customerAdvances: [] as Array<{ amount?: number | null; used_amount?: number | null }>,
  advanceRefunds: [] as Array<{ refund_amount?: number | null }>,
  saleReturns: [
    {
      net_amount: 2800,
      credit_status: "partially_adjusted",
      credit_available_balance: 100,
    },
  ],
};

describe("latest _get_customer_party_balances_rows SQL source", () => {
  const { file, body } = latestPartyRowsSql();

  it("is the Phase 1 step 1 migration, not an earlier copy that inlines LIKE", () => {
    expect(file).toBe("20261126120000_fix_party_balances_settlement_memo_helper.sql");
  });

  it("excludes receipts via _is_settlement_memo_receipt (receipt_voucher_base + paid_at_sale_drift)", () => {
    expect(body).toContain("AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)");
    const helperCalls = body.split("public._is_settlement_memo_receipt(").length - 1;
    expect(helperCalls).toBe(2);
    expect(body).not.toMatch(/LIKE '%credit note adjusted%'/);
    expect(body).not.toMatch(/IN \('advance_adjustment', 'credit_note_adjustment'\)/);
  });

  it("restores remaining CN via _sale_return_remaining_credit_for_balance, not pending-only", () => {
    expect(body).toContain("public._sale_return_remaining_credit_for_balance(");
    const pendingBlock = body.slice(
      body.indexOf("pending_sale_returns AS ("),
      body.indexOf("credit_note_vouchers AS ("),
    );
    expect(pendingBlock).toContain("NOT IN ('refunded')");
    expect(pendingBlock).not.toMatch(/=\s*'pending'/);
  });

  it("keeps the items_gross SRA gate and credit_note_vouchers CTE", () => {
    expect(body).toContain("s.net_amount + COALESCE(s.sale_return_adjust, 0) <= ig.gross + 1");
    expect(body).toContain("credit_note_vouchers AS (");
    expect(body).toMatch(/voucher_type, ''\)\) = 'credit_note'/);
  });
});

describe("_is_settlement_memo_receipt JS mirror vs canonical JS", () => {
  const farhaanMemo = {
    voucher_type: "receipt",
    payment_method: "credit_note_adjustment",
    description: "Credit note adjusted against invoice INV/26-27/xxx",
  };

  it("treats Farhaan's CN memo as a memo in both SQL helper and JS", () => {
    expect(isSettlementMemoReceiptSql(farhaanMemo.payment_method, farhaanMemo.description)).toBe(true);
    expect(isReceiptMemoApplicationLedgerAligned(farhaanMemo)).toBe(true);
  });

  it("does not treat ordinary cash as a memo", () => {
    expect(isSettlementMemoReceiptSql("cash", "Invoice payment")).toBe(false);
    expect(
      isReceiptMemoApplicationLedgerAligned({
        voucher_type: "receipt",
        payment_method: "cash",
        description: "Invoice payment",
      }),
    ).toBe(false);
  });
});

describe("Farhaan Fab — SQL-shaped party formula", () => {
  const invoicedNet = 11_800 + 2_800 + 2_700;
  const sraGated = gatedSraSql(2_700, 2_700, 2_700) + gatedSraSql(11_800, 0, 11_800) + gatedSraSql(2_800, 0, 2_800);
  const remaining = remainingSaleReturnCredit(2_800, 100, 0);

  it("does not gate away Farhaan's SRA (pre-return: net + sra > items_gross)", () => {
    expect(sraGated).toBe(2_700);
    expect(invoicedNet).toBe(17_300);
    expect(remaining).toBe(100);
  });

  it("signed balance is −₹100 when CN memo is excluded and remaining credit is kept", () => {
    expect(
      partySqlSignedBalance({
        opening: 0,
        invoicedNet,
        sraGated,
        receiptsExclMemo: 14_600,
        paidAtSaleDrift: 0,
        pendingRemainingCredit: remaining,
        creditNoteVouchers: 0,
        paymentRefunds: 0,
        advanceUsed: 0,
        unusedAdvance: 0,
      }),
    ).toBe(-100);
    expect(recomputed7ExclMemo(FARHAAN_PARTS)).toBe(-100);
  });

  it("unpatched shape (CN memo counted as cash) is −₹2,800", () => {
    expect(
      partySqlSignedBalance({
        opening: 0,
        invoicedNet,
        sraGated,
        receiptsExclMemo: 14_600 + FARHAAN_CN_MEMO,
        paidAtSaleDrift: 0,
        pendingRemainingCredit: remaining,
        creditNoteVouchers: 0,
        paymentRefunds: 0,
        advanceUsed: 0,
        unusedAdvance: 0,
      }),
    ).toBe(-2_800);
    expect(recomputed7InclAllMemo(FARHAAN_PARTS, 0, FARHAAN_CN_MEMO)).toBe(-2_800);
  });

  it("20260911 pending-only regression: memo excluded but remainder dropped → ₹0, not −₹100", () => {
    expect(
      partySqlSignedBalance({
        opening: 0,
        invoicedNet,
        sraGated,
        receiptsExclMemo: 14_600,
        paidAtSaleDrift: 0,
        pendingRemainingCredit: 0,
        creditNoteVouchers: 0,
        paymentRefunds: 0,
        advanceUsed: 0,
        unusedAdvance: 0,
      }),
    ).toBe(0);
  });

  it("agrees with computeCustomerBalanceCore on the same fixture", () => {
    const aligned = computeCustomerBalanceCore({
      ...FARHAAN_CORE_PARAMS,
      options: { ledgerAlignedApplicationReceipts: true },
    });
    expect(aligned.balance).toBeCloseTo(-100, 0);
    expect(aligned.pendingStandaloneSaleReturns).toBeCloseTo(100, 0);
    expect(
      computePendingStandaloneSaleReturns(FARHAAN_CORE_PARAMS.saleReturns, FARHAAN_CORE_PARAMS.sales),
    ).toBeCloseTo(100, 0);

    const buggy = computeCustomerBalanceCore({
      ...FARHAAN_CORE_PARAMS,
      options: { ledgerAlignedApplicationReceipts: false },
    });
    expect(buggy.balance).toBeCloseTo(-2_800, 0);
  });
});

describe("ELLA NOOR CN leftover class — post-fix party target", () => {
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
  const leftover = classified.filter((r) => r.named_remaining_class === "cn_leftover_incl_all_matches_party");
  const headline7a = parseCsv(
    readFileSync(
      resolve(
        __dirname,
        "../../docs/ella-noor-customer-balance-audit-2026-08/step7a-headline-live-2026-08-25.csv",
      ),
      "utf8",
    ),
    ";",
  )[0]!;

  it("has 74 leftover rows (72 Farhaan-shape + 2 AMNA) from the committed audit CSV", () => {
    expect(leftover).toHaveLength(74);
    expect(numField(headline7a.n_cn_leftover_incl_all_matches_party)).toBe(74);
    expect(numField(headline7a.n_cn_leftover_sra_fully_in_7sum)).toBe(72);
    expect(numField(headline7a.n_cn_leftover_cn_without_sra)).toBe(2);
  });

  it("post-fix signed balance = live party_signed + cn_memos for every leftover row", () => {
    // Live party counted CN memos as cash (incl-all). Excluding them via the
    // helper raises signed_balance by cn_memos. Do not rewrite the CSV.
    for (const r of leftover) {
      const party = numField(r.party_signed);
      const cn = numField(r.cn_memos);
      const recInclAdvance = numField(r.recomputed_7_incl_advance_memo);
      const postFix = round2(party + cn);
      expect(Math.abs(postFix - recInclAdvance)).toBeLessThanOrEqual(DRIFT);
      expect(Math.abs(numField(r.recomputed_7_incl_all_memo) - party)).toBeLessThanOrEqual(DRIFT);
    }
  });

  it("Farhaan Fab post-fix is −₹100; Shumama is ₹1,58,700 Dr; AMNA DARVESH is ₹0", () => {
    const farhaan = leftover.find((r) => r.customer_name === "Farhaan Fab" && r.phone === FARHAAN_PHONE);
    const shumama = leftover.find((r) => r.customer_name === "SHUMAMA BAIRELI");
    const amna = leftover.find((r) => r.customer_name === "AMNA DARVESH");
    expect(farhaan).toBeTruthy();
    expect(shumama).toBeTruthy();
    expect(amna).toBeTruthy();
    expect(round2(numField(farhaan!.party_signed) + numField(farhaan!.cn_memos))).toBe(-100);
    expect(round2(numField(shumama!.party_signed) + numField(shumama!.cn_memos))).toBe(158_700);
    expect(round2(numField(amna!.party_signed) + numField(amna!.cn_memos))).toBe(0);
  });
});
