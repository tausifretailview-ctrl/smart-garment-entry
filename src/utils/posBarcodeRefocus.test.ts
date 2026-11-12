/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { posFocusMovedToOtherField } from "./posBarcodeRefocus";

afterEach(() => {
  document.body.innerHTML = "";
});

function setup() {
  document.body.innerHTML = `
    <input id="barcode" />
    <div data-pos-salesman-picker><input id="pickerSearch" /></div>
    <select id="lineSalesman"><option>Amit</option></select>
    <input id="customer" />
    <textarea id="note"></textarea>
    <div id="editable" contenteditable="true"></div>
    <button id="btn">Cash</button>
  `;
  const el = (id: string) => document.getElementById(id);
  return { el, barcode: el("barcode") };
}

describe("posFocusMovedToOtherField", () => {
  it("counts a cart line's salesman list and other fields as moved", () => {
    const { el, barcode } = setup();
    expect(posFocusMovedToOtherField(el("lineSalesman"), barcode, "[data-pos-salesman-picker]")).toBe(true);
    expect(posFocusMovedToOtherField(el("customer"), barcode, "[data-pos-salesman-picker]")).toBe(true);
    expect(posFocusMovedToOtherField(el("note"), barcode, "[data-pos-salesman-picker]")).toBe(true);
  });

  it("does not count the barcode box, the closing picker, the page or a button", () => {
    const { el, barcode } = setup();
    expect(posFocusMovedToOtherField(barcode, barcode, "[data-pos-salesman-picker]")).toBe(false);
    expect(posFocusMovedToOtherField(el("pickerSearch"), barcode, "[data-pos-salesman-picker]")).toBe(false);
    expect(posFocusMovedToOtherField(document.body, barcode, "[data-pos-salesman-picker]")).toBe(false);
    expect(posFocusMovedToOtherField(el("btn"), barcode, "[data-pos-salesman-picker]")).toBe(false);
    expect(posFocusMovedToOtherField(null, barcode)).toBe(false);
  });

  it("without a picker root, any other input counts", () => {
    const { el, barcode } = setup();
    expect(posFocusMovedToOtherField(el("pickerSearch"), barcode)).toBe(true);
  });
});
