import { describe, expect, it } from "vitest";
import { trendzoDocumentTitle } from "./trendzoDocumentTitle";

describe("trendzoDocumentTitle", () => {
  it("prints ESTIMATE when the sale invoice header is blank", () => {
    expect(trendzoDocumentTitle({ documentType: "pos", grandTotal: 0, invoiceDocumentTitle: "" })).toBe("ESTIMATE");
    expect(trendzoDocumentTitle({ documentType: "pos", grandTotal: 1020 })).toBe("ESTIMATE");
    expect(trendzoDocumentTitle({ documentType: "invoice", grandTotal: 1020, invoiceDocumentTitle: "   " })).toBe("ESTIMATE");
  });

  it("prints the sale invoice header the shop set", () => {
    expect(trendzoDocumentTitle({ documentType: "pos", grandTotal: 1020, invoiceDocumentTitle: "TAX INVOICE" })).toBe("TAX INVOICE");
    expect(trendzoDocumentTitle({ documentType: "pos", grandTotal: 1020, invoiceDocumentTitle: "bill of supply" })).toBe("BILL OF SUPPLY");
    expect(trendzoDocumentTitle({ documentType: "invoice", grandTotal: 500, invoiceDocumentTitle: " Cash Memo " })).toBe("CASH MEMO");
  });

  it("keeps quotation, sale order, and credit note titles", () => {
    expect(trendzoDocumentTitle({ documentType: "quotation", invoiceDocumentTitle: "TAX INVOICE" })).toBe("QUOTATION");
    expect(trendzoDocumentTitle({ documentType: "sale-order", invoiceDocumentTitle: "TAX INVOICE" })).toBe("SALE ORDER");
    expect(trendzoDocumentTitle({ documentType: "pos", grandTotal: -30, invoiceDocumentTitle: "TAX INVOICE" })).toBe("CREDIT NOTE");
  });
});
