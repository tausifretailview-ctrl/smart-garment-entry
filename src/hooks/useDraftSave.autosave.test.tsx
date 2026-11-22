/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
vi.mock("@/contexts/OrganizationContext", () => ({ useOrganization: () => ({ currentOrganization: { id: "org-1" } }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    delete: () => chain,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    upsert: (...args: unknown[]) => upsert(...args),
    then: (r: any) => Promise.resolve({ error: null }).then(r),
  };
  return { supabase: { from: () => chain } };
});

import { useDraftSave } from "./useDraftSave";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The 30-second draft auto-save rewrote the whole bill even when nothing had changed
 * (speed review item S4). It now writes only a bill that changed since the last save.
 */
let renders = 0;
function Entry({ data }: { data: unknown }) {
  renders += 1;
  const { updateCurrentData, startAutoSave, stopAutoSave } = useDraftSave("sale_invoice");
  React.useEffect(() => updateCurrentData(data), [data, updateCurrentData]);
  React.useEffect(() => {
    startAutoSave();
    return stopAutoSave;
  }, [startAutoSave, stopAutoSave]);
  return null;
}

const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe("draft auto-save", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => {
    vi.useFakeTimers();
    upsert.mockReset();
    upsert.mockResolvedValue({ error: null });
    sessionStorage.clear();
    localStorage.clear();
    renders = 0;
    host = document.createElement("div");
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("saves a changed bill once, then stays quiet until it changes again", async () => {
    const bill = { lineItems: [{ productId: "p1", quantity: 2 }] };
    await act(async () => root.render(<Entry data={bill} />));
    await tick(0);
    expect(upsert).toHaveBeenCalledTimes(0);

    await tick(30_000);
    expect(upsert).toHaveBeenCalledTimes(1);

    // Five minutes of nothing changing: no more writes, and the page is not redrawn for them.
    const rendersAfterSave = renders;
    await tick(5 * 60_000);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(renders).toBe(rendersAfterSave);

    // A line is added: the next tick saves it.
    const changed = { lineItems: [...bill.lineItems, { productId: "p2", quantity: 1 }] };
    await act(async () => root.render(<Entry data={changed} />));
    await tick(30_000);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect((upsert.mock.calls[1][0] as { draft_data: unknown }).draft_data).toEqual(changed);
    await tick(60_000);
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it("tries again when a save failed", async () => {
    upsert.mockResolvedValueOnce({ error: { message: "network" } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await act(async () => root.render(<Entry data={{ lineItems: [{ productId: "p1" }] }} />));
    await tick(30_000);
    expect(upsert).toHaveBeenCalledTimes(1);
    await tick(30_000);
    expect(upsert).toHaveBeenCalledTimes(2);
    await tick(30_000);
    expect(upsert).toHaveBeenCalledTimes(2);
  });
});
