import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type SkeletonKpiCardsProps = {
  count?: number;
  className?: string;
  /** Tailwind grid-cols classes, e.g. `grid-cols-2 lg:grid-cols-7` */
  columnsClassName?: string;
};

/** KPI card row — label + value placeholders matching dashboard stat tiles. */
export function SkeletonKpiCards({
  count = 3,
  className,
  columnsClassName = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
}: SkeletonKpiCardsProps) {
  return (
    <div className={cn("grid gap-2 lg:gap-3", columnsClassName, className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={`kpi-skel-${i}`}
          className="min-h-[72px] rounded-xl border border-slate-200/80 bg-white px-2.5 py-2.5 shadow-sm"
        >
          <Skeleton className="h-3.5 w-[56%] max-w-[7rem] rounded" />
          <Skeleton className="mt-2.5 h-7 w-[74%] max-w-[9rem] rounded" />
        </div>
      ))}
    </div>
  );
}

/** Gradient KPI strip used on Stock Report — matches compactStockKpiStrip height. */
export function SkeletonGradientKpiStrip({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-3 gap-2 w-full shrink-0", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={`grad-kpi-skel-${i}`} className="rounded-lg px-3 py-2 min-h-[52px] bg-slate-200/80">
          <Skeleton className="h-3 w-[45%] rounded bg-white/40" />
          <Skeleton className="mt-2 h-5 w-[60%] rounded bg-white/50" />
        </div>
      ))}
    </div>
  );
}
