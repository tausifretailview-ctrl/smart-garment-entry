/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { purchaseBillNavDisabled } from "@/utils/purchaseBillNav";
import { PurchaseEntryHeader, type PurchaseEntryHeaderProps } from "./PurchaseEntryHeader";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("purchaseBillNavDisabled", () => {
  it("new bill with a loaded list: only Last works", () => {
    expect(purchaseBillNavDisabled(false, null, 5)).toEqual({ last: false, previous: true, next: true });
  });
  it("newest bill open: Previous works, Next does not", () => {
    expect(purchaseBillNavDisabled(false, 0, 5)).toEqual({ last: false, previous: false, next: true });
  });
  it("oldest bill open: Next works, Previous does not", () => {
    expect(purchaseBillNavDisabled(false, 4, 5)).toEqual({ last: false, previous: true, next: false });
  });
  it("no list, empty list, or loading: all off", () => {
    expect(purchaseBillNavDisabled(false, null, null)).toEqual({ last: true, previous: true, next: true });
    expect(purchaseBillNavDisabled(false, null, 0).last).toBe(true);
    expect(purchaseBillNavDisabled(true, 2, 5)).toEqual({ last: true, previous: true, next: true });
  });
});

function props(p: Partial<PurchaseEntryHeaderProps> = {}): PurchaseEntryHeaderProps {
  return {
    sectionX: "px-4",
    isEditMode: false,
    softwareBillNo: "",
    navIndex: null,
    billCount: 5,
    isLoadingNavBill: false,
    onBack: vi.fn(),
    onNew: vi.fn(),
    onLast: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    lastBill: null,
    showRestoring: false,
    ...p,
  };
}
const byTitle = (t: string) => host.querySelector(`button[title="${t}"]`) as HTMLButtonElement;

describe("PurchaseEntryHeader", () => {
  it("new bill: NEW badge, buttons call back", () => {
    const p = props();
    act(() => root.render(<PurchaseEntryHeader {...p} />));
    expect(host.textContent).toContain("Purchase Entry");
    expect(host.textContent).toContain("NEW");
    act(() => byTitle("New Bill").click());
    expect(p.onNew).toHaveBeenCalledTimes(1);
    act(() => byTitle("Last Record").click());
    expect(p.onLast).toHaveBeenCalledTimes(1);
    expect(byTitle("Previous").disabled).toBe(true);
    const back = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Dashboard"))!;
    act(() => back.click());
    expect(p.onBack).toHaveBeenCalledTimes(1);
  });

  it("editing a saved bill: EDITING badge and 'n of m'", () => {
    act(() => root.render(<PurchaseEntryHeader {...props({ isEditMode: true, softwareBillNo: "PB/41", navIndex: 1 })} />));
    expect(host.textContent).toContain("Edit Purchase Bill");
    expect(host.textContent).toContain("EDITING PB/41");
    expect(host.textContent).toContain("2 of 5");
    expect(byTitle("Previous").disabled).toBe(false);
    expect(byTitle("Next").disabled).toBe(false);
  });

  it("Last: strip and Restoring strip", () => {
    act(() =>
      root.render(
        <PurchaseEntryHeader {...props({ lastBill: { software_bill_no: "PB/40", supplier_invoice_no: "INV-9" }, showRestoring: true })} />,
      ),
    );
    expect(host.textContent).toContain("Last:PB/40");
    expect(host.textContent).toContain("Sup Inv:INV-9");
    expect(host.textContent).toContain("Restoring your bill…");
  });
});
