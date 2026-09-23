import { describe, expect, it } from "vitest";
import { buildPublicInvoiceViewUrl, resolvePublicInvoicePaperFormat } from "./publicInvoiceLink";

describe("resolvePublicInvoicePaperFormat", () => {
  it("uses sale invoice paper format for sales context", () => {
    expect(
      resolvePublicInvoicePaperFormat("sale", { invoice_paper_format: "a5-vertical", pos_bill_format: "thermal" }),
    ).toBe("a5-vertical");
  });

  it("uses pos bill format for pos context", () => {
    expect(
      resolvePublicInvoicePaperFormat("pos", { invoice_paper_format: "a4", pos_bill_format: "thermal" }),
    ).toBe("thermal");
  });
});

describe("buildPublicInvoiceViewUrl (short link)", () => {
  it("builds short sale link", () => {
    expect(
      buildPublicInvoiceViewUrl({ orgSlug: "demo-shop", saleId: "abc-123", billContext: "sale" }),
    ).toBe("https://app.inventoryshop.in/i/abc-123");
  });

  it("builds short POS link flagged with p=1", () => {
    expect(
      buildPublicInvoiceViewUrl({
        orgSlug: "demo-shop",
        saleId: "abc-123",
        billContext: "pos",
        saleSettings: { pos_bill_format: "thermal", pos_invoice_template: "vastrakala-80mm" },
      }),
    ).toBe("https://app.inventoryshop.in/i/abc-123?p=1");
  });

  it("returns empty without org slug or sale id", () => {
    expect(buildPublicInvoiceViewUrl({ orgSlug: "", saleId: "x" })).toBe("");
  });
});
