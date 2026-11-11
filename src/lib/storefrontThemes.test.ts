import { describe, expect, it } from "vitest";
import {
  STOREFRONT_THEMES,
  defaultStorefrontTheme,
  parseStorefrontTheme,
  resolveStorefrontTheme,
} from "./storefrontThemes";

describe("store theme choice", () => {
  it("offers Classic, Ella Noor and Street", () => {
    expect(STOREFRONT_THEMES.map((t) => t.label)).toEqual(["Classic", "Ella Noor", "Street"]);
  });

  it("reads only a known theme from the organization settings", () => {
    expect(parseStorefrontTheme({ storefront_theme: "street" })).toBe("street");
    expect(parseStorefrontTheme({ storefront_theme: "unknown" })).toBeNull();
    expect(parseStorefrontTheme({})).toBeNull();
    expect(parseStorefrontTheme(null)).toBeNull();
    expect(parseStorefrontTheme(["street"])).toBeNull();
  });

  it("keeps every shop on its current look until a theme is saved", () => {
    expect(defaultStorefrontTheme("ella-noor")).toBe("ella-noor");
    expect(defaultStorefrontTheme("EllaNoor")).toBe("ella-noor");
    expect(defaultStorefrontTheme("ks-footwear")).toBe("classic");
    expect(resolveStorefrontTheme(null, "ks-footwear")).toBe("classic");
  });

  it("a saved choice wins, including moving Ella Noor off its own theme", () => {
    expect(resolveStorefrontTheme("street", "ks-footwear")).toBe("street");
    expect(resolveStorefrontTheme("ella-noor", "ks-footwear")).toBe("ella-noor");
    expect(resolveStorefrontTheme("classic", "ella-noor")).toBe("classic");
  });
});
