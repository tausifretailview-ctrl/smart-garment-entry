/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PosActionBar, type PosActionBarProps } from "./PosActionBar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

function props(over: Partial<PosActionBarProps> = {}): PosActionBarProps {
  return {
    hasItems: true,
    isSaving: false,
    heldCount: 0,
    hasTodaysSales: true,
    onLatestInvoice: false,
    hasSavedInvoice: true,
    onPay: vi.fn(),
    onSaleReturn: vi.fn(),
    onMix: vi.fn(),
    onHold: vi.fn(),
    onEstimate: vi.fn(),
    onNew: vi.fn(),
    onLast: vi.fn(),
    onReprint: vi.fn(),
    onAdvance: vi.fn(),
    onClear: vi.fn(),
    ...over,
  };
}

function render(p: PosActionBarProps) {
  act(() => root.render(<PosActionBar {...p} />));
}
const button = (title: string) =>
  [...host.querySelectorAll("button")].find((b) => b.getAttribute("title") === title) as HTMLButtonElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("PosActionBar (moved out of POSSales unchanged)", () => {
  it("shows the 13 buttons in the same order with their shortcut badges", () => {
    render(props());
    const titles = [...host.querySelectorAll("button")].map((b) => b.getAttribute("title"));
    expect(titles).toEqual([
      "Cash Payment - Save & Print (F1)",
      "UPI Payment - Save & Print (F2)",
      "Card Payment - Save & Print (F3)",
      "Credit - Pay Later (F4)",
      "Sale Return (F5)",
      "Mix Payment - Save & Print (F6)",
      "Hold Bill (F7)",
      "Print Estimate - No Save (F9)",
      "New Invoice",
      "Last Invoice",
      "Reprint Last Saved Invoice",
      "Advance Booking Dashboard",
      "Clear (Esc)",
    ]);
  });

  it("calls the page handlers", () => {
    const p = props();
    render(p);
    act(() => button("Cash Payment - Save & Print (F1)").click());
    act(() => button("Credit - Pay Later (F4)").click());
    act(() => button("Hold Bill (F7)").click());
    act(() => button("Clear (Esc)").click());
    expect(p.onPay).toHaveBeenNthCalledWith(1, "cash");
    expect(p.onPay).toHaveBeenNthCalledWith(2, "pay_later");
    expect(p.onHold).toHaveBeenCalledOnce();
    expect(p.onClear).toHaveBeenCalledOnce();
  });

  it("disables payments with an empty cart or while saving, like before", () => {
    render(props({ hasItems: false }));
    expect(button("Cash Payment - Save & Print (F1)").disabled).toBe(true);
    expect(button("Print Estimate - No Save (F9)").disabled).toBe(true);
    expect(button("Hold Bill (F7)").disabled).toBe(false);
    render(props({ isSaving: true }));
    expect(button("Mix Payment - Save & Print (F6)").disabled).toBe(true);
    expect(button("Hold Bill (F7)").disabled).toBe(true);
    render(props({ hasSavedInvoice: false, hasTodaysSales: false }));
    expect(button("Reprint Last Saved Invoice").disabled).toBe(true);
    expect(button("Last Invoice").disabled).toBe(true);
  });

  it("shows the held-bill count, capped at 9+", () => {
    render(props({ heldCount: 3 }));
    expect(button("Hold Bill (F7)").textContent).toContain("3");
    render(props({ heldCount: 12 }));
    expect(button("Hold Bill (F7)").textContent).toContain("9+");
  });
});
