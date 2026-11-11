import { describe, expect, it } from "vitest";
import {
  encodePosLinePurchaseCode,
  resolvePurchaseCodeGstPer,
  applyPurchaseCodeDiscount,
  resolvePurchaseCodeDiscount,
  encodePurchasePrice,
  encodePurchasePriceForLabel,
  getEffectivePurchasePrice,
  normalizePurchaseBillDate,
  normalizePurchaseCodeAlphabet,
  resolveLabelPurchaseBillDate,
  resolvePosDashboardPurchaseCodeEnabled,
  resolvePosPurchaseCodeEnabled,
  resolvePurchaseCodeAlphabet,
  resolvePurchaseCodeIncludeDate,
  validatePurchaseCodeAlphabet,
} from "./purchaseCodeEncoder";

/** Rahmani NX handwritten mapping: 0=N 1=E 2=A 3=S 4=Y 5=F 6=I 7=T 8=O 9=W */
const RAHMANI_ALPHABET = "NEASYFITOW";

describe("getEffectivePurchasePrice extra percent", () => {
  it("leaves the purchase rate unchanged when extra % is disabled", () => {
    expect(getEffectivePurchasePrice(500, 0, false, false, 10)).toBe(500);
  });

  it("adds 10% on the purchase rate for the label alphabet (500 → 550)", () => {
    expect(getEffectivePurchasePrice(500, 0, false, true, 10)).toBe(550);
  });

  it("does not apply a 0 extra percent even when enabled", () => {
    expect(getEffectivePurchasePrice(500, 0, false, true, 0)).toBe(500);
  });

  it("applies extra % after GST when both are enabled", () => {
    // 500 + 5% GST = 525; + 10% = 577.5 → 578
    expect(getEffectivePurchasePrice(500, 5, true, true, 10)).toBe(578);
  });
});

describe("Rahmani NX purchase code alphabet", () => {
  it("encodes purchase 3190 as SEWN (3=S 1=E 9=W 0=N), not default 09DBKA26", () => {
    expect(encodePurchasePrice(3190, RAHMANI_ALPHABET)).toBe("SEWN");
    expect(encodePurchasePrice(3190.0, RAHMANI_ALPHABET)).toBe("SEWN");
    expect(encodePurchasePrice(3190, RAHMANI_ALPHABET, "2026-09-12")).toBe("SEWN");
  });

  it("does not print the default ABCDEFGHIK mapping for 3190", () => {
    expect(encodePurchasePrice(3190, "ABCDEFGHIK")).toBe("DBKA");
    expect(encodePurchasePrice(3190, RAHMANI_ALPHABET)).not.toBe("DBKA");
    expect(encodePurchasePrice(3190, RAHMANI_ALPHABET)).not.toContain("09");
  });

  it("wraps month/year only when includeDate is opted in", () => {
    expect(encodePurchasePrice(3190, RAHMANI_ALPHABET, "2026-09-12", { includeDate: true })).toBe(
      "09SEWN26",
    );
    expect(encodePurchasePrice(3190, "ABCDEFGHIK", "2026-09-12", { includeDate: true })).toBe(
      "09DBKA26",
    );
  });

  it("accepts the 11-letter handwritten list NEASYFITOWN as NEASYFITOW", () => {
    expect(normalizePurchaseCodeAlphabet("NEASYFITOWN")).toBe(RAHMANI_ALPHABET);
    expect(encodePurchasePrice(3190, "NEASYFITOWN")).toBe("SEWN");
    expect(validatePurchaseCodeAlphabet("NEASYFITOWN")).toBe(true);
  });
});

describe("encodePurchasePrice with extra rate", () => {
  it("encodes 550 as FFA with ABCDEFGHIK (5=F, 5=F, 0=A)", () => {
    const encoded = encodePurchasePrice(550, "ABCDEFGHIK", "2026-08-19");
    expect(encoded).toBe("FFA");
  });

  it("still embeds FFA when date wrapping is on", () => {
    const encoded = encodePurchasePrice(550, "ABCDEFGHIK", "2026-08-19", { includeDate: true });
    expect(encoded).toBe("08FFA26");
  });
});

describe("normalize / resolve alphabet", () => {
  it("uppercases and strips junk", () => {
    expect(normalizePurchaseCodeAlphabet(" neasyfitow ")).toBe(RAHMANI_ALPHABET);
  });

  it("falls back to ABCDEFGHIK only when the alphabet is empty or unusable", () => {
    expect(resolvePurchaseCodeAlphabet("")).toBe("ABCDEFGHIK");
    expect(resolvePurchaseCodeAlphabet(undefined)).toBe("ABCDEFGHIK");
    expect(resolvePurchaseCodeAlphabet("ABC")).toBe("ABCDEFGHIK");
    expect(resolvePurchaseCodeAlphabet(RAHMANI_ALPHABET)).toBe(RAHMANI_ALPHABET);
  });

  it("does not silently swap a valid custom alphabet for the default", () => {
    expect(encodePurchasePrice(100, RAHMANI_ALPHABET)).toBe("ENN");
    expect(encodePurchasePrice(100, "ABCDEFGHIK")).toBe("BAA");
  });
});

describe("resolvePurchaseCodeIncludeDate", () => {
  it("defaults to true when unset or null", () => {
    expect(resolvePurchaseCodeIncludeDate(undefined)).toBe(true);
    expect(resolvePurchaseCodeIncludeDate(null)).toBe(true);
    expect(resolvePurchaseCodeIncludeDate({})).toBe(true);
    expect(resolvePurchaseCodeIncludeDate({ purchase_code_include_date: null })).toBe(true);
  });

  it("respects explicit false", () => {
    expect(resolvePurchaseCodeIncludeDate({ purchase_code_include_date: false })).toBe(false);
  });

  it("respects explicit true", () => {
    expect(resolvePurchaseCodeIncludeDate({ purchase_code_include_date: true })).toBe(true);
  });
});

describe("encodePurchasePriceForLabel", () => {
  it("uses the org alphabet and purchase amount, ignoring sale/MRP", () => {
    expect(
      encodePurchasePriceForLabel(3190, RAHMANI_ALPHABET, { includeDate: false }),
    ).toBe("SEWN");
  });

  it("wraps month/year by default when billDate is provided", () => {
    expect(
      encodePurchasePriceForLabel(3190, RAHMANI_ALPHABET, { billDate: "2026-09-12" }),
    ).toBe("09SEWN26");
  });

  it("skips date wrap when includeDate is false", () => {
    expect(
      encodePurchasePriceForLabel(3190, RAHMANI_ALPHABET, {
        billDate: "2026-09-12",
        includeDate: false,
      }),
    ).toBe("SEWN");
  });

  it("returns empty when there is no purchase price", () => {
    expect(encodePurchasePriceForLabel(0, RAHMANI_ALPHABET)).toBe("");
    expect(encodePurchasePriceForLabel(null, RAHMANI_ALPHABET)).toBe("");
  });
});

describe("purchase invoice date on the barcode code", () => {
  it("keeps September when the entry form was reset to October", () => {
    const invoiceDate = resolveLabelPurchaseBillDate({
      savedInvoiceDate: "2026-09-18",
      itemBillDate: "2026-10-06",
    });
    expect(invoiceDate).toBe("2026-09-18");
    expect(
      encodePurchasePrice(3190, RAHMANI_ALPHABET, invoiceDate, { includeDate: true }),
    ).toBe("09SEWN26");
  });

  it("reads the calendar day from an ISO timestamp without shifting the month", () => {
    expect(normalizePurchaseBillDate("2026-09-01T00:00:00.000Z")).toBe("2026-09-01");
    expect(
      encodePurchasePrice(100, "ABCDEFGHIK", "2026-09-01T00:00:00.000Z", { includeDate: true }),
    ).toBe("09BAA26");
  });

  it("uses the line date only when the saved invoice date is missing", () => {
    expect(
      resolveLabelPurchaseBillDate({
        savedInvoiceDate: null,
        itemBillDate: "2026-09-30",
      }),
    ).toBe("2026-09-30");
    expect(resolveLabelPurchaseBillDate({ savedInvoiceDate: "  ", itemBillDate: "" })).toBeUndefined();
  });
});

describe("POS cart purchase code", () => {
  it("is off unless the org enables it", () => {
    expect(resolvePosPurchaseCodeEnabled(undefined)).toBe(false);
    expect(resolvePosPurchaseCodeEnabled({ show_purchase_code: true } as never)).toBe(false);
    expect(resolvePosPurchaseCodeEnabled({ show_purchase_code_on_pos: true })).toBe(true);
  });

  it("shows letters only, without the month/year wrap", () => {
    expect(
      encodePosLinePurchaseCode({ purPrice: 3190 }, { purchase_code_alphabet: RAHMANI_ALPHABET }),
    ).toBe("SEWN");
  });

  it("follows the label GST and extra % options", () => {
    expect(
      encodePosLinePurchaseCode(
        { purPrice: 500, purchaseGstPer: 5 },
        { purchase_code_alphabet: "ABCDEFGHIK", purchase_code_include_gst: true },
      ),
    ).toBe("FCF");
    expect(
      encodePosLinePurchaseCode(
        { purPrice: 500 },
        {
          purchase_code_alphabet: "ABCDEFGHIK",
          purchase_code_extra_percent_enabled: true,
          purchase_code_extra_percent: 10,
        },
      ),
    ).toBe("FFA");
  });

  it("is blank when the line has no purchase price", () => {
    expect(encodePosLinePurchaseCode({ purPrice: 0 }, {})).toBe("");
    expect(encodePosLinePurchaseCode({}, {})).toBe("");
  });
});

describe("resolvePosDashboardPurchaseCodeEnabled", () => {
  it("is off unless Settings → POS turns it on", () => {
    expect(resolvePosDashboardPurchaseCodeEnabled(undefined)).toBe(false);
    expect(resolvePosDashboardPurchaseCodeEnabled({})).toBe(false);
    expect(resolvePosDashboardPurchaseCodeEnabled({ pos_dashboard_show_purchase_code: false })).toBe(false);
    expect(resolvePosDashboardPurchaseCodeEnabled({ pos_dashboard_show_purchase_code: true })).toBe(true);
  });
});

describe("label and POS purchase code agree", () => {
  const ALPHABET = "FAMILYSHOP";
  // Every on/off combination of the Purchase settings that changes the letters.
  const combos = [false, true].flatMap((includeGst) =>
    [false, true].map((extraOn) => ({ includeGst, extraOn })),
  );
  const product = { purchase_gst_percent: 5, gst_per: 12 };

  it.each(combos)("GST $includeGst, extra % $extraOn: same letters", ({ includeGst, extraOn }) => {
    const settings = {
      purchase_code_alphabet: ALPHABET,
      purchase_code_include_gst: includeGst,
      purchase_code_extra_percent_enabled: extraOn,
      purchase_code_extra_percent: 10,
    };
    const gstPer = resolvePurchaseCodeGstPer(product, 18);
    const pos = encodePosLinePurchaseCode({ purPrice: 3190, purchaseGstPer: gstPer }, settings);
    const labelOpts = { gstPer, includeGst, extraPercentEnabled: extraOn, extraPercent: 10 };
    const labelNoDate = encodePurchasePriceForLabel(3190, ALPHABET, { ...labelOpts, includeDate: false });
    const labelDated = encodePurchasePriceForLabel(3190, ALPHABET, {
      ...labelOpts,
      includeDate: true,
      billDate: "2026-09-14",
    });
    expect(labelNoDate).toBe(pos);
    // Date on: the label only adds month before and year after the same letters.
    expect(labelDated).toBe(`09${pos}26`);
  });

  it("uses the product purchase GST, then product GST, then the bill line", () => {
    expect(resolvePurchaseCodeGstPer({ purchase_gst_percent: 5, gst_per: 12 }, 18)).toBe(5);
    expect(resolvePurchaseCodeGstPer({ purchase_gst_percent: null, gst_per: 12 }, 18)).toBe(12);
    // A saved 0% purchase GST is a real value, not "missing" — POS reads it the same way.
    expect(resolvePurchaseCodeGstPer({ purchase_gst_percent: 0, gst_per: 12 }, 18)).toBe(0);
    expect(resolvePurchaseCodeGstPer(null, 18)).toBe(18);
    expect(resolvePurchaseCodeGstPer(undefined, undefined)).toBe(0);
  });
});

describe("purchase discount in the code", () => {
  it("takes the product discount off the rate, like Product Entry's Net Purchase Price", () => {
    expect(applyPurchaseCodeDiscount(1000, { type: "percent", value: 10 })).toBe(900);
    expect(applyPurchaseCodeDiscount(1000, { type: "flat", value: 150 })).toBe(850);
    // Untyped discount is a percent, as Product Entry saves it.
    expect(applyPurchaseCodeDiscount(1000, { type: null, value: 5 })).toBe(950);
    expect(applyPurchaseCodeDiscount(1000, { type: "flat", value: 5000 })).toBe(0);
    expect(applyPurchaseCodeDiscount(1000, null)).toBe(1000);
    expect(applyPurchaseCodeDiscount(1000, { type: "percent", value: 0 })).toBe(1000);
  });

  it("reads the discount off the product row", () => {
    expect(resolvePurchaseCodeDiscount({ purchase_discount_type: "flat", purchase_discount_value: 20 })).toEqual({
      type: "flat",
      value: 20,
    });
    expect(resolvePurchaseCodeDiscount(null)).toEqual({ type: null, value: 0 });
  });

  it("discount comes off before GST and extra %, and label and POS agree", () => {
    const settings = {
      purchase_code_alphabet: "ABCDEFGHIK",
      purchase_code_include_gst: true,
      purchase_code_extra_percent_enabled: true,
      purchase_code_extra_percent: 10,
    };
    const purchaseDiscount = { type: "percent", value: 10 };
    // 1000 − 10% = 900, + 5% GST = 945, + 10% = 1039.5 → 1040 → BAEA
    const pos = encodePosLinePurchaseCode({ purPrice: 1000, purchaseGstPer: 5, purchaseDiscount }, settings);
    const label = encodePurchasePriceForLabel(1000, "ABCDEFGHIK", {
      gstPer: 5,
      includeGst: true,
      extraPercentEnabled: true,
      extraPercent: 10,
      purchaseDiscount,
      includeDate: false,
    });
    expect(pos).toBe("BAEA");
    expect(label).toBe(pos);
  });

  it("with every option off the code is just the discounted rate", () => {
    expect(
      encodePosLinePurchaseCode(
        { purPrice: 400, purchaseDiscount: { type: "percent", value: 25 } },
        { purchase_code_alphabet: "ABCDEFGHIK" },
      ),
    ).toBe("DAA");
  });
});
