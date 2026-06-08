const PURCHASE_ENTRY_SESSION_PREFIX = "purchaseEntryState";
const TAB_INSTANCE_KEY = "purchaseEntryTabInstanceId";

export function purchaseEntrySessionKey(orgId: string, userId: string): string {
  return `${PURCHASE_ENTRY_SESSION_PREFIX}:${orgId}:${userId}`;
}

/** Clear in-tab session snapshot (e.g. dashboard Discard draft). */
export function clearPurchaseEntrySession(orgId: string, userId: string): void {
  try {
    sessionStorage.removeItem(purchaseEntrySessionKey(orgId, userId));
  } catch {
    // ignore quota / private mode
  }
}

/** Stable id per browser tab — metadata on draft snapshots for last-write diagnostics. */
export function getOrCreatePurchaseEntryTabInstanceId(): string {
  try {
    const existing = sessionStorage.getItem(TAB_INSTANCE_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem(TAB_INSTANCE_KEY, id);
    return id;
  } catch {
    return `tab_${Date.now()}`;
  }
}
