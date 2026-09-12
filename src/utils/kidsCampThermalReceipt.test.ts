import { describe, expect, it } from "vitest";
import {
  buildKidsCampGstRateBreakdown,
  buildKidsCampGstTaxRows,
  fmtKidsCampAmt,
  formatKidsCampMobile,
  instagramHandleFromLink,
  kidsCampLineDiscAmt,
  kidsCampTermLines,
  KIDS_CAMP_DEFAULT_TERMS,
  sumKidsCampGstTaxRows,
} from "./kidsCampThermalReceipt";

describe("instagramHandleFromLink", () => {
  it("strips URL and @ to the handle printed on the Kids Camp slip", () => {
    expect(instagramHandleFromLink("https://instagram.com/kidscamp_wapmen")).toBe("kidscamp_wapmen");
    expect(instagramHandleFromLink("https://www.instagram.com/kidscamp_wapmen/")).toBe("kidscamp_wapmen");
    expect(instagramHandleFromLink("@kidscamp_wapmen")).toBe("kidscamp_wapmen");
    expect(instagramHandleFromLink("kidscamp_wapmen")).toBe("kidscamp_wapmen");
    expect(instagramHandleFromLink("")).toBe("");
  });
});

describe("formatKidsCampMobile", () => {
  it("prefixes +91 on 10-digit numbers", () => {
    expect(formatKidsCampMobile("9004241565")).toBe("+919004241565");
    expect(formatKidsCampMobile("+91 9004241565")).toBe("+919004241565");
    expect(formatKidsCampMobile("")).toBe("");
  });
});

describe("kidsCamp GST tax table", () => {
  it("matches the sample inclusive 5% slip (₹3500 → 3333.33 / 83.33 / 83.33)", () => {
    const breakdown = buildKidsCampGstRateBreakdown([
      { total: 850, gstPercent: 5 },
      { total: 1130, gstPercent: 5 },
      { total: 830, gstPercent: 5 },
      { total: 690, gstPercent: 5 },
    ]);
    const rows = buildKidsCampGstTaxRows(breakdown);
    expect(rows.map((r) => r.rateLabel)).toEqual(["5%", "18%", "28%"]);
    expect(fmtKidsCampAmt(rows[0].taxable)).toBe("3333.33");
    expect(fmtKidsCampAmt(rows[0].cgst)).toBe("83.33");
    expect(fmtKidsCampAmt(rows[0].sgst)).toBe("83.33");
    expect(fmtKidsCampAmt(rows[1].taxable)).toBe("0.00");
    expect(fmtKidsCampAmt(rows[2].taxable)).toBe("0.00");
    const totals = sumKidsCampGstTaxRows(rows);
    expect(fmtKidsCampAmt(totals.taxable)).toBe("3333.33");
    expect(fmtKidsCampAmt(totals.cgst)).toBe("83.33");
    expect(fmtKidsCampAmt(totals.sgst)).toBe("83.33");
  });

  it("keeps unused 5/18/28 rows at zero when another slab is billed", () => {
    const rows = buildKidsCampGstTaxRows(
      buildKidsCampGstRateBreakdown([{ total: 118, gstPercent: 18 }]),
    );
    expect(fmtKidsCampAmt(rows[0].taxable)).toBe("0.00");
    expect(fmtKidsCampAmt(rows[1].taxable)).toBe("100.00");
    expect(fmtKidsCampAmt(rows[1].cgst)).toBe("9.00");
  });
});

describe("kidsCampLineDiscAmt", () => {
  it("prints 0.00 when rate × qty equals amount", () => {
    expect(kidsCampLineDiscAmt({ rate: 850, qty: 1, total: 850 })).toBe(0);
  });

  it("uses discount percent when set", () => {
    expect(kidsCampLineDiscAmt({ rate: 1000, qty: 1, total: 900, discountPercent: 10 })).toBe(100);
  });
});

describe("kidsCampTermLines", () => {
  it("falls back to the sample Kids Camp terms", () => {
    expect(kidsCampTermLines([])).toEqual(KIDS_CAMP_DEFAULT_TERMS);
    expect(kidsCampTermLines(["No exchange"])).toEqual(["No exchange"]);
  });
});
