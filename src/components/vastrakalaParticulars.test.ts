import { describe, expect, it } from "vitest";
import { vastrakalaParticularsLines } from "@/utils/vastrakalaThermalParticulars";

describe("vastrakalaParticularsLines", () => {
  it("keeps the full product name on line 1 (no prefix stripping)", () => {
    expect(vastrakalaParticularsLines("KURTI-GC-RAY-SILK")).toEqual({
      line1: "KURTI-GC-RAY-SILK",
      line2: "",
    });
  });

  it("puts the reference bill-1827 name + pack note on two lines", () => {
    expect(vastrakalaParticularsLines("V8075-BRUSH PRIN -L", "3 PC")).toEqual({
      line1: "V8075-BRUSH PRIN -L",
      line2: "3 PC",
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

  it("trims whitespace on both lines", () => {
    expect(vastrakalaParticularsLines("  GC-RAY  ", "  3 PC ")).toEqual({
      line1: "GC-RAY",
      line2: "3 PC",
    });
  });
});
