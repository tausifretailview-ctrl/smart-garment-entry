import { describe, expect, it } from "vitest";
import { coerceToMap, lookupMap } from "./coerceToMap";

describe("coerceToMap", () => {
  it("returns Map instances unchanged", () => {
    const m = new Map([["a", 1]]);
    expect(coerceToMap(m)).toBe(m);
  });

  it("restores plain objects from persisted query cache", () => {
    const m = coerceToMap<string, number>({ a: 1, b: 2 });
    expect(m.get("a")).toBe(1);
    expect(m.get("b")).toBe(2);
  });

  it("lookupMap reads from plain object", () => {
    expect(lookupMap({ x: { software_bill_no: "B1" } }, "x")).toEqual({
      software_bill_no: "B1",
    });
  });
});
