import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { computePurchaseBillTotals } from "./excelImportUtils";

describe("main dashboard GST basis", () => {
  it("adds GST on top of the purchase rate in the bill net", () => {
    const totals = computePurchaseBillTotals(
      [{ line_total: 1000, gst_per: 5, qty: 1, pur_price: 1000, discount_percent: 0 }],
      0,
      0,
      false,
    );
    expect(totals.taxableAmount).toBe(1000);
    expect(totals.gstAmount).toBe(50);
    expect(totals.netAmount).toBe(1050);
  });

  it("labels Total Purchase as including GST and Stock Value as excluding it", () => {
    const dashboard = readFileSync(resolve(process.cwd(), "src/pages/Index.tsx"), "utf8");
    expect(dashboard).not.toContain('title="Cash Collection"');
    const purchase = dashboard.slice(
      dashboard.indexOf('title="Total Purchase"'),
      dashboard.indexOf('title="Bills"'),
    );
    const stock = dashboard.slice(
      dashboard.indexOf('title="Stock Value"'),
      dashboard.indexOf('title="Gross Profit"'),
    );
    expect(purchase).toContain('caption="Incl. GST"');
    expect(stock).toContain('caption="Excl. GST"');
  });
});
