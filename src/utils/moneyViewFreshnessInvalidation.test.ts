import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { invalidateMoneyViewFreshness } from "./moneyViewFreshnessInvalidation";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const ORG = "org-1";

describe("invalidateMoneyViewFreshness", () => {
  it("marks Customer Ledger balance, closing and payment history stale (other tab after a receipt)", () => {
    const qc = new QueryClient();
    const keys = [
      ["customer-ledger", ORG, false, null, null, null, ""],
      ["customer-ledger-canonical-filtered", ORG, "c1,c2"],
      ["customer-ledger-canonical-page", ORG, "c1,c2"],
      ["customer-ledger-audit-closing", ORG, "c1", "all", "all"],
      ["customer-payment-history", "c1", undefined, undefined],
      ["customer-transactions", "c1", undefined, undefined, false, undefined],
      ["sales-invoice-dashboard", ORG],
    ];
    for (const key of keys) qc.setQueryData(key, { v: 1 });

    invalidateMoneyViewFreshness(qc, ORG);

    for (const key of keys) {
      expect(qc.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    }
  });

  it("leaves unrelated screens alone", () => {
    const qc = new QueryClient();
    qc.setQueryData(["purchase-bills", ORG], { v: 1 });
    invalidateMoneyViewFreshness(qc, ORG);
    expect(qc.getQueryState(["purchase-bills", ORG])?.isInvalidated).toBe(false);
  });
});
