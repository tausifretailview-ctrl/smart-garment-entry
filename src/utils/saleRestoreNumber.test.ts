import { describe, expect, it } from "vitest";
import {
  formatSaleRestoreNumberNote,
  friendlySaleNumberRestoreError,
  isSaleNumberActiveUniqueViolation,
  saleRestoreNumberKind,
  shouldKeepOriginalSaleNumber,
} from "./saleRestoreNumber";

describe("saleRestoreNumber", () => {
  it("detects the Trendzo recycle-bin unique constraint", () => {
    expect(
      isSaleNumberActiveUniqueViolation({
        code: "23505",
        message: 'duplicate key value violates unique constraint "uq_sales_org_number_active"',
      }),
    ).toBe(true);
    expect(isSaleNumberActiveUniqueViolation({ message: "other" })).toBe(false);
  });

  it("POS and delivery challan use the POS number series", () => {
    expect(saleRestoreNumberKind("pos")).toBe("pos");
    expect(saleRestoreNumberKind("delivery_challan")).toBe("pos");
    expect(saleRestoreNumberKind("sale")).toBe("sale");
  });

  it("keeps the original number when the colliding bill is newer (mistaken delete + reuse)", () => {
    expect(
      shouldKeepOriginalSaleNumber("2026-08-30T10:00:00Z", "2026-08-31T08:00:00Z"),
    ).toBe(true);
  });

  it("does not steal the number from an older active bill", () => {
    expect(
      shouldKeepOriginalSaleNumber("2026-08-31T10:00:00Z", "2026-08-01T08:00:00Z"),
    ).toBe(false);
  });

  it("explains restore: original number + original date, newer bill moved", () => {
    expect(
      formatSaleRestoreNumberNote({
        keepOriginal: true,
        originalNumber: "POS/26-27/50",
        reassignedNumber: "POS/26-27/51",
        saleDate: "2026-08-30",
      }),
    ).toBe(
      "Restored POS/26-27/50 dated 2026-08-30. A newer bill had reused that number and is now POS/26-27/51.",
    );
  });

  it("explains restore when this bill must take the next number", () => {
    expect(
      formatSaleRestoreNumberNote({
        keepOriginal: false,
        originalNumber: "POS/26-27/50",
        reassignedNumber: "POS/26-27/51",
        saleDate: "2026-08-30",
      }),
    ).toBe(
      "Restored as POS/26-27/51 dated 2026-08-30 because POS/26-27/50 is already used by another bill.",
    );
  });

  it("maps the raw Postgres error to a restore instruction", () => {
    expect(friendlySaleNumberRestoreError("POS/26-27/50")).toContain("POS/26-27/50");
    expect(friendlySaleNumberRestoreError("POS/26-27/50")).toContain("original date");
  });
});
