import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type FormPageSkeletonProps = {
  /** Number of field-group cards */
  groups?: number;
  /** Fields per group (approx) */
  fieldsPerGroup?: number;
  className?: string;
};

/**
 * Route-shaped FORM shell — page header + field-group cards.
 * Reserved for the FORM-bucket PR; kept consistent with List/Report shells.
 */
export function FormPageSkeleton({
  groups = 2,
  fieldsPerGroup = 4,
  className,
}: FormPageSkeletonProps) {
  return (
    <div
      className={cn(
        "w-full space-y-4 p-4 animate-in fade-in-0 duration-300",
        className,
      )}
      aria-busy="true"
      aria-label="Loading form"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
      </div>

      {Array.from({ length: groups }).map((_, g) => (
        <div
          key={g}
          className="bg-card border border-border rounded-md p-4 space-y-4 min-h-[140px]"
        >
          <Skeleton className="h-5 w-36" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: fieldsPerGroup }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
