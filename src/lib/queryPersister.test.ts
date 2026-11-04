import { describe, expect, it } from "vitest";
import { holdsMapOrSet } from "./queryPersister";

describe("query cache never saves a Map or Set (they come back as {} after a reload)", () => {
  it("skips a Map, a Set, or an object holding one", () => {
    expect(holdsMapOrSet(new Map([["a", 1]]))).toBe(true);
    expect(holdsMapOrSet(new Set(["a"]))).toBe(true);
    expect(holdsMapOrSet({ rows: new Map(), missingSql: false })).toBe(true);
    expect(holdsMapOrSet({ rows: new Map(), irns: new Map(), missingSql: false })).toBe(true);
  });

  it("keeps plain data", () => {
    expect(holdsMapOrSet(null)).toBe(false);
    expect(holdsMapOrSet(undefined)).toBe(false);
    expect(holdsMapOrSet(5)).toBe(false);
    expect(holdsMapOrSet("x")).toBe(false);
    expect(holdsMapOrSet([new Map()])).toBe(false);
    expect(holdsMapOrSet({ godowns: [], missingSql: false })).toBe(false);
    expect(holdsMapOrSet({ a: "Bhiwandi", b: "Thane" })).toBe(false);
  });
});
