/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PurchaseBarcodeConflictStrip,
  PurchaseLargeBillNotice,
  PurchaseLockedOverlay,
  PurchaseToolbarButtons,
  PurchaseTotalQtyBadge,
} from "./PurchaseToolbarActions";

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
const button = (t: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(t)) as HTMLButtonElement | undefined;

describe("PurchaseToolbarButtons", () => {
  const base = {
    importing: false,
    isBillLocked: false,
    photoImportOn: true,
    onImportExcel: vi.fn(),
    onImportPhoto: vi.fn(),
    onAddProduct: vi.fn(),
    onPrefetchAddProduct: vi.fn(),
  };
  it("each button calls back; hover warms up Add Product", () => {
    const p = { ...base, onImportExcel: vi.fn(), onImportPhoto: vi.fn(), onAddProduct: vi.fn(), onPrefetchAddProduct: vi.fn() };
    act(() => root.render(<PurchaseToolbarButtons {...p} />));
    act(() => button("Excel")!.click());
    act(() => button("Photo")!.click());
    act(() => button("Product")!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    act(() => button("Product")!.click());
    expect(p.onImportExcel).toHaveBeenCalledTimes(1);
    expect(p.onImportPhoto).toHaveBeenCalledTimes(1);
    expect(p.onPrefetchAddProduct).toHaveBeenCalled();
    expect(p.onAddProduct).toHaveBeenCalledTimes(1);
  });
  it("importing turns off Excel and Photo; locked turns off Photo and Add Product; Photo hidden when off", () => {
    act(() => root.render(<PurchaseToolbarButtons {...base} importing />));
    expect(button("Excel")!.disabled).toBe(true);
    expect(button("Photo")!.disabled).toBe(true);
    expect(button("Product")!.disabled).toBe(false);
    act(() => root.render(<PurchaseToolbarButtons {...base} isBillLocked />));
    expect(button("Excel")!.disabled).toBe(false);
    expect(button("Photo")!.disabled).toBe(true);
    expect(button("Product")!.disabled).toBe(true);
    act(() => root.render(<PurchaseToolbarButtons {...base} photoImportOn={false} />));
    expect(button("Photo")).toBeUndefined();
  });
});

describe("Purchase notices", () => {
  it("total qty badge", () => {
    act(() => root.render(<PurchaseTotalQtyBadge totalQty={37} />));
    expect(host.textContent).toBe("Total Qty37");
  });
  it("large bill notice only past 100 lines", () => {
    act(() => root.render(<PurchaseLargeBillNotice lineCount={100} shownCount={50} />));
    expect(host.innerHTML).toBe("");
    act(() => root.render(<PurchaseLargeBillNotice lineCount={240} shownCount={300} />));
    expect(host.textContent).toContain("Large bill: 240 items");
    expect(host.textContent).toContain("Showing 240 rows");
  });
  it("barcode conflict strip, singular and plural", () => {
    act(() => root.render(<PurchaseBarcodeConflictStrip count={0} />));
    expect(host.innerHTML).toBe("");
    act(() => root.render(<PurchaseBarcodeConflictStrip count={1} />));
    expect(host.textContent).toContain("1 barcode conflict —");
    act(() => root.render(<PurchaseBarcodeConflictStrip count={3} />));
    expect(host.textContent).toContain("3 barcode conflicts —");
  });
  it("locked overlay", () => {
    act(() => root.render(<PurchaseLockedOverlay />));
    expect(host.textContent).toContain("Locked — click Unlock to edit");
  });
});
