import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RetailERPTemplate } from "./RetailERPTemplate";
import { retailErpLinePrintPlan } from "@/utils/retailErpInvoicePrint";

const here = dirname(fileURLToPath(import.meta.url));

type Variant = "standard" | "real-tast" | "preprinted" | "dc" | "zaika" | "gurukrupa";

function line(sr: number, qty: number, rate: number, total = qty * rate) {
  return {
    sr,
    particulars: `ITEM ${sr}`,
    size: "M",
    barcode: `890000000${sr}`,
    hsn: "9963",
    sp: rate,
    mrp: rate,
    qty,
    rate,
    total,
    gstPercent: 0,
    discountPercent: 0,
  };
}

function renderInvoice(opts: {
  variant: Variant;
  count: number;
  rate?: number;
  discount?: number;
  grandTotal: number;
  roundOff?: number;
  format?: "a4" | "a5-vertical";
}) {
  const rate = opts.rate ?? 100;
  const items = Array.from({ length: opts.count }, (_, i) => line(i + 1, 1, rate));
  const subtotal = items.reduce((sum, item) => sum + item.rate * item.qty, 0);
  const html = renderToStaticMarkup(
    createElement(RetailERPTemplate, {
      businessName: "REALTASTE CATERERS",
      address: "Navi Mumbai",
      mobile: "8879165040",
      invoiceNumber: "POS/26-27/49",
      invoiceDate: new Date("2026-09-20T12:00:00+05:30"),
      customerName: "CIDCO LTD",
      items,
      subtotal,
      discount: opts.discount ?? 0,
      taxableAmount: opts.grandTotal,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      totalTax: 0,
      roundOff: opts.roundOff ?? 0,
      grandTotal: opts.grandTotal,
      taxType: "no_gst",
      variant: opts.variant,
      format: opts.format ?? (opts.variant === "real-tast" ? "a4" : "a4"),
      paymentMethod: "cash",
    }) as ReactElement,
  );
  return { html, items, subtotal };
}

function money(amount: number): string {
  const value = amount.toFixed(2);
  const parts = value.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

describe("Retail ERP page total matches printed line amounts", () => {
  const family: Variant[] = ["standard", "real-tast", "preprinted", "dc", "zaika", "gurukrupa"];

  it.each(family)("%s continued page total equals the visible line sum for a ₹0.56 residual", (variant) => {
    const count = variant === "gurukrupa" ? 10 : 21;
    const rate = 100;
    const grandTotal = count * rate - 0.56;
    const { html } = renderInvoice({
      variant,
      count,
      grandTotal,
      discount: 0,
      format: variant === "gurukrupa" ? "a5-vertical" : "a4",
    });
    const perPage = variant === "gurukrupa" ? 9 : 20;
    const pageTotal = money(perPage * rate);
    expect(html).toContain(`Page Total</span><span>₹${pageTotal}`);
    expect(html).not.toContain("99.97");
    expect(html).not.toContain("99.94");
    if (variant === "gurukrupa" || variant === "dc") {
      expect(html).toContain("- ₹0.56");
      expect(html).not.toContain("Round Off");
    } else {
      expect(html).toContain("Round Off");
      expect(html).toContain("-0.56");
      expect(html).not.toContain("- ₹0.56");
      expect(html).not.toContain("Disc -");
    }
  });

  it("real-tast shows a stored ₹0.56 as Discount and does not shave lines", () => {
    const { html } = renderInvoice({
      variant: "real-tast",
      count: 21,
      discount: 0.56,
      grandTotal: 21 * 100 - 0.56,
    });
    expect(html).toContain("Discount");
    expect(html).toContain("- ₹0.56");
    expect(html).not.toContain("Round Off");
    expect(html).toContain("Page Total</span><span>₹2,000.00");
    expect(html).not.toContain("99.97");
  });

  it("allocates a ₹50 bill discount and the page total matches those shaved lines", () => {
    const count = 21;
    const grosses = Array.from({ length: count }, () => 100);
    const plan = retailErpLinePrintPlan({
      grosses,
      lineTotals: grosses,
      displayDiscount: 50,
      propDiscount: 50,
      roundOffRowHidden: false,
    });
    const pageSum = plan.lineNetAmounts.slice(0, 20).reduce((sum, amount) => sum + amount, 0);
    const { html } = renderInvoice({
      variant: "real-tast",
      count,
      discount: 50,
      grandTotal: count * 100 - 50,
    });
    expect(pageSum).toBeCloseTo(1952.4, 2);
    expect(html).toContain(`Page Total</span><span>₹${money(pageSum)}`);
    expect(html).not.toContain("Page Total</span><span>₹2,000.00");
    expect(plan.lineNetAmounts.reduce((sum, amount) => sum + amount, 0)).toBeCloseTo(2050, 2);
  });

  it("gurukrupa amount column matches shaved lines, not the raw line_total sum", () => {
    const count = 10;
    const grosses = Array.from({ length: count }, () => 100);
    const plan = retailErpLinePrintPlan({
      grosses,
      lineTotals: grosses,
      displayDiscount: 50,
      propDiscount: 0,
      roundOffRowHidden: true,
    });
    const { html } = renderInvoice({
      variant: "gurukrupa",
      count,
      discount: 0,
      grandTotal: 950,
      format: "a5-vertical",
    });
    const pageSum = plan.lineNetAmounts.slice(0, 9).reduce((sum, amount) => sum + amount, 0);
    const allSum = plan.lineNetAmounts.reduce((sum, amount) => sum + amount, 0);
    expect(pageSum).toBe(855);
    expect(allSum).toBe(950);
    expect(html).toContain(`Page Total</span><span>₹${money(pageSum)}`);
    expect(html).not.toContain("Page Total</span><span>₹900.00");
    // Amount column is the shaved line sum. The rate column still shows gross.
    expect(html).toContain(">950.00</td>");
    expect(html).toContain(">1,000.00</td>");
  });

  it("plain retail template does not allocate a bill pool", () => {
    const source = readFileSync(resolve(here, "./RetailTemplate.tsx"), "utf8");
    expect(source).not.toContain("allocateByGrossWeight");
    expect(source).not.toContain("lineNetAmounts");
    expect(source).not.toContain("flatDiscountPool");
  });
});
