import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("POS passes Mix Payment finance to the bill", () => {
  it("every POS InvoiceWrapper that gets creditAmount also gets financeAmount", () => {
    const src = readFileSync("src/pages/POSSales.tsx", "utf8");
    const credit = src.match(/creditAmount=\{savedInvoiceData\??\.creditAmount/g)?.length ?? 0;
    const finance = src.match(/financeAmount=\{savedInvoiceData\??\.paymentBreakdown\?\.financeAmount/g)?.length ?? 0;
    expect(credit).toBeGreaterThan(0);
    expect(finance).toBe(credit);
  });
});
