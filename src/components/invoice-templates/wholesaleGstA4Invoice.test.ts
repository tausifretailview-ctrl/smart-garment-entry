import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WholesaleGstA4Template } from "./WholesaleGstA4Template";

const here = dirname(fileURLToPath(import.meta.url));

const inv210Props = {
  businessName: "BABJII ENTERPRISES",
  address: "11, Ezzy Manzil, 2nd Husband Lane, Santacruz West\nMumbai Suburban, MAHARASHTRA, 400054",
  mobile: "9820889852",
  email: "asthetis@gmail.com",
  gstNumber: "27AGSPG6757E1ZZ",
  logoUrl: "https://example.invalid/org-logo.png",
  invoiceNumber: "INV-210",
  invoiceDate: new Date(2026, 8, 7),
  dueDate: new Date(2026, 9, 7),
  customerName: "NAVRANG SHOES (PANVEL)",
  customerAddress: "SHOP NO 11, GROUND FLOOR, ANAND NAGAR SHIVAJI CHOWK, PANVEL\nRaigad, MAHARASHTRA, 410206",
  customerMobile: "9892377797",
  customerGSTIN: "27AMOPP3239N1ZB",
  taxType: "inclusive" as const,
  items: [
    {
      sr: 1,
      particulars: "30933601 MRP 6999 PUMA",
      size: "",
      barcode: "",
      hsn: "6404",
      sp: 4151.95,
      qty: 4,
      rate: 4151.95,
      total: 19597.2,
      gstPercent: 18,
    },
    {
      sr: 2,
      particulars: "30933602 MRP 6999 PUMA",
      size: "",
      barcode: "",
      hsn: "6404",
      sp: 4151.95,
      qty: 5,
      rate: 4151.95,
      total: 24496.5,
      gstPercent: 18,
    },
    {
      sr: 3,
      particulars: "TRANSPORT COURIER",
      size: "",
      barcode: "",
      hsn: "9968",
      sp: 150,
      qty: 1,
      rate: 150,
      total: 157.5,
      gstPercent: 5,
    },
  ],
  discount: 0,
  roundOff: -0.2,
  grandTotal: 44251,
  bankDetails: {
    bank_name: "Kotak Mahindra Bank",
    account_holder: "BABJII ENTERPRISES",
    account_number: "4812023356",
    ifsc_code: "KKBK0001406",
    branch: "VILE PARLE E MUMBAI",
  },
  qrCodeUrl: "data:image/png;base64,qq==",
  upiId: "babjii@upi",
  stampImageBase64: "data:image/png;base64,ss==",
  customFooterText: "Thank you for your business.",
  showBankDetails: true,
};

describe("WholesaleGstA4Template", () => {
  it("renders INV-210 shape with separate 2.5% and 9.0% GST rows from org settings fields", () => {
    const html = renderToStaticMarkup(createElement(WholesaleGstA4Template, inv210Props));

    expect(html).toContain("BABJII ENTERPRISES");
    expect(html).toContain("27AGSPG6757E1ZZ");
    expect(html).toContain("INV-210");
    expect(html).toContain("27-MAHARASHTRA");
    expect(html).toContain("NAVRANG SHOES (PANVEL)");
    expect(html).toContain("27AMOPP3239N1ZB");
    expect(html).toContain("2,989.40 (18%)");
    expect(html).toContain("7.50 (5%)");
    expect(html).toContain("CGST 2.5%");
    expect(html).toContain("SGST 2.5%");
    expect(html).toContain("CGST 9.0%");
    expect(html).toContain("SGST 9.0%");
    expect(html).toContain("₹3.75");
    expect(html).toContain("₹3,363.08");
    expect(html).toContain("₹37,517.54");
    expect(html).toContain("₹44,251.00");
    expect(html).toContain("Total Items / Qty : 3 / 10");
    expect(html).toContain("Rs. Forty Four Thousand Two Hundred Fifty One Rupees Only");
    expect(html).toContain("Kotak Mahindra Bank");
    expect(html).toContain("4812023356");
    expect(html).toContain("KKBK0001406");
    expect(html).toContain("VILE PARLE E MUMBAI");
    expect(html).toContain("https://example.invalid/org-logo.png");
    expect(html).toContain("data:image/png;base64,qq==");
    expect(html).toContain("babjii@upi");
    expect(html).toContain("Authorized Signatory");
    expect(html).toContain("Receiver");
    expect(html).toContain("Thank you for your business.");
    expect(html).not.toContain("Swipe");
    expect(html).not.toContain("getswipe");
    expect(html).not.toContain("digitally signed");
    expect(html).not.toContain("Add: CGST @");
  });

  it("uses A4 page size with visible overflow (does not clip like the A5 @page history)", () => {
    const src = readFileSync(resolve(here, "./WholesaleGstA4Template.tsx"), "utf8");
    expect(src).toContain("size: A4 portrait");
    expect(src).toContain("margin: 8mm");
    expect(src).toContain("overflow: visible !important");
    expect(src).toContain("max-height: none !important");
    expect(src).not.toMatch(/@media print[\s\S]{0,400}overflow:\s*hidden/);
  });

  it("is registered as wholesale-gst-a4 across the invoice template set", () => {
    const printFormat = readFileSync(resolve(here, "../../utils/invoicePrintFormat.ts"), "utf8");
    expect(printFormat).toContain("'wholesale-gst-a4'");
    expect(printFormat).toMatch(/A4_ONLY_INVOICE_TEMPLATES = new Set\(\[[\s\S]*wholesale-gst-a4/);
    expect(printFormat).toMatch(/FULL_PAGE_INVOICE_TEMPLATES = new Set\(\[[\s\S]*wholesale-gst-a4/);

    const wrapper = readFileSync(resolve(here, "../InvoiceWrapper.tsx"), "utf8");
    expect(wrapper).toContain("WholesaleGstA4Template");
    expect(wrapper).toContain("case 'wholesale-gst-a4'");

    const picker = readFileSync(resolve(here, "../settings/InvoiceTemplateSelectItems.tsx"), "utf8");
    expect(picker).toContain('value="wholesale-gst-a4"');
    expect(picker).toContain("Wholesale GST A4");
    expect(picker).toMatch(/<SelectLabel>A4 Size<\/SelectLabel>[\s\S]*value="wholesale-gst-a4"/);
    const posForm = readFileSync(resolve(here, "../settings/PosSettingsForm.tsx"), "utf8");
    expect(posForm).toContain("InvoiceTemplateSelectItems");
    expect(posForm).not.toContain('paperGroups={posThermal ? "thermal-80mm" : "all"}');
  });
});
