/**
 * Customer ledger waits until heavy money queries are ready.
 * Every other selected tab must mount immediately, including a tab restored
 * from saved filters (that path sets the tab without a click).
 */
export function withSelectedAccountsTab(
  visited: ReadonlySet<string>,
  selectedTab: string | null | undefined,
): ReadonlySet<string> {
  if (!selectedTab || selectedTab === "customer-ledger" || visited.has(selectedTab)) {
    return visited;
  }
  const next = new Set(visited);
  next.add(selectedTab);
  return next;
}
