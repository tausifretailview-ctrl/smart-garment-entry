import type { Query, QueryClient, QueryKey } from "@tanstack/react-query";

/** Persisted queries are restored without a queryFn until a screen subscribes. */
export function queryHasQueryFn(query: Pick<Query, "options">): boolean {
  return typeof query.options.queryFn === "function";
}

export function isMissingQueryFnError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : "";
  return message.startsWith("Missing queryFn");
}

/**
 * Mark every match stale, then refetch only queries that still have a queryFn.
 * Returns a promise that settles when the refetch is done (never rejects).
 */
export async function invalidateQueriesWithQueryFn(
  queryClient: QueryClient,
  queryKey: QueryKey,
  type: "all" | "active" = "all",
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey, refetchType: "none" });
  await queryClient.refetchQueries({
    queryKey,
    type,
    predicate: (query) => queryHasQueryFn(query),
  });
}

/**
 * Fire-and-forget form of {@link invalidateQueriesWithQueryFn}.
 * refetchType "all" on a restored Sales dashboard cache stores
 * "Missing queryFn: [invoice-dashboard-unified, …]" and the screen shows that
 * as "Sales dashboard load failed".
 *
 * `type` defaults to "all" (also refetches unmounted-but-cached screens). Pass "active"
 * to refetch only mounted screens; the rest stay stale and refetch when next opened.
 */
export function invalidateAndRefetchWithQueryFn(
  queryClient: QueryClient,
  queryKey: QueryKey,
  type: "all" | "active" = "all",
): void {
  void invalidateQueriesWithQueryFn(queryClient, queryKey, type);
}

/**
 * Global safety net (QueryCache onError). A refetch of a disk-restored query
 * that no screen has subscribed yet fails with "Missing queryFn" — nothing was
 * actually wrong with the data. Undo the error so no screen ever shows it as a
 * load failure; the query stays stale and refetches when its screen opens.
 * Returns true when the error was cleared.
 */
export function clearMissingQueryFnError(
  query: Pick<Query, "state" | "setState">,
  error: unknown,
): boolean {
  if (!isMissingQueryFnError(error)) return false;
  query.setState({
    error: null,
    status: query.state.data === undefined ? "pending" : "success",
    fetchStatus: "idle",
    fetchFailureCount: 0,
    fetchFailureReason: null,
    isInvalidated: true,
  });
  return true;
}
