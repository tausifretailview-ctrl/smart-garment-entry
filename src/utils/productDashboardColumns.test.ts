import { describe, expect, it } from "vitest";
import { columnHasVisibleValue, isBlankDisplayValue } from "./productDashboardColumns";

describe("isBlankDisplayValue", () => {
  it("treats empty text and dashes as blank", () => {
    expect(isBlankDisplayValue("")).toBe(true);
    expect(isBlankDisplayValue("  ")).toBe(true);
    expect(isBlankDisplayValue("—")).toBe(true);
    expect(isBlankDisplayValue(null)).toBe(true);
  });

  it("keeps numbers, including zero", () => {
    expect(isBlankDisplayValue(0)).toBe(false);
    expect(isBlankDisplayValue("Black")).toBe(false);
  });
});

describe("columnHasVisibleValue", () => {
  it("hides a column only when every row is blank", () => {
    const rows = [{ brand: "" }, { brand: "—" }, { brand: "  " }];
    expect(columnHasVisibleValue(rows, (row) => row.brand)).toBe(false);
    expect(columnHasVisibleValue([{ brand: "" }, { brand: "BATA" }], (row) => row.brand)).toBe(true);
    expect(columnHasVisibleValue([], (row: { brand: string }) => row.brand)).toBe(true);
  });
});
