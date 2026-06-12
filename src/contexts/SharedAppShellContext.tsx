import { createContext, useContext } from "react";

/** True when OrgLayout provides the outer sidebar + header + tabs (single sticky shell). */
export const SharedAppShellContext = createContext(false);

export function useSharedAppShell(): boolean {
  return useContext(SharedAppShellContext);
}
