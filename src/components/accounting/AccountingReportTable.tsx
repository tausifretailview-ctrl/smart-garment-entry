import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  accountsHistoryCardClass,
  accountsHistoryTableClass,
  accountsHistoryTableWrapClass,
  accountsHistoryThClass,
} from "@/components/accounts/accountsHistoryUi";
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

export function AccountingReportTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = "No data available.",
  footer,
}: AccountingReportTableProps<T>) {
  return (
    <div className={cn(accountsHistoryCardClass, "print:border print:shadow-none")}>
      <div className={cn(accountsHistoryTableWrapClass, "max-h-none print:max-h-none")}>
        <Table className={accountsHistoryTableClass}>
          <TableHeader>
            <TableRow className="bg-slate-900 hover:bg-slate-900">
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    accountsHistoryThClass,
                    "text-white bg-slate-900",
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
              <TableRow key={rowKey(row, idx)} className="hover:bg-slate-50/80">
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.className}>
                    {col.cell(row, idx)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center py-10 text-muted-foreground"
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
