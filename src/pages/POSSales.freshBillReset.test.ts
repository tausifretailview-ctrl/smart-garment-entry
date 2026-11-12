import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Every POS path that starts a fresh bill must clear redeemed points and a typed round-off.
 * Left set (Nov 2026), the next walk-in bill was reduced by the old customer's points
 * ("Refund Due 50" on an empty bill) and never auto-rounded.
 */
const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "POSSales.tsx"), "utf8");

function block(start: string, end: string): string {
  const a = src.indexOf(start);
  expect(a, `missing: ${start}`).toBeGreaterThan(-1);
  const b = src.indexOf(end, a);
  expect(b, `missing end of: ${start}`).toBeGreaterThan(a);
  return src.slice(a, b);
}

describe("POSSales fresh-bill resets", () => {
  const paths: Array<[string, string, string]> = [
    ["Clear All", "const handleClearAll = () => {", 'toast.success("Cart Cleared"'],
    ["New Invoice", "const handleNewInvoice = () => {", 'toast.success("New Invoice"'],
    ["header New Sale", "setOnNewSale(() => () => {", 'toast.success("New Invoice"'],
  ];
  for (const [name, start, end] of paths) {
    it(`${name} clears points, manual round-off and the held flag`, () => {
      const body = block(start, end);
      expect(body).toContain("setPointsToRedeem(0)");
      expect(body).toContain("setIsManualRoundOff(false)");
      expect(body).toContain("setIsHeldSale(false)");
    });
  }

  it("every after-save cart reset clears points and the held flag", () => {
    const resets = src.split("setOriginalItemsForEdit([]);").slice(1).map((rest) => rest.slice(0, 600));
    const afterSave = resets.filter((r) => r.includes("clearSalesmanAfterSaveIfNeeded()"));
    expect(afterSave.length).toBe(3);
    for (const r of afterSave) {
      expect(r).toContain("setPointsToRedeem(0)");
      expect(r).toContain("setIsHeldSale(false)");
    }
  });

  it("redeemed points are dropped when the customer changes", () => {
    const effect = block("const pointsCustomerRef = useRef(customerId);", "}, [customerId, setPointsToRedeem]);");
    expect(effect).toContain("setPointsToRedeem(0)");
  });
});
