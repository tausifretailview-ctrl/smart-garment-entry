import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Customer balances must be exact: a bill's paid amount may never be more than its receipts +
 * the counter payment not already a receipt. Screens that counted the counter payment twice
 * (SM HAIR POS/26-27/1500, VASTRAKALA POS/26-27/803, Gurukrupa — Nov 2026) are stopped in the
 * database by trg_cap_sale_paid_to_receipts (SQL file 50), whatever screen writes paid_amount.
 */
const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20270526120000_sale_paid_never_above_receipts.sql"),
  "utf8",
);

describe("sales.paid_amount is capped by receipts in the database", () => {
  it("installs the BEFORE UPDATE trigger on paid / tender / net columns", () => {
    expect(sql).toMatch(/CREATE TRIGGER trg_cap_sale_paid_to_receipts\s+BEFORE UPDATE OF paid_amount/);
    expect(sql).toContain("EXECUTE FUNCTION public.cap_sale_paid_to_receipts()");
  });

  it("only lowers paid, and only for a bill with receipts", () => {
    expect(sql).toContain("IF v_count = 0 THEN\n    RETURN NULL;");
    expect(sql).toContain("IF v_cap IS NOT NULL AND COALESCE(NEW.paid_amount, 0) > v_cap + 0.5 THEN");
  });

  it("counts a same-day receipt as the counter payment, never advance / CN applications", () => {
    expect(sql).toContain("public._is_settlement_memo_receipt(ve.payment_method, ve.description) THEN 0");
    expect(sql).toContain("public._is_sale_day_receipt(ve.voucher_date, p_sale_date)");
    expect(sql).toContain("GREATEST(0, COALESCE(p_tender, 0) - v_same_day)");
  });

  it("the backfill only touches bills above the cap", () => {
    expect(sql).toContain("s.paid_amount > o.cap + 0.5");
  });
});
