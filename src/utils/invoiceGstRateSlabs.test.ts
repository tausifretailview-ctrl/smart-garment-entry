import { describe, expect, it } from "vitest";
import { calculateGSTBreakup, formatPlaceOfSupplyFromGstin } from "@/utils/gstRegisterUtils";
import { numberToWords } from "@/lib/utils";
import {
  buildInvoiceGstBreakdown,
  formatGstHalfRateLabel,
} from "@/utils/invoiceGstRateSlabs";

/** INV-210 / NAVRANG SHOES shape: two 18% lines + one 5% courier line. */
const inv210Items = [
  { particulars: "30933601 MRP 6999 PUMA", hsn: "6404", qty: 4, total: 19597.2, gstPercent: 18 },
  { particulars: "30933602 MRP 6999 PUMA", hsn: "6404", qty: 5, total: 24496.5, gstPercent: 18 },
  { particulars: "TRANSPORT COURIER", hsn: "9968", qty: 1, total: 157.5, gstPercent: 5 },
];

describe("buildInvoiceGstBreakdown — multi-rate GST", () => {
  it("splits CGST/SGST per distinct rate (5% and 18%) instead of one blended pair", () => {
    const result = buildInvoiceGstBreakdown({
      items: inv210Items,
      taxType: "inclusive",
      grandTotal: 44251,
      sellerGstin: "27AGSPG6757E1ZZ",
      buyerGstin: "27AMOPP3239N1ZB",
    });

    expect(result.isInterState).toBe(false);
    expect(result.slabs.map((s) => s.gstPercent)).toEqual([5, 18]);

    const slab5 = result.slabs.find((s) => s.gstPercent === 5)!;
    const slab18 = result.slabs.find((s) => s.gstPercent === 18)!;

    expect(slab5.taxable).toBe(150);
    expect(slab5.cgst).toBe(3.75);
    expect(slab5.sgst).toBe(3.75);
    expect(slab5.igst).toBe(0);

    expect(slab18.taxable).toBe(37367.54);
    expect(slab18.cgst).toBe(3363.08);
    expect(slab18.sgst).toBe(3363.08);

    expect(result.taxableTotal).toBe(37517.54);
    expect(result.taxTotal).toBe(6733.66);
    expect(formatGstHalfRateLabel(5)).toBe("2.5%");
    expect(formatGstHalfRateLabel(18)).toBe("9.0%");
    expect(formatPlaceOfSupplyFromGstin("27AMOPP3239N1ZB")).toBe("27-MAHARASHTRA");

    expect(result.lines[0].taxable).toBeCloseTo(16607.8, 2);
    expect(result.lines[0].gst).toBeCloseTo(2989.4, 2);
    expect(result.lines[0].unitRate).toBeCloseTo(4151.95, 2);
    expect(result.lines[2].taxable).toBeCloseTo(150, 2);
    expect(result.lines[2].gst).toBeCloseTo(7.5, 2);
  });

  it("emits IGST rows (not CGST/SGST) for inter-state GSTINs", () => {
    const result = buildInvoiceGstBreakdown({
      items: inv210Items,
      taxType: "inclusive",
      grandTotal: 44251,
      sellerGstin: "27AGSPG6757E1ZZ",
      buyerGstin: "24AMOPP3239N1ZB",
    });
    expect(result.isInterState).toBe(true);
    const slab18 = result.slabs.find((s) => s.gstPercent === 18)!;
    expect(slab18.igst).toBe(6726.16);
    expect(slab18.cgst).toBe(0);
    expect(slab18.sgst).toBe(0);
  });

  it("keeps a 3% rate that calculateGSTBreakup silently drops", () => {
    const items = [{ total: 103, gstPercent: 3, qty: 1 }];
    const slabs = buildInvoiceGstBreakdown({
      items,
      taxType: "inclusive",
      grandTotal: 103,
      sellerGstin: "27AAAAA0000A1Z5",
      buyerGstin: "27BBBBB0000B1Z5",
    }).slabs;
    expect(slabs).toHaveLength(1);
    expect(slabs[0].gstPercent).toBe(3);
    expect(slabs[0].taxable).toBe(100);
    expect(slabs[0].cgst).toBe(1.5);

    const legacy = calculateGSTBreakup(
      items.map((i) => ({ gst_percent: i.gstPercent, line_total: i.total })),
      "inclusive",
      false,
    );
    expect(legacy.taxable_5 + legacy.taxable_12 + legacy.taxable_18 + legacy.taxable_28).toBe(0);
    expect(legacy.cgst_2_5 + legacy.cgst_6 + legacy.cgst_9 + legacy.cgst_14).toBe(0);
  });

  it("treats exclusive line totals as taxable when grand total includes GST on top", () => {
    const items = [
      { total: 1000, gstPercent: 18, qty: 1 },
      { total: 200, gstPercent: 5, qty: 1 },
    ];
    const result = buildInvoiceGstBreakdown({
      items,
      taxType: "exclusive",
      grandTotal: 1390,
      sellerGstin: "27AAAAA0000A1Z5",
      buyerGstin: "27BBBBB0000B1Z5",
    });
    expect(result.mode).toBe("exclusive");
    expect(result.slabs.map((s) => s.gstPercent)).toEqual([5, 18]);
    expect(result.slabs.find((s) => s.gstPercent === 18)?.cgst).toBe(90);
    expect(result.slabs.find((s) => s.gstPercent === 5)?.cgst).toBe(5);
  });
});

describe("numberToWords reused for Wholesale GST A4", () => {
  it("matches the numeric total for the INV-210 amount and a few other figures", () => {
    expect(numberToWords(44251)).toBe("Rs. Forty Four Thousand Two Hundred Fifty One Rupees Only");
    expect(numberToWords(1)).toBe("Rs. One Rupees Only");
    expect(numberToWords(1500.5)).toBe("Rs. One Thousand Five Hundred Rupees and Fifty Paise Only");
    expect(numberToWords(100000)).toBe("Rs. One Lakh Rupees Only");
  });
});
