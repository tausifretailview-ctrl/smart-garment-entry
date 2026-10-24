import { describe, expect, it } from "vitest";
import {
  billChecks,
  billToReviewRows,
  defaultSalePrice,
  isPhotoImportEnabled,
  matchSupplier,
  normalizeBillDate,
  reviewRowsToImportRows,
  rowIssues,
  type CatalogMatch,
  type ReadBill,
} from "./purchasePhotoImport";

const bill: ReadBill = {
  supplier_name: "ABC Traders",
  invoice_no: "INV-77",
  invoice_date: "21/10/2026",
  taxable_total: 1500,
  gst_total: 75,
  grand_total: 1625,
  other_charges: 50,
  lines: [
    { product_name: "Cotton Shirt", qty: 5, rate: 200, taxable_amount: 1000, gst_percent: 5, mrp: 499, size: "M" },
    { product_name: "lux soap 100g", qty: 10, rate: 50, gst_percent: 5 },
    { product_name: "  ", qty: 1, rate: 1 },
  ],
};

const catalog: Record<string, CatalogMatch> = {
  "lux soap 100g": { product_name: "LUX SOAP 100G", brand: "LUX", category: "SOAP", style: null, color: null, default_sale_price: 65 },
};
const findMatch = (name: string) => catalog[name.trim().toLowerCase()] ?? null;

describe("bill photo import", () => {
  it("builds review rows, reusing the shop's name, brand and price for known items", () => {
    const rows = billToReviewRows(bill, findMatch, 30);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ product_name: "Cotton Shirt", line_total: 1000, sale_price: 499, matchedName: null });
    expect(rows[1]).toMatchObject({ product_name: "LUX SOAP 100G", brand: "LUX", category: "SOAP", line_total: 500, sale_price: 65 });
  });

  it("prices new items at MRP, else purchase + markup", () => {
    expect(defaultSalePrice(499, 200, 30)).toBe(499);
    expect(defaultSalePrice(0, 200, 30)).toBe(260);
    expect(defaultSalePrice(0, 0, 30)).toBe(0);
  });

  it("checks totals against the printed bill", () => {
    const rows = billToReviewRows(bill, findMatch, 30);
    const checks = billChecks(bill, rows, 50);
    expect(checks.find((c) => c.label === "Taxable total")?.level).toBe("ok");
    expect(checks.find((c) => c.label === "GST")?.level).toBe("ok");
    expect(checks.find((c) => c.label === "Bill total")?.level).toBe("ok");
    const wrong = billChecks({ ...bill, grand_total: 1900 }, rows, 50);
    expect(wrong.find((c) => c.label === "Bill total")?.level).toBe("warn");
  });

  it("flags lines staff must look at", () => {
    const [row] = billToReviewRows(bill, findMatch, 30);
    expect(rowIssues(row)).toEqual([]);
    expect(rowIssues({ ...row, gst_per: 7, hsn_code: "12a" })).toEqual(["GST 7% is not a GST rate", "HSN looks wrong"]);
  });

  it("hands rows to the Excel import with bill fields on the first row only", () => {
    const rows = billToReviewRows(bill, findMatch, 30);
    const out = reviewRowsToImportRows(rows, { supplierName: "ABC Traders", invoiceNo: "INV-77", billDate: "21/10/2026", otherCharges: 50 });
    expect(out[0]).toMatchObject({ bill_supplier_name: "ABC Traders", bill_supplier_invoice_no: "INV-77", bill_other_charges: 50, qty: 5, pur_price: 200 });
    expect(out[1].bill_supplier_name).toBeUndefined();
    expect(out[1]).toMatchObject({ product_name: "LUX SOAP 100G", sale_price: 65 });
  });

  it("is on for every shop unless Settings > Purchase turns it off", () => {
    expect(isPhotoImportEnabled(undefined)).toBe(true);
    expect(isPhotoImportEnabled({})).toBe(true);
    expect(isPhotoImportEnabled({ photo_import_enabled: true })).toBe(true);
    expect(isPhotoImportEnabled({ photo_import_enabled: false })).toBe(false);
  });
});

describe("bill photo header", () => {
  const suppliers = [
    { id: "s1", supplier_name: "Shree Ganesh Traders", gst_number: "27ABCDE1234F1Z5" },
    { id: "s2", supplier_name: "M/s. Patel & Sons", gst_number: null },
  ];
  it("matches the supplier by GSTIN, then by name ignoring M/s and punctuation", () => {
    expect(matchSupplier("Anything", "27abcde1234f1z5", suppliers)?.id).toBe("s1");
    expect(matchSupplier("PATEL AND SONS", null, suppliers)).toBeNull();
    expect(matchSupplier("Patel & Sons", null, suppliers)?.id).toBe("s2");
    expect(matchSupplier("SHREE GANESH TRADERS.", "", suppliers)?.id).toBe("s1");
    expect(matchSupplier("New Supplier", null, suppliers)).toBeNull();
  });

  it("turns printed bill dates into dd/mm/yyyy", () => {
    expect(normalizeBillDate("2026-10-19")).toBe("19/10/2026");
    expect(normalizeBillDate("19/10/26")).toBe("19/10/2026");
    expect(normalizeBillDate("9-Oct-2026")).toBe("09/10/2026");
    expect(normalizeBillDate("19 October 2026")).toBe("19/10/2026");
    expect(normalizeBillDate("")).toBe("");
  });
});
