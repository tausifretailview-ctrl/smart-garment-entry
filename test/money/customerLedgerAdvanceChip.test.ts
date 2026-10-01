/**
 * The "Advance available" chip on an invoice row must depend on that row's own running
 * balance (credit exists at that point), not on the customer's overall balance. HAMZAS
 * POS/26-27/334 showed it because a later pending credit note made the overall balance negative.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Customer Ledger advance chip", () => {
  it("is driven by the row balance, not the customer's overall balance", () => {
    const src = readFileSync(resolve(__dirname, "../../src/components/CustomerLedger.tsx"), "utf8");
    const line = src.split("\n").find((l) => l.includes("transaction.paymentStatus !== 'completed'"));
    expect(line).toBeTruthy();
    expect(line).toContain("transaction.balance < -0.5");
    expect(line).not.toContain("effectiveBalance");
  });
});
