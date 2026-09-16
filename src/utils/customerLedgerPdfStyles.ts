import type jsPDF from "jspdf";

export type LedgerPdfPaper = "a4" | "a5";

/**
 * RGB tuples for the Customer Ledger PDF.
 * Tuned darker than Tailwind screen tokens so inkjet/laser prints stay readable
 * while remaining full-color (not grayscale).
 */
export const LEDGER_PDF = {
  headerBg: [4, 78, 71] as const,
  headerText: [255, 255, 255] as const,
  title: [4, 78, 71] as const,
  text: [0, 0, 0] as const,
  muted: [51, 65, 85] as const,
  debit: [185, 28, 28] as const,
  credit: [6, 95, 70] as const,
  balanceDr: [185, 28, 28] as const,
  balanceCr: [6, 95, 70] as const,
  balanceSettled: [51, 65, 85] as const,
  totalsBg: [226, 232, 240] as const,
  zebra: [241, 245, 249] as const,
  openingBg: [255, 237, 213] as const,
  openingText: [154, 52, 18] as const,
  reconBg: [241, 245, 249] as const,
  reconBorder: [71, 85, 105] as const,
  grid: [30, 41, 59] as const,
  orange: [194, 65, 12] as const,
  purple: [88, 28, 135] as const,
  blue: [29, 57, 196] as const,
  green: [6, 95, 70] as const,
  red: [185, 28, 28] as const,
  amber: [146, 64, 14] as const,
  tealBoxBg: [204, 251, 241] as const,
  tealBoxBorder: [15, 118, 110] as const,
  tealBoxText: [4, 78, 71] as const,
  redBoxBg: [254, 226, 226] as const,
  redBoxBorder: [185, 28, 28] as const,
  emeraldBoxBg: [209, 250, 229] as const,
  emeraldBoxBorder: [4, 120, 87] as const,
};

const COL_RATIOS = [28, 16, 22, 48, 22, 22, 22] as const;

export function ledgerPdfLayout(paper: LedgerPdfPaper) {
  const isA5 = paper === "a5";
  const margin = isA5 ? 8 : 14;
  const pageWidth = isA5 ? 148 : 210;
  const pageHeight = isA5 ? 210 : 297;
  const tableWidth = pageWidth - margin * 2;
  const ratioSum = COL_RATIOS.reduce((s, n) => s + n, 0);
  const colWidths = COL_RATIOS.map((n) => (n / ratioSum) * tableWidth);
  return {
    paper,
    margin,
    pageWidth,
    pageHeight,
    tableWidth,
    colWidths,
    pageBreakY: pageHeight - (isA5 ? 16 : 20),
    bodyFont: isA5 ? 7 : 9,
    headerFont: isA5 ? 7 : 8,
    titleFont: isA5 ? 14 : 18,
    descChars: isA5 ? 18 : 28,
    rowH: isA5 ? 5.5 : 6.5,
  };
}

export function pdfStrokeGrid(doc: jsPDF, lineWidth = 0.25) {
  pdfSetDraw(doc, LEDGER_PDF.grid);
  doc.setLineWidth(lineWidth);
}

type Rgb = readonly [number, number, number];

export function pdfSetFill(doc: jsPDF, rgb: Rgb) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}

export function pdfSetDraw(doc: jsPDF, rgb: Rgb) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

export function pdfSetText(doc: jsPDF, rgb: Rgb) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

export function ledgerPdfTypeLabel(t: { type: string; status?: string }): string {
  switch (t.type) {
    case "invoice":
      return "Invoice";
    case "return":
      return "Sale Return";
    case "advance":
      return "Advance";
    case "advance_application":
      return "Adv Adj";
    case "adjustment":
      return "Adjustment";
    case "cn_refund":
      return "CN Refund";
    case "adv_refund":
      return "Adv Refund";
    case "credit_note":
      return "Credit Note";
    case "cn_adjusted":
      return "CN Adjust";
    case "fee":
      return "Fee";
    default:
      return "Payment";
  }
}

export function ledgerPdfTypeColor(t: { type: string; status?: string }): Rgb {
  switch (t.type) {
    case "invoice":
      return LEDGER_PDF.purple;
    case "return":
      return t.status === "pending" ? LEDGER_PDF.orange : LEDGER_PDF.green;
    case "advance":
      return LEDGER_PDF.blue;
    case "payment":
      return LEDGER_PDF.green;
    case "adjustment":
      return LEDGER_PDF.orange;
    case "cn_refund":
    case "adv_refund":
      return LEDGER_PDF.red;
    case "cn_adjusted":
    case "advance_application":
      return LEDGER_PDF.muted;
    default:
      return LEDGER_PDF.muted;
  }
}

export function ledgerPdfReconLineColor(label: string): Rgb | null {
  if (
    label.includes("Sale Returns (Confirmed)") ||
    label.includes("Cash / UPI") ||
    label.includes("Advance Adjusted")
  ) {
    return LEDGER_PDF.green;
  }
  if (label.includes("Pending CN") || label.includes("CN / S/R")) {
    return LEDGER_PDF.orange;
  }
  if (label.includes("Settlement Discount")) {
    return LEDGER_PDF.amber;
  }
  if (label.includes("Outstanding (Dr)")) {
    return LEDGER_PDF.balanceDr;
  }
  if (label.includes("Advance (Cr)") || label.includes("Party balance (Cr)")) {
    return LEDGER_PDF.balanceCr;
  }
  return null;
}
