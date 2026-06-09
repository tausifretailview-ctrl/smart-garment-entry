const PURCHASE_ENTRY_SESSION_PREFIX = "purchaseEntryState";
const PURCHASE_ENTRY_LOCAL_PREFIX = "purchaseEntryStateLocal";
const TAB_INSTANCE_KEY = "purchaseEntryTabInstanceId";
const HANDLED_NAV_KEY = "purchaseEntryHandledNavKey";
const LAST_UNMOUNT_NAV_KEY = "purchaseEntryLastUnmountNavKey";
const LAST_FLUSH_AT_KEY = "purchaseEntryLastFlushAt";

export type PurchaseEntrySnapshot = {
  lineItems?: unknown[];
  billData?: unknown;
  softwareBillNo?: string;
  billDate?: string;
  roundOff?: number;
  otherCharges?: number;
  discountAmount?: number;
  entryMode?: string;
  isDcPurchase?: boolean;
  isEditMode?: boolean;
  editingBillId?: string | null;
  originalLineItems?: unknown[];
  tabInstanceId?: string;
  savedAt?: number;
};

export function purchaseEntrySessionKey(orgId: string, userId: string): string {
  return `${PURCHASE_ENTRY_SESSION_PREFIX}:${orgId}:${userId}`;
}

function purchaseEntryLocalKey(orgId: string, userId: string): string {
  return `${PURCHASE_ENTRY_LOCAL_PREFIX}:${orgId}:${userId}`;
}

function safeSessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // quota / private mode
  }
}

function safeSessionRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function safeLocalGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // quota / private mode
  }
}

function safeLocalRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function parseSnapshot(raw: string | null): PurchaseEntrySnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PurchaseEntrySnapshot;
    if (!Array.isArray(parsed?.lineItems) || parsed.lineItems.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Read in-progress purchase entry — session first, then localStorage (survives some PWA/Electron kills). */
export function readPurchaseEntrySnapshot(
  orgId: string,
  userId: string,
): PurchaseEntrySnapshot | null {
  const sessionKey = purchaseEntrySessionKey(orgId, userId);
  const fromSession = parseSnapshot(safeSessionGet(sessionKey));
  if (fromSession) return fromSession;

  const localKey = purchaseEntryLocalKey(orgId, userId);
  const fromLocal = parseSnapshot(safeLocalGet(localKey));
  if (fromLocal) {
    // Rehydrate session when local survived but session was cleared on remount.
    const serialized = JSON.stringify(fromLocal);
    safeSessionSet(sessionKey, serialized);
    return fromLocal;
  }

  return null;
}

/** Persist in-progress purchase entry to session + localStorage. */
export function writePurchaseEntrySnapshot(
  orgId: string,
  userId: string,
  snapshot: PurchaseEntrySnapshot,
): void {
  if (!Array.isArray(snapshot.lineItems) || snapshot.lineItems.length === 0) {
    clearPurchaseEntrySession(orgId, userId);
    return;
  }

  const withMeta: PurchaseEntrySnapshot = {
    ...snapshot,
    savedAt: snapshot.savedAt ?? Date.now(),
  };
  const serialized = JSON.stringify(withMeta);
  safeSessionSet(purchaseEntrySessionKey(orgId, userId), serialized);
  safeLocalSet(purchaseEntryLocalKey(orgId, userId), serialized);
  markPurchaseEntryFlushAt(withMeta.savedAt!);
}

/** Clear in-tab session snapshot (e.g. dashboard Discard draft). */
export function clearPurchaseEntrySession(orgId: string, userId: string): void {
  safeSessionRemove(purchaseEntrySessionKey(orgId, userId));
  safeLocalRemove(purchaseEntryLocalKey(orgId, userId));
}

/** Fired when Purchase Bills dashboard discards a draft — Purchase Entry tab may still be mounted. */
export const PURCHASE_DRAFT_DISCARDED_EVENT = "ezzy:purchase-draft-discarded";

export type PurchaseDraftDiscardedDetail = {
  orgId: string;
  userId: string;
};

/** Clear local snapshots and tell any mounted Purchase Entry pane to drop in-memory work. */
export function dispatchPurchaseDraftDiscarded(orgId: string, userId: string): void {
  clearPurchaseEntrySession(orgId, userId);
  window.dispatchEvent(
    new CustomEvent(PURCHASE_DRAFT_DISCARDED_EVENT, {
      detail: { orgId, userId },
    }),
  );
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

/** Drop `newBill` from router state while keeping edit/draft intents. */
export function omitNewBillNavigationState(
  state: unknown,
): Record<string, unknown> {
  if (!state || typeof state !== "object") return {};
  const next = { ...(state as Record<string, unknown>) };
  delete next.newBill;
  return next;
}

export function markPurchaseEntryUnmountNavKey(navKey: string | undefined): void {
  if (!navKey) return;
  safeSessionSet(LAST_UNMOUNT_NAV_KEY, navKey);
}

/** True when the same history entry remounted (minimize / tab restore) — not a fresh sidebar click. */
export function wasPurchaseEntryRemount(navKey: string | undefined): boolean {
  if (!navKey) return false;
  return safeSessionGet(LAST_UNMOUNT_NAV_KEY) === navKey;
}

export function markPurchaseEntryNavHandled(navKey: string | undefined): void {
  if (!navKey) return;
  safeSessionSet(HANDLED_NAV_KEY, navKey);
}

export function wasPurchaseEntryNavHandled(navKey: string | undefined): boolean {
  if (!navKey) return false;
  return safeSessionGet(HANDLED_NAV_KEY) === navKey;
}

export function markPurchaseEntryFlushAt(at = Date.now()): void {
  safeSessionSet(LAST_FLUSH_AT_KEY, String(at));
}

export function getPurchaseEntryFlushAt(): number {
  const raw = safeSessionGet(LAST_FLUSH_AT_KEY);
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}
