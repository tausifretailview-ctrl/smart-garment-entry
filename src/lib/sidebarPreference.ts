export const SIDEBAR_LOCKED_KEY = "sidebar_locked";
export const SIDEBAR_PREFERENCE_SYNC_EVENT = "sidebar-preference-sync";

/** Default true — sidebar starts locked open until user clicks Collapse. */
export function readSidebarLockedOpen(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_LOCKED_KEY) !== "false";
  } catch {
    return true;
  }
}

export function writeSidebarLockedOpen(locked: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_LOCKED_KEY, String(locked));
  } catch {}
  window.dispatchEvent(new Event(SIDEBAR_PREFERENCE_SYNC_EVENT));
}
