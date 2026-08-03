import { describe, expect, it } from "vitest";
import { isChunkLoadError } from "./chunkLoadRetry";

describe("isChunkLoadError", () => {
  it("matches real dynamic-import / chunk failures", () => {
    expect(
      isChunkLoadError(new Error("Failed to fetch dynamically imported module: /assets/POSSales.js")),
    ).toBe(true);
    expect(isChunkLoadError(new Error("Loading chunk 42 failed"))).toBe(true);
    expect(isChunkLoadError(new Error("Unexpected token '<'"))).toBe(true);
    expect(isChunkLoadError(new Error("Module load timed out"))).toBe(true);
    const named = new Error("boom");
    named.name = "ChunkLoadError";
    expect(isChunkLoadError(named)).toBe(true);
  });

  it("does not treat app ReferenceErrors as chunk skew (no Updating… reload)", () => {
    expect(isChunkLoadError(new Error("maxFlatDiscountForGross is not defined"))).toBe(false);
    expect(isChunkLoadError(new ReferenceError("foo is not defined"))).toBe(false);
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined"))).toBe(false);
  });
});
