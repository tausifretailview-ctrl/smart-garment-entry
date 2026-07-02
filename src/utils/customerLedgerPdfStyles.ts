import type jsPDF from "jspdf";

/** RGB tuples aligned with CustomerLedger on-screen colors (Tailwind approx). */
export const LEDGER_PDF = {
  headerBg: [15, 118, 110] as const,
  headerText: [255, 255, 255] as const,
  title: [15, 118, 110] as const,
  text: [15, 23, 42] as const,
  muted: [100, 116, 139] as const,
  debit: [220, 38, 38] as const,
  credit: [4, 120, 87] as const,
  balanceDr: [220, 38, 38] as const,
  balanceCr: [4, 120, 87] as const,
  balanceSettled: [100, 116, 139] as const,
  totalsBg: [241, 245, 249] as const,
  zebra: [248, 250, 252] as const,
  openingBg: [255, 247, 237] as const,
  openingText: [234, 88, 12] as const,
  reconBg: [248, 250, 252] as const,
  reconBorder: [226, 232, 240] as const,
  orange: [234, 88, 12] as const,
  purple: [126, 34, 206] as const,
  blue: [29, 78, 216] as const,
  green: [4, 120, 87] as const,
  red: [220, 38, 38] as const,
  amber: [180, 83, 9] as const,
  tealBoxBg: [240, 253, 250] as const,
  tealBoxBorder: [153, 246, 228] as const,
  tealBoxText: [15, 118, 110] as const,
  redBoxBg: [254, 242, 242] as const,
  redBoxBorder: [254, 202, 202] as const,
  emeraldBoxBg: [236, 253, 245] as const,
  emeraldBoxBorder: [167, 243, 208] as const,
};

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
    default:
      return LEDGER_PDF.muted;
  }
}

export function ledgerPdfReconLineColor(label: string): Rgb | null {
  if (label.includes("Sale Returns (Confirmed)") || label.includes("Cash / UPI")) {
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
  if (label.includes("Advance (Cr)")) {
    return LEDGER_PDF.balanceCr;
  }
  return null;
}
