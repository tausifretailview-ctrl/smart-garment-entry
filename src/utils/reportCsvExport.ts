import type { ReportTableColumn } from "@/components/mobile/MobileReportTable";

/** Plain-text cell → CSV-safe field (quote if it contains comma/quote/newline). */
export function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Prefer `csvText`; fall back to string/number `render` results. */
export function reportCellText<T>(col: ReportTableColumn<T>, row: T): string {
  if (col.csvText) return col.csvText(row);
  const rendered = col.render(row);
  if (typeof rendered === "string" || typeof rendered === "number") return String(rendered);
  return "";
}

export function buildCsvFromRows<T>(
  columns: ReportTableColumn<T>[],
  rows: T[],
  cellText: (col: ReportTableColumn<T>, row: T) => string,
): Blob {
  const header = columns.map((c) => csvField(c.header)).join(",");
  const lines = rows.map((row) =>
    columns.map((col) => csvField(cellText(col, row))).join(","),
  );
  return new Blob([[header, ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
}

/** Convenience: derive CSV text from each column's `csvText` (or string `render`). */
export function buildCsvFromReportTable<T>(columns: ReportTableColumn<T>[], rows: T[]): Blob {
  return buildCsvFromRows(columns, rows, reportCellText);
}
