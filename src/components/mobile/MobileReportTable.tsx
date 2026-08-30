import { forwardRef, type ReactNode, type Ref } from "react";
import { cn } from "@/lib/utils";

export interface ReportTableColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  sticky?: boolean; // pins this column left, only valid on the first column
  render: (row: T) => ReactNode;
  /** Plain-text value for CSV export (JSX `render` cannot be reused). */
  csvText?: (row: T) => string;
  minWidth?: string; // tailwind arbitrary value, e.g. "min-w-[80px]"
}

export interface MobileReportTableProps<T> {
  columns: ReportTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
}

/** Full-bleed data table: cancels the report body `px-4` so columns use the page width. */
export const mobileReportTableWrapClass =
  "overflow-x-auto -mx-4 min-w-0 border-y border-border/40 bg-card";

export const mobileReportTheadClass = "sticky top-0 z-10 bg-primary/15";

export const mobileReportThClass =
  "px-3 py-2.5 whitespace-nowrap font-semibold text-primary text-xs";

export const mobileReportTdClass = "px-3 py-2.5 whitespace-nowrap";

function MobileReportTableInner<T>(
  { columns, rows, rowKey }: MobileReportTableProps<T>,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <div ref={ref} className={mobileReportTableWrapClass}>
      <table className="w-full min-w-full text-xs border-collapse">
        <thead className={mobileReportTheadClass}>
          <tr>
            {columns.map((col, i) => (
              <th
                key={col.key}
                className={cn(
                  mobileReportThClass,
                  col.align === "right" ? "text-right" : "text-left",
                  col.sticky && i === 0 && "sticky left-0 bg-primary/15 z-20",
                  col.minWidth,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="odd:bg-muted/20 border-b border-border/40 last:border-b-0">
              {columns.map((col, i) => (
                <td
                  key={col.key}
                  className={cn(
                    mobileReportTdClass,
                    col.align === "right" ? "text-right tabular-nums" : "text-left",
                    col.sticky && i === 0 && "sticky left-0 bg-card z-10",
                  )}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const MobileReportTable = forwardRef(MobileReportTableInner) as <T>(
  props: MobileReportTableProps<T> & { ref?: Ref<HTMLDivElement> },
) => ReturnType<typeof MobileReportTableInner>;
