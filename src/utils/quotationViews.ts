import type { QueryClient } from "@tanstack/react-query";

/** Query keys (prefixes) that show quotations on the Quotation dashboard. */
export const QUOTATION_VIEW_QUERY_KEYS = [
  "quotations-list",
  "quotation-summary",
  "quotation-customers",
  "quotation-followups",
  "quotation-followups-due",
] as const;

/** localStorage key other browser tabs listen to (storage event). */
export const QUOTATION_VIEWS_CHANGED_KEY = "quotation_views_changed_v1";

/**
 * Refresh quotation lists in this tab. refetchType "all" also refreshes a
 * dashboard that is kept mounted but hidden behind another window tab.
 */
export function invalidateQuotationViews(queryClient: QueryClient, organizationId: string) {
  for (const key of QUOTATION_VIEW_QUERY_KEYS) {
    void queryClient.invalidateQueries({ queryKey: [key, organizationId], refetchType: "all" });
  }
}

/** Call after a quotation is saved: refreshes this tab and pings other tabs. */
export function invalidateQuotationViewsAfterSave(queryClient: QueryClient, organizationId: string) {
  invalidateQuotationViews(queryClient, organizationId);
  try {
    localStorage.setItem(
      QUOTATION_VIEWS_CHANGED_KEY,
      JSON.stringify({ organizationId, at: Date.now() }),
    );
  } catch {
    // storage blocked: same-tab refresh above still works
  }
}

/** Parses a storage event value; returns the org id when it is a quotation change marker. */
export function parseQuotationViewsChanged(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { organizationId?: unknown };
    return typeof parsed.organizationId === "string" ? parsed.organizationId : null;
  } catch {
    return null;
  }
}
