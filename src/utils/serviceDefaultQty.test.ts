import { describe, expect, it } from "vitest";
import { normalizeServiceDefaultQty, resolveServiceDefaultQty } from "./serviceDefaultQty";

describe("resolveServiceDefaultQty", () => {
  it("defaults to 1 when unset", () => {
    expect(resolveServiceDefaultQty(null)).toBe(1);
    expect(resolveServiceDefaultQty({})).toBe(1);
    expect(resolveServiceDefaultQty({ report_settings: {} })).toBe(1);
  });

  it("uses the saved shop value", () => {
    expect(resolveServiceDefaultQty({ report_settings: { service_default_qty: 3 } })).toBe(3);
    expect(resolveServiceDefaultQty({ report_settings: { service_default_qty: "5" } })).toBe(5);
  });

  it("falls back to 1 for blank, zero, negative or junk", () => {
    expect(normalizeServiceDefaultQty("")).toBe(1);
    expect(normalizeServiceDefaultQty(0)).toBe(1);
    expect(normalizeServiceDefaultQty(-4)).toBe(1);
    expect(normalizeServiceDefaultQty("abc")).toBe(1);
    expect(normalizeServiceDefaultQty(2.7)).toBe(2);
  });
});
