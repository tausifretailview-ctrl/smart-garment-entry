import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("sales.finance_amount wiring", () => {
  it("all three sale writes include the guarded finance field", () => {
    const src = read("src/hooks/useSaveSale.tsx");
    expect(src.match(/\.\.\.\(await salesFinanceFields\(supabase, financeAmt\)\)/g)?.length).toBe(3);
  });
  it("migration adds the column additively", () => {
    const sql = read("supabase/migrations/20261231160000_sales_finance_amount.sql");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS finance_amount numeric\(15,2\) NOT NULL DEFAULT 0/);
  });
  it("dashboard print and preview pass financeAmount", () => {
    const src = read("src/pages/POSDashboard.tsx");
    expect(src).toContain("financeAmount: Number(sale.finance_amount) || 0");
    expect(src).toContain("financeAmount={printData.financeAmount ?? 0}");
    expect(src).toContain("financeAmount={Number(previewSale.finance_amount) || 0}");
  });
});
