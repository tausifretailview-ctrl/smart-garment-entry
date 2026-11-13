/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { draftLoadPercent } from "@/utils/draftLoadProgress";
import { PurchaseDraftLoadingOverlay } from "./PurchaseDraftLoadingOverlay";
import { PurchaseMobileSupplierCard } from "./PurchaseMobileParts";

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

function setValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("draft loading overlay", () => {
  it("percent of lines loaded", () => {
    expect(draftLoadPercent(150, 600)).toBe(25);
    expect(draftLoadPercent(0, 0)).toBe(0);
  });
  it("shows the counts and the bar", () => {
    act(() => root.render(<PurchaseDraftLoadingOverlay loaded={150} total={600} />));
    expect(host.textContent).toContain("Loading Draft Bill...");
    expect(host.textContent).toContain("Large bill with 600 items");
    expect(host.textContent).toContain("150 / 600");
    expect((host.querySelector(".bg-primary.h-2") as HTMLElement).style.width).toBe("25%");
  });
});

describe("PurchaseMobileSupplierCard", () => {
  const base = {
    supplierId: "",
    suppliers: [{ id: "s1", supplier_name: "Velvet Traders" }],
    onSupplierListOpen: vi.fn(),
    onSupplierChange: vi.fn(),
    billDate: "2026-11-13",
    onBillDateChange: vi.fn(),
    serial: "",
    onSerialChange: vi.fn(),
    nextSerial: "PB/27",
    supplierPaperInvoiceNo: null,
  };
  it("shows the date, the next serial as placeholder, and passes changes", () => {
    const p = { ...base, onBillDateChange: vi.fn(), onSerialChange: vi.fn() };
    act(() => root.render(<PurchaseMobileSupplierCard {...p} />));
    expect(host.textContent).toContain("Supplier & Bill Details");
    const date = host.querySelector('input[type="date"]') as HTMLInputElement;
    expect(date.value).toBe("2026-11-13");
    const serial = host.querySelector('input[data-field="supplier-invoice-no"]') as HTMLInputElement;
    expect(serial.placeholder).toBe("Serial: PB/27");
    setValue(serial, "PB/28");
    expect(p.onSerialChange).toHaveBeenCalledWith("PB/28");
    setValue(date, "2026-11-10");
    expect(p.onBillDateChange).toHaveBeenCalledWith("2026-11-10");
    expect(host.textContent).not.toContain("Supplier bill:");
  });
  it("shows the supplier's paper invoice number; Inv # without a next serial", () => {
    act(() => root.render(<PurchaseMobileSupplierCard {...base} nextSerial={null} supplierPaperInvoiceNo="A-7781" />));
    expect(host.textContent).toContain("Supplier bill: A-7781");
    expect((host.querySelector('input[data-field="supplier-invoice-no"]') as HTMLInputElement).placeholder).toBe("Inv #");
  });
});
