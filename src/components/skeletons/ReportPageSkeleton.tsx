import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricCardSkeleton, TableSkeleton } from "@/components/ui/skeletons";

type ReportPageSkeletonProps = {
  kpiCount?: number;
  /** Fixed chart block height — matches AnimatedChart placeholder precedent */
  chartHeightPx?: number;
  chartBlocks?: number;
  tableRows?: number;
  showFilters?: boolean;
  className?: string;
};

/**
 * Route-shaped REPORT shell — filters + KPI row + chart blocks + table.
 * Reserved for the REPORT-bucket PR.
 */
export function ReportPageSkeleton({
  kpiCount = 4,
  chartHeightPx = 260,
  chartBlocks = 1,
  tableRows = 8,
  showFilters = true,
  className,
}: ReportPageSkeletonProps) {
  return (
    <div
      className={cn(
        "w-full space-y-4 p-4 animate-in fade-in-0 duration-300",
        className,
      )}
      aria-busy="true"
      aria-label="Loading report"
    >
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-36 rounded-md" />
          <Skeleton className="h-9 w-36 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
          <div className="flex-1 min-w-[1rem]" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: kpiCount }).map((_, i) => (
          <MetricCardSkeleton key={i} />
        ))}
      </div>

      {Array.from({ length: chartBlocks }).map((_, i) => (
        <div key={i} className="bg-card border border-border rounded-md p-4">
          <Skeleton className="h-5 w-40 mb-3" />
          <Skeleton
            className="w-full rounded-md"
            style={{ height: chartHeightPx }}
          />
        </div>
      ))}

      <div className="bg-card border border-border rounded-md p-3 min-h-[200px]">
        <TableSkeleton rows={tableRows} columns={6} showHeader />
      </div>
    </div>
  );
}
