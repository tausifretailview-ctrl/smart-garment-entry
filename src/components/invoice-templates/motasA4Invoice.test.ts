import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  MOTAS_FRAME_MM,
  MotasA4Template,
  estimateMotasClosingMm,
  estimateMotasRowMm,
  planMotasPages,
} from "./MotasA4Template";

const item = (i: number, overrides: Record<string, unknown> = {}) => ({
  sr: i + 1,
  particulars: `1KG - TOMATO JOWAR PUFFS ${i + 1}`,
  size: "",
  barcode: "",
  hsn: "2106",
  sp: 250,
  qty: 3,
  rate: 250,
  total: 750,
  gstPercent: 5,
  ...overrides,
});

const baseProps = {
  businessName: "MOTAS",
  address: "Shop No. 3 and 4, Mhatre Nagar, Dombivli East, Thane-421204",
  mobile: "+91-9769186286",
  email: "motas@example.invalid",
  gstNumber: "27BBFPG4255A1Z4",
  invoiceNumber: "INV/26-27/966",
  invoiceDate: new Date(2026, 4, 7),
  dueDate: new Date(2026, 4, 14),
  customerName: "Kalpataru Food Shop",
  customerAddress: "Samarth Building, Link Road, Chinchwad, Pune 33.",
  customerMobile: "9860627555",
  customerGSTIN: "27AIXPC5868K1ZE",
  taxType: "inclusive" as const,
  discount: 0,
  roundOff: 0,
};

const countPages = (html: string) => (html.match(/class="motas-a4-page"/g) || []).length;

describe("planMotasPages", () => {
  const plan = (rows: number, closingMm = 100) =>
    planMotasPages(Array(rows).fill(6.5), { headerMm: 67, theadMm: 6.5, closingMm });

  it("keeps a short bill on one sheet", () => {
    expect(plan(5)).toEqual([[0, 1, 2, 3, 4]]);
  });

  it("fills sheet 1 with rows, then continues on sheet 2", () => {
    const pages = plan(41);
    expect(pages.length).toBe(2);
    expect(pages[0].length).toBeGreaterThanOrEqual(30);
    expect(pages.flat()).toEqual(Array.from({ length: 41 }, (_, i) => i));
  });

  it("never leaves the totals on a sheet without items", () => {
    // Sheet 1 is full of rows; the closing block cannot fit under them.
    const itemArea = MOTAS_FRAME_MM - 67 - 6.5 - 6;
    const fullSheet = Math.floor(itemArea / 6.5);
    const pages = plan(fullSheet);
    expect(pages.length).toBe(2);
    expect(pages[1].length).toBe(1);
    expect(pages.flat().length).toBe(fullSheet);
  });
});

describe("Motas A4 estimates", () => {
  it("grows a row for long descriptions and variants", () => {
    const short = estimateMotasRowMm({ particulars: "SALTED", size: "", color: "" });
    const long = estimateMotasRowMm({
      particulars: "250GM -MUNGDAL CHAKLI -MUNGDAL CHAKLI EXTRA LONG",
      size: "",
      color: "",
    });
    const variant = estimateMotasRowMm({ particulars: "SALTED", size: "XL", color: "Red" });
    expect(long).toBeGreaterThan(short);
    expect(variant).toBeGreaterThan(short);
  });

  it("grows the closing block with more tax rows", () => {
    const one = estimateMotasClosingMm({ taxRows: 1, terms: [], hasNotes: false, hasWordsOverflow: false });
    const three = estimateMotasClosingMm({ taxRows: 3, terms: [], hasNotes: false, hasWordsOverflow: false });
    expect(three).toBeGreaterThan(one);
  });
});

describe("MotasA4Template", () => {
  it("shows only Invoice No, Date, Place of Supply and Due Date — no shipping address", () => {
    const html = renderToStaticMarkup(
      createElement(MotasA4Template, { ...baseProps, items: [item(0)], grandTotal: 750 }),
    );
    expect(html).toContain("Invoice No.");
    expect(html).toContain("Invoice Date");
    expect(html).toContain("Place of Supply");
    expect(html).toContain("Due Date");
    expect(html).toContain("27-MAHARASHTRA");
    expect(html).toContain("14/05/2026");
    expect(html).not.toMatch(/Shipping Address/i);
    expect(html).not.toMatch(/Cust\. PO/i);
    expect(html).not.toMatch(/Transporter/i);
    expect(countPages(html)).toBe(1);
  });

  it("prints the sample columns with line discount and taxable values", () => {
    const html = renderToStaticMarkup(
      createElement(MotasA4Template, {
        ...baseProps,
        // 3 × ₹250 less 10% = ₹675 incl. 5% GST → taxable 642.86, discount 71.43 (taxable basis)
        items: [item(0, { total: 675, discountPercent: 10 })],
        grandTotal: 675,
      }),
    );
    for (const head of ["Description", "Qty", "HSN", "Unit", "Discount", "Taxable", "Tax (%)", "Total"]) {
      expect(html).toContain(`>${head}</th>`);
    }
    expect(html).toContain("238.10");
    expect(html).toContain("71.43");
    expect(html).toContain("642.86");
    expect(html).toContain("5.0%");
    expect(html).toContain("675.00");
    expect(html).toContain("Central Tax");
    expect(html).toContain("State Tax");
  });

  it("repeats the header on every sheet of a long bill and numbers the pages", () => {
    const items = Array.from({ length: 41 }, (_, i) => item(i));
    const html = renderToStaticMarkup(
      createElement(MotasA4Template, { ...baseProps, items, grandTotal: 41 * 750 }),
    );
    const pages = countPages(html);
    expect(pages).toBeGreaterThanOrEqual(2);
    expect(html).toContain(`Page 1 of ${pages}`);
    expect(html).toContain(`Page ${pages} of ${pages}`);
    // Billing block appears once per sheet (plus the hidden measuring copy).
    expect((html.match(/Billing Address/g) || []).length).toBe(pages + 1);
    // Totals + signature only once per sheet set.
    expect((html.match(/Authorised Signatory/g) || []).length).toBe(2);
  });

  it("uses Integrated Tax for inter-state buyers", () => {
    const html = renderToStaticMarkup(
      createElement(MotasA4Template, {
        ...baseProps,
        customerGSTIN: "29AABCU9603R1ZM",
        items: [item(0)],
        grandTotal: 750,
      }),
    );
    expect(html).toContain("Integrated Tax");
    expect(html).not.toContain("Central Tax");
  });
});
