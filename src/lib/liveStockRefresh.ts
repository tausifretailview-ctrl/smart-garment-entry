/**
 * Live stock across browser tabs and computers (Nov 2026).
 *
 * Shops bill in several browser tabs at once (Sale Bill in one, POS or Stock Report in another).
 * A save refreshed the stock screens only inside the tab that saved it; other tabs kept the old
 * stock until the user refreshed the page.
 *
 *  - Same computer: every request that changes stock (sale, purchase, returns, transfers,
 *    adjustments, …) is noticed where the app's requests leave (one fetch wrapper, so no screen
 *    has to remember it). The tab then leaves a marker in localStorage; every other tab on the
 *    computer gets a `storage` event and refreshes its stock screens.
 *  - Other computers and phones: the sales / sale-return live updates the app already receives
 *    (useOrgMoneyRealtimeInvalidation) also refresh the stock screens. No new realtime channel.
 *
 * Kept cheap:
 *  - only screens that are on show reload now; a closed screen is marked out of date and reloads
 *    once when it is opened again (hidden window tabs already work this way);
 *  - a browser tab that is not in front does nothing until the user looks at it;
 *  - at most one reload per few seconds per tab, however many bills are saved;
 *  - a reload never itself changes stock, so tabs cannot set each other off in a loop.
 */
import type { Query, QueryClient } from "@tanstack/react-query";
import { coalesceRefresh } from "@/utils/coalesceRefresh";
import { reloadWhenShownAgain } from "@/lib/hiddenTabQueries";

/** Tables whose insert / update / delete changes stock or what stock screens show. */
export const STOCK_WRITE_TABLES: ReadonlySet<string> = new Set([
  "sales",
  "sale_items",
  "sale_returns",
  "sale_return_items",
  "purchase_bills",
  "purchase_items",
  "purchase_returns",
  "purchase_return_items",
  "product_variants",
  "products",
  "stock_movements",
  "batch_stock",
  "delivery_challans",
  "delivery_challan_items",
  "stock_transfers",
  "stock_transfer_items",
  "godown_stock",
]);

/** Database functions that change stock. Reads (get_…, search_…) are never listed. */
export const STOCK_WRITE_RPCS: ReadonlySet<string> = new Set([
  "save_sale_with_items_numbered",
  "save_sale_with_items_atomic",
  "save_purchase_bill_with_items_atomic",
  "save_return_with_items_atomic",
  "save_document_with_lines",
  "bulk_update_purchase_items",
  "update_purchase_return_items",
  "create_exchange_excess_sale_return",
  "cancel_invoice",
  "cancel_purchase_bill",
  "soft_delete_sale",
  "soft_delete_sale_return",
  "soft_delete_purchase_bill",
  "soft_delete_purchase_return",
  "soft_delete_delivery_challan",
  "hard_delete_document",
  "hard_delete_purchase_bill",
  "restore_sale",
  "restore_sale_return",
  "restore_purchase_bill",
  "restore_purchase_return",
  "adjust_variant_stock",
  "create_stock_transfer",
  "accept_stock_transfer",
  "reject_stock_transfer",
  "cancel_stock_transfer",
  "godown_save",
  "godown_move_stock",
  "godown_move_items",
  "godown_cancel_move",
  "settle_stock_session",
  "zero_unscanned_stock_settlement",
  "reverse_unscanned_stock_settlement",
  "fix_stock_discrepancies",
  "reset_stock_from_transactions",
  "reconcile_variant_stock_qty",
  "merge_products",
  "merge_two_products",
  "mfg_create_lot",
  "mfg_cancel_lot",
  "mfg_finish_lot",
  "mfg_issue_fabric",
  "mfg_cancel_fabric_issue",
  "mfg_save_cutting",
]);

/**
 * "rpc:save_sale_with_items_numbered" / "table:sales" when this request changes stock, else null.
 * Reads (GET / HEAD) never count; read functions are not in the list.
 */
export function stockWriteTarget(url: string, method: string): string | null {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return null;
  const at = url.indexOf("/rest/v1/");
  if (at < 0) return null;
  const path = url.slice(at + "/rest/v1/".length).split(/[?#]/)[0];
  const [first, second] = path.split("/");
  if (first === "rpc") {
    // Every rpc is a POST, reads included: only the listed writers count.
    return second && STOCK_WRITE_RPCS.has(second) ? `rpc:${second}` : null;
  }
  return first && STOCK_WRITE_TABLES.has(first) ? `table:${first}` : null;
}

// ── Marker between browser tabs (localStorage `storage` event) ───────────────────────────────

export const STOCK_FRESHNESS_LS_KEY = "ezzy_stock_freshness_v1";
/** A tab brought to the front ignores a marker older than this. */
export const STOCK_FRESHNESS_MAX_AGE_MS = 10 * 60 * 1000;

type StockMarker = { ts: number; organizationId?: string };

let lastAppliedTs = 0;

export function parseStockMarker(raw: string | null | undefined): StockMarker | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StockMarker;
    if (!parsed || typeof parsed.ts !== "number" || !Number.isFinite(parsed.ts)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function shouldApplyStockMarker(
  marker: StockMarker | null,
  opts: { organizationId?: string; lastAppliedTs: number; now?: number },
): boolean {
  if (!marker) return false;
  if (opts.organizationId && marker.organizationId && marker.organizationId !== opts.organizationId) return false;
  if (marker.ts <= opts.lastAppliedTs) return false;
  return (opts.now ?? Date.now()) - marker.ts <= STOCK_FRESHNESS_MAX_AGE_MS;
}

function writeStockMarker(organizationId?: string): void {
  const ts = Math.max(Date.now(), lastAppliedTs + 1);
  lastAppliedTs = ts; // this tab already knows
  try {
    localStorage.setItem(STOCK_FRESHNESS_LS_KEY, JSON.stringify({ ts, organizationId } satisfies StockMarker));
  } catch {
    // private mode / quota: other tabs still catch up through live updates or a refresh
  }
}

function readStockMarker(): StockMarker | null {
  try {
    return parseStockMarker(localStorage.getItem(STOCK_FRESHNESS_LS_KEY));
  } catch {
    return null;
  }
}

// ── Which screens show stock ─────────────────────────────────────────────────────────────────

/** First element of the query keys of screens that show stock quantities. */
export const LIVE_STOCK_QUERY_HEADS = [
  "sale-invoice-live-stock",
  "stock-report",
  "stock-report-global-totals",
  "stock-report-filtered-totals",
  "stock-summary-variants",
  "stock-summary-articles",
  "item-wise-stock",
  "item-wise-stock-totals",
  "product-wise-stock",
  "rpt-stock-summary",
  "rpt-stock-report-totals",
  "rpt-stock-report-rows",
  "rpt-size-wise-stock",
  "rpt-item-wise-stock",
  "owner-stock-status-counts",
  "owner-stock-product-totals",
  "owner-stock-product-pages",
  "owner-stock-product-variants",
  "owner-stock-product",
  "owner-low-stock",
  "godown-stock",
  "stock-adjustment-variants",
  "product-catalog",
  "product-dashboard-stats",
] as const;

const HEADS: ReadonlySet<unknown> = new Set(LIVE_STOCK_QUERY_HEADS);

export function isLiveStockQuery(query: Pick<Query, "queryKey">): boolean {
  return HEADS.has(query.queryKey[0]);
}

/** Gap between two stock reloads in one tab. */
export const LIVE_STOCK_REFRESH_GAP_MS = 3000;

/**
 * Reload stock screens on show; mark the rest out of date. Screens nobody shows (closed, or in a
 * hidden window tab) reload once when they are shown again.
 */
export function reloadLiveStockViews(queryClient: QueryClient): void {
  const matches = queryClient.getQueryCache().findAll({ predicate: isLiveStockQuery });
  if (matches.length === 0) return;
  const set = new Set<Query>(matches);
  void queryClient.invalidateQueries({ predicate: (q) => set.has(q) }, { cancelRefetch: false }).catch(() => undefined);
  // invalidateQueries refetches the active ones (refetchType "active"); a fetch already running
  // is kept (cancelRefetch false), so a save's own refresh and this one do not both hit the server.
  reloadWhenShownAgain(
    queryClient,
    matches.filter((q) => !q.isActive()),
  );
}

// ── Per-tab scheduling ───────────────────────────────────────────────────────────────────────

const pendingWhileHidden = new WeakSet<QueryClient>();

const tabIsHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

/**
 * Ask for a stock reload in this tab. Runs now (then at most once per few seconds); a tab that is
 * not in front waits until it is.
 */
export function requestLiveStockRefresh(queryClient: QueryClient, organizationId?: string): void {
  if (tabIsHidden()) {
    pendingWhileHidden.add(queryClient);
    return;
  }
  coalesceRefresh(queryClient, `live-stock:${organizationId ?? ""}`, () => reloadLiveStockViews(queryClient), {
    gapMs: LIVE_STOCK_REFRESH_GAP_MS,
  });
}

/** The tab came to the front: run a reload it was owed, or one another tab asked for meanwhile. */
export function catchUpLiveStock(queryClient: QueryClient, organizationId?: string): void {
  const marker = readStockMarker();
  const markerDue = shouldApplyStockMarker(marker, { organizationId, lastAppliedTs });
  if (markerDue) lastAppliedTs = marker!.ts;
  if (pendingWhileHidden.has(queryClient) || markerDue) {
    pendingWhileHidden.delete(queryClient);
    requestLiveStockRefresh(queryClient, organizationId);
  }
}

/** A `storage` event from another tab. */
export function onStockMarkerEvent(
  queryClient: QueryClient,
  organizationId: string | undefined,
  event: Pick<StorageEvent, "key" | "newValue">,
): void {
  if (event.key !== STOCK_FRESHNESS_LS_KEY) return;
  const marker = parseStockMarker(event.newValue);
  if (!shouldApplyStockMarker(marker, { organizationId, lastAppliedTs })) return;
  lastAppliedTs = marker!.ts;
  requestLiveStockRefresh(queryClient, organizationId);
}

// ── Stock writes leaving this tab ────────────────────────────────────────────────────────────

/** One save sends several requests (bill, lines, voucher): tell other tabs once. */
export const STOCK_WRITE_SETTLE_MS = 400;

type WriteListener = () => void;
let writeListener: WriteListener | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let watchOrganizationId: string | undefined;

/**
 * Called by the mounted listener: what to do after this tab changed stock. Returns the undo,
 * which only clears the handler if it is still the one set here.
 */
export function setLocalStockWriteHandler(organizationId: string | undefined, handler: WriteListener): () => void {
  watchOrganizationId = organizationId;
  writeListener = handler;
  return () => {
    if (writeListener !== handler) return;
    writeListener = null;
  };
}

export function noteLocalStockWrite(): void {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    writeStockMarker(watchOrganizationId);
    writeListener?.();
  }, STOCK_WRITE_SETTLE_MS);
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method;
  if (typeof input !== "string" && !(input instanceof URL)) return input.method || "GET";
  return "GET";
}

let installed = false;

/** Install once at boot. Wraps fetch: a successful stock-changing request calls noteLocalStockWrite. */
export function installStockWriteWatch(): void {
  if (installed || typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const pending = original(input, init);
    let target: string | null = null;
    try {
      target = stockWriteTarget(requestUrl(input), requestMethod(input, init));
    } catch {
      target = null;
    }
    if (!target) return pending;
    return pending.then((response) => {
      if (response.ok) noteLocalStockWrite();
      return response;
    });
  };
}

/** Tests only. */
export function resetLiveStockStateForTests(): void {
  lastAppliedTs = 0;
  writeListener = null;
  watchOrganizationId = undefined;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
}
