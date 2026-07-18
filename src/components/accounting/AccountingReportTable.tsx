import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Column<T> = {
  key: string;
  header: string;
  className?: string;
  cell: (row: T, index: number) => ReactNode;
};

type AccountingReportTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  emptyMessage?: string;
  footer?: ReactNode;
};

/** Dense Vasy-style report table — matches Customer Balances header/row density. */
export function AccountingReportTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = "No data available.",
  footer,
}: AccountingReportTableProps<T>) {
  return (
    <div className="rounded-lg border border-slate-200 shadow-sm overflow-hidden bg-white print:border print:shadow-none">
      <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain tab-scroll-stable max-h-[min(62vh,720px)] print:max-h-none">
        <Table className="[&_td]:px-3 [&_th]:px-3 border-collapse">
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="bg-slate-800 hover:bg-slate-800 border-none">
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    "h-10 text-xs font-bold uppercase tracking-wide text-white whitespace-nowrap",
                    col.className,
                  )}
                >
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => (
              <TableRow
                key={rowKey(row, idx)}
                className="h-10 hover:bg-teal-50/80 dark:hover:bg-teal-950/20 even:bg-slate-50/60"
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={cn("py-2 text-sm", col.className)}>
                    {col.cell(row, idx)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-20 text-center text-base text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          {footer ? <TableFooter>{footer}</TableFooter> : null}
        </Table>
      </div>
    </div>
  );
}
