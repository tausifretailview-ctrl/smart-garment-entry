import { describe, expect, it } from "vitest";
import { vastrakalaBarcodeFontPx, vastrakalaParticularsLines } from "@/utils/vastrakalaThermalParticulars";

describe("vastrakalaParticularsLines", () => {
  it("keeps short names on line 1 only", () => {
    expect(vastrakalaParticularsLines("KURTI-GC-RAY-SILK")).toEqual({
      line1: "KURTI-GC-RAY-SILK",
      line2: "",
    });
  });

  it("splits long names: line 1 before qty column, remainder on wide line 2", () => {
    expect(
      vastrakalaParticularsLines("3 PC - FASHION BELLA- RAYON- PIPING PEACOCK", undefined, {
        narrowMaxChars: 22,
      }),
    ).toEqual({
      line1: "3 PC - FASHION BELLA-",
      line2: "RAYON- PIPING PEACOCK",
    });
  });

  it("puts pack note on line 2 when line 1 already uses the narrow column", () => {
    expect(vastrakalaParticularsLines("V8075-BRUSH PRIN -L", "3 PC", { narrowMaxChars: 24 })).toEqual({
      line1: "V8075-BRUSH PRIN -L",
      line2: "3 PC",
    });
  });

  it("merges tail and notes on line 2 for long particulars", () => {
    expect(
      vastrakalaParticularsLines("CORD SET- GC-RAYON- VETICAN WORK", "3 PC", { narrowMaxChars: 22 }),
    ).toEqual({
      line1: "CORD SET- GC-RAYON-",
      line2: "VETICAN WORK 3 PC",
    });
  });

  it("omits line 2 when notes are already contained in line 1", () => {
    expect(vastrakalaParticularsLines("V8075-BRUSH PRIN 3 PC", "3 PC")).toEqual({
      line1: "V8075-BRUSH PRIN 3 PC",
      line2: "",
    });
  });

  it("returns notes as line 2 when particulars are empty", () => {
    expect(vastrakalaParticularsLines("", "3 PC")).toEqual({ line1: "", line2: "3 PC" });
  });
});

describe("vastrakalaParticularsLines — zero-width line 1", () => {
  it("moves the whole name to line 2 when the narrow column fits nothing", () => {
    expect(vastrakalaParticularsLines("KIDS SHOES RED 5", "D-102", { narrowMaxChars: 0 })).toEqual({
      line1: "",
      line2: "KIDS SHOES RED 5 D-102",
    });
  });
});

describe("vastrakalaBarcodeFontPx", () => {
  it("prints a 9-digit barcode at the item font in the 80mm MRP column", () => {
    expect(vastrakalaBarcodeFontPx("100003548", 19, { maxPx: 12.35, minPx: 9 })).toBe(12.35);
  });

  it("shrinks a 13-digit EAN to fit before QTY", () => {
    const px = vastrakalaBarcodeFontPx("8901326030868", 19, { maxPx: 12.35, minPx: 9 });
    expect(px).not.toBeNull();
    expect(px!).toBeLessThan(12.35);
    expect(px! * 0.556 * 13).toBeLessThanOrEqual(19 * 3.78);
  });

  it("returns null when the column is too narrow (58mm with MRP) or there is no barcode", () => {
    expect(vastrakalaBarcodeFontPx("100003548", 1, { maxPx: 9.5, minPx: 7 })).toBeNull();
    expect(vastrakalaBarcodeFontPx("", 19, { maxPx: 12.35, minPx: 9 })).toBeNull();
  });
});
