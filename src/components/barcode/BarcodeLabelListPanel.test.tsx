/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LabelItem } from "@/types/labelTypes";
import { BarcodeLabelListPanel } from "./BarcodeLabelListPanel";

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

const item = (over: Partial<LabelItem>) =>
  ({ sku_id: "v1", product_name: "SHIRT", size: "M", sale_price: 999, mrp: 1299, barcode: "100001", qty: 2, supplier_code: "", ...over }) as LabelItem;

describe("BarcodeLabelListPanel", () => {
  it("counts, rows, DUP badge on shared barcodes, MRP column on request", () => {
    act(() =>
      root.render(
        <BarcodeLabelListPanel
          items={[item({}), item({ sku_id: "v2", size: "L" }), item({ sku_id: "v3", barcode: "", product_name: "BELT", brand: "ACME" })]}
          totalLabelQty={6}
          showMrpColumn
          onClearAll={vi.fn()}
          onQtyChange={vi.fn()}
          onRemove={vi.fn()}
        />,
      ),
    );
    expect(host.textContent).toContain("Products: 3");
    expect(host.textContent).toContain("Labels: 6");
    const rows = [...host.querySelectorAll("tbody tr")];
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("DUP");
    expect(rows[1].textContent).toContain("DUP");
    expect(rows[2].textContent).not.toContain("DUP");
    expect(rows[2].textContent).toContain("BELT-ACME");
    expect(rows[2].textContent).toContain("(auto-gen)");
    expect(rows[0].textContent).toContain("₹1299");
  });

  it("qty, remove and Clear All report back", () => {
    const p = { onClearAll: vi.fn(), onQtyChange: vi.fn(), onRemove: vi.fn() };
    act(() => root.render(<BarcodeLabelListPanel items={[item({})]} totalLabelQty={2} showMrpColumn={false} {...p} />));
    expect(host.textContent).not.toContain("₹1299");
    const input = host.querySelector('input[type="number"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(input, "5");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(p.onQtyChange).toHaveBeenCalledWith("v1", 5);
    act(() => (host.querySelector('button[title="Remove from the print list"]') as HTMLButtonElement).click());
    expect(p.onRemove).toHaveBeenCalledWith("v1");
    act(() => (host.querySelector('button[title="Remove all products from the print list"]') as HTMLButtonElement).click());
    expect(p.onClearAll).toHaveBeenCalledTimes(1);
  });
});
