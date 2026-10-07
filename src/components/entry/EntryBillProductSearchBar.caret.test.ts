/**
 * @vitest-environment jsdom
 */
import { createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EntryBillProductSearchBar } from "./EntryBillProductSearchBar";

const here = dirname(fileURLToPath(import.meta.url));
const bar = readFileSync(resolve(here, "./EntryBillProductSearchBar.tsx"), "utf8");

function Harness() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  return createElement(EntryBillProductSearchBar, {
    entryMode: "grid",
    onEntryModeChange: () => {},
    openProductSearch: open,
    onOpenProductSearchChange: setOpen,
    searchInput: search,
    onSearchInputChange: setSearch,
    isProductSearching: false,
    displaySearchCount: 0,
    displayLimit: 20,
    onDisplayLimitIncrease: () => {},
    productSearchGroups: [],
    popoverSearchResults: [],
    onSelectGroup: () => {},
    onSelectResult: () => {},
    barcodeValue: "",
    onBarcodeValueChange: () => {},
    onBarcodeKeyDown: () => {},
    onBarcodeScanned: () => {},
    noStockRestriction: true,
    barcodeAutoFocus: false,
  });
}

describe("product search bar shows a text caret", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    if (typeof globalThis.ResizeObserver === "undefined") {
      globalThis.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it("types in the visible search field and keeps focus there when the list opens", () => {
    expect(bar).not.toContain("readOnly");
    expect(bar).toContain("onOpenAutoFocus={(e) => e.preventDefault()}");
    expect(bar).not.toMatch(/productSearchInputRef[\s\S]{0,400}autoFocus/);

    act(() => {
      root.render(createElement(Harness));
    });

    const search = container.querySelector(
      'input[placeholder="Search Products (No Stock Restriction)"]',
    ) as HTMLInputElement | null;
    expect(search).toBeTruthy();
    expect(search!.readOnly).toBe(false);
    expect(search!.className).toContain("cursor-text");
    expect(search!.className).toContain("caret-current");
    expect(document.activeElement).not.toBe(search);

    act(() => {
      search!.focus();
    });

    expect(document.activeElement).toBe(search);
    expect(search!.readOnly).toBe(false);
    expect(document.querySelector('[placeholder="Search by name, barcode, brand, color, size..."]')).toBeTruthy();

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(search, "SHOE");
      search!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(document.activeElement).toBe(search);
    expect(search!.value).toBe("SHOE");
  });
});
