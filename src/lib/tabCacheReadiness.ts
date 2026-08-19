/**
 * Tab-cache "ready" vs "chunk downloaded" — these are different.
 *
 * Prefetch can download a sibling chunk within a second of login. That is not a
 * painted pane. Silent Suspense (`null`) and hiding `<Outlet>` on a chunk-only
 * sibling produced a white workspace until the 6s rescue timer.
 */

/** Bill-entry screens may show a boot splash longer than dashboard cold-nav. */
export function usesLongLoadBudget(
  isEntryPage: boolean,
  isCacheableEntryActive: boolean,
): boolean {
  return isEntryPage || isCacheableEntryActive;
}

/**
 * A sibling may silence the active Suspense shell / keep tab-cache as render owner
 * only when it is mounted AND its lazy page has committed (onReady).
 * `chunkLoaded` is ignored — prefetch is not paint.
 */
export function isPaintedTabSibling(opts: {
  mounted: boolean;
  contentReady: boolean;
}): boolean {
  return opts.mounted && opts.contentReady;
}

/** Silent (`null`) fallback only when a sibling is genuinely on screen. */
export function shouldSilentTabSuspenseFallback(hasPaintedSibling: boolean): boolean {
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
