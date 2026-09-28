import { describe, expect, it } from "vitest";
import { vastrakalaLineDiscount } from "@/utils/vastrakalaThermalParticulars";

describe("vastrakalaLineDiscount", () => {
  it("returns null when the line is sold at MRP", () => {
    expect(vastrakalaLineDiscount({ mrp: 949, qty: 1, total: 949 })).toBeNull();
  });

  it("uses MRP x qty as the base", () => {
    expect(vastrakalaLineDiscount({ mrp: 2299, qty: 2, total: 2299 })).toEqual({
      mrp: 2299,
      amount: 2299,
      percentLabel: "50",
    });
  });

  it("shows one decimal when the percent is not whole", () => {
    expect(vastrakalaLineDiscount({ mrp: 1499, qty: 1, total: 500 })?.percentLabel).toBe("66.6");
  });

  it("ignores lines without an MRP", () => {
    expect(vastrakalaLineDiscount({ mrp: 0, qty: 1, total: 500 })).toBeNull();
  });
});
