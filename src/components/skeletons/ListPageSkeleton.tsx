import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/skeletons";

type ListPageSkeletonProps = {
  /** Table body row placeholders */
  rows?: number;
  columns?: number;
  /** Page header + action buttons (cold full-page load) */
  showToolbar?: boolean;
  /** Search / filter strip */
  showFilters?: boolean;
  className?: string;
};

/**
 * Route-shaped LIST shell — toolbar + filters + table.
 * Use showToolbar/showFilters=false when page chrome is already painted
 * and only the table/list region is waiting on isLoading.
 */
export function ListPageSkeleton({
  rows = 8,
  columns = 6,
  showToolbar = true,
  showFilters = true,
  className,
}: ListPageSkeletonProps) {
  return (
    <div
      className={cn(
        "w-full space-y-4 p-4 animate-in fade-in-0 duration-300",
        className,
      )}
      aria-busy="true"
      aria-label="Loading list"
    >
      {showToolbar && (
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56 max-w-full" />
          </div>
          <div className="flex gap-2 shrink-0">
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-9 rounded-md" />
          </div>
        </div>
      )}

      {showFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-48 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
          <div className="flex-1 min-w-[1rem]" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
      )}

      <div className="bg-card border border-border rounded-md p-3 min-h-[260px]">
        <TableSkeleton rows={rows} columns={columns} showHeader />
      </div>
    </div>
  );
}

/** Table-region only — same major height as loaded grids (no layout jump). */
export function ListTableSkeleton({
  rows = 8,
  columns = 6,
  className,
}: Pick<ListPageSkeletonProps, "rows" | "columns" | "className">) {
  return (
    <ListPageSkeleton
      rows={rows}
      columns={columns}
      showToolbar={false}
      showFilters={false}
      className={cn("p-0", className)}
    />
  );
}
