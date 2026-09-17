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
