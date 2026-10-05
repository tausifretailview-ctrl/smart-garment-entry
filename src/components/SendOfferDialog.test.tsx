/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const rpc = vi.fn();
const from = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    rpc: (...args: unknown[]) => rpc(...args),
    from: (...args: unknown[]) => from(...args),
    storage: { from: vi.fn() },
  },
}));

import SendOfferDialog from "./SendOfferDialog";

function customerChain(rows: unknown[]) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    in: () => Promise.resolve({ data: rows, error: null }),
    or: () => Promise.resolve({ data: rows, error: null }),
  };
  return chain;
}

function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

type InvokeCall = [string, { body?: { probeAudience?: boolean; newCampaign?: { phones?: string[]; title?: string } } }];

function invokeBody(call: unknown[]) {
  return (call as InvokeCall)[1]?.body;
}

function buttonByText(text: string): HTMLButtonElement {
  const btn = [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
  if (!btn) throw new Error(`Missing button: ${text}\n${document.body.textContent}`);
  return btn as HTMLButtonElement;
}

async function waitFor(ok: () => boolean, label: string) {
  for (let i = 0; i < 30; i++) {
    if (ok()) return;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
  throw new Error(`timeout: ${label}\n${document.body.textContent}`);
}

describe("SendOfferDialog", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    if (!("ResizeObserver" in globalThis)) {
      vi.stubGlobal("ResizeObserver", class {
        observe() {}
        unobserve() {}
        disconnect() {}
      });
    }
    invoke.mockReset();
    rpc.mockReset();
    from.mockReset();
    invoke.mockResolvedValue({ data: { ok: true, supportsPhoneTarget: true }, error: null });
    rpc.mockResolvedValue({
      data: [
        { customer_phone_last10: "9876543210", customer_id: "c1", status: "confirmed" },
        { customer_phone_last10: "9000000002", customer_id: "c2", status: "inactive" },
      ],
      error: null,
    });
    from.mockImplementation(() => customerChain([{ id: "c1", customer_name: "AAMANA", phone: "9876543210" }]));
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
  });

  it("imports a photo from this PC and sends only to the ticked contact", async () => {
    await act(async () => {
      root.render(<SendOfferDialog organizationId="11111111-1111-1111-1111-111111111111" />);
    });
    await act(async () => {
      buttonByText("Send offer").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitFor(() => document.body.textContent?.includes("AAMANA") === true, "contact list");
    expect(document.body.textContent).toContain("Import photo from this PC");
    expect(document.body.textContent).not.toContain("Image link");
    expect(document.body.textContent).not.toContain("9000000002");

    expect(buttonByText("Send notification").disabled).toBe(true);

    const title = document.body.querySelector("input[placeholder='Diwali Sale — Flat 20% off']") as HTMLInputElement;
    const message = document.body.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      setValue(title, "DIWALI SALE");
      setValue(message, "NEW SILK SAREES ARRIVED");
    });

    const row = [...document.body.querySelectorAll("div")].find((el) => el.textContent?.includes("AAMANA") && el.className.includes("cursor-pointer"));
    if (!row) throw new Error("contact row missing");
    await act(async () => {
      row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await waitFor(() => document.body.textContent?.includes("1 selected") === true, "one contact selected");
    expect(buttonByText("Send notification").disabled).toBe(false);

    invoke.mockResolvedValue({ data: { ok: true, completed: true, sent: 1, campaignId: "camp-1" }, error: null });
    await act(async () => {
      buttonByText("Send notification").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await waitFor(() => invoke.mock.calls.some((c) => invokeBody(c)?.newCampaign), "selected send");

    const sendCall = invoke.mock.calls.find((c) => invokeBody(c)?.newCampaign);
    expect(invokeBody(sendCall ?? [])).toEqual({
      organizationId: "11111111-1111-1111-1111-111111111111",
      newCampaign: {
        title: "DIWALI SALE",
        body: "NEW SILK SAREES ARRIVED",
        offerCode: null,
        validTill: null,
        imageUrl: null,
        phones: ["9876543210"],
      },
    });
  });

  it("send to all omits phones, and a service that cannot target phones keeps Send notification off", async () => {
    invoke.mockImplementation(async (_name: string, args: { body?: { probeAudience?: boolean } }) => {
      if (args?.body?.probeAudience) return { data: { ok: true, supportsPhoneTarget: false }, error: null };
      return { data: { ok: true, completed: true, sent: 4, campaignId: "camp-2" }, error: null };
    });

    await act(async () => {
      root.render(<SendOfferDialog organizationId="11111111-1111-1111-1111-111111111111" />);
    });
    await act(async () => {
      buttonByText("Send offer").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await waitFor(() => document.body.textContent?.includes("notification service is updated") === true, "old service warning");

    const row = [...document.body.querySelectorAll("div")].find((el) => el.textContent?.includes("AAMANA") && el.className.includes("cursor-pointer"));
    await act(async () => {
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(buttonByText("Send notification").disabled).toBe(true);

    const title = document.body.querySelector("input[placeholder='Diwali Sale — Flat 20% off']") as HTMLInputElement;
    const message = document.body.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      setValue(title, "DIWALI SALE");
      setValue(message, "NEW SILK SAREES ARRIVED");
    });
    await act(async () => {
      buttonByText("Send to all").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await waitFor(() => invoke.mock.calls.some((c) => invokeBody(c)?.newCampaign), "send all");

    const sendCall = invoke.mock.calls.find((c) => invokeBody(c)?.newCampaign);
    const campaign = invokeBody(sendCall ?? [])?.newCampaign;
    expect(campaign?.phones).toBeUndefined();
    expect(campaign?.title).toBe("DIWALI SALE");
  });
});
