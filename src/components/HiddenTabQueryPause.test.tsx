/** @vitest-environment jsdom */
import React, { act, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HIDDEN_TAB_DIALOG_CHECK_MS, HiddenTabQueryPause, useHiddenTabLiveness } from "./HiddenTabQueryPause";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Two kept-open window tabs, as TabCachedPages renders them: both stay mounted, one is shown.
 * A hidden tab must not reload or re-render when data changes elsewhere, must keep its own
 * state, and must catch up once when it is shown again.
 */
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  vi.useFakeTimers();
  client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  client.clear();
  vi.useRealTimers();
});

const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

const renders: Record<string, number> = {};
let salesVersion = 1;
const salesFn = vi.fn(async () => `sales v${salesVersion}`);
const stockFn = vi.fn(async () => "stock");
const pollFn = vi.fn(async () => "poll");
const sharedFn = vi.fn(async () => "org settings");

function SalesDashboard() {
  renders.sales = (renders.sales ?? 0) + 1;
  // Like the POS / Sales dashboards: never refetches on mount, relies on being told.
  const list = useQuery({ queryKey: ["sales-list"], queryFn: salesFn, refetchOnMount: false });
  const poll = useQuery({ queryKey: ["sales-poll"], queryFn: pollFn, refetchInterval: 1000 });
  const shared = useQuery({ queryKey: ["org-settings"], queryFn: sharedFn });
  const [typed, setTyped] = useState("");
  return (
    <div data-screen="sales">
      <span data-testid="sales-data">{String(list.data ?? "loading")}</span>
      <span data-testid="sales-poll">{String(poll.data ?? "")}</span>
      <span data-testid="sales-shared">{String(shared.data ?? "")}</span>
      <input data-testid="sales-input" value={typed} onChange={(e) => setTyped(e.target.value)} />
      <button data-testid="sales-type" onClick={() => setTyped("half-entered filter")} />
    </div>
  );
}

function StockScreen() {
  const stock = useQuery({ queryKey: ["stock"], queryFn: stockFn });
  const shared = useQuery({ queryKey: ["org-settings"], queryFn: sharedFn });
  return (
    <div data-screen="stock">
      {String(stock.data ?? "loading")} {String(shared.data ?? "")}
    </div>
  );
}

/** A screen first mounted inside a tab that is already hidden. */
function LateScreen({ onMount }: { onMount: () => void }) {
  useEffect(onMount, [onMount]);
  const q = useQuery({ queryKey: ["late"], queryFn: lateFn });
  return <span data-testid="late">{String(q.data ?? "none")}</span>;
}
const lateFn = vi.fn(async () => "late rows");

/** One window tab, wired the way CachedTabPane wires it. */
function Tab({ active, children }: { active: boolean; children: React.ReactNode }) {
  const tabData = useHiddenTabLiveness(active);
  return (
    <div
      className={active ? "" : "hidden"}
      onPointerDownCapture={tabData.wake}
      onKeyDownCapture={tabData.wake}
      onFocusCapture={tabData.wake}
    >
      <HiddenTabQueryPause live={tabData.live}>{children}</HiddenTabQueryPause>
    </div>
  );
}

/** A dialog the sales tab draws outside itself (a portal), like every Radix dialog. */
function SalesDialog({ open }: { open: boolean }) {
  const q = useQuery({ queryKey: ["dialog-data"], queryFn: dialogFn, enabled: open });
  if (!open) return null;
  return createPortal(
    <div role="dialog" data-state="open" data-testid="sales-dialog">
      <button data-testid="dialog-button">{String(q.data ?? "loading")}</button>
    </div>,
    document.body,
  );
}
const dialogFn = vi.fn(async () => "print settings");

function Tabs({
  shown,
  late = false,
  closeSales = false,
  dialog = false,
}: {
  shown: "sales" | "stock";
  late?: boolean;
  closeSales?: boolean;
  dialog?: boolean;
}) {
  return (
    <QueryClientProvider client={client}>
      {closeSales ? null : (
        <Tab active={shown === "sales"}>
          <SalesDashboard />
          {late ? <LateScreen onMount={noop} /> : null}
          <SalesDialog open={dialog} />
        </Tab>
      )}
      <Tab active={shown === "stock"}>
        <StockScreen />
      </Tab>
    </QueryClientProvider>
  );
}
const noop = () => undefined;

const text = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.textContent;

beforeEach(() => {
  for (const key of Object.keys(renders)) delete renders[key];
  salesVersion = 1;
  for (const fn of [salesFn, stockFn, pollFn, sharedFn, lateFn, dialogFn]) fn.mockClear();
});

describe("HiddenTabQueryPause", () => {
  it("a hidden tab does not reload or re-render on invalidation, and catches up once when shown", async () => {
    act(() => root.render(<Tabs shown="sales" />));
    await settle();
    expect(text("sales-data")).toBe("sales v1");
    expect(salesFn).toHaveBeenCalledTimes(1);
    // The stock tab was never shown: nothing of it has loaded.
    expect(stockFn).toHaveBeenCalledTimes(0);

    act(() => root.render(<Tabs shown="stock" />));
    await settle();
    expect(stockFn).toHaveBeenCalledTimes(1);
    const rendersWhenHidden = renders.sales;

    // A bill is saved on another screen: every flavour of "refresh the sales list".
    salesVersion = 2;
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["sales-list"] });
      await client.invalidateQueries({ queryKey: ["sales-list"], refetchType: "all" });
      await client.refetchQueries({ queryKey: ["sales-list"], type: "all" });
    });
    await settle();
    expect(salesFn).toHaveBeenCalledTimes(1);
    expect(renders.sales).toBe(rendersWhenHidden);
    expect(text("sales-data")).toBe("sales v1");

    // Back to the sales tab: one reload, new rows on screen.
    act(() => root.render(<Tabs shown="sales" />));
    await settle();
    expect(salesFn).toHaveBeenCalledTimes(2);
    expect(text("sales-data")).toBe("sales v2");

    // Visible again, so the next change reloads it at once.
    salesVersion = 3;
    await act(async () => { await client.invalidateQueries({ queryKey: ["sales-list"] }); });
    await settle();
    expect(salesFn).toHaveBeenCalledTimes(3);
    expect(text("sales-data")).toBe("sales v3");
  });

  it("returning to a tab where nothing changed loads nothing", async () => {
    act(() => root.render(<Tabs shown="sales" />));
    await settle();
    act(() => root.render(<Tabs shown="stock" />));
    await settle();
    act(() => root.render(<Tabs shown="sales" />));
    await settle();
    expect(salesFn).toHaveBeenCalledTimes(1);
    expect(sharedFn).toHaveBeenCalledTimes(1);
  });

  it("keeps what the user typed in the hidden tab", async () => {
    act(() => root.render(<Tabs shown="sales" />));
    await settle();
    act(() => (host.querySelector('[data-testid="sales-type"]') as HTMLButtonElement).click());
    act(() => root.render(<Tabs shown="stock" />));
    await settle();
    act(() => root.render(<Tabs shown="sales" />));
    await settle();
    expect((host.querySelector('[data-testid="sales-input"]') as HTMLInputElement).value).toBe("half-entered filter");
  });

  it("a hidden tab stops polling; the visible one keeps polling", async () => {
    act(() => root.render(<Tabs shown="sales" />));
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    const whileShown = pollFn.mock.calls.length;
    expect(whileShown).toBeGreaterThanOrEqual(3);

    act(() => root.render(<Tabs shown="stock" />));
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(pollFn).toHaveBeenCalledTimes(whileShown);

    act(() => root.render(<Tabs shown="sales" />));
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(pollFn.mock.calls.length).toBeGreaterThan(whileShown);
  });

  it("data that the visible tab also shows keeps refreshing", async () => {
    act(() => root.render(<Tabs shown="sales" />));
    await settle();
    act(() => root.render(<Tabs shown="stock" />));
    await settle();
    expect(sharedFn).toHaveBeenCalledTimes(1);
    await act(async () => { await client.invalidateQueries({ queryKey: ["org-settings"] }); });
    await settle();
    expect(sharedFn).toHaveBeenCalledTimes(2);
  });

  it("a hidden tab's data survives its garbage-collection time", async () => {
    client.setQueryDefaults(["sales-list"], { gcTime: 5 * 60_000 });
    act(() => root.render(<Tabs shown="sales" />));
    await settle();
    act(() => root.render(<Tabs shown="stock" />));
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(60 * 60_000); });
    act(() => root.render(<Tabs shown="sales" />));
    // Shown at once from memory, no "loading" flash.
    expect(text("sales-data")).toBe("sales v1");
  });

  it("a screen mounted inside a hidden tab loads only when the tab is shown", async () => {
    act(() => root.render(<Tabs shown="stock" late />));
    await settle();
    expect(lateFn).toHaveBeenCalledTimes(0);
    act(() => root.render(<Tabs shown="sales" late />));
    await settle();
    expect(lateFn).toHaveBeenCalledTimes(1);
    expect(text("late")).toBe("late rows");
  });

  it("closing a hidden tab lets its data go and leaves it out of date for the next open", async () => {
    act(() => root.render(<Tabs shown="sales" />));
    await settle();
    act(() => root.render(<Tabs shown="stock" />));
    await settle();
    await act(async () => { await client.invalidateQueries({ queryKey: ["sales-list"], refetchType: "all" }); });
    act(() => root.render(<Tabs shown="stock" closeSales />));
    await settle();
    expect(client.getQueryCache().find({ queryKey: ["sales-list"] })?.getObserversCount()).toBe(0);
    expect(salesFn).toHaveBeenCalledTimes(1);

    // Reopened: reloads although the screen never refetches on mount.
    salesVersion = 2;
    act(() => root.render(<Tabs shown="sales" />));
    await settle();
    expect(salesFn).toHaveBeenCalledTimes(2);
    expect(text("sales-data")).toBe("sales v2");
  });
  it("a tab hidden with its dialog on screen stays live (save, then print or share)", async () => {
    act(() => root.render(<Tabs shown="sales" />));
    await settle();
    // The dialog opens in the same step as the move to another tab, and stays.
    act(() => root.render(<Tabs shown="stock" dialog />));
    await act(async () => { await vi.advanceTimersByTimeAsync(HIDDEN_TAB_DIALOG_CHECK_MS); });
    await settle();
    expect(dialogFn).toHaveBeenCalledTimes(1);
    expect(text("dialog-button")).toBe("print settings");

    // Live, so it also still follows changes.
    salesVersion = 2;
    await act(async () => { await client.invalidateQueries({ queryKey: ["sales-list"] }); });
    await settle();
    expect(salesFn).toHaveBeenCalledTimes(2);

    // Dialog closed; shown and hidden again: now it sleeps.
    act(() => root.render(<Tabs shown="sales" />));
    await settle();
    act(() => root.render(<Tabs shown="stock" />));
    await settle();
    await act(async () => { await client.invalidateQueries({ queryKey: ["sales-list"] }); });
    await settle();
    expect(salesFn).toHaveBeenCalledTimes(2);
  });

  it("a dialog that closes with the switch (Alt+W switcher, a menu) does not keep the tab awake", async () => {
    act(() => root.render(<Tabs shown="sales" dialog />));
    await settle();
    expect(dialogFn).toHaveBeenCalledTimes(1);
    act(() => root.render(<Tabs shown="stock" />));
    await act(async () => { await vi.advanceTimersByTimeAsync(HIDDEN_TAB_DIALOG_CHECK_MS * 4); });
    await act(async () => { await client.invalidateQueries({ queryKey: ["sales-list"], refetchType: "all" }); });
    await settle();
    expect(salesFn).toHaveBeenCalledTimes(1);
  });

  it("using a dialog that a sleeping tab opens later wakes that tab", async () => {
    // Longer than the dialog check: this dialog is found by the user's focus, not the timer.
    act(() => root.render(<Tabs shown="sales" />));
    await settle();
    act(() => root.render(<Tabs shown="stock" />));
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(HIDDEN_TAB_DIALOG_CHECK_MS * 4); });
    // Opened from the hidden tab (a shortcut or a timer): asleep, so nothing loads yet.
    act(() => root.render(<Tabs shown="stock" dialog />));
    await settle();
    expect(dialogFn).toHaveBeenCalledTimes(0);

    // Radix focuses a dialog when it opens; React delivers that to the tab that drew it.
    act(() => (host.ownerDocument.querySelector('[data-testid="dialog-button"]') as HTMLButtonElement).focus());
    await settle();
    expect(dialogFn).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-testid="dialog-button"]')?.textContent).toBe("print settings");
  });
});
