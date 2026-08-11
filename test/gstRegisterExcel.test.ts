import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  generateGSTRegisterExcel,
  type SalesRegisterRow,
  type SaleReturnRegisterRow,
  type PurchaseRegisterRow,
  type PurchaseReturnRegisterRow,
} from "@/utils/gstRegisterUtils";

const sale: SalesRegisterRow = {
  sno: 1,
  invoiceNo: "INV/26-27/21",
  invoiceDate: "01-04-2026",
  partyName: "TEST PARTY",
  gstin: "27AAAAA0000A1Z5",
  taxable_0: 0,
  taxable_5: 1000, cgst_2_5: 25, sgst_2_5: 25, igst_5: 0,
  taxable_12: 0, cgst_6: 0, sgst_6: 0, igst_12: 0,
  taxable_18: 2000, cgst_9: 0, sgst_9: 0, igst_18: 360,
  taxable_28: 0, cgst_14: 0, sgst_14: 0, igst_28: 0,
  invoiceValue: 3410,
};
const saleReturn: SaleReturnRegisterRow = {
  sno: 1, invoiceNo: "SR/26-27/1", invoiceDate: "02-04-2026",
  partyName: "TEST PARTY", gstin: "27AAAAA0000A1Z5",
  taxableValue: 500, cgst: 12.5, sgst: 12.5, igst: 0, invoiceValue: 525,
};
const purchase: PurchaseRegisterRow = { ...sale, invoiceNo: "PUR-1" };
const purchaseReturn: PurchaseReturnRegisterRow = { ...saleReturn, invoiceNo: "PR-1" };

describe("GST Register Excel export (post lazy-xlsx conversion)", () => {
  it("produces a real workbook with populated sheets and correct totals", async () => {
    const wb = await generateGSTRegisterExcel(
      [sale], [saleReturn], [purchase], [purchaseReturn],
      "TEST BUSINESS", "27AAAAA0000A1Z5",
      new Date("2026-04-01"), new Date("2026-04-30"),
      [sale],
    );

    expect(wb.SheetNames.length).toBeGreaterThanOrEqual(4);

    // Serializing must succeed and yield a non-empty file (GSTR-3B empty-file regression class).
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    expect(buf.byteLength).toBeGreaterThan(2000);

    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1 }) as unknown[][];
    const flat = rows.flat().map(String);

    expect(flat.some((c) => c.includes("TEST BUSINESS"))).toBe(true);
    expect(flat.some((c) => c.includes("27AAAAA0000A1Z5"))).toBe(true);
    expect(flat).toContain("INV/26-27/21");
    // Tax figures must survive the lazy import unchanged.
    expect(rows.some((r) => r.includes(3410))).toBe(true);
    expect(rows.some((r) => r.includes(360))).toBe(true);
  });
});
