/** @vitest-environment jsdom */
import React, { act } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Table, TableBody } from "@/components/ui/table";
import {
  PurchaseLineRow,
  PurchaseLinesTableHeader,
  type PurchaseLineRowItem,
  type PurchaseLineRowProps,
} from "./PurchaseLineRow";

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

const item: PurchaseLineRowItem = {
  temp_id: "t1",
  product_name: "SHIRT",
  style: "SLIM",
  color: "BLUE",
  brand: "-",
  size: "M",
  qty: 3,
  pur_price: 250,
  sale_price: 499,
  mrp: 599,
  gst_per: 5,
  barcode: "100001",
  discount_percent: 10,
  line_total: 675,
};

function props(over: Partial<PurchaseLineRowProps<PurchaseLineRowItem>> = {}): PurchaseLineRowProps<PurchaseLineRowItem> {
  return {
    item,
    index: 0,
    selected: false,
    updated: false,
    isMobileERPMode: false,
    imeiEditable: false,
    selectQtyOnFocus: false,
    showSize: true,
    showMrp: true,
    showGst: true,
    showDiscPercent: true,
    onToggleSelect: vi.fn(),
    onUpdate: vi.fn(),
    onRemove: vi.fn(),
    onOpenEdit: vi.fn(),
    onImeiCorrection: vi.fn(),
    ...over,
  };
}

const render = (p: PurchaseLineRowProps<PurchaseLineRowItem>) =>
  act(() =>
    root.render(
      <Table>
        <TableBody>
          <PurchaseLineRow {...p} />
        </TableBody>
      </Table>,
    ),
  );
const cells = () => [...host.querySelectorAll("td")];
const q = <T extends Element>(sel: string) => host.querySelector(sel) as T;

describe("PurchaseLineRow", () => {
  it("shows SR no, description, size, barcode, sub total and total", () => {
    render(props({ index: 4 }));
    const text = cells().map((c) => c.textContent?.trim());
    expect(text[1]).toBe("5");
    expect(text[2]).toBe("SHIRT-SLIM-BLUE");
    expect(text[3]).toBe("M");
    expect(text[4]).toBe("100001");
    expect(text).toContain("₹750.00"); // 3 × 250
    expect(text).toContain("₹675.00");
    expect(cells().length).toBe(15);
  });

  it("hidden columns drop their cells", () => {
    render(props({ showSize: false, showMrp: false, showGst: false, showDiscPercent: false }));
    expect(cells().length).toBe(11);
  });

  it("print tick, remove, edit and double-click on the item", () => {
    const p = props({ index: 2 });
    render(p);
    act(() => q<HTMLButtonElement>('button[role="checkbox"]').click());
    expect(p.onToggleSelect).toHaveBeenCalledWith("t1");
    act(() => q<HTMLButtonElement>('button[title="Remove line"]').click());
    expect(p.onRemove).toHaveBeenCalledWith("t1");
    act(() => q<HTMLButtonElement>('button[title="Edit Product Details"]').click());
    expect(p.onOpenEdit).toHaveBeenCalledWith(2);
    act(() => cells()[2].dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(p.onOpenEdit).toHaveBeenCalledWith(2, "product_name");
  });

  it("typing disc % reports a number", () => {
    const p = props();
    render(p);
    const input = q<HTMLInputElement>('input[type="number"][max="100"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(input, "12.5");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(p.onUpdate).toHaveBeenCalledWith("t1", "discount_percent", 12.5);
  });

  it("barcode warning: amber inside the bill, red for another bill", () => {
    render(props({ barcodeWarning: "Duplicate barcode in this bill (line 3)" }));
    expect(host.textContent).toContain("Duplicate barcode in this bill (line 3)");
    expect(host.querySelector(".text-amber-700")).not.toBeNull();
    render(props({ barcodeWarning: "Barcode already used by JEANS" }));
    expect(host.querySelector(".text-destructive.bg-destructive\\/10")).not.toBeNull();
  });

  it("Mobile ERP with IMEI edit: an input that reports the IMEI on blur", () => {
    const p = props({ isMobileERPMode: true, imeiEditable: true });
    render(p);
    const input = q<HTMLInputElement>('input[placeholder="IMEI..."]');
    expect(input.value).toBe("100001");
    act(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(p.onImeiCorrection).toHaveBeenCalledWith(item, "100001");
  });

  it("green tick after the edit panel saved the line", () => {
    render(props({ updated: true }));
    expect(host.textContent).toContain("✓");
  });
});

describe("PurchaseLinesTableHeader", () => {
  it("select-all tick reflects the selection and toggles", () => {
    const onToggleAll = vi.fn();
    const cols = { showSize: true, showMrp: false, showGst: true, showDiscPercent: false };
    act(() =>
      root.render(
        <Table>
          <PurchaseLinesTableHeader allSelected={false} onToggleAll={onToggleAll} isMobileERPMode={false} {...cols} />
        </Table>,
      ),
    );
    const box = q<HTMLInputElement>('input[type="checkbox"]');
    expect(box.checked).toBe(false);
    act(() => box.click());
    expect(onToggleAll).toHaveBeenCalledTimes(1);
    expect([...host.querySelectorAll("th")].map((t) => t.textContent)).toEqual([
      "", "SR.NO", "ITEM NAME", "SIZE", "BARCODE", "QTY", "PUR.RATE", "SALE.RATE", "GST %", "SUB TOTAL", "TOTAL", "", "Action",
    ]);
    act(() =>
      root.render(
        <Table>
          <PurchaseLinesTableHeader allSelected onToggleAll={onToggleAll} isMobileERPMode {...cols} />
        </Table>,
      ),
    );
    expect(q<HTMLInputElement>('input[type="checkbox"]').checked).toBe(true);
    expect(host.textContent).toContain("IMEI / BARCODE");
  });
});

describe("PurchaseEntry lines table", () => {
  const src = readFileSync(resolve(__dirname, "../../pages/PurchaseEntry.tsx"), "utf8");
  it("rows get stable handlers so memo skips unchanged lines", () => {
    expect(src).toContain("onToggleSelect={toggleItemSelection}");
    expect(src).toContain("onUpdate={updateLineItemStable}");
    expect(src).toContain("onRemove={removeLineItemStable}");
    expect(src).toContain("onOpenEdit={openEditPanel}");
    expect(src).toContain("onImeiCorrection={handleImeiCorrectionStable}");
    expect(src).toMatch(/const toggleItemSelection = useCallback\(/);
  });
  it("select-all tick reads the real selection (old code read a DOM id that never existed)", () => {
    expect(src).not.toContain("document.getElementById(`check-${i}`)");
    expect(src).toContain("onToggleAll={toggleSelectAllStable}");
  });
});
