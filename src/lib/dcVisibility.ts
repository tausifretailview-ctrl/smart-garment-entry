/**
 * DC (No GST) transactions: show or hide on screen.
 *
 * Settings > Purchase sets the shop's mode:
 *   "show" (default) — DC purchases, stock and sales appear like normal; Ctrl+Shift+H hides them.
 *   "hide"           — DC is hidden everywhere; Ctrl+Shift+H shows it (org admins only).
 *
 * Ctrl+Shift+H flips the mode for this browser tab only (sessionStorage, per user + org).
 * The flip goes back to the shop's mode after 15 minutes without a key press or tap.
 * Prints always show every item: this only filters lists, dashboards and reports.
 */

export type DcVisibilityMode = "show" | "hide";

export const DC_VISIBILITY_IDLE_MS = 15 * 60 * 1000;
const KEY_PREFIX = "ezzy.dcView.";

type StoredFlip = { at: number };

export function resolveDcVisibilityMode(
  purchaseSettings: { dc_visibility_mode?: string | null } | null | undefined,
): DcVisibilityMode {
  return purchaseSettings?.dc_visibility_mode === "hide" ? "hide" : "show";
}

/** True when DC rows must be left out of the screen. */
export function shouldHideDc(mode: DcVisibilityMode, flipped: boolean): boolean {
  return (mode === "hide") !== flipped;
}

/** Show mode: anyone may hide. Hide mode: only org admins may show. */
export function canFlipDcVisibility(
  mode: DcVisibilityMode,
  organizationRole: string | null | undefined,
): boolean {
  return mode === "show" || organizationRole === "admin";
}

export function dcVisibilityStorageKey(userId: string, orgId: string): string {
  return `${KEY_PREFIX}${userId}.${orgId}`;
}

const listeners = new Set<() => void>();

export function subscribeDcVisibility(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  listeners.forEach((l) => l());
}

function readStored(key: string): StoredFlip | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredFlip;
    return typeof parsed?.at === "number" ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: StoredFlip | null) {
  try {
    if (value) window.sessionStorage.setItem(key, JSON.stringify(value));
    else window.sessionStorage.removeItem(key);
  } catch {
    /* private mode / blocked storage: flip lasts until reload only via listeners */
  }
}

/** Whether this tab has flipped the shop's mode (false once idle for 15 minutes). */
export function isDcVisibilityFlipped(key: string | null, now = Date.now()): boolean {
  if (!key) return false;
  const stored = readStored(key);
  if (!stored) return false;
  if (now - stored.at > DC_VISIBILITY_IDLE_MS) {
    writeStored(key, null);
    return false;
  }
  return true;
}

export function setDcVisibilityFlipped(key: string, flipped: boolean, now = Date.now()) {
  writeStored(key, flipped ? { at: now } : null);
  notify();
}

/** Keep a flip alive while the user is working. */
export function touchDcVisibility(key: string, now = Date.now()) {
  const stored = readStored(key);
  if (stored && now - stored.at <= DC_VISIBILITY_IDLE_MS) writeStored(key, { at: now });
}

/** Re-check the idle limit; notifies screens when a flip just ran out. */
export function expireDcVisibility(key: string, now = Date.now()) {
  const had = !!readStored(key);
  if (had && !isDcVisibilityFlipped(key, now)) notify();
}
