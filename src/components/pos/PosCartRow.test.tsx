/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { CartItem } from "@/lib/posBilling";
import { PosCartRow, type PosCartRowActions, type PosCartRowProps } from "./PosCartRow";
import { posDiscPctLabel, posHiddenMrpGap, posLineDiscountFigures, posLineDiscRsBoxValue } from "./posCartRow";

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

const item: CartItem = {
  id: "line-1",
  barcode: " 100001 ",
  productName: "Shirt",
  size: "M",
  color: "Blue",
  quantity: 2,
  mrp: 1000,
  originalMrp: 1000,
  gstPer: 5,
  discountPercent: 10,
  discountAmount: 0,
  unitCost: 900,
  netAmount: 1800,
  productId: "p1",
  variantId: "v1",
  itemNotes: "Alteration",
  stockQty: 1,
};

function actions(): PosCartRowActions {
  return {
    registerRow: vi.fn(),
    updateQuantity: vi.fn(),
    updateMrp: vi.fn(),
    updateGstPer: vi.fn(),
    updateDiscountPercent: vi.fn(),
    updateDiscountAmount: vi.fn(),
    updateLineSalesman: vi.fn(),
    removeItem: vi.fn(),
    setUnitPriceDraft: vi.fn(),
    requestUnitPriceCommit: vi.fn(),
  };
}

function props(p: Partial<PosCartRowProps> = {}): PosCartRowProps {
  return {
    item,
    index: 0,
    isHighlighted: false,
    gridCols: "1fr",
    showPurchaseCode: false,
    purchaseCode: "",
    perLineSalesman: false,
    lineSalesman: "",
    employees: [
      { id: "e1", employee_name: "Amit" },
      { id: "e2", employee_name: "Ravi" },
    ],
    enableMrp: true,
    taxType: "inclusive",
    canEditUnitPrice: false,
    unitPriceDraft: null,
    actions: actions(),
    ...p,
  };
}
const render = (p: PosCartRowProps) =>
  act(() => root.render(<TooltipProvider><PosCartRow {...p} /></TooltipProvider>));

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
const inputs = () => [...host.querySelectorAll("input")] as HTMLInputElement[];

describe("posCartRow helpers", () => {
  it("line discount: Disc Rs wins, else Disc % of MRP × qty", () => {
    expect(posLineDiscountFigures(item)).toEqual({ listUnit: 1000, lineDiscRs: 200, discPct: 10, hasLineDisc: true });
    expect(posLineDiscountFigures({ ...item, discountAmount: 150 }).lineDiscRs).toBe(150);
    expect(posLineDiscountFigures({ ...item, mrp: 0, discountPercent: 0 })).toEqual({
      listUnit: 900, lineDiscRs: 0, discPct: 0, hasLineDisc: false,
    });
  });
  it("Disc Rs box value and % label", () => {
    expect(posLineDiscRsBoxValue(item)).toBe(200);
    expect(posLineDiscRsBoxValue({ ...item, discountPercent: 0 })).toBe("");
    expect(posLineDiscRsBoxValue({ ...item, discountPercent: 3.333 })).toBe(66.66);
    expect(posDiscPctLabel(10)).toBe("-10%");
    expect(posDiscPctLabel(12.5)).toBe("-12.5%");
  });
  it("hidden-MRP note only when MRP is off, no line discount and MRP > rate", () => {
    expect(posHiddenMrpGap({ mrp: 569, unitCost: 549 }, false, false)).toBe(true);
    expect(posHiddenMrpGap({ mrp: 569, unitCost: 549 }, true, false)).toBe(false);
    expect(posHiddenMrpGap({ mrp: 569, unitCost: 549 }, false, true)).toBe(false);
    expect(posHiddenMrpGap({ mrp: 549, unitCost: 549 }, false, false)).toBe(false);
  });
});

describe("PosCartRow", () => {
  it("shows the line and registers its row element", () => {
    const p = props({ index: 1 });
    render(p);
    const row = host.querySelector("[data-pos-cart-row]") as HTMLElement;
    expect(row.getAttribute("data-pos-cart-row")).toBe("line-1");
    expect(row.className).toContain("bg-red-50/80"); // stock 1, qty 2
    expect(p.actions.registerRow).toHaveBeenCalledWith("line-1", row);
    const text = row.textContent || "";
    expect(text).toContain("2"); // Sr
    expect(text).toContain("100001");
    expect(text).toContain("Shirt");
    expect(text).toContain("Alteration");
    expect(text).toContain("₹1,000.00"); // list rate (line discount, no rate edit)
    expect(text).toContain("-10%");
  });

  it("routes each box to its action with the line index", () => {
    const p = props({ index: 3 });
    render(p);
    const [qty, mrp, disc, discRs] = inputs();
    expect(mrp.value).toBe("1000");
    expect(disc.value).toBe("10");
    expect(discRs.value).toBe("200");
    setValue(mrp, "1200");
    expect(p.actions.updateMrp).toHaveBeenCalledWith(3, 1200);
    setValue(disc, "15");
    expect(p.actions.updateDiscountPercent).toHaveBeenCalledWith(3, 15);
    setValue(discRs, "50");
    expect(p.actions.updateDiscountAmount).toHaveBeenCalledWith(3, 50);
    setValue(host.querySelector("select") as HTMLSelectElement, "12");
    expect(p.actions.updateGstPer).toHaveBeenCalledWith(3, 12);
    act(() => (host.querySelector('button[aria-label="Remove line"]') as HTMLButtonElement).click());
    expect(p.actions.removeItem).toHaveBeenCalledWith(3);
    expect(qty).toBeTruthy();
  });

  it("no GST: the GST list shows 0% and is disabled", () => {
    render(props({ taxType: "no_gst" }));
    const gst = host.querySelector("select") as HTMLSelectElement;
    expect(gst.value).toBe("0");
    expect(gst.disabled).toBe(true);
  });

  it("line salesman list falls back to the given name and passes changes", () => {
    const p = props({ perLineSalesman: true, lineSalesman: "Amit", index: 2 });
    render(p);
    const sel = host.querySelector("select.pos-sales-line-salesman-select") as HTMLSelectElement;
    expect(sel.value).toBe("Amit");
    setValue(sel, "Ravi");
    expect(p.actions.updateLineSalesman).toHaveBeenCalledWith(2, "Ravi");
  });

  it("purchase code column and the hidden-MRP note", () => {
    render(props({ showPurchaseCode: true, purchaseCode: "AB/12", enableMrp: false, item: { ...item, discountPercent: 0, mrp: 569, unitCost: 549 } }));
    expect(host.textContent).toContain("AB/12");
    expect(host.textContent).toContain("MRP ₹569.00");
    expect(host.textContent).toContain("₹549.00");
  });

  it("editable rate: focus starts a draft, Enter commits it", () => {
    const p = props({ canEditUnitPrice: true, index: 4 });
    render(p);
    const rate = inputs().find((i) => i.title.startsWith("Selling unit price"))!;
    act(() => rate.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
    expect(p.actions.setUnitPriceDraft).toHaveBeenCalledWith({ index: 4, value: "900" });
    render({ ...p, unitPriceDraft: "850" }); // parent stores the draft
    expect(rate.value).toBe("850");
    act(() => rate.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(p.actions.requestUnitPriceCommit).toHaveBeenCalledWith(4, 850);
  });
});
