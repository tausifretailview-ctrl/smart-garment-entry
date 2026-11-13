/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BarcodePrintFooter } from "./BarcodePrintFooter";

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

const base = () => ({
  onPreview: vi.fn(),
  onPrint: vi.fn(),
  printDisabled: false,
  settingsLoading: false,
  printing: false,
  settingsStale: false,
  onRetrySettings: vi.fn(),
  onPdf: vi.fn(),
});
const buttons = () => [...host.querySelectorAll("button")].map((b) => b.textContent?.trim());
const click = (text: string) => act(() => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!.click());

describe("BarcodePrintFooter", () => {
  it("standard footer: Preview, Print, PDF, Save Default; optional buttons hidden", () => {
    const p = { ...base(), saveDefault: { isDefault: false, onClick: vi.fn() } };
    act(() => root.render(<BarcodePrintFooter {...p} />));
    expect(buttons()).toEqual(["Preview", "Print", "PDF", "Save Default"]);
    click("Preview");
    click("Print");
    click("PDF");
    click("Save Default");
    expect(p.onPreview).toHaveBeenCalled();
    expect(p.onPrint).toHaveBeenCalled();
    expect(p.onPdf).toHaveBeenCalled();
    expect(p.saveDefault.onClick).toHaveBeenCalled();
  });

  it("optional buttons, Default ✓, calibrate slot", () => {
    const p = { ...base(), settingsStale: true, onTestLabel: vi.fn(), onDirectPrint: vi.fn(), saveDefault: { isDefault: true, onClick: vi.fn() } };
    act(() => root.render(<BarcodePrintFooter {...p} calibrate={<button>Calibrate</button>} />));
    expect(buttons()).toEqual(["Preview", "Print", "Retry settings", "Test Label", "Direct Print", "PDF", "Default ✓", "Calibrate"]);
    click("Retry settings");
    click("Test Label");
    click("Direct Print");
    expect(p.onRetrySettings).toHaveBeenCalled();
    expect(p.onTestLabel).toHaveBeenCalled();
    expect(p.onDirectPrint).toHaveBeenCalled();
    const print = [...host.querySelectorAll("button")][1];
    expect(print.title).toBe("Print settings may be incomplete — use Retry if labels look wrong");
  });

  it("Print shows Loading… / Printing… and its tooltip follows settings loading", () => {
    act(() => root.render(<BarcodePrintFooter {...base()} settingsLoading printDisabled />));
    let print = [...host.querySelectorAll("button")][1] as HTMLButtonElement;
    expect(print.textContent).toBe("Loading…");
    expect(print.disabled).toBe(true);
    expect(print.title).toBe("Loading print settings…");
    act(() => root.render(<BarcodePrintFooter {...base()} printing />));
    print = [...host.querySelectorAll("button")][1] as HTMLButtonElement;
    expect(print.textContent).toBe("Printing…");
    expect(print.title).toBe("Print labels");
  });
});
