/** Browser session marker — set once per tab/document load. */
const POS_APP_SESSION_KEY = "ezzy_pos_app_session";

const posCartStorageKey = (orgId: string) => `pos_cart_${orgId || "default"}`;

export type PosCartSnapshot = {
  items: unknown[];
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  saleNotes?: string;
  savedAt?: number;
};

/**
 * On a cold app/tab open, drop legacy localStorage POS carts (they survived quit).
 * In-session restore uses sessionStorage only (minimize / in-app tab switch).
 */
export function ensurePosAppSession(): void {
  try {
    if (sessionStorage.getItem(POS_APP_SESSION_KEY)) return;
    sessionStorage.setItem(POS_APP_SESSION_KEY, String(Date.now()));
    clearLegacyPosCartsFromLocalStorage();
  } catch {
    // ignore private-mode / storage errors
  }
}

export function clearLegacyPosCartsFromLocalStorage(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith("pos_cart_")) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // ignore
  }
}

export function readPosCartSnapshot(orgId: string): PosCartSnapshot | null {
  try {
    const raw = sessionStorage.getItem(posCartStorageKey(orgId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PosCartSnapshot;
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePosCartSnapshot(orgId: string, snapshot: PosCartSnapshot): void {
  try {
    sessionStorage.setItem(
      posCartStorageKey(orgId),
      JSON.stringify({ ...snapshot, savedAt: snapshot.savedAt ?? Date.now() }),
    );
  } catch {
    // ignore quota errors
  }
}

export function clearPosCartSnapshot(orgId: string): void {
  try {
    sessionStorage.removeItem(posCartStorageKey(orgId));
    localStorage.removeItem(posCartStorageKey(orgId));
  } catch {
    // ignore
  }
}
