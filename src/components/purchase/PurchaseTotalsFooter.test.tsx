/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PurchaseTotalsFooter, type PurchaseTotalsFooterProps } from "./PurchaseTotalsFooter";

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

function props(p: Partial<PurchaseTotalsFooterProps> = {}): PurchaseTotalsFooterProps {
  return {
    hidden: false,
    grossAmount: 10000,
    itemDiscount: 500,
    taxableAmount: 9250,
    gstAmount: 462.5,
    netAmount: 9713,
    discountAmount: 250,
    otherCharges: 0,
    setDiscountAmount: vi.fn(),
    setOtherCharges: vi.fn(),
    showPrintBarcodes: false,
    lineCount: 3,
    selectedForPrintCount: 0,
    onPrintBarcodes: vi.fn(),
    onSave: vi.fn(),
    loading: false,
    excelImport: null,
    isBillLocked: false,
    ...p,
  };
}
const inputs = () => [...host.querySelectorAll("input")] as HTMLInputElement[];
function typeInto(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const button = (text: string) =>
  [...host.querySelectorAll("button")].find((b) => (b.textContent || "").includes(text)) as HTMLButtonElement | undefined;

describe("PurchaseTotalsFooter", () => {
  it("shows the totals and the Gross − Disc = Taxable + GST = Net line", () => {
    act(() => root.render(<PurchaseTotalsFooter {...props()} />));
    const text = (host.textContent || "").replace(/\s+/g, " ");
    expect(text).toContain("Gross Amt");
    expect(text).toContain("Net Payable");
    expect(text).toContain("₹9,713");
    expect(text).toContain("Disc ₹750"); // item 500 + bill 250
    expect(text).toContain("Taxable ₹9,250.00");
    expect(text).toContain("GST ₹462.50");
    expect(text).not.toContain("Charges ₹");
    const [pct, rs] = inputs();
    expect(pct.value).toBe("2.5");
    expect(rs.value).toBe("250");
  });

  it("Bill Disc %, Bill Disc ₹ and Charges set the amounts", () => {
    const p = props();
    act(() => root.render(<PurchaseTotalsFooter {...p} />));
    const [pct, rs, charges] = inputs();
    typeInto(pct, "5");
    expect(p.setDiscountAmount).toHaveBeenCalledWith(500);
    typeInto(rs, "120");
    expect(p.setDiscountAmount).toHaveBeenCalledWith(120);
    typeInto(charges, "-40");
    expect(p.setOtherCharges).toHaveBeenCalledWith(-40);
  });

  it("negative charges read as minus in the breakdown", () => {
    act(() => root.render(<PurchaseTotalsFooter {...props({ otherCharges: -40 })} />));
    expect(host.textContent || "").toMatch(/−\s*Charges ₹40\.00/);
  });

  it("Save runs; it is off while saving, importing, locked or empty", () => {
    const p = props();
    act(() => root.render(<PurchaseTotalsFooter {...p} />));
    act(() => button("Save Bill")!.click());
    expect(p.onSave).toHaveBeenCalledTimes(1);
    for (const off of [{ loading: true }, { isBillLocked: true }, { lineCount: 0 }, { excelImport: { current: 3, total: 10 } }]) {
      act(() => root.render(<PurchaseTotalsFooter {...props(off)} />));
      const save = [...host.querySelectorAll("button")].find((b) => b.className.includes("bg-green-600")) as HTMLButtonElement;
      expect(save.disabled).toBe(true);
    }
    expect(host.textContent).toContain("Importing 3/10...");
  });

  it("Print Barcodes only when offered, with the ticked count", () => {
    const p = props({ showPrintBarcodes: true, selectedForPrintCount: 2 });
    act(() => root.render(<PurchaseTotalsFooter {...p} />));
    act(() => button("Print Barcodes (2)")!.click());
    expect(p.onPrintBarcodes).toHaveBeenCalledTimes(1);
    act(() => root.render(<PurchaseTotalsFooter {...props()} />));
    expect(button("Print Barcodes")).toBeUndefined();
  });

  it("has no Cancel button (removed: it had no action)", () => {
    act(() => root.render(<PurchaseTotalsFooter {...props()} />));
    expect(button("Cancel")).toBeUndefined();
  });

  it("hidden while the Edit Product panel is open", () => {
    act(() => root.render(<PurchaseTotalsFooter {...props({ hidden: true })} />));
    expect(host.querySelector("footer")!.className).toContain("hidden");
  });
});
