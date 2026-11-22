import { describe, expect, it } from "vitest";
import {
  buildCatalogueItems,
  cataloguePriceLine,
  catalogueStockCounts,
  catalogueStockStatus,
  passesCatalogueStockFilter,
  type CatalogueProduct,
  type CatalogueVariant,
} from "./productCatalogue";
import { fitImageInBox, isUsableImageUrl } from "./productImages";

const products: CatalogueProduct[] = [
  { id: "p1", product_name: "Kurta", brand: "Aura", category: "Ethnic", image_url: "https://x.test/k.jpg", default_sale_price: 999 },
  { id: "p2", product_name: "Jeans", brand: "Denimo", category: "Bottom", image_url: null },
  { id: "p3", product_name: "Shirt", brand: "Aura", image_url: "javascript:alert(1)" },
];
const variants: CatalogueVariant[] = [
  { product_id: "p1", size: "XL", color: "Red", stock_qty: 2, sale_price: 1200, mrp: 1500 },
  { product_id: "p1", size: "M", color: "Blue", stock_qty: 3, sale_price: 1100, mrp: 1500 },
  { product_id: "p1", size: "S", color: "Red", stock_qty: 0, sale_price: 1100, mrp: 1500 },
  { product_id: "p2", size: "32", stock_qty: 5, sale_price: 800, mrp: 0 },
  { product_id: "p3", size: "40", stock_qty: 0, sale_price: 700 },
];

describe("buildCatalogueItems", () => {
  it("keeps in-stock sizes in garment order with price ranges", () => {
    const [kurta] = buildCatalogueItems(products, variants, { onlyInStock: true, onlyWithPhoto: true });
    expect(kurta.sizes).toEqual(["M", "XL"]);
    expect(kurta.stock).toBe(5);
    expect(kurta.salePrice).toEqual({ min: 1100, max: 1200 });
    expect(kurta.mrp).toEqual({ min: 1500, max: 1500 });
    expect(kurta.colors).toEqual(["Red", "Blue"]);
  });

  it("drops products with no usable photo unless a gallery photo is given", () => {
    const only = buildCatalogueItems(products, variants, { onlyInStock: false, onlyWithPhoto: true });
    expect(only.map((i) => i.id)).toEqual(["p1"]);
    const withGallery = buildCatalogueItems(products, variants, {
      onlyInStock: true,
      onlyWithPhoto: true,
      images: new Map([["p2", "https://x.test/j.jpg"]]),
    });
    expect(withGallery.map((i) => i.id)).toEqual(["p1", "p2"]);
    expect(withGallery[1].imageUrl).toBe("https://x.test/j.jpg");
  });

  it("drops out-of-stock products only when asked", () => {
    const all = buildCatalogueItems(products, variants, { onlyInStock: false, onlyWithPhoto: false });
    expect(all.map((i) => i.id)).toEqual(["p1", "p2", "p3"]);
    expect(all[0].sizes).toEqual(["S", "M", "XL"]);
    const inStock = buildCatalogueItems(products, variants, { onlyInStock: true, onlyWithPhoto: false });
    expect(inStock.map((i) => i.id)).toEqual(["p1", "p2"]);
  });
});

describe("catalogue stock filter", () => {
  it("in stock = quantity above 0 (low stock included); low = 1 to 5; out = 0", () => {
    expect(catalogueStockStatus(0)).toBe("out");
    expect(catalogueStockStatus(5)).toBe("low");
    expect(catalogueStockStatus(6)).toBe("in");
    expect(passesCatalogueStockFilter(3, "in")).toBe(true);
    expect(passesCatalogueStockFilter(0, "in")).toBe(false);
    expect(passesCatalogueStockFilter(3, "low")).toBe(true);
    expect(passesCatalogueStockFilter(9, "low")).toBe(false);
    expect(passesCatalogueStockFilter(0, "out")).toBe(true);
    expect(passesCatalogueStockFilter(0, "all")).toBe(true);
  });

  it("each button lists its own products, with quantity per size", () => {
    const stock = (filter: "in" | "low" | "out" | "all") =>
      buildCatalogueItems(products, variants, { stock: filter, onlyWithPhoto: false });
    expect(stock("in").map((i) => i.id)).toEqual(["p1", "p2"]);
    expect(stock("low").map((i) => i.id)).toEqual(["p1", "p2"]);
    expect(stock("out").map((i) => i.id)).toEqual(["p3"]);
    expect(stock("all").map((i) => i.id)).toEqual(["p1", "p2", "p3"]);
    // In stock: only sizes with stock, each with its quantity.
    expect(stock("in")[0].sizeStock).toEqual([
      { size: "M", qty: 3 },
      { size: "XL", qty: 2 },
    ]);
    // Out of stock: every size is listed, at 0.
    expect(stock("out")[0].sizeStock).toEqual([{ size: "40", qty: 0 }]);
    expect(stock("out")[0].stock).toBe(0);
  });

  it("counts for the buttons follow the photo switch", () => {
    expect(catalogueStockCounts(products, variants, { onlyWithPhoto: false })).toEqual({ in: 2, low: 2, out: 1, all: 3 });
    expect(catalogueStockCounts(products, variants, { onlyWithPhoto: true })).toEqual({ in: 1, low: 1, out: 0, all: 1 });
  });
});

describe("cataloguePriceLine", () => {
  const [kurta, jeans] = buildCatalogueItems(products, variants, {
    onlyInStock: true,
    onlyWithPhoto: false,
  });
  it("formats each mode", () => {
    expect(cataloguePriceLine(kurta, "sale")).toBe("Rs.1,100 - 1,200");
    expect(cataloguePriceLine(kurta, "mrp")).toBe("MRP Rs.1,500");
    expect(cataloguePriceLine(kurta, "both")).toBe("Rs.1,100 - 1,200  (MRP Rs.1,500)");
    expect(cataloguePriceLine(kurta, "none")).toBe("");
  });
  it("falls back to the sale price when there is no MRP", () => {
    expect(cataloguePriceLine(jeans, "mrp")).toBe("Rs.800");
    expect(cataloguePriceLine(jeans, "both")).toBe("Rs.800");
  });
});

describe("product image helpers", () => {
  it("accepts only http(s), data:image and blob URLs", () => {
    expect(isUsableImageUrl("https://a/b.jpg")).toBe(true);
    expect(isUsableImageUrl("data:image/png;base64,AA")).toBe(true);
    expect(isUsableImageUrl("javascript:alert(1)")).toBe(false);
    expect(isUsableImageUrl("")).toBe(false);
    expect(isUsableImageUrl(null)).toBe(false);
  });
  it("fits an image into a box, centred", () => {
    expect(fitImageInBox({ dataUrl: "", width: 200, height: 100 }, 0, 0, 10, 10)).toEqual({ x: 0, y: 2.5, w: 10, h: 5 });
    expect(fitImageInBox({ dataUrl: "", width: 100, height: 200 }, 5, 5, 10, 10)).toEqual({ x: 7.5, y: 5, w: 5, h: 10 });
  });
});
