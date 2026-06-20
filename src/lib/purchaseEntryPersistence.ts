import { resolveTabCachePath } from "@/lib/tabPageRegistry";
import { isTabCachePaneMounted } from "@/lib/tabCacheMountRegistry";

const PURCHASE_ENTRY_SESSION_PREFIX = "purchaseEntryState";
const PURCHASE_ENTRY_LOCAL_PREFIX = "purchaseEntryStateLocal";
const PURCHASE_ENTRY_META_PREFIX = "purchaseEntryDraftMeta";
const PURCHASE_ENTRY_IDB_NAME = "ezzy-purchase-entry";
const PURCHASE_ENTRY_IDB_STORE = "snapshots";
const LARGE_DRAFT_LINE_THRESHOLD = 150;
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
  /** Set while an Excel import is running; cleared only when the import finishes.
   *  If present on a restored draft, the import was interrupted mid-way and the
   *  draft is incomplete — saving must be blocked until re-imported. */
  pendingImport?: { expectedRows: number; expectedQty: number } | null;
};

export type PurchaseEntryDraftMeta = {
  lineCount: number;
  totalQty: number;
  savedAt: number;
  billData?: unknown;
  softwareBillNo?: string;
  billDate?: string;
  isEditMode?: boolean;
  editingBillId?: string | null;
  fullDataInIdb: boolean;
};

export function purchaseEntrySessionKey(orgId: string, userId: string): string {
  return `${PURCHASE_ENTRY_SESSION_PREFIX}:${orgId}:${userId}`;
}

function purchaseEntryLocalKey(orgId: string, userId: string): string {
  return `${PURCHASE_ENTRY_LOCAL_PREFIX}:${orgId}:${userId}`;
}

function purchaseEntryMetaKey(orgId: string, userId: string): string {
  return `${PURCHASE_ENTRY_META_PREFIX}:${orgId}:${userId}`;
}

function purchaseEntryIdbKey(orgId: string, userId: string): string {
  return `${PURCHASE_ENTRY_SESSION_PREFIX}:${orgId}:${userId}`;
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

export function countPurchaseDraftQty(lineItems: unknown[]): number {
  return lineItems.reduce<number>(
    (sum, item) => sum + (Number((item as { qty?: number })?.qty) || 0),
    0,
  );
}

function buildDraftMeta(
  snapshot: PurchaseEntrySnapshot,
  fullDataInIdb: boolean,
): PurchaseEntryDraftMeta {
  const lineItems = snapshot.lineItems ?? [];
  return {
    lineCount: lineItems.length,
    totalQty: countPurchaseDraftQty(lineItems),
    savedAt: snapshot.savedAt ?? Date.now(),
    billData: snapshot.billData,
    softwareBillNo: snapshot.softwareBillNo,
    billDate: snapshot.billDate,
    isEditMode: snapshot.isEditMode,
    editingBillId: snapshot.editingBillId,
    fullDataInIdb,
  };
}

function writeDraftMeta(
  orgId: string,
  userId: string,
  snapshot: PurchaseEntrySnapshot,
  fullDataInIdb: boolean,
): void {
  safeSessionSet(
    purchaseEntryMetaKey(orgId, userId),
    JSON.stringify(buildDraftMeta(snapshot, fullDataInIdb)),
  );
}

function parseDraftMeta(raw: string | null): PurchaseEntryDraftMeta | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PurchaseEntryDraftMeta;
    if (!parsed?.lineCount || parsed.lineCount <= 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Lightweight draft summary for dashboard banner (sync, survives large bills). */
export function readPurchaseEntryDraftMeta(
  orgId: string,
  userId: string,
): PurchaseEntryDraftMeta | null {
  return parseDraftMeta(safeSessionGet(purchaseEntryMetaKey(orgId, userId)));
}

let idbOpenPromise: Promise<IDBDatabase | null> | null = null;

function openPurchaseEntryIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!idbOpenPromise) {
    idbOpenPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(PURCHASE_ENTRY_IDB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(PURCHASE_ENTRY_IDB_STORE)) {
            db.createObjectStore(PURCHASE_ENTRY_IDB_STORE);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return idbOpenPromise;
}

async function writeIdbSnapshot(key: string, serialized: string): Promise<boolean> {
  const db = await openPurchaseEntryIdb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PURCHASE_ENTRY_IDB_STORE, "readwrite");
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.objectStore(PURCHASE_ENTRY_IDB_STORE).put(serialized, key);
    } catch {
      resolve(false);
    }
  });
}

async function readIdbSnapshot(key: string): Promise<string | null> {
  const db = await openPurchaseEntryIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PURCHASE_ENTRY_IDB_STORE, "readonly");
      const request = tx.objectStore(PURCHASE_ENTRY_IDB_STORE).get(key);
      request.onsuccess = () => resolve((request.result as string | undefined) ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function removeIdbSnapshot(key: string): Promise<void> {
  const db = await openPurchaseEntryIdb();
  if (!db) return;
  try {
    const tx = db.transaction(PURCHASE_ENTRY_IDB_STORE, "readwrite");
    tx.objectStore(PURCHASE_ENTRY_IDB_STORE).delete(key);
  } catch {
    // ignore
  }
}

/** Read in-progress purchase entry — session first, then localStorage (small bills only). */
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
    const serialized = JSON.stringify(fromLocal);
    safeSessionSet(sessionKey, serialized);
    return fromLocal;
  }

  return null;
}

/** Read full snapshot including IndexedDB backup for large Excel imports. */
export async function readPurchaseEntrySnapshotAsync(
  orgId: string,
  userId: string,
): Promise<PurchaseEntrySnapshot | null> {
  const inline = readPurchaseEntrySnapshot(orgId, userId);
  if (inline) return inline;

  const meta = readPurchaseEntryDraftMeta(orgId, userId);
  if (!meta?.fullDataInIdb) return null;

  const idbRaw = await readIdbSnapshot(purchaseEntryIdbKey(orgId, userId));
  return parseSnapshot(idbRaw);
}

/** Persist in-progress purchase entry to session, localStorage, and IndexedDB for large bills. */
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
  const lineCount = withMeta.lineItems!.length;
  const useIdb =
    lineCount >= LARGE_DRAFT_LINE_THRESHOLD || serialized.length > 900_000;

  const sessionKey = purchaseEntrySessionKey(orgId, userId);
  const localKey = purchaseEntryLocalKey(orgId, userId);

  if (useIdb) {
    writeDraftMeta(orgId, userId, withMeta, true);
    void writeIdbSnapshot(purchaseEntryIdbKey(orgId, userId), serialized);
    safeSessionSet(sessionKey, serialized);
    safeLocalSet(localKey, serialized);
  } else {
    writeDraftMeta(orgId, userId, withMeta, false);
    safeSessionSet(sessionKey, serialized);
    safeLocalSet(localKey, serialized);
    void removeIdbSnapshot(purchaseEntryIdbKey(orgId, userId));
  }

  markPurchaseEntryFlushAt(withMeta.savedAt!);
}

/** Clear browser snapshots (session, localStorage, IndexedDB metadata). */
export function clearPurchaseEntrySession(orgId: string, userId: string): void {
  safeSessionRemove(purchaseEntrySessionKey(orgId, userId));
  safeLocalRemove(purchaseEntryLocalKey(orgId, userId));
  safeSessionRemove(purchaseEntryMetaKey(orgId, userId));
  void removeIdbSnapshot(purchaseEntryIdbKey(orgId, userId));
}

/** Fired when Purchase Bills dashboard discards a draft — Purchase Entry tab may still be mounted. */
export const PURCHASE_DRAFT_DISCARDED_EVENT = "ezzy:purchase-draft-discarded";
/** Fired after a purchase bill is saved — dashboard draft banner + lists should refresh. */
export const PURCHASE_DRAFT_SAVED_EVENT = "ezzy:purchase-draft-saved";

export type PurchaseDraftEventDetail = {
  orgId: string;
  userId: string;
};

/** @deprecated Use PurchaseDraftEventDetail */
export type PurchaseDraftDiscardedDetail = PurchaseDraftEventDetail;

function dispatchPurchaseDraftEvent(
  eventName: string,
  orgId: string,
  userId: string,
  clearSnapshots: boolean,
): void {
  if (clearSnapshots) {
    clearPurchaseEntrySession(orgId, userId);
  }
  window.dispatchEvent(
    new CustomEvent<PurchaseDraftEventDetail>(eventName, {
      detail: { orgId, userId },
    }),
  );
}

/** Clear local snapshots and tell any mounted Purchase Entry pane to drop in-memory work. */
export function dispatchPurchaseDraftDiscarded(orgId: string, userId: string): void {
  dispatchPurchaseDraftEvent(PURCHASE_DRAFT_DISCARDED_EVENT, orgId, userId, true);
}

/** Notify all tabs that the purchase draft was committed — clear banner and refresh lists. */
export function dispatchPurchaseDraftSaved(orgId: string, userId: string): void {
  dispatchPurchaseDraftEvent(PURCHASE_DRAFT_SAVED_EVENT, orgId, userId, true);
}

/**
 * Subscribe on Purchase Bills dashboard — sync draft banner + lists when Entry saves/discards.
 * Needed on Windows/Electron tab cache where browser meta can stay stale when hasDraft is false.
 */
export function subscribePurchaseDashboardDraftSync(
  orgId: string | undefined,
  userId: string | undefined,
  onCommitted: () => void,
): () => void {
  if (!orgId || !userId) return () => {};

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<PurchaseDraftEventDetail>).detail;
    if (!detail || detail.orgId !== orgId || detail.userId !== userId) return;
    onCommitted();
  };

  window.addEventListener(PURCHASE_DRAFT_SAVED_EVENT, handler);
  window.addEventListener(PURCHASE_DRAFT_DISCARDED_EVENT, handler);
  return () => {
    window.removeEventListener(PURCHASE_DRAFT_SAVED_EVENT, handler);
    window.removeEventListener(PURCHASE_DRAFT_DISCARDED_EVENT, handler);
  };
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

/** True when the same history entry remounted after the pane was unmounted — not a hidden tab switch. */
export function wasPurchaseEntryRemount(navKey: string | undefined): boolean {
  if (!navKey) return false;
  if (safeSessionGet(LAST_UNMOUNT_NAV_KEY) !== navKey) return false;
  const cachePath = resolveTabCachePath("purchase-entry");
  // Pane still mounted in tab cache — visibility toggle only, not a true remount.
  if (isTabCachePaneMounted(cachePath)) return false;
  return true;
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

/** True when the current page load was a full reload (F5 / Ctrl+R). */
export function isDocumentReload(): boolean {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (nav?.type === "reload") return true;
    // Legacy API (older WebViews)
    const legacy = (performance as Performance & { navigation?: { type?: number } }).navigation;
    if (legacy?.type === 1) return true;
  } catch {
    // ignore
  }
  return false;
}

/** Fast sync check — session/local meta or inline snapshot (no IndexedDB read). */
export function hasPurchaseEntryDraftInBrowser(orgId: string, userId: string): boolean {
  if (readPurchaseEntryDraftMeta(orgId, userId)) return true;
  const inline = readPurchaseEntrySnapshot(orgId, userId);
  return Boolean(inline?.lineItems?.length);
}

/**
 * Whether restore should run when work was already restored once but in-memory lines
 * were lost (window switch / remount) while browser storage still has a draft.
 */
export function shouldAllowPurchaseEntryReRestore(
  workAlreadyRestored: boolean,
  lineCount: number,
  orgId: string | undefined,
  userId: string | undefined,
  options?: { force?: boolean },
): boolean {
  if (!workAlreadyRestored) return true;
  if (lineCount > 0) return false;
  if (options?.force) return true;
  if (!orgId || !userId) return false;
  return hasPurchaseEntryDraftInBrowser(orgId, userId);
}

/** Summarize draft for dashboard display (DB stub or full payload). */
export function summarizePurchaseDraft(data: unknown): {
  lineCount: number;
  totalQty: number;
  isEdit: boolean;
  savedAt?: number;
} | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const lines = (d.lineItems ?? d.items) as unknown[] | undefined;
  const lineCount =
    typeof d.lineCount === "number"
      ? d.lineCount
      : Array.isArray(lines)
        ? lines.length
        : 0;
  if (lineCount <= 0) return null;
  const totalQty =
    typeof d.totalQty === "number"
      ? d.totalQty
      : Array.isArray(lines)
        ? countPurchaseDraftQty(lines)
        : 0;
  return {
    lineCount,
    totalQty,
    isEdit: Boolean(d.isEditMode && (d.editingBillId || d.editBillId)),
    savedAt: typeof d.savedAt === "number" ? d.savedAt : undefined,
  };
}
