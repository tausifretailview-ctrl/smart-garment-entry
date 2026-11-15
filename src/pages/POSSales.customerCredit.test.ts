import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * POS customer credit (balance, sale-return credit notes, redeem trace) loads when the customer
 * changes. Switching customer quickly used to let the previous customer's slower answer land last,
 * so the bill showed — and could apply — the wrong customer's credit (Nov 2026).
 */
const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "POSSales.tsx"), "utf8");
const start = src.indexOf("// Fetch credit balance and pending sale return credit notes when customer changes");
const effect = src.slice(start, src.indexOf("}, [customerId]);", start));

describe("POS customer credit load", () => {
  it("drops answers for a customer who is no longer selected", () => {
    expect(start).toBeGreaterThan(-1);
    expect(effect).toContain("let cancelled = false;");
    expect(effect).toContain("cancelled = true;");
    // checked after the parallel reads and after the follow-up read, before any state is set
    expect(effect.split("if (cancelled) return;").length - 1).toBeGreaterThanOrEqual(2);
    expect(effect.indexOf("if (cancelled) return;")).toBeLessThan(effect.indexOf("setAvailableCreditBalance(balance)"));
  });

  it("reads balance, credit notes and the redeem trace together", () => {
    expect(effect).toContain("await Promise.all([");
    expect(effect).toContain("getAvailableCreditBalance(customerId)");
    expect(effect).toContain("getAvailableCN(supabase, customerId, orgId, { includeUnlinkedAdjusted: true })");
  });
});
