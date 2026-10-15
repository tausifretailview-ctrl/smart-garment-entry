import { describe, expect, it } from "vitest";
import {
  describeImportDbError,
  formatImportFailureSummary,
  normalizeImportGstPercent,
} from "@/utils/purchaseImportErrors";

describe("purchaseImportErrors", () => {
  it("reads percent-formatted GST cells as whole slabs", () => {
    expect(normalizeImportGstPercent(0.05)).toBe(5);
    expect(normalizeImportGstPercent(0.18)).toBe(18);
    expect(normalizeImportGstPercent(12)).toBe(12);
    expect(normalizeImportGstPercent(0)).toBe(0);
    expect(normalizeImportGstPercent(Number.NaN)).toBe(0);
  });

  it("explains common insert failures in plain words", () => {
    expect(
      describeImportDbError(
        { code: "23514", message: 'new row for relation "products" violates check constraint "products_gst_per_check"' },
        { what: "product", gstPer: 3 },
      ),
    ).toBe("GST % 3 is not allowed (use 0, 5, 12, 18, 28)");
    expect(
      describeImportDbError({
        code: "23505",
        message: 'duplicate key value violates unique constraint "idx_unique_active_product_name_per_org"',
        details: "Key (organization_id, lower(TRIM(BOTH FROM product_name)))=(x, y) already exists.",
      }),
    ).toBe("A product with this name already exists");
    expect(
      describeImportDbError({ code: "22P02", message: 'invalid input syntax for type integer: "0.05"' }),
    ).toBe('"0.05" is not a valid whole number');
    expect(describeImportDbError({ code: "42501", message: "new row violates row-level security policy" })).toBe(
      "No permission to create products for this shop",
    );
    expect(describeImportDbError({ message: "something odd" })).toBe("something odd");
  });

  it("lists failed rows by Excel row number", () => {
    const text = formatImportFailureSummary(
      [
        { excelRow: 5, productName: "MaxStride Lite", reason: "A number is too large" },
        { excelRow: 2, productName: "AMF1 SoftridePro", reason: "No permission to create products for this shop" },
        { excelRow: 9, productName: "X", reason: "r" },
      ],
      2,
    );
    expect(text).toBe(
      "Row 2: AMF1 SoftridePro · No permission to create products for this shop\nRow 5: MaxStride Lite · A number is too large\n…and 1 more rows",
    );
  });
});
