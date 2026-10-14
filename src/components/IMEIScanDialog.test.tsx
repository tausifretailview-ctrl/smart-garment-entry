/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

import { IMEIScanDialog } from "./IMEIScanDialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function findButton(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll("button")).find((b) =>
    (b.textContent || "").includes(text),
  ) as HTMLButtonElement | undefined;
}

describe("IMEIScanDialog accessory barcode", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    if (!("ResizeObserver" in globalThis)) {
      vi.stubGlobal("ResizeObserver", class {
        observe() {}
        unobserve() {}
        disconnect() {}
      });
    }
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (onUseAsNormalBarcode?: (barcode: string) => void) => {
    act(() => {
      root.render(
        <IMEIScanDialog
          open
          onClose={() => {}}
          quantity={2}
          productName="POLAR MAX SMART WATCH"
          onConfirm={() => {}}
          onUseAsNormalBarcode={onUseAsNormalBarcode}
        />,
      );
    });
  };

  it("offers normal stock for a scanned EAN and passes the barcode", () => {
    const onUse = vi.fn();
    render(onUse);
    const input = document.querySelector("input") as HTMLInputElement;
    act(() => typeInto(input, "8906086576427"));
    const button = findButton("Not an IMEI item");
    expect(button).toBeTruthy();
    act(() => button!.click());
    expect(onUse).toHaveBeenCalledWith("8906086576427");
  });

  it("does not offer normal stock for a real IMEI", () => {
    render(vi.fn());
    const input = document.querySelector("input") as HTMLInputElement;
    act(() => typeInto(input, "356938035643809"));
    expect(findButton("Not an IMEI item")).toBeUndefined();
  });

  it("hides the option when the parent does not support it", () => {
    render(undefined);
    const input = document.querySelector("input") as HTMLInputElement;
    act(() => typeInto(input, "8906086576427"));
    expect(findButton("Not an IMEI item")).toBeUndefined();
  });
});
