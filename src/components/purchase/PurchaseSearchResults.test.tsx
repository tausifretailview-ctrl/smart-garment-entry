/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatProductDescription } from "@/utils/purchaseProductDescription";
import { PurchaseInlineSearchMenu, PurchaseMobileSearchResults, type PurchaseSearchRow } from "./PurchaseSearchResults";

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

const rows: PurchaseSearchRow[] = [
  {
    id: "a", product_name: "Shirt", brand: "Arrow", category: "Shirts", style: "Slim", color: "Blue",
    size_range: "S-XL", groupedVariantCount: 4, groupedMrpTierCount: 2,
    mrp: 1299, pur_price: 600, sale_price: 999, mrpMin: 1199, mrpMax: 1299,
  },
  { id: "b", product_name: "Tee", brand: "", category: "", style: "-", color: "-", mrp: 499, pur_price: 200, sale_price: 399 },
];

describe("formatProductDescription", () => {
  it("joins the set parts, skipping blank and '-'", () => {
    expect(formatProductDescription({ product_name: "Shirt", style: "Slim", color: "Blue", brand: "Arrow", category: "Shirts" }))
      .toBe("Shirt-Slim-Blue-Arrow-Shirts");
    expect(formatProductDescription({ product_name: "Tee", style: "-", color: " ", brand: null })).toBe("Tee");
  });
});

describe("PurchaseMobileSearchResults", () => {
  it("shows chips, size range, counts and rates; picks a row", () => {
    const onSelect = vi.fn();
    act(() => root.render(<PurchaseMobileSearchResults results={rows} onSelect={onSelect} />));
    const text = host.textContent || "";
    expect(text).toContain("Shirt");
    expect(text).toContain("Arrow");
    expect(text).toContain("S-XL");
    expect(text).toContain("4 sizes");
    expect(text).toContain("2 MRP");
    expect(text).toMatch(/Buy: .*600/);
    expect(text).toMatch(/MRP: .*1,?199.*1,?299/);
    expect(text).not.toContain("-Tee"); // "-" colour chip hidden
    act(() => (host.querySelectorAll("button")[1] as HTMLButtonElement).click());
    expect(onSelect).toHaveBeenCalledWith(rows[1]);
  });
});

describe("PurchaseInlineSearchMenu", () => {
  const anchor = () => {
    const el = document.createElement("input");
    document.body.appendChild(el);
    return el;
  };
  function props(p: Partial<React.ComponentProps<typeof PurchaseInlineSearchMenu<PurchaseSearchRow>>> = {}) {
    return {
      anchor: anchor(),
      query: "sh",
      results: rows,
      displayLimit: 100,
      onLoadMore: vi.fn(),
      selectedIndex: 0,
      onHoverIndex: vi.fn(),
      onSelect: vi.fn(),
      onAddNew: vi.fn(),
      ...p,
    };
  }
  const menuButtons = () => [...document.body.querySelectorAll("div[style*='fixed'] button")] as HTMLButtonElement[];

  it("lists rows with the description and rates; the selected row is highlighted; picks and adds", () => {
    const p = props();
    act(() => root.render(<PurchaseInlineSearchMenu {...p} />));
    const text = document.body.textContent || "";
    expect(text).toContain("Shirt-Slim-Blue-Arrow-Shirts");
    expect(text).toMatch(/Pur: .*600/);
    const [first, second, addNew] = menuButtons();
    expect(first.className).toContain("bg-primary");
    act(() => second.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(p.onHoverIndex).toHaveBeenCalledWith(1);
    act(() => second.click());
    expect(p.onSelect).toHaveBeenCalledWith(rows[1]);
    expect(addNew.textContent).toContain("Add New Product");
    act(() => addNew.click());
    expect(p.onAddNew).toHaveBeenCalledTimes(1);
  });

  it("more results than the limit: count line and Load More", () => {
    const p = props({ displayLimit: 1 });
    act(() => root.render(<PurchaseInlineSearchMenu {...p} />));
    expect(document.body.textContent).toContain("Showing 1 of 2 results");
    const more = menuButtons().find((b) => b.textContent === "Load More")!;
    act(() => more.click());
    expect(p.onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("no matches: says so and still offers Add New Product; nothing for an empty query", () => {
    act(() => root.render(<PurchaseInlineSearchMenu {...props({ results: [], query: "zzz" })} />));
    expect(document.body.textContent).toContain('No products found for "zzz"');
    expect(menuButtons().some((b) => b.textContent?.includes("Add New Product"))).toBe(true);
    act(() => root.render(<PurchaseInlineSearchMenu {...props({ results: [], query: "" })} />));
    expect(menuButtons()).toHaveLength(0);
  });
});

import { PurchaseToolbarSearchDropdown } from "./PurchaseSearchResults";

describe("PurchaseToolbarSearchDropdown", () => {
  const withIds = rows.map((r, i) => ({ ...r, product_id: `p${i}` }));
  it("highlights the selected row, picks a row, and adds all variants without picking", () => {
    const onSelect = vi.fn();
    const onAddAllVariants = vi.fn();
    const onHoverIndex = vi.fn();
    act(() =>
      root.render(
        <PurchaseToolbarSearchDropdown
          results={withIds}
          selectedIndex={1}
          onHoverIndex={onHoverIndex}
          onSelect={onSelect}
          onAddAllVariants={onAddAllVariants}
        />,
      ),
    );
    const rowsEls = [...host.querySelectorAll(".purchase-search-dropdown > div")] as HTMLElement[];
    expect(rowsEls).toHaveLength(2);
    expect(rowsEls[1].className).toContain("bg-accent");
    expect(rowsEls[0].textContent).toContain("S-XL");
    expect(rowsEls[0].textContent).toMatch(/MRP: .*1,?199/);
    act(() => rowsEls[0].dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(onHoverIndex).toHaveBeenCalledWith(0);
    const [pick0, all0] = [...rowsEls[0].querySelectorAll("button")] as HTMLButtonElement[];
    act(() => all0.click());
    expect(onAddAllVariants).toHaveBeenCalledWith(withIds[0]);
    expect(onSelect).not.toHaveBeenCalled();
    act(() => pick0.click());
    expect(onSelect).toHaveBeenCalledWith(withIds[0]);
  });
});
