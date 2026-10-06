/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import BulkSendHistory from "./BulkSendHistory";
import { summarizeBulkSends, type PushMessageRow } from "@/utils/customerPushStats";

const messages: PushMessageRow[] = [
  {
    id: "m1",
    status: "failed",
    created_at: "2026-10-06T05:10:00Z",
    sent_at: null,
    delivered_at: null,
    opened_at: null,
    dismissed_at: null,
    error_code: "UNREGISTERED",
    sale_id: null,
    campaign_id: "camp-1",
    subscription_id: "sub-1",
  },
  {
    id: "m2",
    status: "sent",
    created_at: "2026-10-06T05:10:00Z",
    sent_at: "2026-10-06T05:10:00Z",
    delivered_at: "2026-10-06T05:11:00Z",
    opened_at: "2026-10-06T05:12:00Z",
    dismissed_at: null,
    error_code: null,
    sale_id: null,
    campaign_id: "camp-1",
    subscription_id: "sub-2",
  },
  {
    id: "m3",
    status: "sent",
    created_at: "2026-10-05T05:10:00Z",
    sent_at: "2026-10-05T05:10:00Z",
    delivered_at: null,
    opened_at: null,
    dismissed_at: null,
    error_code: null,
    sale_id: null,
    campaign_id: "camp-2",
    subscription_id: "sub-3",
  },
];

const bulk = summarizeBulkSends(messages, [
  {
    id: "camp-1",
    title: "Diwali Sale",
    body: "New stock",
    created_at: "2026-10-06T05:00:00Z",
    status: "done",
    target: { phones: ["9527465086", "8080980366"] },
  },
  {
    id: "camp-2",
    title: "Sunday hours",
    body: "Shop opens at 11",
    created_at: "2026-10-05T05:00:00Z",
    status: "done",
    target: {},
  },
]);

function buttonByText(text: string): HTMLButtonElement {
  const btn = [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
  if (!btn) throw new Error(`Missing button: ${text}\n${document.body.textContent}`);
  return btn as HTMLButtonElement;
}

describe("BulkSendHistory", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
  });

  async function renderPanel(search = "") {
    await act(async () => {
      root.render(
        <BulkSendHistory
          summary={bulk.summary}
          history={bulk.history}
          messages={messages}
          phoneOf={(id) => ({ "sub-1": "9527465086", "sub-2": "8080980366", "sub-3": "9673648444" })[id] ?? ""}
          search={search}
          loading={false}
        />,
      );
    });
  }

  it("shows total sent, failed and read, and lists each bulk send", async () => {
    await renderPanel();
    expect(buttonByText("Total sent").textContent).toContain("2");
    expect(buttonByText("Failed").textContent).toContain("1");
    expect(buttonByText("Read").textContent).toContain("1");
    expect(document.body.textContent).toContain("Diwali Sale");
    expect(document.body.textContent).toContain("2 selected");
    expect(document.body.textContent).toContain("Sunday hours");
    expect(document.body.textContent).toContain("All contacts");
    expect(document.body.textContent).not.toContain("9527465086");
  });

  it("filters history to failed sends and shows the phone reason", async () => {
    await renderPanel();
    await act(async () => {
      buttonByText("Failed").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.body.textContent).toContain("Diwali Sale");
    expect(document.body.textContent).not.toContain("Sunday hours");

    const row = [...document.body.querySelectorAll("tr")].find((el) => el.textContent?.includes("Diwali Sale"));
    if (!row) throw new Error("history row missing");
    await act(async () => {
      row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.body.textContent).toContain("9527465086");
    expect(document.body.textContent).toContain("Phone turned notifications off");
    expect(document.body.textContent).not.toContain("8080980366");
  });
});
