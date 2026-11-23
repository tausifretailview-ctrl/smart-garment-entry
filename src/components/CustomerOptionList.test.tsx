/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerOptionList } from "./CustomerOptionList";
import { SearchableSelect } from "@/components/ui/searchable-select";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Customer pickers used to draw one row per customer (speed review item S6). With 5,000
 * customers they now draw 100, and the search still reaches every customer.
 */
const customers = Array.from({ length: 5000 }, (_, i) => ({
  id: `c${i}`,
  customer_name: `Customer ${i}`,
  phone: `98${String(i).padStart(8, "0")}`,
}));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const rows = () => [...document.querySelectorAll('[role="option"]')] as HTMLElement[];
const type = (input: HTMLInputElement, text: string) =>
  act(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const key = (input: HTMLInputElement, k: string) =>
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  });

describe("CustomerOptionList", () => {
  it("draws 100 of 5,000 customers and says so", () => {
    act(() => root.render(<CustomerOptionList customers={customers} selectedId={null} onPick={() => undefined} />));
    expect(rows()).toHaveLength(100);
    expect(host.textContent).toContain("Showing 100 of 5,000. Type to narrow.");
  });

  it("search reaches a customer far beyond the rows on screen, by name or phone", () => {
    const onPick = vi.fn();
    act(() => root.render(<CustomerOptionList customers={customers} selectedId={null} onPick={onPick} />));
    const input = host.querySelector("input")!;
    type(input, "customer 4876");
    expect(rows().map((r) => r.textContent)).toEqual(["Customer 48769800004876"]);
    expect(host.textContent).not.toContain("Type to narrow");

    type(input, "9800003210");
    expect(rows()).toHaveLength(1);
    act(() => rows()[0].click());
    expect(onPick).toHaveBeenCalledWith(customers[3210]);
  });

  it("arrow keys move and Enter picks, as the old list did", () => {
    const onPick = vi.fn();
    act(() => root.render(<CustomerOptionList customers={customers} selectedId={null} onPick={onPick} />));
    const input = host.querySelector("input")!;
    type(input, "customer 12");
    key(input, "ArrowDown");
    key(input, "ArrowDown");
    key(input, "ArrowUp");
    key(input, "Enter");
    // Down, Down, Up lands on the second match in list order (name or phone holding "12").
    const matches = customers.filter((c) => `${c.customer_name} ${c.phone}`.toLowerCase().includes("12"));
    expect(matches[0]).toBe(customers[12]);
    expect(onPick).toHaveBeenCalledWith(matches[1]);
  });

  it("the chosen customer is on screen even when it is far down the list", () => {
    act(() => root.render(<CustomerOptionList customers={customers} selectedId="c4321" onPick={() => undefined} />));
    const first = rows()[0];
    expect(first.textContent).toContain("Customer 4321");
    expect(first.getAttribute("aria-selected")).toBe("true");
    expect(rows()).toHaveLength(100);
  });

  it("no match and no customers", () => {
    act(() => root.render(<CustomerOptionList customers={customers} selectedId={null} onPick={() => undefined} />));
    type(host.querySelector("input")!, "zzzz");
    expect(rows()).toHaveLength(0);
    expect(host.textContent).toContain("No customers found.");
    act(() => root.render(<CustomerOptionList customers={undefined} selectedId={null} onPick={() => undefined} />));
    expect(host.textContent).toContain("No customers found.");
  });

  it("extra detail lines are drawn for the rows on screen only", () => {
    const detail = vi.fn((c: { id: string }) => <span>bal {c.id}</span>);
    act(() => root.render(<CustomerOptionList customers={customers} selectedId={null} onPick={() => undefined} renderDetail={detail} />));
    expect(detail).toHaveBeenCalledTimes(100);
  });
});

describe("SearchableSelect with a long list", () => {
  const options = customers.map((c) => ({ value: c.id, label: c.customer_name }));
  const open = () => act(() => (host.querySelector('[role="combobox"]') as HTMLElement).click());
  const items = () => [...document.querySelectorAll('[data-radix-popper-content-wrapper] button')] as HTMLElement[];

  it("draws nothing while closed, then All plus 100 rows, and the search reaches the rest", () => {
    const onChange = vi.fn();
    act(() => root.render(<SearchableSelect value="all" onValueChange={onChange} options={options} allLabel="All Customers" />));
    expect(items()).toHaveLength(0);
    open();
    expect(items()).toHaveLength(101);
    expect(document.body.textContent).toContain("Showing 100 of 5,000. Type to narrow.");

    const input = document.querySelector('[data-radix-popper-content-wrapper] input') as HTMLInputElement;
    type(input, "customer 4999");
    const found = items().filter((b) => b.textContent === "Customer 4999");
    expect(found).toHaveLength(1);
    act(() => found[0].click());
    expect(onChange).toHaveBeenCalledWith("c4999");
  });

  it("shows the chosen option's name on the button and first in the list", () => {
    act(() => root.render(<SearchableSelect value="c4321" onValueChange={() => undefined} options={options} allLabel="All Customers" />));
    expect(host.querySelector('[role="combobox"]')!.textContent).toContain("Customer 4321");
    open();
    expect(items()[1].textContent).toBe("Customer 4321");
  });
});
