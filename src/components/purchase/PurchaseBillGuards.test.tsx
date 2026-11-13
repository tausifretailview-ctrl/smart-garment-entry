/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PurchaseBarcodeConflictDialog,
  PurchaseDuplicateBillDialog,
  PurchaseLockedBanner,
  PurchaseUnlockDialog,
} from "./PurchaseBillGuards";

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

const button = (text: string) =>
  [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === text) as HTMLButtonElement | undefined;

describe("Purchase bill guards", () => {
  it("locked banner: Unlock Bill asks to unlock", () => {
    const onUnlock = vi.fn();
    act(() => root.render(<PurchaseLockedBanner onUnlock={onUnlock} />));
    expect(host.textContent).toContain("Bill is Locked");
    act(() => button("Unlock Bill")!.click());
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it("unlock dialog: Unlock & Edit confirms", () => {
    const onConfirm = vi.fn();
    act(() => root.render(<PurchaseUnlockDialog open onOpenChange={() => {}} onConfirm={onConfirm} />));
    expect(document.body.textContent).toContain("Unlock Purchase Bill?");
    act(() => button("Unlock & Edit")!.click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("duplicate bill: names the existing bill and saves anyway on request", () => {
    const onSaveAnyway = vi.fn();
    act(() =>
      root.render(
        <PurchaseDuplicateBillDialog
          open
          onOpenChange={() => {}}
          duplicate={{ bill_no: "INV-77", bill_date: "2026-11-10" }}
          onSaveAnyway={onSaveAnyway}
        />,
      ),
    );
    expect(document.body.textContent).toContain("Possible Duplicate Bill");
    expect(document.body.textContent).toContain("(Bill: INV-77, Date: 2026-11-10)");
    act(() => button("Save Anyway")!.click());
    expect(onSaveAnyway).toHaveBeenCalledTimes(1);
  });

  it("duplicate bill without details still reads as a sentence", () => {
    act(() => root.render(<PurchaseDuplicateBillDialog open onOpenChange={() => {}} duplicate={null} onSaveAnyway={() => {}} />));
    expect(document.body.textContent).toContain("already exists.");
  });

  it("barcode conflict: counts the lines; Review Items closes, Save Anyway saves", () => {
    const onSaveAnyway = vi.fn();
    const onOpenChange = vi.fn();
    act(() =>
      root.render(<PurchaseBarcodeConflictDialog open onOpenChange={onOpenChange} conflictCount={1} onSaveAnyway={onSaveAnyway} />),
    );
    expect(document.body.textContent).toContain("1 line item has a barcode conflict");
    act(() => root.render(<PurchaseBarcodeConflictDialog open onOpenChange={onOpenChange} conflictCount={3} onSaveAnyway={onSaveAnyway} />));
    expect(document.body.textContent).toContain("3 line items have barcode conflicts");
    act(() => button("Save Anyway")!.click());
    expect(onSaveAnyway).toHaveBeenCalledTimes(1);
    act(() => button("Review Items")!.click());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
