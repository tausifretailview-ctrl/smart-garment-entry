import { describe, expect, it } from "vitest";
import {
  splitVastrakalaParticulars,
  vastrakalaParticularsPrimaryLine,
} from "@/utils/vastrakalaThermalParticulars";

describe("vastrakalaParticularsPrimaryLine", () => {
  it("shows style segment after category prefix (KURTI-GC-RAY → GC-RAY)", () => {
    expect(vastrakalaParticularsPrimaryLine("KURTI-GC-RAY-SILK")).toBe("GC-RAY-SILK");
  });

  it("keeps style codes with a dash intact (GC-RAY)", () => {
    expect(vastrakalaParticularsPrimaryLine("GC-RAY")).toBe("GC-RAY");
  });

  it("strips category when separated by space (KURTI GC-RAY)", () => {
    expect(vastrakalaParticularsPrimaryLine("KURTI GC-RAY")).toBe("GC-RAY");
  });
});

describe("splitVastrakalaParticulars", () => {
  it("splits on first dash", () => {
    expect(splitVastrakalaParticulars("KURTI-GC-RAY")).toEqual({
      head: "KURTI",
      detailLine: "GC-RAY",
    });
  });
});
