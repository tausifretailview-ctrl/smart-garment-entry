/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const warning = vi.fn();
vi.mock("sonner", () => ({ toast: { warning: (...a: unknown[]) => warning(...a) } }));

import { PosSrAdjustField, type PosSrAdjustFieldProps } from "./PosSrAdjustField";
import { resolveSrAdjustOnBlur, srAdjustTyped, srOverBillPrompt } from "./posSrAdjust";

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
const buttonText = (text: string) =>
  [...host.querySelectorAll("button")].find((b) => (b.textContent || "").includes(text)) as HTMLButtonElement | undefined;

describe("srAdjustTyped", () => {
  it("clears on blank, ignores junk, marks walk-in over-bill as exchange", () => {
    expect(srAdjustTyped("", false, 500)).toEqual({ kind: "clear" });
    expect(srAdjustTyped("-", true, 500)).toEqual({ kind: "clear" });
    expect(srAdjustTyped("x", false, 500)).toBeNull();
    expect(srAdjustTyped("300", false, 500)).toEqual({ kind: "set", adjust: 300, raiseGrossTo: null });
    expect(srAdjustTyped("700", false, 500)).toEqual({ kind: "set", adjust: 700, raiseGrossTo: 700 });
    expect(srAdjustTyped("700", true, 500)).toEqual({ kind: "set", adjust: 700, raiseGrossTo: null });
  });
});

describe("srOverBillPrompt (named customer, S/R above the bill)", () => {
  it("is null when the amount fits the bill or nothing is billed yet", () => {
    expect(srOverBillPrompt({ requested: 500, maxSrFromBill: 500, availableSrCredit: 0 })).toBeNull();
    expect(srOverBillPrompt({ requested: 500.004, maxSrFromBill: 500, availableSrCredit: 0 })).toBeNull();
    expect(srOverBillPrompt({ requested: 800, maxSrFromBill: 0, availableSrCredit: 800 })).toBeNull();
  });
  it("splits the amount into what to record and what to refund", () => {
    expect(srOverBillPrompt({ requested: 2400, maxSrFromBill: 1300, availableSrCredit: 2400 })).toEqual({
      requested: 2400, shortfall: 0, refundDue: 1100,
    });
    expect(srOverBillPrompt({ requested: 2400, maxSrFromBill: 1300, availableSrCredit: 1300 })).toEqual({
      requested: 2400, shortfall: 1100, refundDue: 1100,
    });
    expect(srOverBillPrompt({ requested: 2400, maxSrFromBill: 1300, availableSrCredit: 0 })).toEqual({
      requested: 2400, shortfall: 2400, refundDue: 1100,
    });
  });
});

describe("resolveSrAdjustOnBlur", () => {
  const base = { hasCustomer: true, sameBillReturnGross: 0, maxSrFromBill: 500, availableSrCredit: 200 };
  it("≤ 0 clears", () => {
    expect(resolveSrAdjustOnBlur({ ...base, requested: 0 })).toEqual({ kind: "clear" });
  });
  it("keeps a same-bill exchange or a walk-in over-bill return whole", () => {
    expect(resolveSrAdjustOnBlur({ ...base, sameBillReturnGross: 900, requested: 900 })).toEqual({ kind: "exchange", amount: 900 });
    expect(resolveSrAdjustOnBlur({ ...base, hasCustomer: false, requested: 700 })).toEqual({ kind: "exchange", amount: 700 });
  });
  it("named customer over the bill: asks about the refund, and records what no credit note backs", () => {
    // Credit 200, bill 500, typed 800: 600 to record, 300 to refund. Nothing is cut silently.
    expect(resolveSrAdjustOnBlur({ ...base, requested: 800 })).toEqual({
      kind: "credit",
      forBill: 500,
      capWarning: null,
      prompt: { requested: 800, shortfall: 600, refundDue: 300 },
    });
  });
  it("named customer over the bill with enough saved credit: refund prompt, nothing to record", () => {
    // The shop's case the other way round: credit 2400, bill 1300 → refund 1100.
    expect(
      resolveSrAdjustOnBlur({ ...base, maxSrFromBill: 1300, availableSrCredit: 2400, requested: 2400 }),
    ).toEqual({
      kind: "credit",
      forBill: 1300,
      capWarning: null,
      prompt: { requested: 2400, shortfall: 0, refundDue: 1100 },
    });
  });
  it("the shop's photo: credit 1300, bill 1300, typed 2400 → record 1100 and refund 1100", () => {
    expect(
      resolveSrAdjustOnBlur({ ...base, maxSrFromBill: 1300, availableSrCredit: 1300, requested: 2400 }),
    ).toEqual({
      kind: "credit",
      forBill: 1300,
      capWarning: null,
      prompt: { requested: 2400, shortfall: 1100, refundDue: 1100 },
    });
  });
  it("named customer, nothing billed yet: no refund prompt, the amount is dropped with a note", () => {
    expect(resolveSrAdjustOnBlur({ ...base, maxSrFromBill: 0, requested: 800 })).toEqual({
      kind: "credit",
      forBill: 0,
      capWarning: "Add the items first: S/R is adjusted against the bill",
      prompt: null,
    });
  });
  it("named customer within the bill but above the credit: asks to record the missing part", () => {
    expect(resolveSrAdjustOnBlur({ ...base, requested: 350 })).toEqual({
      kind: "credit",
      forBill: 350,
      capWarning: null,
      prompt: { requested: 350, shortfall: 150, refundDue: 0 },
    });
  });
  it("named customer within credit: applies without warning or prompt", () => {
    expect(resolveSrAdjustOnBlur({ ...base, requested: 150 })).toEqual({
      kind: "credit", forBill: 150, capWarning: null, prompt: null,
    });
  });
  it("walk-in within the bill: applies as typed", () => {
    expect(resolveSrAdjustOnBlur({ ...base, hasCustomer: false, availableSrCredit: 0, requested: 300 })).toEqual({
      kind: "credit", forBill: 300, capWarning: null, prompt: null,
    });
  });
});

function props(p: Partial<PosSrAdjustFieldProps> = {}): PosSrAdjustFieldProps {
  return {
    hasCustomer: true,
    saleReturnAdjust: 0,
    sameBillReturnGross: 0,
    availableSrCredit: 200,
    maxSrAllowed: 200,
    maxSrFromBill: 500,
    isSameBillExchangeSr: false,
    exchangeRefundDue: 0,
    exchangeSrApplied: 0,
    pendingCredits: [{ id: "c1", return_number: "SR/1", net_amount: 200 }],
    recentAdjustedCredits: [],
    setSaleReturnAdjust: vi.fn(),
    setSameBillReturnGross: vi.fn(),
    setManualSrPrompt: vi.fn(),
    onClampSaleReturnAdjust: vi.fn(),
    onOpenAdjustedBill: vi.fn(),
    ...p,
  };
}

describe("PosSrAdjustField", () => {
  it("shows the customer's CN and Use CN, which applies it silently", () => {
    const p = props();
    act(() => root.render(<PosSrAdjustField {...p} />));
    expect(host.textContent).toContain("S/R Adj · CN ₹200");
    const use = buttonText("Use CN ₹200");
    expect(use).toBeTruthy();
    act(() => use!.click());
    expect(p.onClampSaleReturnAdjust).toHaveBeenCalledWith(200, { silent: true });
  });

  it("typing sets S/R; leaving with more than the credit asks to record the missing part", () => {
    const p = props();
    act(() => root.render(<PosSrAdjustField {...p} />));
    typeInto(input(), "350");
    expect(p.setSaleReturnAdjust).toHaveBeenCalledWith(350);
    act(() => root.render(<PosSrAdjustField {...p} saleReturnAdjust={350} />)); // parent stores it
    blur(input());
    expect(p.setManualSrPrompt).toHaveBeenCalledWith({ requested: 350, shortfall: 150, refundDue: 0 });
    expect(p.onClampSaleReturnAdjust).not.toHaveBeenCalled();
  });

  it("over the bill asks about the refund and leaves the typed amount in the box meanwhile", () => {
    const p = props();
    act(() => root.render(<PosSrAdjustField {...p} />));
    typeInto(input(), "800");
    act(() => root.render(<PosSrAdjustField {...p} saleReturnAdjust={800} />));
    blur(input());
    expect(warning).not.toHaveBeenCalled();
    expect(p.setSaleReturnAdjust).toHaveBeenLastCalledWith(800);
    expect(p.setManualSrPrompt).toHaveBeenCalledWith({ requested: 800, shortfall: 600, refundDue: 300 });
    expect(p.onClampSaleReturnAdjust).not.toHaveBeenCalled();
  });

  it("nothing billed yet: the amount is dropped with a note, no prompt", () => {
    const p = props({ maxSrFromBill: 0 });
    act(() => root.render(<PosSrAdjustField {...p} />));
    typeInto(input(), "800");
    act(() => root.render(<PosSrAdjustField {...p} saleReturnAdjust={800} />));
    blur(input());
    expect(warning).toHaveBeenCalledWith("Add the items first: S/R is adjusted against the bill");
    expect(p.setSaleReturnAdjust).toHaveBeenLastCalledWith(0);
    expect(p.setManualSrPrompt).not.toHaveBeenCalled();
  });

  it("within the credit applies through the clamp", () => {
    const p = props();
    act(() => root.render(<PosSrAdjustField {...p} />));
    typeInto(input(), "150");
    act(() => root.render(<PosSrAdjustField {...p} saleReturnAdjust={150} />));
    blur(input());
    expect(p.onClampSaleReturnAdjust).toHaveBeenCalledWith(150);
  });

  it("walk-in over the bill keeps the exchange and raises the return gross", () => {
    const p = props({ hasCustomer: false, availableSrCredit: 0, pendingCredits: [] });
    act(() => root.render(<PosSrAdjustField {...p} />));
    expect(host.textContent).not.toContain("CN ₹");
    typeInto(input(), "700");
    expect(p.setSameBillReturnGross).toHaveBeenCalledWith(expect.any(Function));
    const raise = (p.setSameBillReturnGross as ReturnType<typeof vi.fn>).mock.calls[0][0] as (n: number) => number;
    expect(raise(100)).toBe(700);
    expect(raise(900)).toBe(900);
  });

  it("clearing resets S/R and the return gross", () => {
    const p = props({ saleReturnAdjust: 150 });
    act(() => root.render(<PosSrAdjustField {...p} />));
    typeInto(input(), "");
    expect(p.setSaleReturnAdjust).toHaveBeenCalledWith(0);
    expect(p.setSameBillReturnGross).toHaveBeenCalledWith(0);
  });

  it("shows the exchange refund line and the cap note", () => {
    act(() => root.render(<PosSrAdjustField {...props({ hasCustomer: false, availableSrCredit: 0, pendingCredits: [], saleReturnAdjust: 700, exchangeSrApplied: 500, exchangeRefundDue: 200, isSameBillExchangeSr: true })} />));
    expect(host.textContent).toContain("Return ₹700 · Applied ₹500 · Refund due ₹200");
    expect(input().max).toBe("");
    act(() => root.render(<PosSrAdjustField {...props({ availableSrCredit: 900, maxSrAllowed: 500, saleReturnAdjust: 600 })} />));
    expect(host.textContent).toContain("Only ₹500 of credit can be applied to this bill");
  });
});
