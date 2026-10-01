import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SaleReturnThermalPrint } from "./SaleReturnThermalPrint";
import { SaleReturnPrint } from "./SaleReturnPrint";
import { buildSaleReturnCreditPrintInfo } from "@/utils/saleReturnPrintMeta";

const business = { business_name: "ADTECH", address: "Addr", mobile_number: "0842", gst_number: null };
const base = {
  return_number: "SR/26-27/41",
  credit_note_number: "CN/26-27/10",
  customer_name: "AZEEM",
  customer_phone: "9876543210",
  created_at: "2026-10-01T09:15:00+05:30",
  original_sale_number: "POS/26-27/3",
  return_date: "2026-10-01",
  gross_amount: 1000,
  gst_amount: 0,
  net_amount: 1000,
  notes: null,
  items: [],
};

describe("sale return print details", () => {
  const pending = buildSaleReturnCreditPrintInfo({ net_amount: 1000, availableAmount: 1000 });
  const adjusted = buildSaleReturnCreditPrintInfo({
    net_amount: 1000,
    availableAmount: 0,
    actual_adjusted_amt: 1000,
    redeemedBills: [{ saleNumber: "INV/26-27/9", amount: 1000 }],
  });

  it("thermal shows logo, mobile and pending status", () => {
    const html = renderToStaticMarkup(
      createElement(SaleReturnThermalPrint, { saleReturn: { ...base, credit_info: pending }, businessDetails: business, logoUrl: "https://x/logo.png" }),
    );
    expect(html).toContain("https://x/logo.png");
    expect(html).toContain("9876543210");
    expect(html).toContain("PENDING");
    expect(html).toContain("CN Balance:");
  });

  it("A4 shows mobile and adjusted invoice", () => {
    const html = renderToStaticMarkup(
      createElement(SaleReturnPrint, { saleReturn: { ...base, credit_info: adjusted }, businessDetails: business, logoUrl: "https://x/logo.png" }),
    );
    expect(html).toContain("9876543210");
    expect(html).toContain("ADJUSTED");
    expect(html).toContain("INV/26-27/9");
    expect(html).toContain("https://x/logo.png");
  });

  it("no logo when not provided", () => {
    const html = renderToStaticMarkup(
      createElement(SaleReturnThermalPrint, { saleReturn: base, businessDetails: business }),
    );
    expect(html).not.toContain("<img");
  });
});
