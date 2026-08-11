import { describe, expect, it } from "vitest";
import { resolveVariantColor } from "@/utils/resolveVariantColor";

describe("resolveVariantColor", () => {
  it("prefers variant colour over product colour", () => {
    expect(resolveVariantColor("Red", "Blue")).toBe("Red");
  });

  it("falls back to product colour when variant is null/blank", () => {
    expect(resolveVariantColor(null, "Blue")).toBe("Blue");
    expect(resolveVariantColor("", "Blue")).toBe("Blue");
    expect(resolveVariantColor("  ", "Blue")).toBe("Blue");
  });

  it("returns empty when both missing", () => {
    expect(resolveVariantColor(null, null)).toBe("");
    expect(resolveVariantColor(undefined, "")).toBe("");
  });
});
