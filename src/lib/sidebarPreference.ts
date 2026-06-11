export const SIDEBAR_LOCKED_KEY = "sidebar_locked";

/** Default true — sidebar starts locked open until user clicks Collapse. */
export function readSidebarLockedOpen(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_LOCKED_KEY) !== "false";
  } catch {
    return true;
  }
}
