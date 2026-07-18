import { describe, expect, it } from "vitest";
import { minSequenceFromSeriesStart, trailingSaleSequence } from "./saleNumber";

describe("trailingSaleSequence", () => {
  it("reads only the trailing invoice sequence", () => {
    expect(trailingSaleSequence("INV/26-27/18")).toBe(18);
    expect(trailingSaleSequence("INV/26-27/262")).toBe(262);
    expect(trailingSaleSequence("POS/26-27/4")).toBe(4);
  });

  it("does not concatenate FY digits (legacy bug: 262718)", () => {
    expect(trailingSaleSequence("INV/26-27/18")).not.toBe(262718);
  });
});

describe("minSequenceFromSeriesStart", () => {
  it("treats series start as last issued number", () => {
    expect(minSequenceFromSeriesStart("INV/26-27/18")).toBe(19);
    expect(minSequenceFromSeriesStart("261")).toBe(262);
  });
});
