import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  LETTERPAD_COMPOSITION_DECLARATION,
  retailErpDisplayDiscount,
  retailErpLetterpadNoteText,
  retailErpLineDisplayRate,
  retailErpLineGross,
} from "./retailErpInvoicePrint";

const here = dirname(fileURLToPath(import.meta.url));

describe("Gurukrupa A5 billed unit rate (POS unit-price edit)", () => {
  /** POS/26-27/1892: qty 2, edited unit ₹2,750, master/MRP ₹4,000, net ₹5,500. */
  const line = { mrp: 4_000, rate: 2_750, qty: 2, total: 5_500 };

  it("prints the edited unit price in Rate, not the old sale price / MRP", () => {
    expect(retailErpLineDisplayRate(line, true)).toBe(2_750);
    expect(retailErpLineGross(line, true)).toBe(5_500);
  });

  it("does not reprint the MRP−unit gap as Discount when Rate is the billed unit", () => {
    const subTotal = retailErpLineGross(line, true);
    const merchandiseNet = 5_500;
    const computed = Math.max(0, subTotal - merchandiseNet);
    expect(
      retailErpDisplayDiscount({
        billedUnitRate: true,
        propDiscount: 2_500,
        computedFromLines: computed,
      }),
    ).toBe(0);
  });

  it("standard Retail ERP still shows list/MRP in Rate and the gap as Discount", () => {
    expect(retailErpLineDisplayRate(line, false)).toBe(4_000);
    expect(retailErpLineGross(line, false)).toBe(8_000);
    expect(
      retailErpDisplayDiscount({
        billedUnitRate: false,
        propDiscount: 2_500,
        computedFromLines: 2_500,
      }),
    ).toBe(2_500);
  });

  it("keeps an explicit bill discount (flat / Disc%) under billed unit rates", () => {
    expect(
      retailErpDisplayDiscount({
        billedUnitRate: true,
        propDiscount: 500,
        computedFromLines: 500,
      }),
    ).toBe(500);
  });
});

describe("preprinted letter-pad Note declaration", () => {
  it("wires the helper into the Retail ERP Note: block", () => {
    const template = readFileSync(
      resolve(here, "../components/invoice-templates/RetailERPTemplate.tsx"),
      "utf8",
    );
    expect(template).toContain("retailErpLetterpadNoteText");
    expect(template).toContain("Note:");
  });

  it("fills the Note section with the composition declaration on letter-pad", () => {
    expect(
      retailErpLetterpadNoteText({
        isPreprinted: true,
        saleNote: "",
        declarationText: "",
      }),
    ).toBe(LETTERPAD_COMPOSITION_DECLARATION);
  });

  it("does not add the declaration on standard Retail ERP", () => {
    expect(
      retailErpLetterpadNoteText({
        isPreprinted: false,
        saleNote: "",
        declarationText: "",
      }),
    ).toBe("");
  });

  it("keeps an existing sale note and appends the declaration", () => {
    expect(
      retailErpLetterpadNoteText({
        isPreprinted: true,
        saleNote: "Handle with care",
        declarationText: "",
      }),
    ).toBe(`Handle with care\n${LETTERPAD_COMPOSITION_DECLARATION}`);
  });

  it("uses Settings declaration text when it is not the generic certified line", () => {
    const custom = "Composition taxable person, not eligible to collect tax on supplies.";
    expect(
      retailErpLetterpadNoteText({
        isPreprinted: true,
        saleNote: "",
        declarationText: custom,
      }),
    ).toBe(custom);
  });
});
