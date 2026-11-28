// @vitest-environment jsdom
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LIVE_STOCK_REFRESH_GAP_MS,
  STOCK_FRESHNESS_LS_KEY,
  STOCK_WRITE_SETTLE_MS,
  catchUpLiveStock,
  moneyWriteTarget,
  noteLocalMoneyWrite,
  noteLocalStockWrite,
  onStockMarkerEvent,
  reloadLiveStockViews,
  requestLiveStockRefresh,
  resetLiveStockStateForTests,
  setLocalMoneyWriteHandler,
  setLocalStockWriteHandler,
  shouldApplyStockMarker,
  stockWriteTarget,
} from "./liveStockRefresh";

const API = "https://abc.supabase.co/rest/v1";
const ORG = "org-1";

describe("which requests change stock", () => {
  it("bill saves, returns, purchases, transfers and table writes count", () => {
    expect(stockWriteTarget(`${API}/rpc/save_sale_with_items_numbered`, "POST")).toBe("rpc:save_sale_with_items_numbered");
    expect(stockWriteTarget(`${API}/rpc/save_return_with_items_atomic`, "post")).toBe("rpc:save_return_with_items_atomic");
    expect(stockWriteTarget(`${API}/rpc/accept_stock_transfer`, "POST")).toBe("rpc:accept_stock_transfer");
    expect(stockWriteTarget(`${API}/purchase_return_items?select=*`, "POST")).toBe("table:purchase_return_items");
    expect(stockWriteTarget(`${API}/sales?id=eq.1`, "PATCH")).toBe("table:sales");
    expect(stockWriteTarget(`${API}/product_variants?id=eq.1`, "DELETE")).toBe("table:product_variants");
  });

  it("reads never count, so a reload in one tab cannot set off another", () => {
    expect(stockWriteTarget(`${API}/product_variants?select=stock_qty`, "GET")).toBeNull();
    expect(stockWriteTarget(`${API}/sales?select=id`, "HEAD")).toBeNull();
    // Every rpc is a POST: only the listed writers count.
    expect(stockWriteTarget(`${API}/rpc/get_stock_report`, "POST")).toBeNull();
    expect(stockWriteTarget(`${API}/rpc/search_sales_header_ids`, "POST")).toBeNull();
    expect(stockWriteTarget(`${API}/customers`, "POST")).toBeNull();
    expect(stockWriteTarget("https://abc.supabase.co/auth/v1/token?grant_type=refresh_token", "POST")).toBeNull();
    expect(stockWriteTarget("https://abc.supabase.co/functions/v1/send-whatsapp", "POST")).toBeNull();
  });
});

describe("which requests change payments", () => {
  it("receipts, advances, credit notes, bill saves and settlement functions count", () => {
    expect(moneyWriteTarget(`${API}/voucher_entries`, "POST")).toEqual({ target: "table:voucher_entries", supplier: true });
    expect(moneyWriteTarget(`${API}/customer_advances?id=eq.1`, "PATCH")).toEqual({ target: "table:customer_advances", supplier: false });
    expect(moneyWriteTarget(`${API}/rpc/apply_credit_note_to_sale`, "POST")).toEqual({ target: "rpc:apply_credit_note_to_sale", supplier: false });
    expect(moneyWriteTarget(`${API}/rpc/save_sale_with_items_numbered`, "POST")?.supplier).toBe(false);
    expect(moneyWriteTarget(`${API}/rpc/save_purchase_bill_with_items_atomic`, "POST")?.supplier).toBe(true);
  });

  it("reads and unrelated writes never count", () => {
    expect(moneyWriteTarget(`${API}/voucher_entries?select=*`, "GET")).toBeNull();
    expect(moneyWriteTarget(`${API}/rpc/get_customer_financial_snapshot_batch`, "POST")).toBeNull();
    expect(moneyWriteTarget(`${API}/rpc/compute_sale_settlement`, "POST")).toBeNull();
    expect(moneyWriteTarget(`${API}/product_variants?id=eq.1`, "PATCH")).toBeNull();
  });

  it("one save sends one note, supplier if any part of it was", async () => {
    const handler = vi.fn();
    const release = setLocalMoneyWriteHandler(handler);
    noteLocalMoneyWrite(false);
    noteLocalMoneyWrite(true);
    noteLocalMoneyWrite(false);
    await vi.advanceTimersByTimeAsync(STOCK_WRITE_SETTLE_MS);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(true);
    noteLocalMoneyWrite(false);
    await vi.advanceTimersByTimeAsync(STOCK_WRITE_SETTLE_MS);
    expect(handler).toHaveBeenLastCalledWith(false);
    release();
  });
});

describe("stock marker between tabs", () => {
  it("applies a newer marker of the same shop only, and not when too old", () => {
    const now = 1_000_000_000;
    expect(shouldApplyStockMarker({ ts: now - 10, organizationId: ORG }, { organizationId: ORG, lastAppliedTs: 0, now })).toBe(true);
    expect(shouldApplyStockMarker({ ts: now - 10, organizationId: "other" }, { organizationId: ORG, lastAppliedTs: 0, now })).toBe(false);
    expect(shouldApplyStockMarker({ ts: now - 10 }, { organizationId: ORG, lastAppliedTs: now - 10, now })).toBe(false);
    expect(shouldApplyStockMarker({ ts: now - 11 * 60_000 }, { organizationId: ORG, lastAppliedTs: 0, now })).toBe(false);
    expect(shouldApplyStockMarker(null, { lastAppliedTs: 0, now })).toBe(false);
  });
});

const tick = async () => {
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
};

let client: QueryClient;
let hidden = false;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-27T12:00:00Z"));
  hidden = false;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => (hidden ? "hidden" : "visible"));
  localStorage.clear();
  resetLiveStockStateForTests();
  client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } });
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** A screen showing `key` (subscribes like useQuery). */
function screen(key: unknown[], fn: () => Promise<unknown>, extra: Record<string, unknown> = {}) {
  const observer = new QueryObserver(client, { queryKey: key, queryFn: fn, ...extra });
  let off = observer.subscribe(() => undefined);
  return {
    close: () => off(),
    open: () => {
      off = observer.subscribe(() => undefined);
    },
  };
}

describe("reloading stock screens", () => {
  it("reloads stock screens on show, not other screens", async () => {
    const stock = vi.fn(async () => "stock");
    const customers = vi.fn(async () => "customers");
    screen(["stock-report-global-totals", ORG], stock);
    screen(["customers-list", ORG], customers);
    await tick();
    reloadLiveStockViews(client);
    await tick();
    expect(stock).toHaveBeenCalledTimes(2);
    expect(customers).toHaveBeenCalledTimes(1);
  });

  it("a closed screen that never refetches on open reloads once when opened again", async () => {
    const fn = vi.fn(async () => "rows");
    const s = screen(["product-catalog", ORG], fn, { refetchOnMount: false });
    await tick();
    s.close();
    reloadLiveStockViews(client);
    await tick();
    expect(fn).toHaveBeenCalledTimes(1); // nobody is looking: no read
    s.open();
    await tick();
    expect(fn).toHaveBeenCalledTimes(2);
    s.close();
    s.open();
    await tick();
    expect(fn).toHaveBeenCalledTimes(2); // only once
  });

  it("many requests in a burst become at most one reload now and one at the end of the gap", async () => {
    const fn = vi.fn(async () => "rows");
    screen(["sale-invoice-live-stock", ORG, "v1"], fn);
    await tick();
    for (let i = 0; i < 6; i++) requestLiveStockRefresh(client, ORG);
    await tick();
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(LIVE_STOCK_REFRESH_GAP_MS);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("a browser tab in the background waits until it is in front", async () => {
    const fn = vi.fn(async () => "rows");
    screen(["stock-report", ORG], fn);
    await tick();
    hidden = true;
    requestLiveStockRefresh(client, ORG);
    await tick();
    expect(fn).toHaveBeenCalledTimes(1);
    hidden = false;
    catchUpLiveStock(client, ORG);
    await tick();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("between tabs", () => {
  it("a stock save in this tab leaves a marker once per save and refreshes this tab", async () => {
    const handler = vi.fn();
    const release = setLocalStockWriteHandler(ORG, handler);
    noteLocalStockWrite();
    noteLocalStockWrite(); // lines + voucher of the same save
    await vi.advanceTimersByTimeAsync(STOCK_WRITE_SETTLE_MS);
    expect(handler).toHaveBeenCalledTimes(1);
    const marker = JSON.parse(localStorage.getItem(STOCK_FRESHNESS_LS_KEY)!);
    expect(marker.organizationId).toBe(ORG);
    release();
  });

  it("another tab's marker reloads stock screens here; the same marker twice does nothing", async () => {
    const fn = vi.fn(async () => "rows");
    screen(["stock-summary-variants", ORG], fn);
    await tick();
    const newValue = JSON.stringify({ ts: Date.now(), organizationId: ORG });
    onStockMarkerEvent(client, ORG, { key: STOCK_FRESHNESS_LS_KEY, newValue });
    await tick();
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(LIVE_STOCK_REFRESH_GAP_MS);
    onStockMarkerEvent(client, ORG, { key: STOCK_FRESHNESS_LS_KEY, newValue });
    onStockMarkerEvent(client, ORG, { key: "something-else", newValue });
    await tick();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("a tab that was in the background catches up on a marker it missed", async () => {
    const fn = vi.fn(async () => "rows");
    screen(["stock-report", ORG], fn);
    await tick();
    localStorage.setItem(STOCK_FRESHNESS_LS_KEY, JSON.stringify({ ts: Date.now(), organizationId: ORG }));
    catchUpLiveStock(client, ORG);
    await tick();
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(LIVE_STOCK_REFRESH_GAP_MS);
    catchUpLiveStock(client, ORG); // already applied
    await tick();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("request watch", () => {
  it("only a successful stock write is noticed", async () => {
    const { installStockWriteWatch } = await import("./liveStockRefresh");
    const responses: Response[] = [];
    const base = vi.fn(async () => responses.shift() ?? new Response("{}", { status: 200 }));
    const savedFetch = window.fetch;
    window.fetch = base as unknown as typeof fetch;
    try {
      installStockWriteWatch();
      const handler = vi.fn();
      const release = setLocalStockWriteHandler(ORG, handler);
      const moneyHandler = vi.fn();
      const releaseMoney = setLocalMoneyWriteHandler(moneyHandler);

      await window.fetch(`${API}/product_variants?select=stock_qty`); // read
      await window.fetch(`${API}/rpc/get_stock_report`, { method: "POST" }); // read rpc
      responses.push(new Response("{}", { status: 400 }));
      await window.fetch(`${API}/rpc/save_sale_with_items_numbered`, { method: "POST" }); // failed save
      await vi.advanceTimersByTimeAsync(STOCK_WRITE_SETTLE_MS);
      expect(handler).not.toHaveBeenCalled();

      const res = await window.fetch(`${API}/rpc/save_sale_with_items_numbered`, { method: "POST" });
      expect(res.status).toBe(200); // the app still gets the response
      await vi.advanceTimersByTimeAsync(STOCK_WRITE_SETTLE_MS);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(moneyHandler).toHaveBeenCalledTimes(1); // a bill save is both
      expect(base).toHaveBeenCalledTimes(4);

      await window.fetch(`${API}/voucher_entries`, { method: "POST" }); // a receipt: money only
      await vi.advanceTimersByTimeAsync(STOCK_WRITE_SETTLE_MS);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(moneyHandler).toHaveBeenCalledTimes(2);
      release();
      releaseMoney();
    } finally {
      window.fetch = savedFetch;
    }
  });
});
