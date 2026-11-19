import { describe, expect, it } from "vitest";
import {
  SALE_INVOICE_EXPORT_HEADERS,
  buildSaleInvoiceSheetRows,
  saleInvoiceExportFileBase,
  saleInvoicePdfPageFormat,
  type SaleInvoiceExportData,
} from "./saleInvoiceExport";

const base: SaleInvoiceExportData = {
  businessName: "DEMO SHOP",
  billNo: "INV/26-27/15",
  date: new Date(2026, 10, 19),
  customerName: "RAVI KUMAR",
  customerPhone: "9876543210",
  taxType: "inclusive",
  lines: [
    { productName: "COTTON SHIRT", size: "M", color: "BLUE", barcode: "100001", hsn: "6205", qty: 2, mrp: 999, rate: 999, discountPercent: 10, gstPercent: 5, total: 1798.2 },
    { productName: "JEANS", size: "32", qty: 1, rate: 1500, total: 1500 },
  ],
  summary: [
    { label: "Gross", amount: 3498, always: true },
    { label: "Discount", amount: -199.8, always: true },
    { label: "Other Charges", amount: 0 },
    { label: "Round Off", amount: -0.2 },
    { label: "Net Payable", amount: 3298, always: true },
  ],
};

describe("saleInvoiceExport", () => {
  it("writes header, item table with totals, and only non-zero optional totals", () => {
    const rows = buildSaleInvoiceSheetRows(base);
    expect(rows[0]).toEqual(["DEMO SHOP"]);
    expect(rows[1]).toEqual(["SALE INVOICE"]);
    expect(rows).toContainEqual(["Invoice No", "INV/26-27/15", "", "Date", "19-11-2026"]);
    expect(rows).toContainEqual(["Customer", "RAVI KUMAR"]);
    const h = rows.findIndex((r) => r[0] === "Sr");
    expect(rows[h]).toEqual([...SALE_INVOICE_EXPORT_HEADERS]);
    expect(rows[h + 1]).toEqual([1, "COTTON SHIRT", "M", "BLUE", "100001", "6205", 2, 999, 999, 10, 5, 1798.2]);
    expect(rows[h + 2]).toEqual([2, "JEANS", "32", "", "", "", 1, 0, 1500, 0, 0, 1500]);
    expect(rows[h + 3]).toEqual(["", "Total", "", "", "", "", 3, "", "", "", "", 3298.2]);
    const labels = rows.filter((r) => r.length === 12 && r[0] === "" && r[1] === "").map((r) => r[10]);
    expect(labels).toEqual(["Gross", "Discount", "Round Off", "Net Payable"]);
  });

  it("marks an unsaved bill as DRAFT", () => {
    const rows = buildSaleInvoiceSheetRows({ ...base, billNo: "DRAFT" });
    expect(rows[1][0]).toContain("DRAFT");
  });

  it("builds safe file names and page formats", () => {
    expect(saleInvoiceExportFileBase("INV/26-27/15", new Date(2026, 10, 19))).toBe("Invoice_INV-26-27-15_19112026");
    expect(saleInvoiceExportFileBase("", new Date(2026, 0, 2))).toBe("Invoice_DRAFT_02012026");
    expect(saleInvoicePdfPageFormat("thermal")).toBe("thermal");
    expect(saleInvoicePdfPageFormat("a5-horizontal")).toBe("a5");
    expect(saleInvoicePdfPageFormat(undefined)).toBe("a4");
  });
});
