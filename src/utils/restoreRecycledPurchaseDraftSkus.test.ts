import { describe, expect, it } from "vitest";
import { shouldRestoreRecycledDraftVariant } from "./restoreRecycledPurchaseDraftSkus";

const KS = "4bc73037-e877-4123-9261-eb6e3876698c";

describe("shouldRestoreRecycledDraftVariant", () => {
  it("restores a recycled generated SKU still sitting on the KS Footwear draft", () => {
    expect(
      shouldRestoreRecycledDraftVariant(
        {
          organization_id: KS,
          deleted_at: "2026-09-07T10:00:00.000Z",
          stock_qty: 0,
          barcode_source: "generated",
          barcode: "1000000605",
        },
        KS,
      ),
    ).toBe(true);
  });

  it("does not restore a live SKU, another org, or a SKU that already has stock", () => {
    expect(
      shouldRestoreRecycledDraftVariant(
        {
          organization_id: KS,
          deleted_at: null,
          stock_qty: 0,
          barcode_source: "generated",
          barcode: "1000000605",
        },
        KS,
      ),
    ).toBe(false);
    expect(
      shouldRestoreRecycledDraftVariant(
        {
          organization_id: "other-org",
          deleted_at: "2026-09-07T10:00:00.000Z",
          stock_qty: 0,
          barcode_source: "generated",
          barcode: "1000000605",
        },
        KS,
      ),
    ).toBe(false);
    expect(
      shouldRestoreRecycledDraftVariant(
        {
          organization_id: KS,
          deleted_at: "2026-09-07T10:00:00.000Z",
          stock_qty: 12,
          barcode_source: "generated",
          barcode: "1000000605",
        },
        KS,
      ),
    ).toBe(false);
  });

  it("never undeletes a manufacturer EAN", () => {
    expect(
      shouldRestoreRecycledDraftVariant(
        {
          organization_id: KS,
          deleted_at: "2026-09-07T10:00:00.000Z",
          stock_qty: 0,
          barcode_source: "external",
          barcode: "8901326331101",
        },
        KS,
      ),
    ).toBe(false);
  });
});
