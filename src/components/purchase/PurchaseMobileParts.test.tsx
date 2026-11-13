/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PurchaseMobileItemsCard,
  PurchaseMobileSaveBar,
  PurchaseMobileTotalsCard,
  type PurchaseMobileLine,
} from "./PurchaseMobileParts";

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

const lines: PurchaseMobileLine[] = [
  { tempId: "t1", title: "Shirt", subtitle: "M Blue", qty: 3, uomLabel: null, purPrice: 600, amount: 1800 },
  { tempId: "t2", title: "890123", subtitle: "MTR ", qty: 2.5, uomLabel: "Mtr", purPrice: 120.4, amount: 301 },
];
const btn = (label: string, i = 0) => [...host.querySelectorAll(`button[aria-label="${label}"]`)][i] as HTMLButtonElement;
const byText = (t: string, i = 0) =>
  [...host.querySelectorAll("button")].filter((b) => b.textContent?.includes(t))[i] as HTMLButtonElement;

describe("Purchase mobile parts", () => {
  it("items card: lines, units, amounts, and each action with the line id", () => {
    const onQtyStep = vi.fn();
    const onPriceChange = vi.fn();
    const onRemove = vi.fn();
    act(() =>
      root.render(
        <PurchaseMobileItemsCard lines={lines} totalQty={5.5} onQtyStep={onQtyStep} onPriceChange={onPriceChange} onRemove={onRemove} />,
      ),
    );
    const text = host.textContent || "";
    expect(text).toContain("Items (2)");
    expect(text).toContain("5.5 pcs");
    expect(text).toContain("Shirt");
    expect(text).toContain("M Blue");
    expect(text).toContain("= ₹1,800");
    expect(text).toContain("Mtr");
    expect(text).toContain("= ₹301");
    act(() => btn("Less", 1).click());
    expect(onQtyStep).toHaveBeenCalledWith("t2", -1);
    act(() => btn("More", 0).click());
    expect(onQtyStep).toHaveBeenCalledWith("t1", 1);
    act(() => byText("Remove", 1).click());
    expect(onRemove).toHaveBeenCalledWith("t2");
  });

  it("items card is empty with no lines", () => {
    act(() =>
      root.render(<PurchaseMobileItemsCard lines={[]} totalQty={0} onQtyStep={() => {}} onPriceChange={() => {}} onRemove={() => {}} />),
    );
    expect(host.innerHTML).toBe("");
  });

  it("totals card", () => {
    act(() => root.render(<PurchaseMobileTotalsCard totalQty={5} netAmount={2101.4} />));
    expect(host.textContent).toContain("Total Qty5 pcs");
    expect(host.textContent).toContain("Grand Total₹2,101");
  });

  it("save bar: amount on the button, saving / importing states, off when empty", () => {
    const onSave = vi.fn();
    act(() =>
      root.render(<PurchaseMobileSaveBar onSave={onSave} loading={false} excelImport={null} lineCount={2} filledCount={2} netAmount={2101} />),
    );
    const save = host.querySelector("button") as HTMLButtonElement;
    expect(save.textContent).toContain("Save Bill · ₹2,101");
    act(() => save.click());
    expect(onSave).toHaveBeenCalledTimes(1);
    act(() =>
      root.render(<PurchaseMobileSaveBar onSave={onSave} loading excelImport={null} lineCount={2} filledCount={2} netAmount={2101} />),
    );
    expect(host.textContent).toContain("Saving…");
    expect((host.querySelector("button") as HTMLButtonElement).disabled).toBe(true);
    act(() =>
      root.render(
        <PurchaseMobileSaveBar onSave={onSave} loading={false} excelImport={{ current: 40, total: 1200 }} lineCount={2} filledCount={2} netAmount={2101} />,
      ),
    );
    expect(host.textContent).toContain("Importing 40 / 1,200...");
    act(() =>
      root.render(<PurchaseMobileSaveBar onSave={onSave} loading={false} excelImport={null} lineCount={0} filledCount={0} netAmount={0} />),
    );
    expect(host.textContent).toContain("Save Bill");
    expect(host.textContent).not.toContain("·");
    expect((host.querySelector("button") as HTMLButtonElement).disabled).toBe(true);
  });
});
