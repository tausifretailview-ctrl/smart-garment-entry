import type { ReactNode } from "react";
import { useIsFetching, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * True when a matching query is fetching *and* already has cached data.
 * Uses `useIsFetching` so it still updates under the app-wide
 * `notifyOnChangeProps: ["data", "error"]` default (which silences
 * `isFetching` flips on `useQuery` consumers).
 */
export function useQuietRefreshActive(queryKey: QueryKey, enabled = true): boolean {
  const queryClient = useQueryClient();
  const fetching = useIsFetching({ queryKey });
  if (!enabled || fetching === 0) return false;
  return queryClient.getQueriesData({ queryKey }).some(([, data]) => data != null);
}

type QuietRefreshBarProps = {
  queryKey: QueryKey;
  /** When false, never show (e.g. no customer selected). */
  enabled?: boolean;
  className?: string;
};

/** Thin indeterminate strip — no layout shift (absolute overlay). Hidden in print. */
export function QuietRefreshBar({ queryKey, enabled = true, className }: QuietRefreshBarProps) {
  const active = useQuietRefreshActive(queryKey, enabled);
  if (!active) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Refreshing"
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden print:hidden",
        className,
      )}
    >
      <div
        className="h-full w-full animate-[shimmer_1.2s_linear_infinite] bg-[linear-gradient(90deg,transparent_0%,hsl(var(--primary)/0.55)_45%,hsl(var(--primary)/0.55)_55%,transparent_100%)] bg-[length:200%_100%]"
      />
    </div>
  );
}

type QuietRefreshHintProps = {
  queryKey: QueryKey;
  enabled?: boolean;
  /** Shown when not quietly refreshing (e.g. party count subtitle). */
  idle?: ReactNode;
  className?: string;
};

/** Inline “Refreshing…” cue for header subtitles (party-balances pattern). */
export function QuietRefreshHint({ queryKey, enabled = true, idle, className }: QuietRefreshHintProps) {
  const active = useQuietRefreshActive(queryKey, enabled);
  if (active) {
    return (
      <span className={cn("inline-flex items-center gap-1", className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Refreshing…
      </span>
    );
  }
  return <>{idle}</>;
}
