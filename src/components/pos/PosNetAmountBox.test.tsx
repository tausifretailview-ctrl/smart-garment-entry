/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PosNetAmountBox, type PosNetAmountBoxProps } from "./PosNetAmountBox";
import { posNetAmountBoxValue, posNetAmountFromTyped, posNetAmountLabel } from "./posNetAmount";

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

const base: PosNetAmountBoxProps = {
  finalAmount: 2278,
  exchangeRefundDue: 0,
  totalBillAdvance: 0,
  posTenderDue: 2278,
  showToCollect: false,
  enableMrp: false,
  mrp: 2398,
  effectiveDiscountPercent: 5,
  onFinalAmountChange: () => {},
};
const render = (p: Partial<PosNetAmountBoxProps> = {}) =>
  act(() => root.render(<PosNetAmountBox {...base} {...p} />));
const input = () => host.querySelector("input") as HTMLInputElement;

/** React listens for the native input event; set the value through the prototype setter. */
function typeInto(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("posNetAmount helpers", () => {
  it("labels refund, to-collect and net", () => {
    expect(posNetAmountLabel(-10, 0, false)).toBe("Refund Due");
    expect(posNetAmountLabel(100, 50, true)).toBe("Refund Due");
    expect(posNetAmountLabel(100, 0, true)).toBe("To Collect");
    expect(posNetAmountLabel(100, 0, false)).toBe("Net Amount");
  });

  it("shows the refund, the amount left to collect, or the net", () => {
    expect(posNetAmountBoxValue(-120.4, 0, false, 0)).toBe(120);
    expect(posNetAmountBoxValue(0, 75.6, false, 0)).toBe(76);
    expect(posNetAmountBoxValue(1000, 0, true, 400)).toBe(400);
    expect(posNetAmountBoxValue(999.5, 0, false, 999.5)).toBe(1000);
  });

  it("adds the advance back to what was typed only in To Collect mode", () => {
    expect(posNetAmountFromTyped("400", true, 600)).toBe(1000);
    expect(posNetAmountFromTyped("400", false, 600)).toBe(400);
    expect(posNetAmountFromTyped("", false, 0)).toBe(0);
  });
});

describe("PosNetAmountBox", () => {
  it("shows Net Amount and passes the typed figure as the bill net", () => {
    const onFinalAmountChange = vi.fn();
    render({ onFinalAmountChange });
    expect(host.textContent).toContain("Net Amount");
    expect(input().value).toBe("2278");
    expect(input().readOnly).toBe(false);
    expect(host.textContent).not.toContain("MRP ₹");
    expect(host.textContent).not.toContain("% off");
    typeInto(input(), "2200");
    expect(onFinalAmountChange).toHaveBeenCalledWith(2200);
  });

  it("with an advance shows To Collect and still sets the bill total", () => {
    const onFinalAmountChange = vi.fn();
    render({ finalAmount: 1000, totalBillAdvance: 600, posTenderDue: 400, showToCollect: true, onFinalAmountChange });
    expect(host.textContent).toContain("To Collect");
    expect(input().value).toBe("400");
    expect(host.textContent).toContain("Bill ₹1,000 − Adv ₹600");
    typeInto(input(), "300");
    expect(onFinalAmountChange).toHaveBeenCalledWith(900);
  });

  it("shows Refund Due read-only in orange", () => {
    render({ finalAmount: -150, posTenderDue: 0 });
    expect(host.textContent).toContain("Refund Due");
    expect(input().value).toBe("150");
    expect(input().readOnly).toBe(true);
    expect(input().className).toContain("text-orange-600");
  });

  it("shows the MRP strike-through and % off when MRP is on", () => {
    render({ enableMrp: true });
    expect(host.textContent).toContain("MRP ₹2,398.00");
    expect(host.textContent).toContain("↓ 5.0% off");
    render({ enableMrp: true, mrp: 2278 });
    expect(host.textContent).not.toContain("MRP ₹");
  });
});
