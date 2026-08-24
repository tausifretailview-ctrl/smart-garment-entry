import { describe, expect, it } from "vitest";
import {
  parseProductEntryUnsavedDraft,
  productEntryDraftIsMeaningful,
  PRODUCT_ENTRY_UNSAVED_DRAFT_MAX_AGE_MS,
  restoredProductVariantLockMatches,
} from "./productEntryUnsavedDraft";

const filled = {
  v: 1 as const,
  savedAt: 1_000_000,
  formData: {
    product_name: "FL505",
    category: "Footwear",
    brand: "",
    style: "",
    colors: ["BLACK"],
    size_group_id: "g1",
    hsn_code: "",
    gst_per: 18,
    default_pur_price: 200,
    default_sale_price: 230.65,
  },
  colorInput: "",
  markupPercent: "",
  selectedSizes: ["7"],
  disabledSizes: [],
  customSizes: [],
  customSizeInput: "",
  variants: [{ size: "7", color: "BLACK", purchase_qty: 12, barcode: "", pur_price: 200, sale_price: 230.65 }],
  showVariants: true,
  mobileERPQty: 1,
  colorRollLengths: {},
  rollWiseMtrEnabled: false,
};

describe("productEntryDraftIsMeaningful", () => {
  it("treats a named product with qty as worth restoring", () => {
    expect(productEntryDraftIsMeaningful(filled)).toBe(true);
  });

  it("ignores a blank new-product form", () => {
    expect(
      productEntryDraftIsMeaningful({
        formData: { product_name: "", colors: [], default_pur_price: 0 },
        variants: [{ purchase_qty: 0, barcode: "" }],
        selectedSizes: [],
      }),
    ).toBe(false);
  });
});

describe("parseProductEntryUnsavedDraft", () => {
  it("round-trips a filled accidental-close snapshot", () => {
    const parsed = parseProductEntryUnsavedDraft(JSON.stringify(filled), filled.savedAt + 1000);
    expect(parsed?.formData.product_name).toBe("FL505");
    expect(parsed?.variants).toHaveLength(1);
    expect(parsed?.selectedSizes).toEqual(["7"]);
  });

  it("drops drafts older than 48 hours", () => {
    expect(
      parseProductEntryUnsavedDraft(
        JSON.stringify(filled),
        filled.savedAt + PRODUCT_ENTRY_UNSAVED_DRAFT_MAX_AGE_MS + 1,
      ),
    ).toBeNull();
  });

  it("drops empty or corrupt payloads", () => {
    expect(parseProductEntryUnsavedDraft(null)).toBeNull();
    expect(parseProductEntryUnsavedDraft("{")).toBeNull();
    expect(
      parseProductEntryUnsavedDraft(
        JSON.stringify({ ...filled, formData: {}, variants: [], selectedSizes: [] }),
        filled.savedAt,
      ),
    ).toBeNull();
  });
});

describe("restoredProductVariantLockMatches", () => {
  it("holds restored variants until the user changes size/color", () => {
    const lock = {
      sizeGroupId: "g1",
      colorsKey: JSON.stringify(["BLACK"]),
      customSizesKey: JSON.stringify([]),
      mobileERPQty: 1,
    };
    expect(
      restoredProductVariantLockMatches(lock, {
        sizeGroupId: "g1",
        colors: ["BLACK"],
        customSizes: [],
        mobileERPQty: 1,
      }),
    ).toBe(true);
    expect(
      restoredProductVariantLockMatches(lock, {
        sizeGroupId: "g1",
        colors: ["BLACK", "BROWN"],
        customSizes: [],
        mobileERPQty: 1,
      }),
    ).toBe(false);
  });
});
