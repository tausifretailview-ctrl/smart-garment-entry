/** @vitest-environment jsdom */
import React, { act } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PurchaseBillDetailsFields, type PurchaseBillDetailsFieldsProps } from "./PurchaseBillDetailsFields";

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

function props(over: Partial<PurchaseBillDetailsFieldsProps> = {}): PurchaseBillDetailsFieldsProps {
  return {
    softwareBillNo: "PUR/26-27/42",
    supplierId: "",
    suppliers: [{ id: "s1", supplier_name: "ACME TEXTILES" }],
    onSupplierListOpen: vi.fn(),
    onSupplierChange: vi.fn(),
    onAddSupplier: vi.fn(),
    supplierInvoiceNo: "",
    onSupplierInvoiceNoChange: vi.fn(),
    nextSerial: "128",
    billDate: new Date(2026, 10, 13),
    onBillDateChange: vi.fn(),
    billEntryAt: null,
    isDcPurchase: false,
    dcLocked: false,
    onDcPurchaseChange: vi.fn(),
    ...over,
  };
}

const q = <T extends Element>(sel: string) => host.querySelector(sel) as T;

describe("PurchaseBillDetailsFields", () => {
  it("shows bill no, serial placeholder, bill date and the not-yet-saved note", () => {
    act(() => root.render(<PurchaseBillDetailsFields {...props()} />));
    expect(q<HTMLInputElement>("#software_bill_no").value).toBe("PUR/26-27/42");
    expect(q<HTMLInputElement>("#supplier_invoice_no").placeholder).toBe("Serial on save: 128");
    expect(q<HTMLButtonElement>("#bill_date").textContent).toContain("13 Nov 2026");
    expect(host.textContent).toContain("Recorded automatically when you save");
  });

  it("no next serial: plain placeholder", () => {
    act(() => root.render(<PurchaseBillDetailsFields {...props({ nextSerial: null })} />));
    expect(q<HTMLInputElement>("#supplier_invoice_no").placeholder).toBe("Invoice number");
  });

  it("typing the supplier invoice number reports the text", () => {
    const p = props();
    act(() => root.render(<PurchaseBillDetailsFields {...p} />));
    const input = q<HTMLInputElement>("#supplier_invoice_no");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(input, "A-77");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(p.onSupplierInvoiceNoChange).toHaveBeenCalledWith("A-77");
  });

  it("Add New Supplier button opens the dialog", () => {
    const p = props();
    act(() => root.render(<PurchaseBillDetailsFields {...p} />));
    act(() => q<HTMLButtonElement>('button[title="Add New Supplier"]').click());
    expect(p.onAddSupplier).toHaveBeenCalledTimes(1);
  });

  it("DC Purchase tick reports true; locked for DC-only users", () => {
    const p = props();
    act(() => root.render(<PurchaseBillDetailsFields {...p} />));
    act(() => q<HTMLButtonElement>('button[role="checkbox"]').click());
    expect(p.onDcPurchaseChange).toHaveBeenCalledWith(true);
    act(() => root.render(<PurchaseBillDetailsFields {...props({ isDcPurchase: true, dcLocked: true })} />));
    expect(q<HTMLButtonElement>('button[role="checkbox"]').disabled).toBe(true);
  });

  it("saved bill shows its entry time instead of the note", () => {
    act(() => root.render(<PurchaseBillDetailsFields {...props({ billEntryAt: "2026-11-13T05:30:00Z" })} />));
    expect(host.textContent).not.toContain("Recorded automatically when you save");
  });
});

describe("PurchaseEntry supplier pick", () => {
  const src = readFileSync(resolve(__dirname, "../../pages/PurchaseEntry.tsx"), "utf8");
  it("both layouts use the one stable handler, which updates billData from the latest state", () => {
    expect(src).not.toContain("setBillData({ ...billData, supplier_id: value");
    expect(src).not.toMatch(/setBillData\(\{\s*\.\.\.billData,\s*supplier_id: value/);
    expect(src).toContain("setBillData((prev) => ({ ...prev, supplier_id: value");
    expect(src.match(/onSupplierChange=\{handleSupplierPicked\}/g)?.length).toBe(2);
  });
});
