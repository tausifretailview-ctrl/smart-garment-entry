/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const warning = vi.fn();
vi.mock("sonner", () => ({ toast: { warning: (...a: unknown[]) => warning(...a) } }));

import { PosFlatDiscountField, type PosFlatDiscountFieldProps } from "./PosFlatDiscountField";
import { PosRoundOffField, type PosRoundOffFieldProps } from "./PosRoundOffField";
import { parseFlatDiscountTyped, resolveFlatDiscountOnBlur } from "./posFlatDiscount";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  warning.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const input = () => host.querySelector("input") as HTMLInputElement;
function typeInto(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const blur = (el: HTMLElement) => act(() => el.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
const button = () => host.querySelector("button") as HTMLButtonElement;

describe("posFlatDiscount helpers", () => {
  it("parses typing: blank is 0, junk ignored, numbers whole", () => {
    expect(parseFlatDiscountTyped("")).toBe(0);
    expect(parseFlatDiscountTyped("-")).toBe(0);
    expect(parseFlatDiscountTyped("abc")).toBeNull();
    expect(parseFlatDiscountTyped("12.6")).toBe(13);
  });

  it("caps a ₹ discount at what the bill allows", () => {
    const r = resolveFlatDiscountOnBlur({
      value: 900, mode: "amount", maxFlatDiscountForGross: 499.6, flatDiscountCapped: false, mrp: 1000, saleReturnAdjust: 0,
    });
    expect(r.next).toBe(500);
    expect(r.warning).toBe("Only ₹500 discount can be applied to this bill");
  });

  it("turns a capped % into the percent of (MRP − S/R) that gives the cap", () => {
    const r = resolveFlatDiscountOnBlur({
      value: 80, mode: "percent", maxFlatDiscountForGross: 300, flatDiscountCapped: true, mrp: 1000, saleReturnAdjust: 200,
    });
    expect(r.next).toBe(38); // 300 / 800 = 37.5 %
    expect(r.warning).toMatch(/^Only ₹[\d,]+ discount can be applied to this bill$/);
  });

  it("leaves an allowed discount alone", () => {
    expect(
      resolveFlatDiscountOnBlur({
        value: 10, mode: "percent", maxFlatDiscountForGross: 300, flatDiscountCapped: false, mrp: 1000, saleReturnAdjust: 0,
      }),
    ).toEqual({ next: 10, warning: null });
  });
});

const flatBase: PosFlatDiscountFieldProps = {
  mode: "percent",
  value: 0,
  maxFlatDiscountForGross: 500,
  flatDiscountCapped: false,
  mrp: 1000,
  saleReturnAdjust: 0,
  onModeChange: () => {},
  onValueChange: () => {},
  onValueCommit: () => {},
};

describe("PosFlatDiscountField", () => {
  it("toggles %/₹, passes typing and commits on leaving the box", () => {
    const onModeChange = vi.fn();
    const onValueChange = vi.fn();
    const onValueCommit = vi.fn();
    act(() => root.render(<PosFlatDiscountField {...flatBase} onModeChange={onModeChange} onValueChange={onValueChange} onValueCommit={onValueCommit} />));
    expect(host.textContent).toContain("Flat Disc");
    expect(button().textContent).toBe("%");
    expect(input().value).toBe("");
    act(() => button().click());
    expect(onModeChange).toHaveBeenCalledWith("amount");
    typeInto(input(), "12");
    expect(onValueChange).toHaveBeenCalledWith(12);
    act(() => root.render(<PosFlatDiscountField {...flatBase} value={12} onValueCommit={onValueCommit} />));
    blur(input());
    expect(onValueCommit).toHaveBeenCalledWith(12);
    expect(warning).not.toHaveBeenCalled();
  });

  it("₹ mode over the cap warns and commits the cap", () => {
    const onValueCommit = vi.fn();
    act(() => root.render(<PosFlatDiscountField {...flatBase} mode="amount" value={800} onValueCommit={onValueCommit} />));
    expect(button().textContent).toBe("₹");
    expect(input().max).toBe("500");
    blur(input());
    expect(warning).toHaveBeenCalledWith("Only ₹500 discount can be applied to this bill");
    expect(onValueCommit).toHaveBeenCalledWith(500);
  });

  it("shows the cap note when the discount is capped", () => {
    act(() => root.render(<PosFlatDiscountField {...flatBase} flatDiscountCapped />));
    expect(host.textContent).toMatch(/Only ₹[\d,]+ discount can be applied to this bill/);
  });
});

const roundBase: PosRoundOffFieldProps = {
  roundOff: 0.4,
  isManualRoundOff: false,
  onRoundOffChange: () => {},
  onReset: () => {},
};

describe("PosRoundOffField", () => {
  it("shows auto round-off in green, no (M) and no reset", () => {
    act(() => root.render(<PosRoundOffField {...roundBase} />));
    expect(host.textContent).toContain("Round");
    expect(host.textContent).not.toContain("(M)");
    expect(input().value).toBe("0.4");
    expect(input().className).toContain("bg-green-100");
    expect(host.querySelector("button")).toBeNull();
  });

  it("keeps the typed text while typing, then shows the stored value after leaving", () => {
    const onRoundOffChange = vi.fn();
    act(() => root.render(<PosRoundOffField {...roundBase} roundOff={-0.4} isManualRoundOff onRoundOffChange={onRoundOffChange} />));
    typeInto(input(), "-1");
    expect(onRoundOffChange).toHaveBeenCalledWith(-1);
    // The stored value is still -0.4 (the parent snaps it); the box keeps what was typed.
    expect(input().value).toBe("-1");
    expect(input().className).toContain("bg-red-100");
    blur(input());
    expect(input().value).toBe("-0.4");
  });

  it("manual: shows (M) and the reset button", () => {
    const onReset = vi.fn();
    act(() => root.render(<PosRoundOffField {...roundBase} isManualRoundOff onReset={onReset} />));
    expect(host.textContent).toContain("(M)");
    act(() => button().click());
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
