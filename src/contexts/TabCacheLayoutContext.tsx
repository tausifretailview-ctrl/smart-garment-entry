import { createContext, useContext } from "react";

/** True when rendered inside a TabCachedPages pane (window tab). */
export const TabCacheLayoutContext = createContext(false);

export function useTabCacheLayout(): boolean {
  return useContext(TabCacheLayoutContext);
}

/** Registry path of the enclosing tab-cache pane (`""` = Dashboard). Null outside TabCachedPages. */
export const TabCachePanePathContext = createContext<string | null>(null);

export function useTabCachePanePath(): string | null {
  return useContext(TabCachePanePathContext);
}
