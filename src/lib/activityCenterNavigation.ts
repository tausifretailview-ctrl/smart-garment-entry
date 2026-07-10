/** Session-scoped navigation intent from Activity Center (survives tab-cache remounts). */

const STORAGE_KEY = "activity-center-pending-nav";

export type ActivityNavigationState = Record<string, unknown>;

type PendingActivityNav = {
  orgId: string;
  /** Route segment without org slug, e.g. `stock-report` */
  path: string;
  state?: ActivityNavigationState;
  ts: number;
};

export function normalizeActivityPath(path: string): string {
  const trimmed = path.replace(/^\/+/, "");
  const parts = trimmed.split("/").filter(Boolean);
  // Drop org slug when present: demo/stock-report → stock-report
  if (parts.length >= 2 && parts[0] !== "admin") {
    return parts.slice(1).join("/");
  }
  return trimmed;
}

export function queueActivityNavigation(
  orgId: string,
  path: string,
  state?: ActivityNavigationState,
): void {
  if (!orgId) return;
  const payload: PendingActivityNav = {
    orgId,
    path: normalizeActivityPath(path),
    state,
    ts: Date.now(),
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

/** Returns merged navigation state and clears the queue when path matches. */
export function consumeActivityNavigation(
  orgId: string | undefined,
  currentPath: string,
): ActivityNavigationState | null {
  if (!orgId) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw) as PendingActivityNav;
    if (pending.orgId !== orgId) return null;
    if (Date.now() - pending.ts > 120_000) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    const normalizedCurrent = normalizeActivityPath(currentPath);
    const normalizedPending = normalizeActivityPath(pending.path);
    if (normalizedCurrent !== normalizedPending) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    return pending.state ?? {};
  } catch {
    return null;
  }
}

export function mergeActivityNavigationState(
  locationState: ActivityNavigationState | null | undefined,
  orgId: string | undefined,
  currentPath: string,
): ActivityNavigationState | null {
  const pending = consumeActivityNavigation(orgId, currentPath);
  if (!pending && !locationState) return null;
  return { ...(locationState ?? {}), ...(pending ?? {}) };
}
