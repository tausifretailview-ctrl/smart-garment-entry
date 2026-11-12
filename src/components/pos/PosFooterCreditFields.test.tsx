/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PosAdvanceField, PosLegacyCreditField, PosPointsField } from "./PosFooterCreditFields";
import { posLegacyCreditFromTyped, posPointsFromTyped, posPointsTitle } from "./posFooterCredits";

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

const input = () => host.querySelector("input") as HTMLInputElement;
function typeInto(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("posFooterCredits helpers", () => {
  it("points title explains the state", () => {
    expect(posPointsTitle(0, 10, 0)).toBe("No old points to redeem");
    expect(posPointsTitle(5, 10, 0)).toBe("Need at least 10 old pts (this bill's +pts are pending)");
    expect(posPointsTitle(50, 10, 30)).toBe("Redeem old points only (max 30)");
  });
  it("typed points stay whole and within 0..max", () => {
    expect(posPointsFromTyped("12", 30)).toBe(12);
    expect(posPointsFromTyped("99", 30)).toBe(30);
    expect(posPointsFromTyped("-4", 30)).toBe(0);
    expect(posPointsFromTyped("", 30)).toBe(0);
  });
  it("typed legacy credit clears at 0, else caps to balance and bill", () => {
    expect(posLegacyCreditFromTyped("0", 500, 800)).toEqual({ clear: true, amount: 0 });
    expect(posLegacyCreditFromTyped("700", 500, 800)).toEqual({ clear: false, amount: 500 });
    expect(posLegacyCreditFromTyped("300", 500, 200)).toEqual({ clear: false, amount: 200 });
    expect(posLegacyCreditFromTyped("300", 0, 200)).toEqual({ clear: false, amount: 300 });
  });
});

describe("PosPointsField", () => {
  it("shows the balance, caps typing and shows the rupee value", () => {
    const setPointsToRedeem = vi.fn();
    act(() =>
      root.render(
        <PosPointsField balance={50} minPoints={10} maxRedeemable={30} pointsToRedeem={20} redemptionValue={20} setPointsToRedeem={setPointsToRedeem} />,
      ),
    );
    expect(host.textContent).toContain("Pts (50)");
    expect(host.textContent).toContain("−₹20");
    expect(input().title).toBe("Redeem old points only (max 30)");
    typeInto(input(), "45");
    expect(setPointsToRedeem).toHaveBeenCalledWith(30);
  });
  it("below the minimum: disabled with the Min note", () => {
    act(() =>
      root.render(
        <PosPointsField balance={5} minPoints={10} maxRedeemable={0} pointsToRedeem={0} redemptionValue={0} setPointsToRedeem={() => {}} />,
      ),
    );
    expect(input().disabled).toBe(true);
    expect(host.textContent).toContain("Min 10 pts");
  });
});

describe("PosLegacyCreditField", () => {
  it("clears at 0 and applies a capped amount", () => {
    const onClear = vi.fn();
    const onApplyCredit = vi.fn();
    act(() =>
      root.render(
        <PosLegacyCreditField creditApplied={100} availableCreditBalance={500} amountBeforeCredit={800} hasCustomer isApplyingCredit={false} onClear={onClear} onApplyCredit={onApplyCredit} />,
      ),
    );
    expect(host.textContent).toContain("Cr ₹500");
    expect(host.textContent).toContain("✓ Applied");
    typeInto(input(), "700");
    expect(onApplyCredit).toHaveBeenCalledWith(500);
    typeInto(input(), "0");
    expect(onClear).toHaveBeenCalledTimes(1);
  });
  it("is disabled while applying", () => {
    act(() =>
      root.render(
        <PosLegacyCreditField creditApplied={100} availableCreditBalance={500} amountBeforeCredit={800} hasCustomer isApplyingCredit onClear={() => {}} onApplyCredit={() => {}} />,
      ),
    );
    expect(input().disabled).toBe(true);
  });
});

describe("PosAdvanceField", () => {
  const base = {
    availableAdvanceBalance: 1000,
    advanceApplied: 0,
    finalAmount: 600,
    hasCustomer: true,
    exchangeRefundDue: 0,
    openingBalanceRemaining: 0,
  };
  it("passes the typed advance and caps the HTML max to the bill", () => {
    const onApplyAdvance = vi.fn();
    act(() => root.render(<PosAdvanceField {...base} onApplyAdvance={onApplyAdvance} />));
    expect(host.textContent).toContain("Adv ₹1000");
    expect(input().max).toBe("600");
    expect(input().disabled).toBe(false);
    typeInto(input(), "250");
    expect(onApplyAdvance).toHaveBeenCalledWith(250);
  });
  it("is disabled on an exchange refund or an unpaid opening balance; shows Applied", () => {
    act(() => root.render(<PosAdvanceField {...base} exchangeRefundDue={50} onApplyAdvance={() => {}} />));
    expect(input().disabled).toBe(true);
    act(() => root.render(<PosAdvanceField {...base} openingBalanceRemaining={10} advanceApplied={200} onApplyAdvance={() => {}} />));
    expect(input().disabled).toBe(true);
    expect(host.textContent).toContain("✓ Applied");
  });
});
