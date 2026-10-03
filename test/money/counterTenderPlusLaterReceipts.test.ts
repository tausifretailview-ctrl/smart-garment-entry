/**
 * Gurukrupa SARASWATI JI (8850068772), 03 Oct 2026 — three screens, three balances.
 *   POS Dashboard ₹4,300 · Customer Ledger ₹300 Cr · Settle dialog / Payments picker ₹9,650.
 * Shop confirmed RCP/25-26/180 (₹4,100) and RCP/26-27/1090 (₹500) were never paid.
 *
 * Root cause of ₹9,650: SQL combined counter tender (sales.cash/card/upi) with receipts on the
 * same bill as max(tender, receipts), dropping the counter cash whenever a later receipt paid
 * the rest. Fix (migration 20261231200000): only SAME-DAY receipts cancel tender, later receipts
 * add on top — the Customer Ledger's existing rule.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isSaleDayReceipt, reconcileSaleInvoiceWithSplit } from "@/utils/customerBalanceUtils";
import { getCustomerAccountState } from "@/utils/customerBalanceCore";

type Sale = { id: string; date: string; net: number; tender: number; paid: number };
type Receipt = { no: string; sale: string; date: string; amt: number };

// From the shop's diagnostic export (amounts rounded to the rupee).
const SALES: Sale[] = [
  { id: "172", date: "2025-12-16T15:26:27+00:00", net: 8000, tender: 3000, paid: 8000 },
  { id: "202", date: "2025-12-21T14:52:52+00:00", net: 1000, tender: 0, paid: 1000 },
  { id: "206", date: "2025-12-21T16:31:42+00:00", net: 1400, tender: 0, paid: 1400 },
  { id: "667", date: "2026-02-06T06:34:30+00:00", net: 4100, tender: 4100, paid: 4100 },
  { id: "25", date: "2026-04-03T14:28:22+00:00", net: 1100, tender: 500, paid: 1100 },
  { id: "718", date: "2026-05-20T12:32:33+00:00", net: 900, tender: 500, paid: 900 },
  { id: "738", date: "2026-05-22T14:49:05+00:00", net: 5400, tender: 1100, paid: 5400 },
  { id: "1522", date: "2026-08-18T09:40:05+00:00", net: 2950, tender: 750, paid: 2950 },
  { id: "1569", date: "2026-08-22T16:37:39+00:00", net: 2500, tender: 2500, paid: 2500 },
  { id: "1972", date: "2026-09-27T16:21:15+00:00", net: 3500, tender: 0, paid: 0 },
  { id: "2000", date: "2026-10-02T15:08:14+00:00", net: 1800, tender: 1000, paid: 1000 },
];
const RECEIPTS: Receipt[] = [
  { no: "VCH/25-26/9", sale: "172", date: "2025-12-18", amt: 5000 },
  { no: "RCP/25-26/20", sale: "206", date: "2025-12-21", amt: 1400 },
  { no: "RCP/25-26/180", sale: "667", date: "2026-02-08", amt: 4100 },
  { no: "RCP/26-27/15", sale: "25", date: "2026-04-14", amt: 600 },
  { no: "RCP/26-27/40", sale: "718", date: "2026-05-22", amt: 400 },
  { no: "RCP/26-27/1090", sale: "718", date: "2026-05-23", amt: 500 },
  { no: "RCP/26-27/1089", sale: "738", date: "2026-05-26", amt: 4300 },
  { no: "RCP/26-27/3321", sale: "202", date: "2026-08-01", amt: 1000 },
  { no: "RCP/26-27/4213", sale: "1522", date: "2026-08-24", amt: 2200 },
];
const WRONG = new Set(["RCP/25-26/180", "RCP/26-27/1090"]);

const receiptsOn = (rs: Receipt[], s: Sale) => rs.filter((r) => r.sale === s.id);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** reconcile_customer_balance: invoiced − receipts − Σ drift (old: all receipts, new: same-day). */
function sqlSigned(rs: Receipt[], sameDayOnly: boolean): number {
  const invoiced = sum(SALES.map((s) => s.net));
  const receipts = sum(rs.map((r) => r.amt));
  const drift = sum(
    SALES.filter((s) => s.tender > 0.005).map((s) => {
      const cancel = sum(
        receiptsOn(rs, s)
          .filter((r) => !sameDayOnly || isSaleDayReceipt(r.date, s.date))
          .map((r) => r.amt),
      );
      return Math.max(0, s.tender - cancel);
    }),
  );
  return invoiced - receipts - drift;
}

/** compute_sale_settlement paid: old max(tender, receipts) vs new receipts + residual tender. */
function computePaid(s: Sale, rs: Receipt[], fixed: boolean): number {
  const on = receiptsOn(rs, s);
  const total = sum(on.map((r) => r.amt));
  if (!fixed) return Math.min(s.net, Math.max(total, s.tender));
  const sameDay = sum(on.filter((r) => isSaleDayReceipt(r.date, s.date)).map((r) => r.amt));
  return Math.min(s.net, total + Math.max(0, s.tender - sameDay));
}

function jsMirror(rs: Receipt[], paidOf: (s: Sale) => number): number {
  return getCustomerAccountState({
    openingBalance: 0,
    customerId: "c",
    sales: SALES.map((s) => ({
      id: s.id,
      sale_number: s.id,
      net_amount: s.net,
      paid_amount: paidOf(s),
      cash_amount: s.tender,
      card_amount: 0,
      upi_amount: 0,
      payment_status: "completed",
    })),
    voucherEntries: rs.map((r) => ({
      voucher_type: "receipt",
      reference_type: "sale",
      reference_id: r.sale,
      total_amount: r.amt,
    })),
    customerAdvances: [],
    advanceRefunds: [],
    adjustmentTotal: 0,
    saleReturns: [],
    options: { ledgerAlignedApplicationReceipts: true },
  }).outstanding;
}

describe("SARASWATI JI — counter tender + later receipts", () => {
  const fixedData = RECEIPTS.filter((r) => !WRONG.has(r.no));

  it("old SQL formula reproduces the ₹9,650 the Settle dialog showed", () => {
    expect(sqlSigned(RECEIPTS, false)).toBe(9650);
  });

  it("new SQL formula matches the ledger now (₹300 Cr) and the customer after removing the two wrong receipts (₹4,300)", () => {
    expect(sqlSigned(RECEIPTS, true)).toBe(-300);
    expect(sqlSigned(fixedData, true)).toBe(4300);
  });

  it("deleting RCP/26-27/1090 no longer leaves POS/26-27/718 part-paid", () => {
    const s718 = SALES.find((s) => s.id === "718")!;
    expect(computePaid(s718, fixedData, false)).toBe(500); // old: ₹400 shown due
    expect(computePaid(s718, fixedData, true)).toBe(900);
    const s738 = SALES.find((s) => s.id === "738")!;
    expect(computePaid(s738, fixedData, false)).toBe(4300); // old: counter ₹1,100 lost
    expect(computePaid(s738, fixedData, true)).toBe(5400);
  });

  it("every bill except 1972 / 2000 stays fully paid after the data fix", () => {
    const due = SALES.map((s) => s.net - computePaid(s, fixedData, true)).filter((d) => d > 0.5);
    expect(due).toEqual([3500, 800]);
  });

  it("JS mirror (getCustomerAccountState) agrees: ₹4,300 after the fix", () => {
    expect(jsMirror(fixedData, (s) => computePaid(s, fixedData, true))).toBe(4300);
  });
});

describe("Customer Payment cap (prevents RCP/25-26/180 again)", () => {
  it("a bill fully paid at the counter has ₹0 outstanding, so a second ₹4,100 receipt is blocked", () => {
    const rec = reconcileSaleInvoiceWithSplit(
      { id: "667", net_amount: 4100, paid_amount: 4100, sale_return_adjust: 0, cash_amount: 4100, card_amount: 0, upi_amount: 0 },
      null,
    );
    expect(rec.outstanding).toBe(0);
  });
});

describe("isSaleDayReceipt", () => {
  it("matches the sale's UTC or India date only", () => {
    expect(isSaleDayReceipt("2026-05-22", "2026-05-22T14:49:05+00:00")).toBe(true);
    expect(isSaleDayReceipt("2026-05-26", "2026-05-22T14:49:05+00:00")).toBe(false);
    // 00:30 IST on 17 Dec = 19:00 UTC on 16 Dec: both dates count as the sale day.
    expect(isSaleDayReceipt("2025-12-17", "2025-12-16T19:00:00+00:00")).toBe(true);
    expect(isSaleDayReceipt("2025-12-16", "2025-12-16T19:00:00+00:00")).toBe(true);
    expect(isSaleDayReceipt("2025-12-18", "2025-12-16T19:00:00+00:00")).toBe(false);
    expect(isSaleDayReceipt(null, "2025-12-16T19:00:00+00:00")).toBe(true);
  });
});

describe("migration 20261231200000 wiring", () => {
  const sql = readFileSync(
    resolve(__dirname, "../../supabase/migrations/20261231200000_counter_tender_plus_later_receipts.sql"),
    "utf8",
  );
  it("uses the same-day rule in compute_sale_settlement, the drift helper and the inline drift patch", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public._is_sale_day_receipt");
    expect(sql).toMatch(/v_receipt_total \+ GREATEST\(0, COALESCE\(v_tender, 0\) - v_non_cn_same_day\)/);
    expect(sql).toMatch(/_org_sale_receipt_settlement_by_sale[\s\S]*_is_sale_day_receipt\(ve\.voucher_date, s\.sale_date\)/);
    expect(sql).toContain("'reconcile_customer_balance'");
    expect(sql).toContain("'_get_customer_party_balances_rows'");
    expect(sql).toContain("'get_customer_financial_snapshot_all'");
  });
  it("keeps the organisation guards on the SECURITY DEFINER functions it replaces", () => {
    const settle = sql.slice(sql.indexOf("FUNCTION public.compute_sale_settlement"));
    expect(settle.slice(0, settle.indexOf("$$;"))).toMatch(
      /PERFORM public\._assert_row_org_access\('public\.sales'::regclass, p_sale_id\);\s+PERFORM public\._assert_org_access\(p_org_id\);/,
    );
    const helper = sql.slice(sql.indexOf("FUNCTION public._org_sale_receipt_settlement_by_sale"));
    expect(helper.slice(0, helper.indexOf("$$;"))).toContain("SELECT public._assert_org_access(p_organization_id);");
  });
});
