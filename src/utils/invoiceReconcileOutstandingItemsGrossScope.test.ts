/**
 * Equivalence gate for scoping items_gross in get_invoice_dashboard_stats.
 *
 * Source of truth: public.invoice_reconcile_outstanding
 * (supabase/migrations/20260717052829_69fb9ab7-04f9-491f-9860-5cd3e7a2ba1f.sql)
 *
 * items_gross only participates when ALL of:
 *   items_gross IS NOT NULL AND items_gross > 0.01
 *   AND sale_return_adjust > 0.01
 *   AND (net + sale_return_adjust) > (items_gross + 1)
 *
 * Therefore for any sale with sale_return_adjust <= 0.01, passing NULL vs any
 * items_gross cannot change outstanding — which is exactly what scoping the
 * CTE to sale_return_adjust > 0 does (LEFT JOIN → NULL for those sales).
 */
import { describe, expect, it } from "vitest";

const INVOICE_RECON_TOL = 0.01;
const DUPLICATE_CN_PAID_MATCH_TOL = 1;

function srAppliedOnTop(
  itemsGross: number | null,
  saleReturnAdjust: number,
  net: number,
): boolean {
  return (
    itemsGross != null &&
    itemsGross > INVOICE_RECON_TOL &&
    saleReturnAdjust > INVOICE_RECON_TOL &&
    net + saleReturnAdjust > itemsGross + DUPLICATE_CN_PAID_MATCH_TOL
  );
}

describe("items_gross scoping gate (invoice_reconcile_outstanding)", () => {
  it("is false for sale_return_adjust = 0 regardless of items_gross", () => {
    expect(srAppliedOnTop(null, 0, 10_000)).toBe(false);
    expect(srAppliedOnTop(50_000, 0, 10_000)).toBe(false);
  });

  it("is false for sale_return_adjust within tol (0.01)", () => {
    expect(srAppliedOnTop(null, 0.01, 5_000)).toBe(false);
    expect(srAppliedOnTop(9_999, 0.01, 5_000)).toBe(false);
  });

  it("can be true only when sale_return_adjust > tol and items_gross present", () => {
    expect(srAppliedOnTop(null, 3_000, 7_000)).toBe(false);
    expect(srAppliedOnTop(8_000, 3_000, 7_000)).toBe(true); // 7000+3000 > 8000+1
  });
});
