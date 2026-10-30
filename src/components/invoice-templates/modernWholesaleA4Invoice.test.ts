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

const render = (count: number) =>
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

  it("prints amount in words with a single Only", () => {
    const html = render(3);
    expect(html).toContain("Rupees Only");
    expect(html).not.toContain("Only Only");
  });
});
