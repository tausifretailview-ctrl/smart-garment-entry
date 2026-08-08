import { describe, expect, it } from "vitest";
import { getPosCartStockIndicator } from "./cartStockStatus";

describe("getPosCartStockIndicator", () => {
  it("returns null when stock is unknown / not tracked", () => {
    expect(getPosCartStockIndicator(undefined, 1)).toBeNull();
    expect(getPosCartStockIndicator(null, 1)).toBeNull();
  });

  it("red when stock is 0, 1, or 2", () => {
    expect(getPosCartStockIndicator(0, 1)).toEqual({
      status: "red",
      stockQty: 0,
      remaining: -1,
    });
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

  it("yellow when stock is 3, 4, or 5", () => {
    expect(getPosCartStockIndicator(3, 1)).toEqual({
      status: "yellow",
      stockQty: 3,
      remaining: 2,
    });
    expect(getPosCartStockIndicator(4, 1)).toEqual({
      status: "yellow",
      stockQty: 4,
      remaining: 3,
    });
    expect(getPosCartStockIndicator(5, 1)).toEqual({
      status: "yellow",
      stockQty: 5,
      remaining: 4,
    });
  });

  it("green when stock is greater than 5", () => {
    expect(getPosCartStockIndicator(6, 1)).toEqual({
      status: "green",
      stockQty: 6,
      remaining: 5,
    });
    expect(getPosCartStockIndicator(50, 1)).toEqual({
      status: "green",
      stockQty: 50,
      remaining: 49,
    });
  });

  it("red when overselling even if snapshot stock is mid/high", () => {
    expect(getPosCartStockIndicator(3, 4)).toEqual({
      status: "red",
      stockQty: 3,
      remaining: -1,
    });
    expect(getPosCartStockIndicator(10, 12)).toEqual({
      status: "red",
      stockQty: 10,
      remaining: -2,
    });
  });
});
