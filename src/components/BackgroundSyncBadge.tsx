import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tally/Vyapar-style background sync indicator. Renders a tiny "Syncing…" chip
 * whenever any React Query fetch or mutation is in flight. Replaces full-page
 * skeletons for routine tab refreshes — cached data stays visible, user gets a
 * subtle hint that data is updating.
 *
 * Mount once globally (already in StatusBar). The 250 ms debounce avoids a
 * flicker on instant cache hits.
 */
interface BackgroundSyncBadgeProps {
  className?: string;
  /** Show even when only mutations (no queries) are running. Default true. */
  includeMutations?: boolean;
}

export function BackgroundSyncBadge({
  className,
  includeMutations = true,
}: BackgroundSyncBadgeProps) {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const busy = fetching > 0 || (includeMutations && mutating > 0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (busy) {
      const t = window.setTimeout(() => setVisible(true), 250);
      return () => window.clearTimeout(t);
    }
    setVisible(false);
  }, [busy]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        "status-item gap-1.5 text-[0.875rem] tracking-wide",
        "text-primary-foreground/80",
        className,
      )}
      role="status"
      aria-live="polite"
      title="Refreshing data in background"
    >
      <RefreshCw className="h-2.5 w-2.5 animate-spin" />
      <span>Syncing…</span>
    </div>
  );
}