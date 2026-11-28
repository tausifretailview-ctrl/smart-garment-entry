import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCALE_BARCODE,
  parseScaleBarcode,
  readScaleBarcodeConfig,
  scaleItemBarcodeCandidates,
  scaleQuantity,
} from "./scaleBarcode";

/** Weighing-scale labels (supermarket go-live, Nov 2026). */
const on = { ...DEFAULT_SCALE_BARCODE, enabled: true };

describe("reading a scale label", () => {
  it("21 00123 00250 4 → item 00123, 0.250 kg", () => {
    expect(parseScaleBarcode("2100123002504", on)).toEqual({ itemCode: "00123", weightKg: 0.25 });
    expect(parseScaleBarcode("2100123015009", on)).toEqual({ itemCode: "00123", weightKg: 1.5 });
  });

  it("price labels: 22 00045 04500 → ₹45.00", () => {
    const cfg = { ...on, valueType: "price" as const, valueDecimals: 2 };
    expect(parseScaleBarcode("2200045045006", cfg)).toEqual({ itemCode: "00045", price: 45 });
  });

  it("off, company EANs, wrong length or a misread check digit are not scale labels", () => {
    expect(parseScaleBarcode("2100123002504", DEFAULT_SCALE_BARCODE)).toBeNull(); // switched off
    expect(parseScaleBarcode("8901058000016", on)).toBeNull(); // Tata Salt EAN
    expect(parseScaleBarcode("210012300250", on)).toBeNull(); // 12 digits
    expect(parseScaleBarcode("2100123002505", on)).toBeNull(); // check digit wrong
    expect(parseScaleBarcode("2100123002505", { ...on, checkDigit: false })).toEqual({ itemCode: "00123", weightKg: 0.25 });
    expect(parseScaleBarcode("21001230000O", on)).toBeNull();
  });

  it("a zero weight is not billed", () => {
    // 21 00123 00000 + check
    expect(parseScaleBarcode("2100123000005", on)).toBeNull();
  });

  it("other layouts: 1-digit prefix, 6-digit item code", () => {
    const cfg = { ...on, prefixes: ["2"], itemDigits: 6 };
    // 2 001234 00750 + check
    const code = "200123400750";
    const t = [...code].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0);
    expect(parseScaleBarcode(code + ((10 - (t % 10)) % 10), cfg)).toEqual({ itemCode: "001234", weightKg: 0.75 });
  });
});

describe("settings", () => {
  it("defaults when nothing is saved; prefixes from a typed list", () => {
    expect(readScaleBarcodeConfig(null)).toEqual(DEFAULT_SCALE_BARCODE);
    const cfg = readScaleBarcodeConfig({ scale_barcode: { enabled: true, prefixes: "21, 22,x", itemDigits: 99, valueType: "price" } });
    expect(cfg).toMatchObject({ enabled: true, prefixes: ["21", "22"], itemDigits: 5, valueType: "price", valueDecimals: 2 });
  });
});

describe("item and quantity", () => {
  it("item code as printed, then without leading zeros", () => {
    expect(scaleItemBarcodeCandidates("00123")).toEqual(["00123", "123"]);
    expect(scaleItemBarcodeCandidates("12345")).toEqual(["12345"]);
  });

  it("weight is the quantity; price ÷ rate for price labels", () => {
    expect(scaleQuantity({ itemCode: "1", weightKg: 0.25 }, 0)).toBe(0.25);
    expect(scaleQuantity({ itemCode: "1", price: 45 }, 60)).toBe(0.75);
    expect(scaleQuantity({ itemCode: "1", price: 10 }, 3)).toBe(3.333);
    expect(scaleQuantity({ itemCode: "1", price: 45 }, 0)).toBeNull();
  });
});
