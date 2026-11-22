import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { holdQueriesLeftByHiddenTab, isOutdatedHeldQuery, snapshotScreenQueries } from "./hiddenTabQueries";
import { invalidateAndRefetchWithQueryFn } from "@/utils/refetchQueriesWithFn";

/**
 * A kept-open tab that is hidden must not reload its data on every bill, and must catch up
 * exactly once when a screen shows that data again (review items S2, L2).
 */
const tick = async () => {
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
};

let client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } });
});
afterEach(() => {
  client.clear();
  vi.useRealTimers();
});

/** A screen showing `key`: subscribes like useQuery does, returns how to hide / close it. */
function screen(key: string, fn: () => Promise<unknown>, extra: Record<string, unknown> = {}) {
  const observer = new QueryObserver(client, { queryKey: [key], queryFn: fn, ...extra });
  let off = observer.subscribe(() => undefined);
  return {
    hide: () => off(),
    show: () => {
      off = observer.subscribe(() => undefined);
    },
  };
}

/** What HiddenTabQueryPause does around a tab going hidden. */
function hideTab(...screens: Array<{ hide: () => void }>) {
  const snapshot = snapshotScreenQueries(client);
  for (const s of screens) s.hide();
  return holdQueriesLeftByHiddenTab(client, snapshot);
}

describe("queries of a hidden tab", () => {
  it("are not reloaded by any invalidation while the tab is hidden", async () => {
    const fn = vi.fn(async () => "rows");
    const s = screen("sales-list", fn);
    await tick();
    expect(fn).toHaveBeenCalledTimes(1);

    const held = hideTab(s);
    expect(held.size).toBe(1);

    await client.invalidateQueries({ queryKey: ["sales-list"] }); // "active"
    await client.invalidateQueries({ queryKey: ["sales-list"], refetchType: "all" });
    await client.refetchQueries({ queryKey: ["sales-list"], type: "all" });
    invalidateAndRefetchWithQueryFn(client, ["sales-list"]);
    await tick();

    expect(fn).toHaveBeenCalledTimes(1);
    expect(client.getQueryState(["sales-list"])?.isInvalidated).toBe(true);
    expect(client.getQueryData(["sales-list"])).toBe("rows");
  });

  it("reload once when the tab is shown again, also on screens that do not refetch on mount", async () => {
    const fn = vi.fn(async () => "rows");
    const s = screen("pos-dashboard", fn, { refetchOnMount: false });
    await tick();
    const held = hideTab(s);
    await client.invalidateQueries({ queryKey: ["pos-dashboard"], refetchType: "all" });
    expect(fn).toHaveBeenCalledTimes(1);

    s.show();
    held.release();
    await tick();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(client.getQueryState(["pos-dashboard"])?.isInvalidated).toBe(false);

    // Live again: the next invalidation reloads it straight away, once.
    await client.invalidateQueries({ queryKey: ["pos-dashboard"] });
    await tick();
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("do not reload twice when the screen itself already refetches on mount", async () => {
    const fn = vi.fn(async () => "rows");
    const s = screen("stock-report", fn); // default refetchOnMount
    await tick();
    const held = hideTab(s);
    await client.invalidateQueries({ queryKey: ["stock-report"] });

    s.show();
    held.release();
    await tick();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("are left alone on return when nothing changed while hidden", async () => {
    const fn = vi.fn(async () => "rows");
    const s = screen("customers", fn, { refetchOnMount: false });
    await tick();
    const held = hideTab(s);
    s.show();
    held.release();
    await tick();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("keep their data in memory past the garbage-collection time", async () => {
    const fn = vi.fn(async () => "rows");
    const s = screen("accounts", fn, { gcTime: 10 * 60_000 });
    await tick();
    const held = hideTab(s);
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(client.getQueryData(["accounts"])).toBe("rows");

    // Tab closed while hidden: the normal clean-up applies again.
    held.release();
    await vi.advanceTimersByTimeAsync(11 * 60_000);
    expect(client.getQueryData(["accounts"])).toBeUndefined();
  });

  it("keep refreshing while another, visible screen shows the same data", async () => {
    const fn = vi.fn(async () => "rows");
    const hiddenTab = screen("settings", fn);
    screen("settings", fn); // the visible tab's layout uses it too
    await tick();
    expect(fn).toHaveBeenCalledTimes(1);

    const held = hideTab(hiddenTab);
    expect(held.size).toBe(0);
    await client.invalidateQueries({ queryKey: ["settings"] });
    await tick();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("stay held for a second hidden tab until a screen is live again", async () => {
    const fn = vi.fn(async () => "rows");
    const tabA = screen("ledger", fn, { refetchOnMount: false });
    const tabB = screen("ledger", fn, { refetchOnMount: false });
    await tick();

    const heldB = hideTab(tabB); // A still shows it
    expect(heldB.size).toBe(0);
    const heldA = hideTab(tabA); // now nobody does
    expect(heldA.size).toBe(1);
    await client.invalidateQueries({ queryKey: ["ledger"], refetchType: "all" });
    await tick();
    expect(fn).toHaveBeenCalledTimes(1);

    // B comes back while A is still hidden: B must not show the old rows.
    tabB.show();
    heldB.release();
    await tick();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("closed while hidden: reload when the screen is opened again", async () => {
    const fn = vi.fn(async () => "rows");
    const s = screen("purchase-dashboard", fn, { refetchOnMount: false });
    await tick();
    const held = hideTab(s);
    await client.invalidateQueries({ queryKey: ["purchase-dashboard"], refetchType: "all" });
    held.release(); // tab closed
    await tick();
    expect(fn).toHaveBeenCalledTimes(1);

    screen("purchase-dashboard", fn, { refetchOnMount: false }); // reopened
    await tick();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("keep their queryFn, so the app's own refetch helpers still see them afterwards", async () => {
    const fn = vi.fn(async () => "rows");
    const s = screen("invoice-dashboard", fn);
    await tick();
    const held = hideTab(s);
    const query = client.getQueryCache().find({ queryKey: ["invoice-dashboard"] })!;
    expect(typeof query.options.queryFn).toBe("function");

    s.show();
    held.release();
    await tick();
    invalidateAndRefetchWithQueryFn(client, ["invoice-dashboard"], "active");
    await tick();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("are not written to disk while out of date (a reload must load them fresh)", async () => {
    const fn = vi.fn(async () => "rows");
    const s = screen("sales-invoice-dashboard", fn);
    await tick();
    const query = client.getQueryCache().find({ queryKey: ["sales-invoice-dashboard"] })!;
    expect(isOutdatedHeldQuery(query)).toBe(false);

    const held = hideTab(s);
    expect(isOutdatedHeldQuery(query)).toBe(false); // held but still current
    await client.invalidateQueries({ queryKey: ["sales-invoice-dashboard"] });
    expect(isOutdatedHeldQuery(query)).toBe(true);

    s.show();
    held.release();
    await tick();
    expect(isOutdatedHeldQuery(query)).toBe(false);
  });

  it("release is safe to call twice", async () => {
    const s = screen("x", async () => 1);
    await tick();
    const held = hideTab(s);
    held.release();
    expect(() => held.release()).not.toThrow();
  });
});
