import { describe, expect, it } from "vitest";
import { getPosCartStockIndicator } from "./cartStockStatus";

describe("getPosCartStockIndicator", () => {
  it("returns null when stock is unknown / not tracked", () => {
    expect(getPosCartStockIndicator(undefined, 1, 10)).toBeNull();
    expect(getPosCartStockIndicator(null, 1, 10)).toBeNull();
  });

  it("green when remaining above threshold", () => {
    expect(getPosCartStockIndicator(50, 1, 10)).toEqual({
      status: "green",
      stockQty: 50,
      remaining: 49,
    });
  });

  it("yellow when remaining is within low-stock threshold (incl. 0)", () => {
    expect(getPosCartStockIndicator(1, 1, 10)).toEqual({
      status: "yellow",
      stockQty: 1,
      remaining: 0,
    });
    expect(getPosCartStockIndicator(12, 2, 10)).toEqual({
      status: "yellow",
      stockQty: 12,
      remaining: 10,
    });
  });

  it("red when overselling or already out", () => {
    expect(getPosCartStockIndicator(1, 2, 10)).toEqual({
      status: "red",
      stockQty: 1,
      remaining: -1,
    });
    expect(getPosCartStockIndicator(0, 1, 10)).toEqual({
      status: "red",
      stockQty: 0,
      remaining: -1,
    });
  });
});
