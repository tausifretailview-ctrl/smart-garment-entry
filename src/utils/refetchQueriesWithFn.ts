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
  void (async () => {
    await queryClient.invalidateQueries({ queryKey, refetchType: "none" });
    await queryClient.refetchQueries({
      queryKey,
      type,
      predicate: (query) => queryHasQueryFn(query),
    });
  })();
}
