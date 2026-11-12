/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PosCustomerPicker, type PosCustomerPickerProps } from "./PosCustomerPicker";
import { posCustomerDueChip } from "./posCustomerChips";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver ??= RO;
Element.prototype.scrollIntoView ??= function () {};

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

const customers = [
  { id: "c1", customer_name: "Hanif", phone: "9800000001", email: null },
  { id: "c2", customer_name: "Ravi", phone: null, email: "ravi@example.test" },
];

function props(p: Partial<PosCustomerPickerProps> = {}): PosCustomerPickerProps {
  return {
    open: false,
    setOpen: vi.fn(),
    customerName: "",
    setCustomerName: vi.fn(),
    onClear: vi.fn(),
    onAddCustomer: vi.fn(),
    onPick: vi.fn(),
    isLoading: false,
    balancesLoading: false,
    isError: false,
    onRetry: vi.fn(),
    totalCount: 2,
    hasMore: false,
    customers,
    getCustomerSnapshot: (id) => (id === "c1" ? { grossOutstandingDr: 5000.4 } : { grossOutstandingDr: -250 }),
    getCustomerAdvance: (id) => (id === "c1" ? 1200 : 0),
    getCustomerCreditNote: (id) => (id === "c2" ? 300 : 0),
    ...p,
  };
}
const nameInput = () => host.querySelector('input[placeholder="Enter customer name or phone"]') as HTMLInputElement;
function typeInto(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const popupItems = () => [...document.querySelectorAll("[cmdk-item]")] as HTMLElement[];

describe("posCustomerDueChip", () => {
  it("shows bills due, credit, or nothing", () => {
    expect(posCustomerDueChip(5000.4)).toEqual({ kind: "due", label: "₹5,000 Due" });
    expect(posCustomerDueChip(-250)).toEqual({ kind: "credit", label: "₹250 Cr" });
    expect(posCustomerDueChip(0.4)).toBeNull();
    expect(posCustomerDueChip(null)).toBeNull();
  });
});

describe("PosCustomerPicker", () => {
  it("typing sets the name and opens the search; add and clear buttons", () => {
    const p = props({ customerName: "HAN" });
    act(() => root.render(<PosCustomerPicker {...p} />));
    expect(host.textContent).toContain("Customer Name");
    typeInto(nameInput(), "Hani");
    expect(p.setCustomerName).toHaveBeenCalledWith("HANI"); // shared Input upper-cases
    expect(p.setOpen).toHaveBeenCalledWith(true);
    act(() => (host.querySelector('button[title="Add New Customer"]') as HTMLButtonElement).click());
    expect(p.onAddCustomer).toHaveBeenCalledTimes(1);
    act(() => (host.querySelector('button[aria-label="Clear customer"]') as HTMLButtonElement).click());
    expect(p.onClear).toHaveBeenCalledTimes(1);
  });

  it("no clear button without a name", () => {
    act(() => root.render(<PosCustomerPicker {...props()} />));
    expect(host.querySelector('button[aria-label="Clear customer"]')).toBeNull();
  });

  it("lists customers with Adv / CN / Due chips and picks one", () => {
    const p = props({ open: true });
    act(() => root.render(<PosCustomerPicker {...p} />));
    expect(document.body.textContent).toContain("Customers (2)");
    const items = popupItems();
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Hanif");
    expect(items[0].textContent).toContain("₹1,200 Adv");
    expect(items[0].textContent).toContain("₹5,000 Due");
    expect(items[0].textContent).toContain("Phone: 9800000001");
    expect(items[1].textContent).toContain("₹300 CN");
    expect(items[1].textContent).toContain("₹250 Cr");
    expect(items[1].textContent).toContain("| Email: ravi@example.test");
    act(() => items[1].click());
    expect(p.onPick).toHaveBeenCalledWith(customers[1]);
  });

  it("shows loading, error with Retry, and the 'refine search' note", () => {
    act(() => root.render(<PosCustomerPicker {...props({ open: true, isLoading: true })} />));
    expect(document.body.textContent).toContain("Loading customers...");
    act(() => root.render(<PosCustomerPicker {...props({ open: true, balancesLoading: true })} />));
    expect(document.body.textContent).toContain("Loading balances...");
    const onRetry = vi.fn();
    act(() => root.render(<PosCustomerPicker {...props({ open: true, isError: true, onRetry })} />));
    expect(document.body.textContent).toContain("Error loading customers");
    const retry = [...document.querySelectorAll("button")].find((b) => b.textContent === "Retry") as HTMLButtonElement;
    act(() => retry.click());
    expect(onRetry).toHaveBeenCalledTimes(1);
    act(() => root.render(<PosCustomerPicker {...props({ open: true, hasMore: true, totalCount: 200 })} />));
    expect(document.body.textContent).toContain("Customers (200) - refine search for more");
  });
});
