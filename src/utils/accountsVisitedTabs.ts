const ACCOUNTS_TABS_WITHOUT_ADMIN_FOOTER = new Set([
  "customer-payment",
  "supplier-payment",
  "voucher-entry",
]);

/** Summary & admin settings sits under the accounts tabs. Voucher Entry does not show it. */
export function accountsTabShowsAdminFooter(tab: string | null | undefined): boolean {
  return !ACCOUNTS_TABS_WITHOUT_ADMIN_FOOTER.has(String(tab || ""));
}

/**
 * Customer ledger waits until heavy money queries are ready.
 * Every other selected tab must mount immediately, including a tab restored
 * from saved filters (that path sets the tab without a click).
 */
export function withSelectedAccountsTab(
  visited: Set<string>,
  selectedTab: string | null | undefined,
): Set<string> {
  if (!selectedTab || selectedTab === "customer-ledger" || visited.has(selectedTab)) {
    return visited;
  }
  const next = new Set(visited);
  next.add(selectedTab);
  return next;
}
