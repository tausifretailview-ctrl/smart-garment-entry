/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PosSalesmanPicker, type PosSalesmanPickerProps } from "./PosSalesmanPicker";
import { filterPosSalesmen } from "./posSalesmen";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// cmdk / Radix need these in jsdom.
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

const employees = [
  { id: "e1", employee_name: "Amit", designation: "Sales" },
  { id: "e2", employee_name: "Ravi", designation: null },
];

function props(p: Partial<PosSalesmanPickerProps> = {}): PosSalesmanPickerProps {
  return {
    open: false,
    setOpen: vi.fn(),
    search: "",
    setSearch: vi.fn(),
    selectedSalesman: "",
    setSelectedSalesman: vi.fn(),
    employees,
    onClosed: vi.fn(),
    onPicked: vi.fn(),
    ...p,
  };
}
const headerInput = () => host.querySelector('input[placeholder="Select..."]') as HTMLInputElement;
function typeInto(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("filterPosSalesmen", () => {
  it("matches part of the name, any case", () => {
    expect(filterPosSalesmen(employees, "").map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(filterPosSalesmen(employees, "RA").map((e) => e.id)).toEqual(["e2"]);
    expect(filterPosSalesmen(employees, "zz")).toEqual([]);
  });
});

describe("PosSalesmanPicker", () => {
  it("typing sets the salesperson and opens the list", () => {
    const p = props();
    act(() => root.render(<PosSalesmanPicker {...p} />));
    expect(host.textContent).toContain("Salesperson");
    typeInto(headerInput(), "Am");
    // The shared Input upper-cases typing, as on the real screen.
    expect(p.setSelectedSalesman).toHaveBeenCalledWith("AM");
    expect(p.setOpen).toHaveBeenCalledWith(true);
  });

  it("the clear button empties it without opening the list", () => {
    const p = props({ selectedSalesman: "Ravi" });
    act(() => root.render(<PosSalesmanPicker {...p} />));
    const clear = host.querySelector('button[aria-label="Clear salesperson"]') as HTMLButtonElement;
    act(() => clear.click());
    expect(p.setSelectedSalesman).toHaveBeenCalledWith("");
  });

  it("open: lists the matching employees; picking one sets it, closes and goes back to barcode", () => {
    const p = props({ open: true, search: "ra" });
    act(() => root.render(<PosSalesmanPicker {...p} />));
    const popup = document.querySelector("[data-pos-salesman-picker]") as HTMLElement;
    expect(popup).toBeTruthy();
    const items = [...popup.querySelectorAll("[cmdk-item]")];
    expect(items.map((i) => i.textContent)).toEqual(["Ravi"]);
    act(() => (items[0] as HTMLElement).click());
    expect(p.setSelectedSalesman).toHaveBeenCalledWith("Ravi");
    expect(p.setOpen).toHaveBeenCalledWith(false);
    expect(p.setSearch).toHaveBeenCalledWith("");
    expect(p.onPicked).toHaveBeenCalledTimes(1);
  });

  it("Escape closes, clears the search and calls onClosed", () => {
    const p = props({ open: true, search: "a" });
    act(() => root.render(<PosSalesmanPicker {...p} />));
    const search = document.querySelector("[data-pos-salesman-picker] [cmdk-input]") as HTMLInputElement;
    act(() => {
      search.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(p.setOpen).toHaveBeenCalledWith(false);
    expect(p.setSearch).toHaveBeenCalledWith("");
    expect(p.onClosed).toHaveBeenCalled();
  });
});
