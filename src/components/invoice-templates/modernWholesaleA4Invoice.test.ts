import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModernWholesaleTemplate } from "./ModernWholesaleTemplate";

const items = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    particulars: `PUL${i + 1}-PUL-RLX-LD`,
    color: "BK",
    hsn: "64029990",
    size: "7",
    qty: 1,
    rate: 200,
    mrp: 300,
    gstPercent: 5,
    total: 210,
  }));

const render = (count: number, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(ModernWholesaleTemplate, {
      businessName: "KS FOOTWEAR",
      address: "Kandivali East, Mumbai",
      mobile: "8879122095",
      invoiceNumber: "INV/26-27/1795",
      invoiceDate: new Date(2026, 8, 22),
      customerName: "RASHMI SHOES",
      items: items(count),
      subtotal: count * 210,
      discount: 0,
      grandTotal: count * 210,
      cgstAmount: count * 5,
      sgstAmount: count * 5,
      format: "a4",
      ...extra,
    }),
  );

const pageCount = (html: string) => (html.match(/modern-wholesale-page/g) || []).length;
const rowsOnLastPage = (html: string) => {
  const pages = html.split('class="invoice-page modern-wholesale-page"');
  return (pages[pages.length - 1].match(/PUL\d+-PUL-RLX-LD/g) || []).length;
};

describe("ModernWholesaleTemplate A4 pages", () => {
  it("makes every sheet a full A4 page, not just the last", () => {
    const html = render(40);
    expect(pageCount(html)).toBe(4);
    expect((html.match(/min-height:297mm/g) || []).length).toBe(4);
  });

  it("keeps the last page short enough for the totals box", () => {
    // 40 rows: 14 + 14 + 6 + 6 (was 14 + 14 + 12, which pushed the totals off the sheet).
    expect(rowsOnLastPage(render(40))).toBeLessThanOrEqual(10);
    expect(rowsOnLastPage(render(24))).toBeLessThanOrEqual(10);
  });

  it("fills page 1 before moving rows to page 2", () => {
    // 11 rows used to split 6 + 5, leaving most of page 1 blank.
    const html = render(11);
    const pages = html.split('class="invoice-page modern-wholesale-page"');
    expect(pageCount(html)).toBe(2);
    expect((pages[1].match(/PUL\d+-PUL-RLX-LD/g) || []).length).toBe(10);
    expect(rowsOnLastPage(html)).toBe(1);
    // 24 rows: 14 + 10 (fits the last-page limit as is).
    expect(rowsOnLastPage(render(24))).toBe(10);
  });

  it("prints amount in words with a single Only", () => {
    const html = render(3);
    expect(html).toContain("Rupees Only");
    expect(html).not.toContain("Only Only");
  });

  it("shows the IGST line in the totals box for an interstate bill", () => {
    const html = render(3, { cgstAmount: 0, sgstAmount: 0, igstAmount: 31.5 });
    expect(html).toContain("IGST:");
    expect(html).not.toContain("CGST:");
    // Total row GST column carries the IGST too.
    expect(html).toContain(">31.50<");
  });
});
