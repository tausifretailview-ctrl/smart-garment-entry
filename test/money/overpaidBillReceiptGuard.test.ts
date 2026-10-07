/**
 * DB guard 20261231210000 (trg_guard_receipt_not_over_bill) + read-only scan
 * scripts/find-overpaid-bill-receipts.sql. Twin of the guard maths, checked on the
 * Gurukrupa SARASWATI JI bills that produced RCP/25-26/180 and RCP/26-27/1090.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isSaleDayReceipt } from "@/utils/customerBalanceUtils";

type Bill = { net: number; sra?: number; itemsGross?: number; tender: number; date: string; paid: number };
type Rcpt = { amt: number; date: string };

/** Same as guard_receipt_not_over_bill: true when `incoming` would be rejected. */
function wouldOverpayBill(bill: Bill, existing: Rcpt[], incoming: Rcpt): boolean {
  const sra = bill.sra ?? 0;
  const gross = bill.itemsGross ?? 0;
  const sraCounted = gross > 0 && sra > 0 && bill.net + sra <= gross + 1 ? 0 : sra;
  const due = bill.net - sraCounted;
  const other = existing.reduce((t, r) => t + r.amt, 0);
  const otherSameDay = existing.filter((r) => isSaleDayReceipt(r.date, bill.date)).reduce((t, r) => t + r.amt, 0);
  const newSameDay = isSaleDayReceipt(incoming.date, bill.date);
  // Counter tender only counts as far as POS booked it as paid (sales.paid_amount).
  const before = other + Math.min(Math.max(0, bill.tender - otherSameDay), bill.paid);
  const after =
    other + incoming.amt + Math.min(Math.max(0, bill.tender - otherSameDay - (newSameDay ? incoming.amt : 0)), bill.paid);
  return after > due + 1 && after > before + 0.005;
}

describe("guard_receipt_not_over_bill — SARASWATI JI cases", () => {
  it("blocks a second ₹4,100 on POS/25-26/667, already paid ₹4,100 at the counter (RCP/25-26/180)", () => {
    const b667 = { net: 4100, tender: 4100, paid: 4100, date: "2026-02-06T06:34:30+00:00" };
    expect(wouldOverpayBill(b667, [], { amt: 4100, date: "2026-02-08" })).toBe(true);
  });

  it("blocks the extra ₹500 on POS/26-27/718 after ₹500 counter + ₹400 receipt (RCP/26-27/1090)", () => {
    const b718 = { net: 900, tender: 500, paid: 900, date: "2026-05-20T12:32:33+00:00" };
    expect(wouldOverpayBill(b718, [{ amt: 400, date: "2026-05-22" }], { amt: 500, date: "2026-05-23" })).toBe(true);
    // The genuine ₹400 balance payment was fine (bill then had ₹500 booked).
    expect(wouldOverpayBill({ ...b718, paid: 500 }, [], { amt: 400, date: "2026-05-22" })).toBe(false);
  });

  it("allows the later ₹4,300 that settled POS/26-27/738 (₹1,100 counter)", () => {
    const b738 = { net: 5400, tender: 1100, paid: 1100, date: "2026-05-22T14:49:05+00:00" };
    expect(wouldOverpayBill(b738, [], { amt: 4300, date: "2026-05-26" })).toBe(false);
    expect(wouldOverpayBill(b738, [], { amt: 4301.5, date: "2026-05-26" })).toBe(true);
  });

  it("allows a same-day counter receipt that only writes the tender as a voucher", () => {
    const bill = { net: 1800, tender: 1000, paid: 1000, date: "2026-10-02T15:08:14+00:00" };
    expect(wouldOverpayBill(bill, [], { amt: 1000, date: "2026-10-02" })).toBe(false);
    expect(wouldOverpayBill(bill, [{ amt: 1000, date: "2026-10-02" }], { amt: 800, date: "2026-10-05" })).toBe(false);
    expect(wouldOverpayBill(bill, [{ amt: 1000, date: "2026-10-02" }], { amt: 900, date: "2026-10-05" })).toBe(true);
  });

  it("post-return bill (SRA already inside net) is not treated as overpaid — POS/26-27/1522", () => {
    const b1522 = { net: 2950, sra: 1950, itemsGross: 6400, tender: 750, paid: 750, date: "2026-08-18T09:40:05+00:00" };
    expect(wouldOverpayBill(b1522, [], { amt: 2200, date: "2026-08-24" })).toBe(false);
  });

  it("Rule-B bill (net = full bill, CN applied as SRA) caps cash at net − SRA", () => {
    const ruleB = { net: 4900, sra: 1950, itemsGross: 6400, tender: 750, paid: 750, date: "2026-08-18T09:40:05+00:00" };
    expect(wouldOverpayBill(ruleB, [], { amt: 2200, date: "2026-08-24" })).toBe(false);
    expect(wouldOverpayBill(ruleB, [], { amt: 2250, date: "2026-08-24" })).toBe(true);
  });

  it("Mulund-style bill: payment mode saved at billing (paid ₹0) — the real later payment is allowed", () => {
    const m694 = { net: 159999, tender: 159999, paid: 0, date: "2026-05-12T10:00:00+00:00" };
    expect(wouldOverpayBill(m694, [], { amt: 159999, date: "2026-07-07" })).toBe(false);
    expect(wouldOverpayBill(m694, [], { amt: 160100, date: "2026-07-07" })).toBe(true);
    // once recorded (paid now 159999), the same payment again is blocked
    expect(wouldOverpayBill({ ...m694, paid: 159999 }, [{ amt: 159999, date: "2026-07-07" }], { amt: 159999, date: "2026-08-01" })).toBe(true);
  });

  it("never blocks a write that does not increase what is paid on an already-overpaid legacy bill", () => {
    const legacy = { net: 4100, tender: 4100, paid: 4100, date: "2026-02-06T06:34:30+00:00" };
    expect(wouldOverpayBill(legacy, [{ amt: 4100, date: "2026-02-08" }], { amt: 0, date: "2026-02-08" })).toBe(false);
  });
});

describe("migration + scan wiring", () => {
  const root = resolve(__dirname, "../..");
  const mig = readFileSync(resolve(root, "supabase/migrations/20261231210000_block_overpaid_bill_receipts.sql"), "utf8");
  const scan = readFileSync(resolve(root, "scripts/find-overpaid-bill-receipts.sql"), "utf8");

  it("guard: app users only, memos skipped, deletes allowed, not callable as RPC", () => {
    expect(mig).toContain("IF COALESCE(auth.role(), '') <> 'authenticated' THEN");
    expect(mig).toContain("public._is_settlement_memo_receipt(NEW.payment_method, NEW.description)");
    expect(mig).toContain("IF NEW.deleted_at IS NOT NULL");
    expect(mig).toContain("REVOKE ALL ON FUNCTION public.guard_receipt_not_over_bill() FROM PUBLIC, anon, authenticated;");
    expect(mig).toMatch(/CREATE TRIGGER trg_guard_receipt_not_over_bill\s+BEFORE INSERT OR UPDATE/);
    expect(mig).toContain("public._is_sale_day_receipt(NEW.voucher_date, v_sale.sale_date)");
    expect(mig).toContain("LEAST(GREATEST(0, v_tender - v_other_same_day), v_cur_paid)");
    // security review: serialise per bill, and re-check when a memo row is renamed
    expect(mig).toContain("FOR UPDATE OF s;");
    expect(mig).toMatch(/UPDATE OF [^;]*\bdescription\b/);
  });

  it("cap migration: counter tender never credits a bill beyond net, everywhere", () => {
    const cap = readFileSync(resolve(root, "supabase/migrations/20261231205000_cap_counter_tender_at_bill.sql"), "utf8");
    expect(cap).toContain("CREATE OR REPLACE FUNCTION public._sale_counter_tender_settled");
    expect(cap).toMatch(/LEAST\(\s*GREATEST\(0, COALESCE\(v_tender, 0\) - v_non_cn_same_day\),\s*GREATEST\(0, v_current_paid\)\s*\)/);
    expect(cap).toContain("PERFORM public._assert_org_access(p_org_id);");
    expect(cap).toContain("SELECT public._assert_org_access(p_organization_id);");
    expect(cap).toContain("'/* counter-tender capped */'");
  });

  it("scan is read-only and uses the same same-day + SRA gate", () => {
    expect(scan).not.toMatch(/\b(UPDATE|DELETE|INSERT|ALTER|DROP|CREATE)\b/);
    expect(scan).toContain("public._is_sale_day_receipt(ve.voucher_date, s.sale_date)");
    expect(scan).toContain("s.net_amount + COALESCE(s.sale_return_adjust, 0) <= ig.gross + 1");
  });
});
