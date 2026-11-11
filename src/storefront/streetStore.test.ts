import { describe, expect, it } from "vitest";
import type { PublicStorefrontProduct } from "@/lib/websiteTypes";
import { toEllaStorefrontProduct } from "./ellaProduct";
import {
  buildStreetHeroSlides,
  buildStreetNav,
  buildStreetTiles,
  parseStreetWishlist,
  restoreStreetCart,
  streetCardFlag,
  streetNewArrivals,
  streetProductsFor,
  streetRelatedProducts,
  streetSizeFacets,
  toggleStreetWishlist,
} from "./streetStore";

function product(over: Partial<PublicStorefrontProduct> & { id: string }): PublicStorefrontProduct {
  return {
    product_id: over.id,
    name: `Style ${over.id}`,
    brand: null,
    category: null,
    display_order: 0,
    display_price: 999,
    photo_urls: [`/${over.id}.jpg`],
    stock_status: "in_stock",
    stock_left: null,
    variants: [
      { id: `${over.id}-m`, size: "M", color: null, display_price: 999, stock_status: "in_stock", stock_left: 4 },
      { id: `${over.id}-l`, size: "L", color: null, display_price: 999, stock_status: "out_of_stock", stock_left: 0 },
    ],
    ...over,
  };
}

const catalogue = [
  product({ id: "a", category: "Shirts", section_slug: "new-arrival", section_label: "New Arrival", display_order: 1 }),
  product({ id: "b", category: "Shirts", display_order: 2 }),
  product({ id: "c", category: "Jeans", display_order: 3, photo_urls: [] }),
  product({
    id: "d",
    category: "Jeans",
    display_order: 4,
    stock_status: "out_of_stock",
    variants: [{ id: "d-m", size: "M", color: null, display_price: 999, stock_status: "out_of_stock", stock_left: 0 }],
  }),
].map(toEllaStorefrontProduct);

describe("Street theme navigation", () => {
  it("uses Website menus, and a heading without its own filter shows all its children", () => {
    const nav = buildStreetNav(
      [
        { id: "home", label: "Home", category_filter: null, display_order: 0 },
        {
          id: "m1",
          label: "Clothing",
          category_filter: null,
          display_order: 1,
          children: [
            { id: "m1a", label: "Shirts", category_filter: "Shirts", display_order: 1 },
            { id: "m1b", label: "Jeans", category_filter: "jeans", display_order: 2 },
          ],
        },
      ],
      [],
      catalogue,
    );
    expect(nav.map((n) => n.label)).toEqual(["Clothing"]);
    expect(nav[0].chips).toEqual(["Shirts", "jeans"]);
    expect(streetProductsFor(catalogue, nav[0])).toHaveLength(4);
    // Category names match whatever case the menu was typed in.
    expect(streetProductsFor(catalogue, nav[0].children[1]).map((p) => p.productId)).toEqual(["c", "d"]);
  });

  it("falls back to sections, then to the ERP categories of the products", () => {
    const bySection = buildStreetNav([], [{ id: "s1", slug: "new-arrival", label: "New Arrival", display_order: 0 }], catalogue);
    expect(bySection).toHaveLength(1);
    expect(bySection[0].sort).toBe("newest");
    expect(streetProductsFor(catalogue, bySection[0]).map((p) => p.productId)).toEqual(["a"]);

    const byCategory = buildStreetNav(undefined, undefined, catalogue);
    expect(byCategory.map((n) => n.label).sort()).toEqual(["Jeans", "Shirts"]);
  });

  it("with no link chosen every product is shown", () => {
    expect(streetProductsFor(catalogue, null)).toHaveLength(4);
  });
});

describe("Street theme home page is built from the shop's own catalogue", () => {
  const nav = buildStreetNav(undefined, undefined, catalogue);

  it("makes one category tile per link with products, each with its own photo", () => {
    const tiles = buildStreetTiles(nav, catalogue);
    expect(tiles.map((t) => t.count)).toEqual([2, 2]);
    expect(tiles.every((t) => t.photo)).toBe(true);
    expect(new Set(tiles.map((t) => t.photo)).size).toBe(2);
  });

  it("banner uses in-stock products with photos, new arrivals first", () => {
    expect(buildStreetHeroSlides(catalogue).map((p) => p.productId)).toEqual(["a", "b"]);
  });

  it("new arrivals come from the New Arrival section, else the latest listings", () => {
    expect(streetNewArrivals(catalogue).map((p) => p.productId)).toEqual(["a"]);
    const plain = catalogue.filter((p) => p.productId !== "a");
    expect(streetNewArrivals(plain, 2).map((p) => p.productId)).toEqual(["d", "c"]);
  });

  it("flags and size filters follow live stock", () => {
    expect(streetCardFlag(catalogue[0])).toBe("new");
    expect(streetCardFlag(catalogue[3])).toBe("sold-out");
    expect(streetSizeFacets(catalogue)).toEqual(["M"]);
  });

  it("suggests the same section or category first", () => {
    expect(streetRelatedProducts(catalogue, catalogue[2]).map((p) => p.productId)).toEqual(["d", "a", "b"]);
  });
});

describe("Street theme wishlist and saved bag", () => {
  it("reads only a clean list of product ids", () => {
    expect(parseStreetWishlist('["a","a",3,"b"]')).toEqual(["a", "b"]);
    expect(parseStreetWishlist("not json")).toEqual([]);
    expect(parseStreetWishlist('{"a":1}')).toEqual([]);
    expect(toggleStreetWishlist(["a"], "b")).toEqual(["b", "a"]);
    expect(toggleStreetWishlist(["a", "b"], "a")).toEqual(["b"]);
  });

  it("re-checks a saved bag against live stock", () => {
    const saved = JSON.stringify([
      { productId: "a", size: "M", qty: 9 },
      { productId: "a", size: "L", qty: 1 },
      { productId: "gone", size: "M", qty: 1 },
    ]);
    const cart = restoreStreetCart(saved, catalogue);
    // M is capped at the 4 in stock; L is sold out; the unlisted product is dropped.
    expect(cart).toHaveLength(1);
    expect(cart[0]).toMatchObject({ key: "a::M", qty: 4, maxQty: 4, variantId: "a-m" });
    expect(restoreStreetCart("oops", catalogue)).toEqual([]);
  });
});
