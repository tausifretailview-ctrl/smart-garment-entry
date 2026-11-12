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

  it("every save path resets through resetPosBillAfterSave, which clears points, round-off and the held flag", () => {
    const reset = block("const resetPosBillAfterSave = () => {", "\n  };");
    expect(reset).toContain("setPointsToRedeem(0)");
    expect(reset).toContain("setIsManualRoundOff(false)");
    expect(reset).toContain("setIsHeldSale(false)");
    expect(reset).toContain("clearSalesmanAfterSaveIfNeeded()");
    for (const handler of [
      "const handleSaveSale = async (",
      "const handlePaymentAndPrint = async (",
      "const handleMixPaymentSave = async (",
    ]) {
      expect(block(handler, "\n  };"), handler).toContain("resetPosBillAfterSave()");
    }
    // No hand-written copy of the after-save reset is left to drift again.
    expect(src.split("clearSalesmanAfterSaveIfNeeded();\n      setSaleNotes(").length).toBe(1);
  });

  it("redeemed points are dropped when the customer changes", () => {
    const effect = block("const pointsCustomerRef = useRef(customerId);", "}, [customerId, setPointsToRedeem]);");
    expect(effect).toContain("setPointsToRedeem(0)");
  });
});
