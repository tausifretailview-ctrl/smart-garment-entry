import { describe, expect, it } from "vitest";
import { buildPublicInvoiceViewUrl, resolvePublicInvoicePaperFormat } from "./publicInvoiceLink";

describe("resolvePublicInvoicePaperFormat", () => {
  it("uses sale invoice paper format for sales context", () => {
    expect(
      resolvePublicInvoicePaperFormat("sale", {
        invoice_paper_format: "a5-vertical",
        pos_bill_format: "thermal",
      }),
    ).toBe("a5-vertical");
  });

  it("uses pos bill format for pos context", () => {
    expect(
      resolvePublicInvoicePaperFormat("pos", {
        invoice_paper_format: "a4",
        pos_bill_format: "thermal",
      }),
    ).toBe("thermal");
  });
});

describe("buildPublicInvoiceViewUrl", () => {
  it("builds full mobile view link for sale A4", () => {
    expect(
      buildPublicInvoiceViewUrl({
        orgSlug: "demo-shop",
        saleId: "abc-123",
        billContext: "sale",
        saleSettings: {
          invoice_paper_format: "a4",
          invoice_template: "professional",
        },
      }),
    ).toBe(
      "https://app.inventoryshop.in/demo-shop/invoice/view/abc-123?template=professional",
    );
  });

  it("builds thermal link for POS thermal", () => {
    expect(
      buildPublicInvoiceViewUrl({
        orgSlug: "demo-shop",
        saleId: "abc-123",
        billContext: "pos",
        saleSettings: { pos_bill_format: "thermal" },
      }),
    ).toBe("https://app.inventoryshop.in/demo-shop/invoice/view/abc-123?format=thermal");
  });
});
