import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { IsRestoringProvider, useIsRestoring, useQueryClient } from "@tanstack/react-query";
import { holdQueriesLeftByHiddenTab, snapshotScreenQueries, type HeldQueries } from "@/lib/hiddenTabQueries";

/** A dialog, sheet or drawer that is on screen right now. */
const OPEN_DIALOG = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]';

function hasOpenDialog(): boolean {
  return typeof document !== "undefined" && document.querySelector(OPEN_DIALOG) !== null;
}

/** How long after a tab is hidden a dialog must still be on screen to count as that tab's. */
export const HIDDEN_TAB_DIALOG_CHECK_MS = 500;

/**
 * Should a kept-open window tab keep its data live?
 *
 * Yes while it is the shown tab. A hidden tab normally sleeps, with two exceptions, because a
 * dialog is drawn outside its tab (a portal) and stays on screen when the tab is hidden:
 *  - the user clicks, types or focuses inside something the hidden tab drew (a dialog takes
 *    the focus when it opens, so this is immediate);
 *  - a dialog is still on screen half a second after the tab went hidden (save, then print or
 *    share). Not checked at the moment of the switch: the Alt+W window switcher, a menu or a
 *    mobile side sheet is closing just then and would keep every tab awake.
 * Either keeps the tab live until it has been shown and hidden again.
 *
 * `wake` goes on the tab's wrapper as onPointerDownCapture / onKeyDownCapture / onFocusCapture:
 * React delivers events from a portal to the component that rendered it.
 */
export function useHiddenTabLiveness(active: boolean): { live: boolean; wake: () => void } {
  const [seenActive, setSeenActive] = useState(active);
  const [awakeWhileHidden, setAwakeWhileHidden] = useState(false);
  if (seenActive !== active) {
    setSeenActive(active);
    setAwakeWhileHidden(false);
  }
  useEffect(() => {
    if (active) return;
    const timer = window.setTimeout(() => {
      if (hasOpenDialog()) setAwakeWhileHidden(true);
    }, HIDDEN_TAB_DIALOG_CHECK_MS);
    return () => window.clearTimeout(timer);
  }, [active]);
  const activeRef = useRef(active);
  activeRef.current = active;
  const wake = useCallback(() => {
    if (!activeRef.current) setAwakeWhileHidden(true);
  }, []);
  return { live: active || awakeWhileHidden, wake };
}

/**
 * Wraps one kept-open window tab. While the tab is not `live` its screens stop listening to the
 * data cache, so a bill saved elsewhere no longer reloads and re-renders every background tab;
 * the tab catches up when it is shown again (see src/lib/hiddenTabQueries.ts).
 *
 * How: React Query does not subscribe a screen's queries while `useIsRestoring()` is true, and
 * subscribes them again (reloading what is out of date) when it turns false. Form state, scroll
 * position and everything else in the tab are untouched: nothing is unmounted.
 */
export function HiddenTabQueryPause({ live, children }: { live: boolean; children: ReactNode }) {
  const queryClient = useQueryClient();
  const restoring = useIsRestoring();
  const paused = !live;
  const snapshotRef = useRef<ReturnType<typeof snapshotScreenQueries> | null>(null);
  const heldRef = useRef<HeldQueries | null>(null);

  // Layout effects run before the screens' own (passive) effects: the tab's queries are still
  // attached here, so this is the list to compare against once they have let go.
  useLayoutEffect(() => {
    snapshotRef.current = paused ? snapshotScreenQueries(queryClient) : null;
  }, [paused, queryClient]);

  // A parent's effect runs after its children's. Hiding: the screens have let go, hold what
  // nobody else shows. Showing: the screens are listening again, so the holds can go.
  useEffect(() => {
    heldRef.current?.release();
    heldRef.current = paused ? holdQueriesLeftByHiddenTab(queryClient, snapshotRef.current ?? []) : null;
    snapshotRef.current = null;
  }, [paused, queryClient]);

  // Tab closed while hidden.
  useEffect(
    () => () => {
      heldRef.current?.release();
      heldRef.current = null;
    },
    [],
  );

  return <IsRestoringProvider value={restoring || paused}>{children}</IsRestoringProvider>;
}
