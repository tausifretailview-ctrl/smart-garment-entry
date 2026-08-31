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
  variant?: "default" | "insights" | "statement";
  onRowClick?: (row: T) => void;
}

/** Full-bleed data table: cancels the report body `px-4` and stretches columns to the page width. */
export const mobileReportTableWrapClass =
  "overflow-x-auto -mx-2 w-[calc(100%+1rem)] max-w-none border-y border-border/40 bg-card";

export const mobileReportTheadClass = "sticky top-0 z-10 bg-primary/15";

export const mobileReportThClass =
  "px-3 py-2.5 whitespace-nowrap font-semibold text-primary text-xs";

export const mobileReportTdClass = "px-3 py-2.5 whitespace-nowrap";

function MobileReportTableInner<T>(
  { columns, rows, rowKey, variant = "default", onRowClick }: MobileReportTableProps<T>,
  ref: Ref<HTMLDivElement>,
) {
  const insights = variant === "insights";
  const statement = variant === "statement";
  const headBg = insights ? "bg-slate-800" : statement ? "bg-sky-100" : undefined;
  const stickyHead = insights ? "bg-slate-800" : statement ? "bg-sky-100" : "bg-primary/15";
  return (
    <div ref={ref} className={mobileReportTableWrapClass}>
      <table className="w-full min-w-full text-xs border-collapse">
        <thead className={cn(mobileReportTheadClass, headBg, statement && "bg-sky-100")}>
          <tr>
            {columns.map((col, i) => (
              <th
                key={col.key}
                className={cn(
                  mobileReportThClass,
                  insights && "bg-slate-800 text-white uppercase tracking-wide text-[10px]",
                  statement && "bg-sky-100 text-sky-900 uppercase tracking-wide text-[10px] border-b border-sky-200",
                  col.align === "right" ? "text-right" : "text-left",
                  col.sticky && i === 0 && `sticky left-0 ${stickyHead} z-20`,
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
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "group odd:bg-muted/20 border-b border-border/40 last:border-b-0",
                insights && "odd:bg-transparent even:bg-slate-50/80 border-slate-100",
                statement && "odd:bg-transparent even:bg-sky-50/50 border-slate-200",
                onRowClick && "cursor-pointer active:bg-muted/40 touch-manipulation",
              )}
            >
              {columns.map((col, i) => (
                <td
                  key={col.key}
                  className={cn(
                    mobileReportTdClass,
                    col.align === "right" ? "text-right tabular-nums" : "text-left",
                    col.sticky && i === 0 && (insights
                      ? "sticky left-0 z-10 bg-background group-even:bg-slate-50"
                      : statement
                        ? "sticky left-0 z-10 bg-background group-even:bg-sky-50/50"
                        : "sticky left-0 bg-card z-10"),
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
