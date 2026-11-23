// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  applyThermalPageSize,
  needsThermalPageSize,
  THERMAL_AUTO_PAGE_SIZE_RE,
  thermalMeasuredPageSize,
} from "./thermalPrintPageSize";

describe("thermal print page size", () => {
  it("recognises the invalid `Xmm auto` size", () => {
    expect(THERMAL_AUTO_PAGE_SIZE_RE.test("@page { size: 80mm auto; margin: 0 }")).toBe(true);
    expect(THERMAL_AUTO_PAGE_SIZE_RE.test("@page{size:58mm auto}")).toBe(true);
    expect(THERMAL_AUTO_PAGE_SIZE_RE.test("@page { size: 80mm 297mm }")).toBe(false);
  });

  it("only touches thermal prints, never an explicit A4 / A5 / label size", () => {
    expect(needsThermalPageSize("@page { size: 80mm auto; }", false)).toBe(true);
    expect(needsThermalPageSize(undefined, true)).toBe(true);
    expect(needsThermalPageSize("@page { margin: 0 }", true)).toBe(true);
    expect(needsThermalPageSize("@page { size: A4 portrait; margin: 10mm }", true)).toBe(false);
    expect(needsThermalPageSize("@page { size: 210mm 148mm }", false)).toBe(false);
    expect(needsThermalPageSize("@page { size: A5 portrait }", false)).toBe(false);
    expect(needsThermalPageSize(undefined, false)).toBe(false);
  });

  it("sizes the page to the receipt with headroom, within sane bounds", () => {
    const px = (mm: number) => (mm * 96) / 25.4;
    expect(thermalMeasuredPageSize("80mm", px(150))).toBe("80mm 168mm");
    expect(thermalMeasuredPageSize("58mm", px(100))).toBe("58mm 115mm");
    expect(thermalMeasuredPageSize("80mm", 0)).toBe("80mm 40mm");
    expect(thermalMeasuredPageSize("80mm", px(10_000))).toBe("80mm 3000mm");
  });

  it("writes a last @page rule with the measured size and the receipt's roll width", () => {
    document.head.innerHTML = "<style>@page { size: 80mm auto; margin: 0 }</style>";
    document.body.innerHTML = '<div class="thermal-print-80mm" data-thermal-paper="58mm">receipt</div>';
    const root = document.querySelector<HTMLElement>(".thermal-print-80mm")!;
    Object.defineProperty(root, "scrollHeight", { configurable: true, value: (120 * 96) / 25.4 });

    expect(applyThermalPageSize(document, undefined, true)).toBe("58mm 136mm");
    const rule = document.getElementById("ezzy-thermal-page-size");
    expect(rule?.textContent).toBe("@page { size: 58mm 136mm; }");
    expect(document.head.lastElementChild).toBe(rule);
    // Measuring does not leave the width pinned.
    expect(document.documentElement.style.width).toBe("");

    // A second print replaces the rule instead of stacking them.
    applyThermalPageSize(document, "@page { size: 80mm auto }", true);
    expect(document.querySelectorAll("#ezzy-thermal-page-size")).toHaveLength(1);
  });

  it("leaves A4 invoices alone", () => {
    document.head.innerHTML = "";
    document.body.innerHTML = '<div class="invoice-print-root">A4 bill</div>';
    expect(applyThermalPageSize(document, "@page { size: A4 portrait; margin: 10mm }", true)).toBeNull();
    expect(document.getElementById("ezzy-thermal-page-size")).toBeNull();
  });

  it("does nothing unless this computer chose to size the page to the receipt", () => {
    document.head.innerHTML = "<style>@page { size: 80mm auto; margin: 0 }</style>";
    document.body.innerHTML = '<div class="thermal-print-80mm">receipt</div>';
    localStorage.removeItem("ezzy_thermal_fit_page_to_receipt");
    expect(applyThermalPageSize(document, "@page { size: 80mm auto; }")).toBeNull();
    expect(document.getElementById("ezzy-thermal-page-size")).toBeNull();
    localStorage.setItem("ezzy_thermal_fit_page_to_receipt", "1");
    expect(applyThermalPageSize(document, "@page { size: 80mm auto; }")).toMatch(/^80mm \d+mm$/);
    localStorage.removeItem("ezzy_thermal_fit_page_to_receipt");
  });
});
