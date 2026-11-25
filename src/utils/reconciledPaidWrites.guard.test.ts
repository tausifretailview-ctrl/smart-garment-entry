import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Customer Payment tab and the Sales Invoice dashboard used to write their own reconciled
 * paid_amount onto bills they opened. That figure adds the counter payment AND the receipt the
 * app makes from it ("Counter payment received for sale …"), so just opening the screen wrote
 * 4,700 on a bill paid 2,350 at the counter + 2,000 advance (VASTRAKALA POS/26-27/803, Nov 2026;
 * SM HAIR POS/26-27/1500 showed 14,000 paid for 8,000). Bills that look off must be settled by
 * the database rule (applyRecomputedSalePaymentState → compute_sale_settlement).
 */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("reconciled paid amount is never written from the client figure", () => {
  for (const file of ["src/components/accounts/CustomerPaymentTab.tsx", "src/utils/invoiceDashboardData.ts"]) {
    it(file, () => {
      const src = read(file);
      expect(src).not.toMatch(/update\(\{\s*paid_amount:\s*normalizedPaid/);
      expect(src).toContain("applyRecomputedSalePaymentState(");
    });
  }
});
