import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("POS Dashboard print render", () => {
  const src = readFileSync("src/pages/POSDashboard.tsx", "utf8");
  const printStart = src.indexOf("{printData && (");

  it("builds refundCash and billNetAmount into the print data", () => {
    expect(src).toMatch(/refundCash:\s*saleRefundForReprint\(/);
    expect(src).toMatch(/billNetAmount:\s*saleBillFigures\(sale\)\.billAmount/);
  });

  it("passes both to the hidden InvoiceWrapper the Print button and WhatsApp PDF use", () => {
    expect(printStart).toBeGreaterThan(-1);
    const render = src.slice(printStart, printStart + 3000);
    expect(render).toContain("refundCash={printData.refundCash");
    expect(render).toContain("billNetAmount={printData.billNetAmount}");
  });
});
