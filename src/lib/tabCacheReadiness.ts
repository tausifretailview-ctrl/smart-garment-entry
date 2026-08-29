/**
 * Tab-cache "ready" vs "chunk downloaded" — these are different.
 *
 * Prefetch can download a sibling chunk within a second of login. That is not a
 * painted pane. Silent Suspense (`null`) and hiding `<Outlet>` on a chunk-only
 * sibling produced a white workspace until the 6s rescue timer.
 */

/** Same 6s floor as purchase-entry remount — never 1.2s / 4s on long-budget screens. */
export const LONG_BUDGET_STUCK_RESCUE_MS = 6_000;

/**
 * Long-budget Outlet entries that had no rescue after the purchase-entry 6s remount.
 * Must not be given the 1.2s / 4s timers — those interrupt a slow-but-working bill load.
 */
export const LONG_BUDGET_OUTLET_ENTRY_PATHS = [
  "pos-sales",
  "pos-delivery-challan",
  "sales-invoice",
  "sale-return-entry",
  "quotation-entry",
  "sale-order-entry",
  "purchase-return-entry",
] as const;

export function isLongBudgetOutletEntryPath(path: string): boolean {
  const bare = path.replace(/^\/+|\/+$/g, "");
  return (LONG_BUDGET_OUTLET_ENTRY_PATHS as readonly string[]).includes(bare);
}

/** Bill-entry / POS screens may show a boot splash longer than dashboard cold-nav. */
export function usesLongLoadBudget(
  isEntryPage: boolean,
  isCacheableEntryActive: boolean,
  isPosLikeEntry = false,
): boolean {
  return isEntryPage || isCacheableEntryActive || isPosLikeEntry;
}

/**
 * Arm the 6s timer on every long-budget landing. Do not skip just because a
 * previous page's inputs are still in the workspace for a frame — decide at fire.
 */
export function shouldArmLongBudgetStuckRescue(opts: {
  usesLongLoadBudget: boolean;
}): boolean {
  return opts.usesLongLoadBudget;
}

/**
 * Fire remount only at/after 6s and only if still not ready.
 * A 1.2s or 4s elapsed time must never remount — that is a slow-but-working load.
 */
export function shouldFireLongBudgetStuckRescue(opts: {
  contentReady: boolean;
  alreadyRescuedThisPath: boolean;
  elapsedMs: number;
  minMs?: number;
}): boolean {
  if (opts.alreadyRescuedThisPath) return false;
  if (opts.contentReady) return false;
  return opts.elapsedMs >= (opts.minMs ?? LONG_BUDGET_STUCK_RESCUE_MS);
}

/** True when the workspace has real entry UI — not an empty pane or load shell alone. */
export function workspaceHasCommittedEntryUi(el: HTMLElement | null): boolean {
  if (!el) return false;
  const hasShell = !!el.querySelector("[data-ezzy-load-shell]");
  const hasControls = !!el.querySelector(
    "input, textarea, select, table, canvas, [data-entry-ready]",
  );
  if (hasShell && !hasControls) return false;
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  return hasControls || text.length > 0;
}

/**
 * Cacheable entry (purchase-entry) from an outlet route (POS) has no painted
 * tab-cache sibling and is exempt from the 1.2s blank-frame / 4s Outlet rescue.
 * A load shell counts as painted, so those timers never fire even when Suspense
 * is stuck. Remount the tab-cache chunk instead of handing off to Outlet.
 */
export function shouldRemountStuckCacheableEntry(opts: {
  isCacheableEntryActive: boolean;
  contentReady: boolean;
  renderViaTabCache: boolean;
  forceOutletFallback: boolean;
}): boolean {
  if (!opts.isCacheableEntryActive) return false;
  if (!opts.renderViaTabCache || opts.forceOutletFallback) return false;
  if (opts.contentReady) return false;
  return true;
}

/**
 * A sibling may silence the active Suspense shell / keep tab-cache as render owner
 * only when it is mounted AND its lazy page has committed (onReady).
 * `chunkLoaded` is ignored — prefetch is not paint.
 * POS / bill-entry shells must never go silent — a painted dashboard sibling
 * would hide the DC/POS loading splash and leave a white pane.
 */
export function isPaintedTabSibling(opts: {
  mounted: boolean;
  contentReady: boolean;
}): boolean {
  return opts.mounted && opts.contentReady;
}

export type TabLoadShellKind = "entry" | "dashboard" | "page";

/** Silent (`null`) fallback only when a sibling is genuinely on screen — never for entry shells. */
export function shouldSilentTabSuspenseFallback(
  hasPaintedSibling: boolean,
  loadShell: TabLoadShellKind = "dashboard",
): boolean {
  if (loadShell === "entry") return false;
  return hasPaintedSibling;
}

export function resolveTabPageFallbackKind(silent: boolean): "empty" | "shell" {
  return silent ? "empty" : "shell";
}

export function paneLooksPaintedFromFlags(opts: {
  hasLoadShell: boolean;
  text: string;
  hasMediaOrControls: boolean;
}): boolean {
  if (opts.hasLoadShell) return true;
  if (opts.text.replace(/\s+/g, " ").trim().length > 0) return true;
  return opts.hasMediaOrControls;
}

/**
 * True when a tab-cache pane has user-visible content (previous page, skeleton,
 * or real UI). Empty wrappers and dimmed empty prefetch shells do not count.
 */
export function paneLooksPainted(pane: HTMLElement): boolean {
  return paneLooksPaintedFromFlags({
    hasLoadShell: !!pane.querySelector("[data-ezzy-load-shell]"),
    text: pane.textContent ?? "",
    hasMediaOrControls: !!pane.querySelector(
      "table, img, canvas, svg, input, textarea, select, button",
    ),
  });
}

/** Watchdog: any painted tab-cache pane (including a dimmed previous page) is enough. */
export function tabCacheWorkspaceLooksPainted(
  paneFlags: Array<{
    hasLoadShell: boolean;
    text: string;
    hasMediaOrControls: boolean;
  }>,
): boolean {
  if (paneFlags.length === 0) return false;
  return paneFlags.some((pane) => paneLooksPaintedFromFlags(pane));
}

/**
 * Workspace watchdog predicate. Tab-cache chrome with only empty unpainted panes
 * is unpainted. A dimmed outgoing pane that still holds the previous page counts
 * as painted so a slow report load is not swapped at 1.2s.
 */
export function hasPaintedWorkspaceContent(el: HTMLElement): boolean {
  const panes = el.querySelectorAll<HTMLElement>("[data-tab-cache-path]");
  if (panes.length > 0) {
    for (const pane of panes) {
      if (paneLooksPainted(pane)) return true;
    }
    return false;
  }
  if (el.childElementCount === 0) return false;
  const nodes = el.querySelectorAll<HTMLElement>(":scope > *, :scope > * > *");
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (rect.width > 1 && rect.height > 1) return true;
  }
  return false;
}
