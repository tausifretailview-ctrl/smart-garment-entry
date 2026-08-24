/** @vitest-environment jsdom */

import React, { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { MixPaymentDialog } from "@/components/MixPaymentDialog";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { PriceSelectionDialog } from "@/components/PriceSelectionDialog";

function flushEffects() {
  act(() => {
    // DescriptionWarning runs in useEffect after paint.
  });
}

describe("DialogContent description fallback", () => {
  let container: HTMLDivElement;
  let root: Root;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    warnSpy.mockRestore();
  });

  function render(node: React.ReactElement) {
    act(() => {
      root.render(node);
    });
    flushEffects();
  }

  function descriptionWarningFired() {
    return warnSpy.mock.calls.some((args) =>
      String(args[0] ?? "").includes("Missing `Description`"),
    );
  }

  function dialogEl() {
    return document.querySelector('[role="dialog"]') as HTMLElement | null;
  }

  function fallbackDescriptions() {
    return Array.from(document.querySelectorAll('[role="dialog"] p.sr-only')).filter(
      (el) => el.textContent?.trim() === "" && el.id,
    );
  }

  it("injects sr-only description when none is provided (MixPaymentDialog)", () => {
    render(
      createElement(MixPaymentDialog, {
        open: true,
        onOpenChange: () => {},
        billAmount: 100,
      }),
    );

    const dialog = dialogEl();
    expect(dialog).toBeTruthy();
    const describedBy = dialog!.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const desc = document.getElementById(describedBy!);
    expect(desc).toBeTruthy();
    expect(desc!.classList.contains("sr-only")).toBe(true);
    expect(desc!.textContent?.trim()).toBe("");
    expect(descriptionWarningFired()).toBe(false);
  });

  it("does not inject a second description when DialogDescription is nested in DialogHeader (KeyboardShortcutsModal)", () => {
    render(
      createElement(KeyboardShortcutsModal, {
        open: true,
        onOpenChange: () => {},
        context: "general",
      }),
    );

    const dialog = dialogEl();
    expect(dialog).toBeTruthy();
    const describedBy = dialog!.getAttribute("aria-describedby");
    const desc = document.getElementById(describedBy!);
    expect(desc).toBeTruthy();
    expect(desc!.textContent).toContain("Quick actions to speed up your workflow");
    expect(fallbackDescriptions()).toHaveLength(0);
    expect(descriptionWarningFired()).toBe(false);
  });

  it("does not inject when DialogDescription is nested in DialogHeader (PriceSelectionDialog)", () => {
    render(
      createElement(PriceSelectionDialog, {
        open: true,
        onOpenChange: () => {},
        productName: "FL505",
        size: "7",
        masterPrice: { sale_price: 258.65, mrp: 369.5 },
        lastPurchasePrice: { sale_price: 230.65, mrp: 329.5 },
        onSelect: () => {},
      }),
    );

    const dialog = dialogEl();
    expect(dialog).toBeTruthy();
    const describedBy = dialog!.getAttribute("aria-describedby");
    const desc = document.getElementById(describedBy!);
    expect(desc).toBeTruthy();
    expect(desc!.textContent).toContain("FL505");
    expect(fallbackDescriptions()).toHaveLength(0);
    expect(descriptionWarningFired()).toBe(false);
  });

  it("does not inject when caller passes aria-describedby={undefined}", () => {
    render(
      createElement(
        Dialog,
        { open: true },
        createElement(
          DialogContent,
          { "aria-describedby": undefined },
          createElement(
            DialogHeader,
            null,
            createElement(DialogTitle, null, "New Customer"),
          ),
        ),
      ),
    );

    const dialog = dialogEl();
    expect(dialog).toBeTruthy();
    expect(dialog!.hasAttribute("aria-describedby")).toBe(false);
    expect(fallbackDescriptions()).toHaveLength(0);
    expect(descriptionWarningFired()).toBe(false);
  });

  it("injects fallback for a DialogHeader with title only (Sales Invoice New Customer shape)", () => {
    render(
      createElement(
        Dialog,
        { open: true },
        createElement(
          DialogContent,
          null,
          createElement(
            DialogHeader,
            null,
            createElement(DialogTitle, null, "New Customer"),
          ),
        ),
      ),
    );

    const dialog = dialogEl();
    expect(dialog).toBeTruthy();
    const describedBy = dialog!.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const desc = document.getElementById(describedBy!);
    expect(desc?.classList.contains("sr-only")).toBe(true);
    expect(descriptionWarningFired()).toBe(false);
  });

  it("does not inject when DialogDescription is a direct child", () => {
    render(
      createElement(
        Dialog,
        { open: true },
        createElement(
          DialogContent,
          null,
          createElement(DialogTitle, null, "Titled"),
          createElement(DialogDescription, null, "Visible copy"),
        ),
      ),
    );

    const describedBy = dialogEl()!.getAttribute("aria-describedby");
    const desc = document.getElementById(describedBy!);
    expect(desc!.textContent).toBe("Visible copy");
    expect(desc!.classList.contains("sr-only")).toBe(false);
    expect(fallbackDescriptions()).toHaveLength(0);
    expect(descriptionWarningFired()).toBe(false);
  });
});
