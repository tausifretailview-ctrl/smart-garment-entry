import { afterEach, describe, expect, it } from "vitest";
import { isAppHost, isPossibleStoreHost, normalizeStoreDomain } from "./storefrontDomain";
import {
  parseStorefrontPath,
  setStorefrontCustomDomainSlug,
  storefrontHomePath,
  storefrontProductPath,
} from "./storefrontPath";

describe("normalizeStoreDomain", () => {
  it("strips scheme, www, path, port and case", () => {
    expect(normalizeStoreDomain("https://www.EllaNoor.in/store")).toBe("ellanoor.in");
    expect(normalizeStoreDomain("  shop.example.co.in:443 ")).toBe("shop.example.co.in");
    expect(normalizeStoreDomain("ellanoor.in.")).toBe("ellanoor.in");
  });

  it("rejects non-domains and app hosts", () => {
    expect(normalizeStoreDomain("")).toBeNull();
    expect(normalizeStoreDomain("ellanoor")).toBeNull();
    expect(normalizeStoreDomain("bad_domain.in")).toBeNull();
    expect(normalizeStoreDomain("app.inventoryshop.in")).toBeNull();
    expect(normalizeStoreDomain("my-app.vercel.app")).toBeNull();
  });
});

describe("isAppHost / isPossibleStoreHost", () => {
  it("treats app, preview and local hosts as the ERP", () => {
    for (const h of ["app.inventoryshop.in", "inventoryshop.in", "x.vercel.app", "localhost", "127.0.0.1", "::1"]) {
      expect(isAppHost(h)).toBe(true);
    }
    expect(isAppHost("ellanoor.in")).toBe(false);
  });

  it("only looks up http(s) custom hosts", () => {
    expect(isPossibleStoreHost({ protocol: "https:", hostname: "ellanoor.in" })).toBe(true);
    expect(isPossibleStoreHost({ protocol: "https:", hostname: "app.inventoryshop.in" })).toBe(false);
    expect(isPossibleStoreHost({ protocol: "file:", hostname: "" })).toBe(false);
    expect(isPossibleStoreHost({ protocol: "capacitor:", hostname: "localhost" })).toBe(false);
  });
});

describe("storefront paths on a custom domain", () => {
  afterEach(() => setStorefrontCustomDomainSlug(null));

  it("serves the store at / and products at /p/:id", () => {
    setStorefrontCustomDomainSlug("ella-noor");
    expect(parseStorefrontPath("/")).toEqual({ orgSlug: "ella-noor", productId: null });
    expect(parseStorefrontPath("/p/abc")).toEqual({ orgSlug: "ella-noor", productId: "abc" });
    expect(parseStorefrontPath("/anything")).toEqual({ orgSlug: "ella-noor", productId: null });
    expect(storefrontHomePath("ella-noor")).toBe("/");
    expect(storefrontProductPath("ella-noor", "abc")).toBe("/p/abc");
  });

  it("keeps /:slug/store paths unchanged without a custom domain", () => {
    expect(parseStorefrontPath("/")).toBeNull();
    expect(storefrontHomePath("ella-noor")).toBe("/ella-noor/store");
    expect(storefrontProductPath("ella-noor", "abc")).toBe("/ella-noor/store/p/abc");
  });
});
