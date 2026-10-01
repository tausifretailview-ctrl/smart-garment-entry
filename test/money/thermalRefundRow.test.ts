import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(`src/components/${name}.tsx`, "utf8");

describe("thermal receipts print the cash refund row", () => {
  // Every template that draws a payment section must draw `Refund` from refundCash.
  for (const name of [
    "ThermalPrint80mm",
    "ThermalReceiptCompact",
    "TvsThermalReceipt80mm",
    "KidsThermalReceipt80mm",
    "ModernThermalReceipt80mm",
    "NewDesignThermalReceipt80mm",
    "KidsCampThermalReceipt80mm",
  ]) {
    it(`${name} renders refundCash`, () => {
      const src = read(name);
      expect(src).toMatch(/refundCash\s*(>|!==)/);
    });
  }

  it("Modern keeps the refund row outside the paid-amount block (a refund bill pays 0)", () => {
    const src = read("ModernThermalReceipt80mm");
    const paidBlock = src.indexOf("PAYMENT DETAILS");
    const refundRow = src.indexOf("Refund to Customer");
    const youSaved = src.indexOf("YOU SAVED");
    expect(paidBlock).toBeGreaterThan(-1);
    // Placed after the paid block closes and before You Saved.
    expect(refundRow).toBeGreaterThan(paidBlock);
    expect(refundRow).toBeLessThan(youSaved);
    const between = src.slice(paidBlock, refundRow);
    expect(between.match(/paidAmount > 0\) && \(/g)?.length).toBe(1);
    // the paid block's closing "        )}" occurs before the refund row
    expect(between).toContain("\n        )}\n");
  });
});
