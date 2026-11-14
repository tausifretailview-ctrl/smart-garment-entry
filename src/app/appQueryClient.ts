import { QueryClient, QueryCache, MutationCache, keepPreviousData } from "@tanstack/react-query";
import {
  isStatementTimeout,
  statementTimeoutMessage,
  statementTimeoutMutationMessage,
} from "@/utils/statementTimeout";
import { toast as showToast } from "@/hooks/use-toast";
import { clearMissingQueryFnError, isMissingQueryFnError } from "@/utils/refetchQueriesWithFn";
import { APP_BUILD_BUSTER, holdsMapOrSet, isVolatileOrSensitiveKey, persister } from "@/lib/queryPersister";

/**
 * The app's React Query client and its on-disk cache settings, moved out of App.tsx
 * (Plan Phase 4, S3). Behaviour unchanged.
 */
export function createAppQueryClient(): QueryClient {
    // Write timeouts: global mutation toast. Read timeouts: only when a query
    // fails on first load with no cached rows (avoids spam on background refetch).
    const lastWriteToastAt = { current: 0 as number };
    const lastReadTimeoutToastAt = { current: 0 as number };
    const notifyWriteTimeout = () => {
      const now = Date.now();
      if (now - lastWriteToastAt.current < 1500) return;
      lastWriteToastAt.current = now;
      const { title, message } = statementTimeoutMutationMessage();
      showToast({ variant: "destructive", title, description: message });
    };
    const notifyReadTimeout = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      const now = Date.now();
      if (now - lastReadTimeoutToastAt.current < 3000) return;
      lastReadTimeoutToastAt.current = now;
      const { title, message } = statementTimeoutMessage();
      showToast({ variant: "destructive", title, description: message });
    };
    return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        // Restored-from-disk queries have no queryFn until their screen mounts;
        // a background refetch of one is not a real failure — never surface it.
        if (clearMissingQueryFnError(query, error)) return;
        if (!isStatementTimeout(error)) return;
        if (query.state.data !== undefined && query.state.data !== null) return;
        const head = String(query.queryKey[0] ?? "").toLowerCase();
        // Platform Admin queries (keys "platform-…") show their own inline errors.
        if (head.startsWith("platform")) return;
        notifyReadTimeout();
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isStatementTimeout(error)) notifyWriteTimeout();
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 60_000, // 60s — cuts cloud reads on tab/component remount; live queries override via STALE_LIVE
        gcTime: 1000 * 60 * 60 * 24, // 24h — matches persist maxAge; retention only, not refetch frequency
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        // refetchOnMount: true (default) — first page visit always fetches; tab return within staleTime skips
        // Statement timeouts (57014) are deterministic — retrying just doubles
        // the wait before the same failure. Short-circuit them; everything
        // else keeps the previous single retry.
        retry: (failureCount, error) =>
          !isStatementTimeout(error) && !isMissingQueryFnError(error) && failureCount < 1,
        // Tally/Vyapar feel: keep showing the previous data while a refetch runs
        // in the background. Combined with the always-mounted window tabs, this
        // makes switching dashboards instant — no skeleton flash, no scroll jump.
        placeholderData: keepPreviousData,
        // Only re-render consumers when data/error actually changes — silences
        // background `isFetching` flips so the page doesn't visibly "blink".
        notifyOnChangeProps: ["data", "error"],
      },
    },
    });
}

/** Restore cached reads for 24h; never write volatile / sensitive / Map-or-Set data to disk. */
export const appPersistOptions = {
  persister,
  maxAge: 1000 * 60 * 60 * 24,
  buster: APP_BUILD_BUSTER,
  dehydrateOptions: {
    shouldDehydrateQuery: (q: { state: { status: string; data: unknown }; queryKey: readonly unknown[] }) =>
      q.state.status === "success" && !isVolatileOrSensitiveKey(q.queryKey) && !holdsMapOrSet(q.state.data),
  },
};
