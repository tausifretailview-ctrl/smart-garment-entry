import { describe, expect, it } from "vitest";
import jsPDF from "jspdf";
import {
  LEDGER_PDF,
  fitLedgerPdfText,
  ledgerPdfLayout,
  ledgerPdfMoney,
  ledgerPdfTypeLabel,
  sanitizeLedgerPdfText,
} from "./customerLedgerPdfStyles";

describe("ledgerPdfLayout", () => {
  it("keeps A4 table width inside the page with default margins", () => {
    const a4 = ledgerPdfLayout("a4");
    expect(a4.pageWidth).toBe(210);
    expect(a4.pageHeight).toBe(297);
    expect(a4.margin + a4.tableWidth + a4.margin).toBe(210);
    const colSum = a4.colWidths.reduce((s, n) => s + n, 0);
    expect(colSum).toBeCloseTo(a4.tableWidth, 5);
  });

  it("jsPDF A5 page matches the layout helper", () => {
    const layout = ledgerPdfLayout("a5");
    const doc = new jsPDF({ unit: "mm", format: "a5", orientation: "portrait" });
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(layout.pageWidth, 0);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(layout.pageHeight, 0);
  });

  it("fits A5 portrait with narrower columns and an earlier page break", () => {
    const a5 = ledgerPdfLayout("a5");
    const a4 = ledgerPdfLayout("a4");
    expect(a5.pageWidth).toBe(148);
    expect(a5.pageHeight).toBe(210);
    expect(a5.tableWidth).toBeLessThan(a4.tableWidth);
    expect(a5.pageBreakY).toBeLessThan(a4.pageBreakY);
    expect(a5.margin + a5.tableWidth + a5.margin).toBe(148);
  });

  it("gives A5 amount columns enough width for 5-digit balances", () => {
    const a5 = ledgerPdfLayout("a5");
    expect(a5.colWidths[2]).toBeGreaterThanOrEqual(23);
    expect(a5.colWidths[6]).toBeGreaterThanOrEqual(17);
  });
});

describe("LEDGER_PDF print contrast", () => {
  it("uses black body text and a dark header so inkjet output is not washed out", () => {
    expect(LEDGER_PDF.text).toEqual([0, 0, 0]);
    expect(LEDGER_PDF.headerBg[0] + LEDGER_PDF.headerBg[1] + LEDGER_PDF.headerBg[2]).toBeLessThan(170);
    expect(LEDGER_PDF.muted[1]).toBeLessThan(80);
    expect(LEDGER_PDF.grid[0]).toBeLessThan(40);
  });
});

describe("ledger PDF cell clipping", () => {
  it("replaces rupee signs so Helvetica does not scatter glyphs", () => {
    expect(sanitizeLedgerPdfText("Customer owes ₹36,100")).toBe("Customer owes Rs. 36,100");
  });

  it("never lets fitted text exceed the cell width", () => {
    const doc = new jsPDF({ unit: "mm", format: "a5" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    const layout = ledgerPdfLayout("a5");
    const samples = [
      "POS/26-27/1259",
      "POS/26-27/1843",
      "Payment at sale - Cash: Rs. 4,000",
      "Rs. 36,100 Dr",
    ];
    for (const colW of layout.colWidths) {
      const max = colW - 2.2;
      for (const sample of samples) {
        const fitted = fitLedgerPdfText(doc, sample, max);
        expect(doc.getTextWidth(fitted)).toBeLessThanOrEqual(max + 0.05);
      }
    }
  });

  it("uses compact type labels and amounts on A5", () => {
    expect(ledgerPdfTypeLabel({ type: "invoice" }, true)).toBe("Inv");
    expect(ledgerPdfTypeLabel({ type: "payment" }, true)).toBe("Pmt");
    expect(ledgerPdfMoney(36100, "a5", "Dr")).toBe("36,100 Dr");
    expect(ledgerPdfMoney(36100, "a4", "Dr")).toBe("Rs. 36,100 Dr");
  });
});
