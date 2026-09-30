/**
 * @vitest-environment jsdom
 */
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CustomerLedgerBalanceHeader } from "./CustomerLedgerBalanceHeader";

// Afreen (ADEEBAAREEBA) rows as printed on the 01-10-2026 ledger PDF.
const AFREEN_BEFORE_CLEANUP = [
  { id: "i408", type: "invoice", balance: 4200 },
  { id: "p408", type: "payment", balance: 0 },
  { id: "sr47", type: "return", balance: -4200 },
  { id: "pay2130", type: "refund", balance: -3900 },
  { id: "sr49", type: "return", balance: -8100 },
  { id: "i464", type: "invoice", balance: -4200 },
  { id: "pay2135", type: "refund", balance: -3900 },
];
const AFREEN_AFTER_CLEANUP = [
  { id: "i408", type: "invoice", balance: 4200 },
  { id: "p408", type: "payment", balance: 0 },
  { id: "sr49", type: "return", balance: -4200 },
  { id: "i464", type: "invoice", balance: -300 },
  { id: "pay2135", type: "refund", balance: 0 },
];

describe("CustomerLedgerBalanceHeader", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (props: Parameters<typeof CustomerLedgerBalanceHeader>[0]) =>
    act(() => root.render(createElement(CustomerLedgerBalanceHeader, props)));
  const text = (id: string) => container.querySelector(`[data-testid="${id}"]`)?.textContent ?? null;

  it("shows one plain-words balance and flags when the check disagrees", () => {
    render({ rows: AFREEN_BEFORE_CLEANUP, checkBalance: 600 });
    expect(text("ledger-headline-label")).toBe("You owe customer");
    expect(text("ledger-headline-amount")).toBe("₹3,900.00");
    expect(text("ledger-needs-checking")).toContain("Balance needs checking");
    expect(container.textContent).not.toContain("Refund owed");
  });

  it("shows Settled with no flag once the data is clean", () => {
    render({ rows: AFREEN_AFTER_CLEANUP, checkBalance: 0 });
    expect(text("ledger-headline-label")).toBe("Settled");
    expect(text("ledger-needs-checking")).toBeNull();
  });

  it("does not run the lifetime check on a date-filtered ledger", () => {
    render({ rows: AFREEN_BEFORE_CLEANUP, checkBalance: 600, asOfDate: new Date("2026-09-30") });
    expect(container.textContent).toContain("Balance on");
    expect(text("ledger-needs-checking")).toBeNull();
  });

  it("does not flag while the check is still loading", () => {
    render({ rows: AFREEN_BEFORE_CLEANUP, checkBalance: 600, checkLoading: true });
    expect(text("ledger-needs-checking")).toBeNull();
  });
});
