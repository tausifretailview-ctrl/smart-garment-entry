import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton components for common UI patterns
 * Use these to show loading state that matches the final layout shape
 */

// Metric card skeleton - matches AnimatedMetricCard layout
export function MetricCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("bg-card border border-border rounded-md p-3 border-l-[3px] border-l-muted", className)}>
      <div className="flex flex-row items-center justify-between space-y-0 pb-1">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-7 rounded-md" />
      </div>
      <Skeleton className="h-7 w-24 mt-1" />
    </div>
  );
}

// Table skeleton - shows placeholder rows matching table structure
export function TableSkeleton({ 
  rows = 5, 
  columns = 5,
  showHeader = true,
  className 
}: { 
  rows?: number; 
  columns?: number;
  showHeader?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("w-full space-y-2", className)}>
      {showHeader && (
        <div className="flex gap-2 p-2 bg-muted/50 rounded-md">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className={cn("h-4", i === 0 ? "w-32" : "flex-1")} />
          ))}
        </div>
      )}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-2 p-2">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton 
              key={colIndex} 
              className={cn(
                "h-5",
                colIndex === 0 ? "w-32" : "flex-1"
              )} 
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// List skeleton - vertical list of items
export function ListSkeleton({ 
  items = 5,
  showIcon = true,
  className 
}: { 
  items?: number;
  showIcon?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-2">
          {showIcon && <Skeleton className="h-8 w-8 rounded-md shrink-0" />}
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

// Dashboard skeleton - complete dashboard layout placeholder
export function DashboardSkeleton() {
  return (
    <div className="space-y-4 p-4 animate-in fade-in-0 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-md" />
        ))}
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <MetricCardSkeleton key={i} />
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-md p-4">
          <Skeleton className="h-5 w-32 mb-4" />
          <Skeleton className="h-48 w-full rounded-md" />
        </div>
        <div className="bg-card border border-border rounded-md p-4">
          <Skeleton className="h-5 w-32 mb-4" />
          <Skeleton className="h-48 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}

// POS skeleton - matches POS billing screen layout
export function POSSkeleton() {
  return (
    <div className="flex h-full gap-3 p-3 animate-in fade-in-0 duration-300">
      {/* Left panel - items */}
      <div className="flex-1 flex flex-col gap-3">
        {/* Search bar */}
        <div className="flex gap-2">
          <Skeleton className="h-10 flex-1 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
        </div>
        
        {/* Items table */}
        <div className="flex-1 bg-card border border-border rounded-md p-3">
          <TableSkeleton rows={8} columns={6} />
        </div>
      </div>

      {/* Right panel - totals */}
      <div className="w-80 flex flex-col gap-3">
        {/* Customer */}
        <div className="bg-card border border-border rounded-md p-3 space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>

        {/* Totals */}
        <div className="bg-card border border-border rounded-md p-3 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
          <div className="border-t border-border pt-2 mt-2">
            <div className="flex justify-between">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-24" />
            </div>
          </div>
        </div>

        {/* Payment buttons */}
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}

// Report skeleton - for reports and data tables
export function ReportSkeleton() {
  return (
    <div className="space-y-4 p-4 animate-in fade-in-0 duration-300">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Skeleton className="h-10 w-36 rounded-md" />
        <Skeleton className="h-10 w-36 rounded-md" />
        <Skeleton className="h-10 w-24 rounded-md" />
        <div className="flex-1" />
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <MetricCardSkeleton key={i} />
        ))}
      </div>

      {/* Data table */}
      <div className="bg-card border border-border rounded-md p-4">
        <TableSkeleton rows={10} columns={7} />
      </div>
    </div>
  );
}

// Form skeleton - for forms and entry screens
export function FormSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <div className="space-y-4 p-4 animate-in fade-in-0 duration-300">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        ))}
      </div>
      <div className="flex gap-2 justify-end pt-4">
        <Skeleton className="h-10 w-24 rounded-md" />
        <Skeleton className="h-10 w-28 rounded-md" />
      </div>
    </div>
  );
}

// Card skeleton - simple card placeholder
export function CardSkeleton({ 
  showHeader = true, 
  contentLines = 3,
  className 
}: { 
  showHeader?: boolean;
  contentLines?: number;
  className?: string;
}) {
  return (
    <div className={cn("bg-card border border-border rounded-md p-4 space-y-3", className)}>
      {showHeader && (
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-5 rounded" />
        </div>
      )}
      <div className="space-y-2">
        {Array.from({ length: contentLines }).map((_, i) => (
          <Skeleton 
            key={i} 
            className={cn("h-4", i === contentLines - 1 ? "w-2/3" : "w-full")} 
          />
        ))}
      </div>
    </div>
  );
}
