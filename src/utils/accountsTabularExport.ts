import type * as XLSXType from "xlsx";

/** Lazily loaded — keeps the xlsx / jsPDF bundles off the first paint. */
let xlsxModulePromise: Promise<typeof XLSXType> | null = null;
const loadXlsx = (): Promise<typeof XLSXType> => (xlsxModulePromise ??= import("xlsx"));

export type TabularColumn<T> = {
  header: string;
  /** Relative PDF column width. Defaults to 1. */
  width?: number;
  align?: "left" | "right";
  value: (row: T) => string | number | null | undefined;
};

export function tabularRowsToRecords<T>(
  columns: TabularColumn<T>[],
  rows: T[],
): Record<string, string | number>[] {
  return rows.map((row) => {
    const record: Record<string, string | number> = {};
    for (const column of columns) {
      const value = column.value(row);
      record[column.header] = value == null || value === "" ? "" : value;
    }
    return record;
  });
}

/** SheetJS sheet names are limited to 31 characters and a small character set. */
export function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || "Sheet").slice(0, 31);
}

function cellText(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value).replace(/₹/g, "Rs.").replace(/\s+/g, " ").trim();
}

function fitText(
  measure: (text: string) => number,
  text: string,
  maxWidth: number,
): string {
  if (!text) return "";
  if (measure(text) <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  let best = "";
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = mid >= text.length ? text : `${text.slice(0, mid)}…`;
    if (measure(candidate) <= maxWidth) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

export async function downloadTabularExcel<T>(args: {
  filename: string;
  sheetName: string;
  columns: TabularColumn<T>[];
  rows: T[];
}): Promise<void> {
  const XLSX = await loadXlsx();
  const ws = XLSX.utils.json_to_sheet(tabularRowsToRecords(args.columns, args.rows));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(args.sheetName));
  XLSX.writeFile(wb, args.filename);
}

export async function downloadTabularPdf<T>(args: {
  filename: string;
  title: string;
  subtitle?: string;
  columns: TabularColumn<T>[];
  rows: T[];
}): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 8;
  const usable = pageWidth - margin * 2;
  const weights = args.columns.map((column) => Math.max(column.width ?? 1, 0.4));
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const widths = weights.map((weight) => (usable * weight) / weightSum);

  const paintHeader = (y: number) => {
    doc.setFillColor(15, 118, 110);
    doc.rect(margin, y, usable, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    let x = margin;
    args.columns.forEach((column, index) => {
      const label = fitText((text) => doc.getTextWidth(text), column.header, widths[index] - 2);
      if (column.align === "right") {
        doc.text(label, x + widths[index] - 1.2, y + 4.6, { align: "right" });
      } else {
        doc.text(label, x + 1.2, y + 4.6);
      }
      x += widths[index];
    });
    doc.setTextColor(15, 23, 42);
    return y + 7;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 118, 110);
  doc.text(args.title, margin, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  if (args.subtitle) doc.text(args.subtitle, margin, 17);
  doc.setTextColor(15, 23, 42);

  let y = paintHeader(args.subtitle ? 21 : 16);
  const rowHeight = 5.4;

  args.rows.forEach((row, rowIndex) => {
    if (y + rowHeight > pageHeight - 10) {
      doc.addPage();
      y = paintHeader(10);
    }
    if (rowIndex % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, usable, rowHeight, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    let x = margin;
    args.columns.forEach((column, index) => {
      const raw = cellText(column.value(row));
      const fitted = fitText((text) => doc.getTextWidth(text), raw, widths[index] - 2);
      if (column.align === "right") {
        doc.text(fitted, x + widths[index] - 1.2, y + 3.7, { align: "right" });
      } else {
        doc.text(fitted, x + 1.2, y + 3.7);
      }
      x += widths[index];
    });
    y += rowHeight;
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 4, { align: "right" });
  }

  doc.save(args.filename);
}
