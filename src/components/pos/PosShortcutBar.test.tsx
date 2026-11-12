/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PosShortcutBar } from "./PosShortcutBar";

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

describe("PosShortcutBar (moved out of POSSales unchanged)", () => {
  it("shows the last saved bill with qty and amount", () => {
    act(() => root.render(<PosShortcutBar lastBillNumber="POS/26-27/414" lastBillQty={3} lastBillAmount={1234.5} />));
    const text = host.textContent || "";
    expect(text).toContain("Last Bill");
    expect(text).toContain("POS/26-27/414");
    expect(text).toContain("Qty 3");
    expect(text).toContain("₹1,234.50");
  });

  it("says when no bill is saved today", () => {
    act(() => root.render(<PosShortcutBar lastBillNumber={null} lastBillQty={0} lastBillAmount={0} />));
    expect(host.textContent).toContain("No bill saved today");
  });

  it("keeps the keyboard legend in the same order", () => {
    act(() => root.render(<PosShortcutBar lastBillNumber={null} lastBillQty={0} lastBillAmount={0} />));
    const keys = [...host.querySelectorAll("kbd")].map((k) => k.textContent);
    expect(keys).toEqual(["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "ESC", "CTRL+P"]);
  });
});
