import { Fragment } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SkeletonTableColumn = {
  width?: string;
  align?: "left" | "center" | "right";
  variant?: "text" | "pill" | "checkbox" | "icon" | "amount" | "barcode";
};

type SkeletonTableRowsProps = {
  count?: number;
  columns: SkeletonTableColumn[];
  /** Use native `<tr>` for ERPTable; default shadcn TableRow */
  asNative?: boolean;
  rowClassName?: string;
  cellClassName?: string;
};

function alignClass(align?: SkeletonTableColumn["align"]) {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

function SkeletonCell({ column }: { column: SkeletonTableColumn }) {
  const align = column.align ?? "left";
  const margin =
    align === "right" ? "ml-auto" : align === "center" ? "mx-auto" : undefined;

  if (column.variant === "checkbox") {
    return <Skeleton className={cn("h-4 w-4 rounded", margin)} />;
  }
  if (column.variant === "icon") {
    return <Skeleton className={cn("h-4 w-4 rounded", margin)} />;
  }
  if (column.variant === "pill") {
    return <Skeleton className={cn("h-4 w-11 rounded-full", margin)} />;
  }

  const width = column.width ?? "72%";
  const height = column.variant === "amount" ? "h-3.5" : "h-3";

  return (
    <Skeleton
      className={cn(height, "rounded", margin, column.variant === "barcode" && "font-mono")}
      style={{ width, maxWidth: "100%" }}
    />
  );
}

/** Table body rows shaped like real dashboard columns (shimmer via Skeleton). */
export function SkeletonTableRows({
  count = 8,
  columns,
  asNative = false,
  rowClassName,
  cellClassName,
}: SkeletonTableRowsProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, rowIdx) => {
        const cells = columns.map((column, colIdx) => {
          const content = <SkeletonCell column={column} />;
          if (asNative) {
            return (
              <td
                key={`skel-cell-${rowIdx}-${colIdx}`}
                className={cn("px-3 py-2.5 align-middle", alignClass(column.align), cellClassName)}
              >
                {content}
              </td>
            );
          }
          return (
            <TableCell
              key={`skel-cell-${rowIdx}-${colIdx}`}
              className={cn("py-2.5 align-middle", alignClass(column.align), cellClassName)}
            >
              {content}
            </TableCell>
          );
        });

        if (asNative) {
          return (
            <tr key={`skel-row-${rowIdx}`} className={cn("border-b border-slate-100", rowClassName)}>
              {cells}
            </tr>
          );
        }

        return (
          <TableRow key={`skel-row-${rowIdx}`} className={cn("border-b border-slate-100", rowClassName)}>
            {cells}
          </TableRow>
        );
      })}
    </>
  );
}

/** Mobile card list placeholder — stacked rows like invoice/bill cards. */
export function SkeletonMobileListRows({ count = 5, className }: { count?: number; className?: string }) {
  return (
    <Fragment>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={`mob-skel-${i}`}
          className={cn("rounded-2xl border border-border/40 bg-card p-3.5 shadow-sm space-y-2", className)}
        >
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-4 w-12 rounded-full" />
          </div>
          <Skeleton className="h-4 w-[70%] rounded" />
          <div className="flex justify-between items-center pt-1">
            <Skeleton className="h-3 w-20 rounded" />
            <Skeleton className="h-5 w-16 rounded" />
          </div>
        </div>
      ))}
    </Fragment>
  );
}
