import { describe, expect, it } from "vitest";
import { sanitizeSheetName, tabularRowsToRecords } from "./accountsTabularExport";

describe("tabularRowsToRecords", () => {
  it("maps columns into sheet rows and blanks empty values", () => {
    const rows = tabularRowsToRecords(
      [
        { header: "Voucher No", value: (row: { no: string }) => row.no },
        { header: "Amount", align: "right" as const, value: (row: { amount: number | null }) => row.amount },
        { header: "Note", value: () => "" },
      ],
      [{ no: "RV-1", amount: 120.5 }, { no: "RV-2", amount: null }],
    );

    expect(rows).toEqual([
      { "Voucher No": "RV-1", Amount: 120.5, Note: "" },
      { "Voucher No": "RV-2", Amount: "", Note: "" },
    ]);
  });
});

describe("sanitizeSheetName", () => {
  it("strips illegal characters and caps length at 31", () => {
    expect(sanitizeSheetName("Payment/Reconciliation: Q1")).toBe("Payment Reconciliation Q1");
    expect(sanitizeSheetName("x".repeat(40))).toHaveLength(31);
    expect(sanitizeSheetName("   ")).toBe("Sheet");
  });
});
