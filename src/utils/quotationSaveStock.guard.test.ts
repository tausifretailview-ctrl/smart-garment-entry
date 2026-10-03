import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entry = readFileSync(resolve(here, "../pages/QuotationEntry.tsx"), "utf8");
const migration = readFileSync(
  resolve(here, "../../supabase/migrations/20270103140000_quotation_no_stock_deduction.sql"),
  "utf8",
);

function saveBody(): string {
  const start = entry.indexOf("const handleSaveQuotationInner");
  const end = entry.indexOf("const handleSaveAndPrint");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return entry.slice(start, end);
}

describe("quotation save does not change live stock", () => {
  it("writes quotations and quotation_items only", () => {
    const body = saveBody();
    expect(body).toContain('.from("quotations")');
    expect(body).toContain('.from("quotation_items")');
    expect(body).not.toMatch(/from\(["']sale_items["']\)/);
    expect(body).not.toMatch(/from\(["']sales["']\)/);
    expect(body).not.toMatch(/from\(["']stock_movements["']\)/);
    expect(body).not.toMatch(/from\(["']product_variants["']\)/);
    expect(body).not.toMatch(/stock_qty\s*:/);
  });

  it("shows live on-hand in the size grid instead of subtracting the quotation qty", () => {
    expect(entry).toContain("holdLiveStock: true");
    expect(entry).not.toContain("cartQtyByVariant");
  });

  it("drops stock triggers on quotation tables and does not rewrite stock_qty", () => {
    expect(migration).toContain("DROP TRIGGER IF EXISTS");
    expect(migration).toContain("quotation_items");
    expect(migration).toContain("stock_qty");
    expect(migration).not.toMatch(/UPDATE\s+product_variants/i);
    expect(migration).not.toMatch(/INSERT\s+INTO\s+stock_movements/i);
  });
});
