import { describe, expect, it } from "vitest";
import {
  SALE_INVOICE_PREVIEW_FIELDS,
  SALE_INVOICE_PREVIEW_SELECT,
} from "./mobileInvoicePreviewData";

describe("SALE_INVOICE_PREVIEW_SELECT", () => {
  it("loads credit_applied from sales, never the missing credit_amount column", () => {
    expect(SALE_INVOICE_PREVIEW_FIELDS).toContain("credit_applied");
    expect(SALE_INVOICE_PREVIEW_FIELDS).not.toContain("credit_amount");
    for (const col of SALE_INVOICE_PREVIEW_FIELDS) {
      expect(SALE_INVOICE_PREVIEW_SELECT.includes(col)).toBe(true);
    }
    expect(SALE_INVOICE_PREVIEW_SELECT).not.toMatch(/\bcredit_amount\b/);
    expect(SALE_INVOICE_PREVIEW_SELECT).toContain("customers:customer_id");
  });
});
