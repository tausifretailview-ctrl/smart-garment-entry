import { describe, expect, it } from "vitest";
import { toEllaStorefrontProduct } from "./ellaProduct";
import { buildStreetBannerSlides, buildStreetNav } from "./streetStore";
import {
  isStreetSampleImage,
  isStreetSampleProductId,
  streetSampleCatalogue,
  streetSampleImage,
  streetSampleKind,
} from "./streetSamples";

describe("Street theme sample pictures", () => {
  it("draws the garment the product name or category describes", () => {
    expect(streetSampleKind("2154-JEANS")).toBe("jeans");
    expect(streetSampleKind("Polo T-Shirt")).toBe("tshirt");
    expect(streetSampleKind("Formal Shirt")).toBe("shirt");
    // "shirt shirts" must not read as "t shirts".
    expect(streetSampleKind("Oxford Cotton Shirt", "Shirts")).toBe("shirt");
    expect(streetSampleKind("Classic Crew Tee", "T-Shirts")).toBe("tshirt");
    expect(streetSampleKind("Winter Hoodie")).toBe("jacket");
    expect(streetSampleKind("Cargo Pant")).toBe("trousers");
    expect(streetSampleKind("2PCS SET")).toBe("kurta");
    expect(streetSampleKind("Item 44", "Footwear")).toBe("shoes");
    expect(streetSampleKind("", null)).toBe("tshirt");
  });

  it("is a self-contained captioned picture, the same every time for one product", () => {
    const src = streetSampleImage("jeans", "p1");
    expect(src.startsWith("data:image/svg+xml;utf8,")).toBe(true);
    expect(decodeURIComponent(src)).toContain("SAMPLE IMAGE");
    expect(isStreetSampleImage(src)).toBe(true);
    expect(isStreetSampleImage("https://cdn.example/a.jpg")).toBe(false);
    expect(streetSampleImage("jeans", "p1")).toBe(src);
    expect(streetSampleImage("jeans", "p2")).not.toBe(streetSampleImage("shirt", "p2"));
  });
});

describe("Street theme sample catalogue (store with no products yet)", () => {
  const samples = streetSampleCatalogue();
  const items = samples.map(toEllaStorefrontProduct);

  it("has in-stock products that can never be mistaken for real ones", () => {
    expect(samples.length).toBeGreaterThanOrEqual(8);
    expect(samples.every((p) => isStreetSampleProductId(p.product_id))).toBe(true);
    expect(isStreetSampleProductId("0f7c3b2a-real-product")).toBe(false);
    expect(items.every((p) => p.available > 0 && p.sizes.length >= 4)).toBe(true);
  });

  it("gives the default menu and all three sample banners something to show", () => {
    const nav = buildStreetNav([], [], items);
    expect(nav.map((n) => n.label)).toEqual(
      expect.arrayContaining(["Shirts", "T-Shirts", "Jeans", "Trousers", "Jackets"]),
    );
    expect(buildStreetBannerSlides([], nav, items).map((s) => s.id)).toEqual([
      "sample-new",
      "sample-category",
      "sample-all",
    ]);
  });
});
