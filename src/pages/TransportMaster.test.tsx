/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store: { rows: any[] } = { rows: [] };
const added = vi.fn();

vi.mock("@/contexts/OrganizationContext", () => ({ useOrganization: () => ({ currentOrganization: { id: "org-1" } }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u-1" } }) }));
vi.mock("@/components/BackToDashboard", () => ({ BackToDashboard: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/data/transporters", async (orig) => {
  const real = await orig<typeof import("@/lib/data/transporters")>();
  return {
    ...real,
    fetchTransporters: vi.fn(async () => store.rows),
    addTransporter: vi.fn(async (_org: string, input: any) => {
      added(input);
      const row = { ...input, id: `t${store.rows.length + 1}`, organization_id: "org-1", created_at: "" };
      store.rows = [...store.rows, row];
      return row;
    }),
    updateTransporter: vi.fn(),
    removeTransporter: vi.fn(),
  };
});

import TransportMaster from "./TransportMaster";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// The dialog's form controls measure themselves; jsdom has no ResizeObserver.
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const type = (el: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("Transport Master page", () => {
  beforeEach(() => {
    store.rows = [];
    added.mockReset();
  });

  it("adds a transporter with its details and lists it", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    act(() => root.render(<QueryClientProvider client={client}><TransportMaster /></QueryClientProvider>));
    await flush();
    await flush();
    expect(document.body.textContent).toContain("No transporters yet");

    const addBtn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes("Add transporter"))!;
    act(() => addBtn.click());
    const byId = (id: string) => document.getElementById(id) as HTMLInputElement;
    // Name is required.
    const submit = () => act(() => (document.querySelector('form button[type="submit"]') as HTMLButtonElement).click());
    submit();
    await flush();
    expect(document.body.textContent).toContain("Enter the transporter name");

    act(() => {
      type(byId("tr-name"), "VRL Logistics");
      type(byId("tr-transporter_gstin"), "29aabcv3609c1zj");
      type(byId("tr-phone"), "98450 12345");
      type(byId("tr-city"), "Hubli");
    });
    submit();
    await flush();
    await flush();
    expect(added).toHaveBeenCalledWith(
      // The app upper-cases typed text (as for customer names).
      expect.objectContaining({ transporter_name: "VRL LOGISTICS", transporter_gstin: "29AABCV3609C1ZJ", phone: "9845012345", city: "HUBLI" }),
    );
    expect(document.body.textContent).toContain("VRL LOGISTICS");
    expect(document.body.textContent).toContain("1 transporter");
    act(() => root.unmount());
    host.remove();
  });
});
