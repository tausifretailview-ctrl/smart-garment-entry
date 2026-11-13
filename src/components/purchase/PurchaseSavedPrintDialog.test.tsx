/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PurchaseSavedPrintDialog, type PurchaseSavedPrintDialogProps } from "./PurchaseSavedPrintDialog";

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

function props(p: Partial<PurchaseSavedPrintDialogProps> = {}): PurchaseSavedPrintDialogProps {
  return {
    open: true,
    onOpenChange: vi.fn(),
    totalLabels: 12,
    hasNewLines: false,
    newLabels: 0,
    selectedCount: 0,
    onPrintAll: vi.fn(),
    onPrintNew: vi.fn(),
    onContinueAdding: vi.fn(),
    ...p,
  };
}
const button = (text: string) =>
  [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes(text)) as HTMLButtonElement | undefined;

describe("PurchaseSavedPrintDialog", () => {
  it("shows the label count and runs Print All, Continue and Skip", () => {
    const p = props();
    act(() => root.render(<PurchaseSavedPrintDialog {...p} />));
    expect(document.body.textContent).toContain("Bill Saved Successfully");
    expect(document.body.textContent).toContain("12 labels");
    expect(document.body.textContent).not.toContain("Newly Added");
    expect(button("Print New Only")).toBeUndefined();
    act(() => button("Print All Labels (12)")!.click());
    expect(p.onPrintAll).toHaveBeenCalledTimes(1);
    act(() => button("Continue Adding Products")!.click());
    expect(p.onContinueAdding).toHaveBeenCalledTimes(1);
    act(() => button("Skip")!.click());
    expect(p.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("with ticked lines the main button prints the selection", () => {
    act(() => root.render(<PurchaseSavedPrintDialog {...props({ selectedCount: 3 })} />));
    expect(button("Print Selected (3)")).toBeTruthy();
  });

  it("lines added in this edit: shows the count and Print New Only", () => {
    const p = props({ hasNewLines: true, newLabels: 4 });
    act(() => root.render(<PurchaseSavedPrintDialog {...p} />));
    expect(document.body.textContent).toContain("Newly Added:");
    expect(document.body.textContent).toContain("4 labels");
    act(() => button("Print New Only (4)")!.click());
    expect(p.onPrintNew).toHaveBeenCalledTimes(1);
  });
});
