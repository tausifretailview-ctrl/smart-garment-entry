import { describe, expect, it } from "vitest";
import { getPosCartStockIndicator } from "./cartStockStatus";

describe("getPosCartStockIndicator", () => {
  it("returns null when stock is unknown / not tracked", () => {
    expect(getPosCartStockIndicator(undefined, 1)).toBeNull();
    expect(getPosCartStockIndicator(null, 1)).toBeNull();
  });

  it("yellow when stock is greater than 2", () => {
    expect(getPosCartStockIndicator(3, 1)).toEqual({
      status: "yellow",
      stockQty: 3,
      remaining: 2,
    });
    expect(getPosCartStockIndicator(50, 1)).toEqual({
      status: "yellow",
      stockQty: 50,
      remaining: 49,
    });
  });

  it("red when stock is 1 or 2", () => {
    expect(getPosCartStockIndicator(1, 1)).toEqual({
      status: "red",
      stockQty: 1,
      remaining: 0,
    });
    expect(getPosCartStockIndicator(2, 1)).toEqual({
      status: "red",
      stockQty: 2,
      remaining: 1,
    });
  });

  it("red when stock is 0 or overselling", () => {
    expect(getPosCartStockIndicator(0, 1)).toEqual({
      status: "red",
      stockQty: 0,
      remaining: -1,
    });
    expect(getPosCartStockIndicator(3, 4)).toEqual({
      status: "red",
      stockQty: 3,
      remaining: -1,
    });
  });
});
