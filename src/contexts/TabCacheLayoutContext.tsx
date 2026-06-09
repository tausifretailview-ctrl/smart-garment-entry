import { createContext, useContext } from "react";

/** True when rendered inside a TabCachedPages pane (window tab). */
export const TabCacheLayoutContext = createContext(false);

export function useTabCacheLayout(): boolean {
  return useContext(TabCacheLayoutContext);
}
