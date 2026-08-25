import { describe, expect, it } from "vitest";
import {
  isPublicStorefrontPath,
  parseStorefrontPath,
  publicOrgSlugKey,
  storefrontHomePath,
  storefrontProductPath,
} from "./storefrontPath";

describe("storefrontPath", () => {
  it("detects public store routes only", () => {
    expect(isPublicStorefrontPath("/demo/store")).toBe(true);
    expect(isPublicStorefrontPath("/demo/store/")).toBe(true);
    expect(isPublicStorefrontPath("/demo/store/p/abc")).toBe(true);
    expect(isPublicStorefrontPath("/demo/portal")).toBe(false);
    expect(isPublicStorefrontPath("/demo")).toBe(false);
    expect(isPublicStorefrontPath("/store")).toBe(false);
  });

  it("parses slug and optional product id", () => {
    expect(parseStorefrontPath("/ella-noor/store")).toEqual({
      orgSlug: "ella-noor",
      productId: null,
    });
    expect(parseStorefrontPath("/ella-noor/store/p/11111111-2222-3333-4444-555555555555")).toEqual({
      orgSlug: "ella-noor",
      productId: "11111111-2222-3333-4444-555555555555",
    });
    expect(parseStorefrontPath("/ella-noor/portal")).toBeNull();
  });

  it("builds shareable paths", () => {
    expect(storefrontHomePath("demo")).toBe("/demo/store");
    expect(storefrontProductPath("demo", "prod-1")).toBe("/demo/store/p/prod-1");
  });

  it("treats hyphenated and compacted shop slugs as the same key", () => {
    expect(publicOrgSlugKey("ellanoor")).toBe(publicOrgSlugKey("ella-noor"));
    expect(publicOrgSlugKey(" Ella-Noor ")).toBe("ellanoor");
  });
});
