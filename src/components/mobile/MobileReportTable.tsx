import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ReportTableColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  sticky?: boolean; // pins this column left, only valid on the first column
  render: (row: T) => ReactNode;
  minWidth?: string; // tailwind arbitrary value, e.g. "min-w-[80px]"
}

export function MobileReportTable<T>({
  columns,
  rows,
  rowKey,
}: {
  columns: ReportTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
}) {
  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 bg-muted/95 backdrop-blur-sm z-10">
          <tr>
            {columns.map((col, i) => (
              <th
                key={col.key}
                className={cn(
                  "px-2 py-2 whitespace-nowrap font-semibold",
                  col.align === "right" ? "text-right" : "text-left",
                  col.sticky && i === 0 && "sticky left-0 bg-muted/95 z-20",
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
            <tr key={rowKey(row)} className="odd:bg-muted/20">
              {columns.map((col, i) => (
                <td
                  key={col.key}
                  className={cn(
                    "px-2 py-2 whitespace-nowrap",
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
