/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  applyThermalPdfColourTheme,
  THERMAL_PDF_COLOUR_CLASS,
  TRENDZO_PDF_COLOUR_CLASS,
} from "@/utils/thermalPdfColourTheme";

function cloneDoc(rootClass: string) {
  const doc = document.implementation.createHTMLDocument("invoice");
  doc.body.innerHTML = `<div class="wrap"><div class="thermal-receipt-container ${rootClass}"><div class="vk-header"></div></div></div>`;
  return doc;
}

describe("applyThermalPdfColourTheme", () => {
  it("colours the Vastrakala thermal PDF clone", () => {
    const doc = cloneDoc("vastrakala-thermal-receipt-80mm");
    const wrap = doc.body.firstElementChild as HTMLElement;
    expect(applyThermalPdfColourTheme(doc, wrap)).toBe(true);
    const receipt = wrap.querySelector(".vastrakala-thermal-receipt-80mm") as HTMLElement;
    expect(receipt.classList.contains(THERMAL_PDF_COLOUR_CLASS)).toBe(true);
    const style = doc.head.querySelector("style[data-thermal-pdf-colour]");
    expect(style?.textContent).toContain(".vk-header");
    expect(style?.textContent).toContain("linear-gradient");
  });

  it("gives the Trendzo thermal PDF clone its premium look, logo included", () => {
    const doc = cloneDoc("trendzo-pos-thermal-receipt-80mm");
    const wrap = doc.body.firstElementChild as HTMLElement;
    expect(applyThermalPdfColourTheme(doc, wrap)).toBe(true);
    const receipt = wrap.querySelector(".trendzo-pos-thermal-receipt-80mm") as HTMLElement;
    expect(receipt.classList.contains(TRENDZO_PDF_COLOUR_CLASS)).toBe(true);
    const css = doc.head.querySelector(`style[data-thermal-pdf-colour="${TRENDZO_PDF_COLOUR_CLASS}"]`)?.textContent ?? "";
    expect(css).toContain(".tz-logo");
    expect(css).toContain(".tz-grand-total");
    // Barcode number under the barcode must not be clipped in the PDF.
    expect(css).toMatch(/\.tz-invoice-barcode \{[^}]*max-height: none !important/);
  });

  it("leaves other thermal layouts black & white", () => {
    const doc = cloneDoc("kids-thermal-receipt-80mm");
    const wrap = doc.body.firstElementChild as HTMLElement;
    expect(applyThermalPdfColourTheme(doc, wrap)).toBe(false);
    expect(doc.head.querySelector("style[data-thermal-pdf-colour]")).toBeNull();
    expect(wrap.querySelector(`.${THERMAL_PDF_COLOUR_CLASS}, .${TRENDZO_PDF_COLOUR_CLASS}`)).toBeNull();
  });
});
