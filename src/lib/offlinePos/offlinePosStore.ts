/**
 * Offline POS billing — per-computer state: the switch, the counter code, the
 * saved item list (IndexedDB) and the bills waiting to be sent (localStorage,
 * written synchronously so a bill is never lost between print and a crash).
 */
import { createStore, get, set } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";
import { istNowDate } from "@/lib/localDayBounds";
import {
  OFFLINE_POS_CATALOG_SELECT,
  OFFLINE_SALE_NUMBER_PREFIX,
  buildCatalogIndex,
  financialYearShort,
  formatOfflineSaleNumber,
  generateCounterCode,
  isValidCounterCode,
  mergeCatalogRows,
  offlineSaleNumberSeq,
  offlineSoldQtyByVariant,
  type OfflineCatalogIndex,
  type OfflineCatalogRow,
} from "./offlinePosCore";

export type OfflinePosBill = {
  localId: string;
  organizationId: string;
  saleNumber: string;
  createdAt: number;
  saleDate: string;
  netAmount: number;
  customerName: string;
  paymentMethod: "cash" | "card" | "upi" | "multiple";
  paymentBreakdown?: unknown;
  /** SaleData exactly as POS passed it to saveSale (JSON-safe). */
  saleData: Record<string, unknown> & {
    items: Array<{ variantId?: string | null; quantity?: number | null }>;
    salesman?: string | null;
  };
  attempts: number;
  lastError?: string | null;
};

type CatalogMeta = {
  status: "empty" | "loading" | "ready" | "error";
  count: number;
  syncedAt: number | null;
  error: string | null;
};

export type OfflinePosSnapshot = {
  organizationId: string | null;
  enabled: boolean;
  counterCode: string;
  catalog: CatalogMeta;
  bills: OfflinePosBill[];
  syncing: boolean;
  networkDown: boolean;
};

const ENABLED_KEY = (orgId: string) => `ezzy_offline_pos_enabled:${orgId}`;
const COUNTER_KEY = "ezzy_offline_pos_counter";
const QUEUE_KEY = (orgId: string) => `ezzy_offline_pos_queue:${orgId}`;
const SEQ_KEY = (orgId: string, code: string, fy: string) => `ezzy_offline_pos_seq:${orgId}:${code}:${fy}`;
const CATALOG_KEY = (orgId: string) => `catalog:${orgId}`;

/** Full item-list download at most once a day; changed items every 15 minutes. */
export const OFFLINE_CATALOG_FULL_REFRESH_MS = 24 * 60 * 60 * 1000;
export const OFFLINE_CATALOG_REFRESH_MS = 15 * 60 * 1000;
const CATALOG_PAGE = 1000;
/** A failed request marks the network down for this long even if the browser says online. */
const NETWORK_FAILURE_WINDOW_MS = 30_000;

const idbStore = typeof indexedDB !== "undefined" ? createStore("ezzy-offline-pos", "kv") : null;

type StoredCatalog = { rows: OfflineCatalogRow[]; syncedAt: number; fullAt: number };

let state: OfflinePosSnapshot = {
  organizationId: null,
  enabled: false,
  counterCode: "",
  catalog: { status: "empty", count: 0, syncedAt: null, error: null },
  bills: [],
  syncing: false,
  networkDown: typeof navigator !== "undefined" ? !navigator.onLine : false,
};
let catalogRows: OfflineCatalogRow[] = [];
let catalogIndex: OfflineCatalogIndex = buildCatalogIndex([]);
let catalogFullAt = 0;
let networkFailedAt = 0;
let catalogRefreshPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(patch: Partial<OfflinePosSnapshot>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function subscribeOfflinePos(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOfflinePosSnapshot(): OfflinePosSnapshot {
  return state;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function getCounterCode(): string {
  const saved = safeGet(COUNTER_KEY);
  if (isValidCounterCode(saved)) return saved as string;
  const code = generateCounterCode();
  safeSet(COUNTER_KEY, code);
  return code;
}

function readQueue(orgId: string): OfflinePosBill[] {
  try {
    const raw = safeGet(QUEUE_KEY(orgId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(orgId: string, bills: OfflinePosBill[]): boolean {
  const ok = safeSet(QUEUE_KEY(orgId), JSON.stringify(bills));
  if (ok && state.organizationId === orgId) emit({ bills });
  return ok;
}

/** Point the store at the POS's organization (loads switch, queue and saved item list). */
export function initOfflinePos(orgId: string) {
  if (!orgId) return;
  const enabled = safeGet(ENABLED_KEY(orgId)) === "1";
  if (state.organizationId !== orgId) {
    catalogRows = [];
    catalogIndex = buildCatalogIndex([]);
    catalogFullAt = 0;
    emit({
      organizationId: orgId,
      enabled,
      counterCode: getCounterCode(),
      bills: readQueue(orgId),
      catalog: { status: "empty", count: 0, syncedAt: null, error: null },
    });
    if (enabled) void loadSavedCatalog(orgId);
  } else {
    emit({ enabled, bills: readQueue(orgId) });
  }
}

export function setOfflinePosEnabled(orgId: string, enabled: boolean) {
  safeSet(ENABLED_KEY(orgId), enabled ? "1" : "0");
  emit({ enabled });
  if (enabled) {
    void loadSavedCatalog(orgId).then(() => refreshOfflineCatalog(orgId, { force: true }));
  }
}

async function loadSavedCatalog(orgId: string) {
  if (!idbStore || catalogRows.length > 0) return;
  try {
    const saved = await get<StoredCatalog>(CATALOG_KEY(orgId), idbStore);
    if (!saved || state.organizationId !== orgId) return;
    catalogRows = saved.rows || [];
    catalogIndex = buildCatalogIndex(catalogRows);
    catalogFullAt = saved.fullAt || 0;
    emit({
      catalog: { status: "ready", count: catalogIndex.byId.size, syncedAt: saved.syncedAt, error: null },
    });
  } catch {
    // Saved list unreadable — the next refresh downloads it again.
  }
}

async function fetchCatalogPages(orgId: string, sinceIso: string | null): Promise<OfflineCatalogRow[]> {
  const out: OfflineCatalogRow[] = [];
  let lastId: string | null = null;
  for (;;) {
    let q = supabase
      .from("product_variants")
      .select(OFFLINE_POS_CATALOG_SELECT)
      .eq("organization_id", orgId)
      .eq("products.organization_id", orgId);
    if (sinceIso) {
      // Changed rows, including ones deleted or switched off, so they drop out.
      q = q.gte("updated_at", sinceIso);
    } else {
      q = q.is("deleted_at", null).is("products.deleted_at", null).eq("products.status", "active");
    }
    if (lastId) q = q.gt("id", lastId);
    const { data, error } = await q.order("id", { ascending: true }).limit(CATALOG_PAGE);
    if (error) throw error;
    const rows = (data || []) as unknown as OfflineCatalogRow[];
    out.push(...rows);
    if (rows.length < CATALOG_PAGE) break;
    lastId = rows[rows.length - 1].id;
  }
  return out;
}

/** Highest OFL number this counter already sent, so a cleared browser can't reuse one. */
async function fetchServerSeqFloor(orgId: string, code: string, fy: string): Promise<number> {
  const { data, error } = await supabase
    .from("sales")
    .select("sale_number")
    .eq("organization_id", orgId)
    .like("sale_number", `${OFFLINE_SALE_NUMBER_PREFIX}${code}/${fy}/%`)
    .limit(5000);
  if (error) throw error;
  let max = 0;
  for (const row of data || []) {
    max = Math.max(max, offlineSaleNumberSeq((row as { sale_number?: string }).sale_number));
  }
  return max;
}

/**
 * Download the item list (full once a day, otherwise only changed items).
 * Runs only while the switch is on and the internet works.
 */
export function refreshOfflineCatalog(orgId: string, opts: { force?: boolean } = {}): Promise<void> {
  if (catalogRefreshPromise) return catalogRefreshPromise;
  if (!state.enabled || state.organizationId !== orgId) return Promise.resolve();
  if (isNetworkDown()) return Promise.resolve();
  const now = Date.now();
  if (!opts.force && state.catalog.syncedAt && now - state.catalog.syncedAt < OFFLINE_CATALOG_REFRESH_MS) {
    return Promise.resolve();
  }

  catalogRefreshPromise = (async () => {
    const full = catalogRows.length === 0 || now - catalogFullAt > OFFLINE_CATALOG_FULL_REFRESH_MS;
    emit({ catalog: { ...state.catalog, status: state.catalog.count > 0 ? "ready" : "loading", error: null } });
    try {
      // Five-minute overlap so an edit saved during the last refresh is not missed.
      const sinceIso =
        !full && state.catalog.syncedAt ? new Date(state.catalog.syncedAt - 5 * 60 * 1000).toISOString() : null;
      const fetched = await fetchCatalogPages(orgId, sinceIso);
      if (state.organizationId !== orgId) return;
      catalogRows = full ? mergeCatalogRows([], fetched) : mergeCatalogRows(catalogRows, fetched);
      catalogIndex = buildCatalogIndex(catalogRows);
      if (full) catalogFullAt = now;
      if (idbStore) {
        await set(CATALOG_KEY(orgId), { rows: catalogRows, syncedAt: now, fullAt: catalogFullAt }, idbStore);
      }
      const code = state.counterCode || getCounterCode();
      const fy = financialYearShort(istNowDate());
      const floor = await fetchServerSeqFloor(orgId, code, fy).catch(() => 0);
      const key = SEQ_KEY(orgId, code, fy);
      if (floor > (Number(safeGet(key)) || 0)) safeSet(key, String(floor));
      noteNetworkOk();
      emit({ catalog: { status: "ready", count: catalogIndex.byId.size, syncedAt: now, error: null } });
    } catch (err) {
      emit({
        catalog: {
          ...state.catalog,
          status: catalogRows.length > 0 ? "ready" : "error",
          error: err instanceof Error ? err.message : String((err as { message?: string })?.message || err),
        },
      });
    } finally {
      catalogRefreshPromise = null;
    }
  })();
  return catalogRefreshPromise;
}

export function noteNetworkFailure() {
  networkFailedAt = Date.now();
  if (!state.networkDown) emit({ networkDown: true });
}

export function noteNetworkOk() {
  networkFailedAt = 0;
  const down = typeof navigator !== "undefined" ? !navigator.onLine : false;
  if (state.networkDown !== down) emit({ networkDown: down });
}

export function isNetworkDown(): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return networkFailedAt > 0 && Date.now() - networkFailedAt < NETWORK_FAILURE_WINDOW_MS;
}

/** Offline billing can take over for this org right now (switch on + item list saved). */
export function offlineCatalogUsable(orgId: string | null | undefined): boolean {
  return (
    !!orgId &&
    state.enabled &&
    state.organizationId === orgId &&
    catalogIndex.byId.size > 0
  );
}

/** POS should use the saved item list instead of the server for this lookup. */
export function shouldUseOfflineCatalog(orgId: string | null | undefined): boolean {
  return offlineCatalogUsable(orgId) && isNetworkDown();
}

export function getOfflineCatalogIndex(): OfflineCatalogIndex {
  return catalogIndex;
}

export function getOfflineCatalogRows(): OfflineCatalogRow[] {
  return catalogRows;
}

/** Saved stock minus what offline bills on this computer already sold. */
export function offlineAvailableStock(variantId: string): { known: boolean; stock: number; row?: OfflineCatalogRow } {
  const row = catalogIndex.byId.get(variantId);
  if (!row) return { known: false, stock: 0 };
  const sold = offlineSoldQtyByVariant(state.bills.map((b) => b.saleData)).get(variantId) || 0;
  return { known: true, stock: (Number(row.stock_qty) || 0) - sold, row };
}

/** Next number of this counter's offline series (never reuses one already printed). */
export function allocateOfflineSaleNumber(orgId: string): string {
  const code = state.counterCode || getCounterCode();
  const fy = financialYearShort(istNowDate());
  const key = SEQ_KEY(orgId, code, fy);
  const queuedMax = readQueue(orgId).reduce(
    (m, b) => (b.saleNumber.includes(`/${fy}/`) ? Math.max(m, offlineSaleNumberSeq(b.saleNumber)) : m),
    0,
  );
  const next = Math.max(Number(safeGet(key)) || 0, queuedMax) + 1;
  safeSet(key, String(next));
  return formatOfflineSaleNumber(code, fy, next);
}

export function enqueueOfflineBill(bill: OfflinePosBill): boolean {
  const queue = readQueue(bill.organizationId);
  queue.push(bill);
  return writeQueue(bill.organizationId, queue);
}

export function removeOfflineBill(orgId: string, localId: string) {
  writeQueue(
    orgId,
    readQueue(orgId).filter((b) => b.localId !== localId),
  );
}

export function updateOfflineBill(orgId: string, localId: string, patch: Partial<OfflinePosBill>) {
  writeQueue(
    orgId,
    readQueue(orgId).map((b) => (b.localId === localId ? { ...b, ...patch } : b)),
  );
}

export function readOfflineBills(orgId: string): OfflinePosBill[] {
  return readQueue(orgId);
}

export function setOfflineSyncing(syncing: boolean) {
  if (state.syncing !== syncing) emit({ syncing });
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => noteNetworkOk());
  window.addEventListener("offline", () => emit({ networkDown: true }));
  // Another POS tab on this computer changed the queue.
  window.addEventListener("storage", (e) => {
    if (state.organizationId && e.key === QUEUE_KEY(state.organizationId)) {
      emit({ bills: readQueue(state.organizationId) });
    }
  });
}

/** Ask the POS page to send waiting bills now. */
export const OFFLINE_POS_SYNC_NOW_EVENT = "ezzy-offline-pos-sync-now";
