import { describe, expect, it } from "vitest";
import {
  checkGstReadiness,
  DEFAULT_GST_FILING_PREFS,
  resolveGstFilingPrefs,
  seriesGaps,
  splitByGstin,
  withGstFilingPrefs,
  type GstReadinessInput,
} from "./gstReadiness";

const SHOP = "27ABCDE1234F1Z0";
const GUJ = "24ABCDE1234F1Z6";

const input = (over: Partial<GstReadinessInput> = {}): GstReadinessInput => ({
  shopGstin: SHOP,
  prefs: { scheme: "regular", turnoverUnder5Cr: true, signatoryName: "Owner" },
  products: [{ id: "p1", name: "T-Shirt", hsn: "6109", unit: "pcs" }],
  customers: [{ id: "c1", name: "Walk-in", gstin: "" }],
  suppliers: [{ id: "s1", name: "Mill", gstin: GUJ }],
  lastMonth: { label: "Sep 2026", documents: [{ number: "POS/26-27/1", cancelled: false }, { number: "POS/26-27/2", cancelled: true }], heldCarts: 0 },
  ...over,
});

const section = (r: ReturnType<typeof checkGstReadiness>, key: string) => r.sections.find((s) => s.key === key)!;

describe("filing preferences", () => {
  it("reads and writes settings.report_settings.gst_filing without touching other keys", () => {
    expect(resolveGstFilingPrefs(null)).toEqual(DEFAULT_GST_FILING_PREFS);
    expect(resolveGstFilingPrefs({ report_settings: { second_firm: { enabled: true } } })).toEqual(DEFAULT_GST_FILING_PREFS);
    expect(
      resolveGstFilingPrefs({ report_settings: { gst_filing: { scheme: "qrmp", turnover_under_5cr: false, signatory_name: "Tausif" } } }),
    ).toEqual({ scheme: "qrmp", turnoverUnder5Cr: false, signatoryName: "Tausif" });
    expect(resolveGstFilingPrefs({ report_settings: { gst_filing: { scheme: "weird" } } }).scheme).toBeNull();

    const saved = withGstFilingPrefs({ service_default_qty: 3 }, { scheme: "regular", turnoverUnder5Cr: true, signatoryName: " Owner " });
    expect(saved).toEqual({ service_default_qty: 3, gst_filing: { scheme: "regular", turnover_under_5cr: true, signatory_name: "Owner" } });
  });
});

describe("GSTIN grouping and bill series", () => {
  it("splits parties by GSTIN quality", () => {
    const s = splitByGstin([
      { gstin: "" }, { gstin: GUJ }, { gstin: "24ABCDE1234F1Z7" }, { gstin: "24ABC" },
    ]);
    expect(s.none).toHaveLength(1);
    expect(s.valid).toHaveLength(1);
    expect(s.invalid).toHaveLength(1);
    expect(s.partial).toHaveLength(1);
  });

  it("counts cancelled and missing numbers per series", () => {
    expect(seriesGaps([
      { number: "POS/26-27/1", cancelled: false },
      { number: "POS/26-27/2", cancelled: true },
      { number: "POS/26-27/5", cancelled: false },
      { number: "INV/26-27/1", cancelled: false },
    ])).toEqual([
      { prefix: "INV/26-27/", from: "INV/26-27/1", to: "INV/26-27/1", total: 1, cancelled: 0, missing: 0 },
      { prefix: "POS/26-27/", from: "POS/26-27/1", to: "POS/26-27/5", total: 3, cancelled: 1, missing: 2 },
    ]);
  });
});

describe("checkGstReadiness", () => {
  it("is all green for a complete shop", () => {
    const r = checkGstReadiness(input());
    expect(r.level).toBe("ok");
    expect(r.blockers).toBe(0);
    expect(r.warnings).toBe(0);
    expect(section(r, "shop").summary).toContain("Maharashtra");
    expect(section(r, "documents").summary).toContain("1 cancelled");
  });

  it("blocks on shop GSTIN, bad customer GSTIN and bad HSN", () => {
    const r = checkGstReadiness(input({
      shopGstin: "27ABCDE1234F1Z5",
      customers: [{ id: "c", name: "Shop A", gstin: "24ABCDE1234F1Z7" }, { id: "d", name: "Shop B", gstin: "24AB" }],
      products: [{ id: "p", name: "Cap", hsn: "61", unit: "pcs" }, { id: "q", name: "Belt", hsn: "", unit: "pcs" }],
    }));
    expect(r.level).toBe("block");
    expect(r.blockers).toBe(3);
    expect(section(r, "shop").level).toBe("block");
    expect(section(r, "customers").level).toBe("block");
    expect(section(r, "customers").items.map((i) => i.label)).toEqual(["Shop A", "Shop B"]);
    expect(section(r, "hsn").level).toBe("block");
    expect(section(r, "hsn").items[0]).toEqual({ label: "Cap", note: 'HSN "61" is not 4, 6 or 8 digits' });
  });

  it("missing HSN only warns under ₹5 crore and blocks above it", () => {
    const products = [{ id: "q", name: "Belt", hsn: null, unit: "pcs" }];
    expect(section(checkGstReadiness(input({ products })), "hsn").level).toBe("warn");
    expect(
      section(checkGstReadiness(input({ products, prefs: { scheme: "regular", turnoverUnder5Cr: false, signatoryName: "" } })), "hsn").level,
    ).toBe("block");
  });

  it("warns on scheme not chosen, composition, odd units, supplier GSTINs and gaps", () => {
    const r = checkGstReadiness(input({
      prefs: { ...DEFAULT_GST_FILING_PREFS, scheme: null },
      products: [{ id: "p", name: "Cloth", hsn: "5208", unit: "bale" }],
      suppliers: [{ id: "s", name: "Agent", gstin: "24ABCDE1234F1Z7" }, { id: "t", name: "Local", gstin: "" }],
      lastMonth: { label: "Sep 2026", documents: [{ number: "POS/1", cancelled: false }, { number: "POS/4", cancelled: false }], heldCarts: 2 },
    }));
    expect(r.level).toBe("warn");
    expect(section(r, "scheme").level).toBe("warn");
    expect(section(r, "units").items).toEqual([{ label: '"bale"', note: "1 product" }]);
    expect(section(r, "suppliers").level).toBe("warn");
    expect(section(r, "suppliers").detail).toContain("1 supplier have no GSTIN");
    expect(section(r, "documents").level).toBe("warn");
    expect(section(r, "documents").summary).toContain("2 bill numbers missing");
    expect(section(r, "documents").items.at(-1)).toEqual({ label: "Held carts (not bills)", note: "2 carts" });

    const comp = checkGstReadiness(input({ prefs: { ...DEFAULT_GST_FILING_PREFS, scheme: "composition" } }));
    expect(section(comp, "scheme").summary).toContain("CMP-08");
  });
});
