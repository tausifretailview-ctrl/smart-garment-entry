/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PosFooterInfo, type PosFooterInfoProps } from "./PosFooterInfo";

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

const base: PosFooterInfoProps = {
  quantity: 4,
  subTotal: 2398,
  discount: 120.5,
  loadedInvoiceTime: null,
  paymentModeLabel: "Cash",
  mrpPriceMode: false,
};
const render = (p: Partial<PosFooterInfoProps> = {}) => act(() => root.render(<div><PosFooterInfo {...base} {...p} /></div>));

describe("PosFooterInfo (moved out of POSSales unchanged)", () => {
  it("shows qty, charges, sub total, discount and payment mode", () => {
    render();
    const t = host.textContent || "";
    expect(t).toContain("4Qty");
    expect(t).toContain("₹0Charges");
    expect(t).toContain("₹2,398.00Sub Total");
    expect(t).toContain("−₹120.50Discount");
    expect(t).toContain("Payment ModeCash");
    expect(t).not.toContain("MRP Price Mode Active");
  });

  it("shows ₹0 discount, the saved bill time, and the MRP mode badge when set", () => {
    render({ discount: 0, loadedInvoiceTime: "11:42 AM", mrpPriceMode: true });
    const t = host.textContent || "";
    expect(t).toContain("₹0Discount");
    expect(t).toContain("Invoice time11:42 AM");
    expect(t).toContain("MRP Price Mode Active");
  });

  it("shows the live clock when no saved bill is loaded", () => {
    render();
    expect(host.textContent).toMatch(/Time\S/);
    expect(host.textContent).not.toContain("Invoice time");
  });
});
