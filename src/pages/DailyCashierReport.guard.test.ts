import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("Cashier Report discount vs round-off", () => {
  it("totals discount from line+flat+points only, and shows Round Off separately", () => {
    const src = readFileSync(join(here, "DailyCashierReport.tsx"), "utf8");
    expect(src).toContain("getSaleReportLineDiscountAmount");
    expect(src).not.toMatch(/totalDiscount \+= getSaleReportDiscountAmount/);
    expect(src).not.toContain("Incl. round off");
    expect(src).toContain("Round Off");
    expect(src).toContain("Round off");
  });
});

describe("Business Report custom From – To period", () => {
  const src = readFileSync(join(here, "DailyCashierReport.tsx"), "utf8");

  it("offers a Custom period with From and To pickers that drive the date range", () => {
    expect(src).toContain('<SelectItem value="custom">Custom (From – To)</SelectItem>');
    expect(src).toMatch(/case "custom": \{[\s\S]*?customFrom <= customTo/);
    expect(src).toContain('onSelect={(date) => date && setCustomFrom(date)}');
    expect(src).toContain('onSelect={(date) => date && setCustomTo(date)}');
  });

  it("remembers the custom dates with the other filters and names exports by the range", () => {
    expect(src).toContain('["customFrom", setCustomFrom]');
    expect(src).toContain('["customTo", setCustomTo]');
    expect(src).toContain("`${rangeStartYmd}_to_${rangeEndYmd}`");
  });
});
