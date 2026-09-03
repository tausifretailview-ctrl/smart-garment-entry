import { describe, expect, it } from "vitest";
import { buildUpiPayLink } from "@/lib/upiPayLink";
import { classifyEllaStock, isEllaProductPurchasable, ellaMaxPurchaseQty } from "./ellaStock";
import {
  addToEllaCart,
  ellaCartCount,
  ellaCartTotal,
  updateEllaCartQty,
} from "./ellaCart";
import {
  availableFromPublicProduct,
  ellaProductWhatsAppText,
  filterEllaProducts,
  mapEllaCategory,
  mapEllaStyleCode,
  toEllaStorefrontProduct,
} from "./ellaProduct";
import { enrichPublicStorefrontShop, isEllaNoorSlug } from "./storefrontTheme";
import type { PublicStorefrontProduct } from "@/lib/websiteTypes";

function sample(over: Partial<PublicStorefrontProduct> = {}): PublicStorefrontProduct {
  return {
    id: "listing-1",
    product_id: "11111111-2222-3333-4444-555555555555",
    name: "Zardozi lehenga",
    brand: "EN-204",
    category: "Bridal",
    display_order: 0,
    display_price: 185000,
    photo_urls: ["https://cdn.example/a.jpg"],
    stock_status: "in_stock",
    stock_left: null,
    variants: [],
    ...over,
  };
}

describe("enrichPublicStorefrontShop", () => {
  it("fills UPI and Instagram from bill/profile settings", () => {
    const shop = {
      name: "Ella",
      slug: "ella-noor",
      whatsapp_number: null,
      instagram_url: null,
    };
    const enriched = enrichPublicStorefrontShop(shop, {
      business_name: "Ella Noor",
      settings: { mobile_number: "919876543210" },
      bill_barcode_settings: {
        upi_id: "studio@okaxis",
        instagram_link: "@ella.noor",
      },
    });
    expect(enriched.upi_id).toBe("studio@okaxis");
    expect(enriched.instagram_url).toBe("https://instagram.com/ella.noor");
    expect(enriched.whatsapp_number).toBe("919876543210");
  });
});

describe("isEllaNoorSlug", () => {
  it("matches only the ella-noor org slug", () => {
    expect(isEllaNoorSlug("ella-noor")).toBe(true);
    expect(isEllaNoorSlug("Ella-Noor")).toBe(true);
    expect(isEllaNoorSlug("ellanoor")).toBe(true);
    expect(isEllaNoorSlug("demo")).toBe(false);
    expect(isEllaNoorSlug("")).toBe(false);
  });
});

describe("classifyEllaStock", () => {
  it("uses low when 0 < available <= threshold (default 3)", () => {
    expect(classifyEllaStock({ available: 2 }).state).toBe("low");
    expect(classifyEllaStock({ available: 2 }).label).toBe("Only 2 left");
    expect(classifyEllaStock({ available: 3 }).state).toBe("low");
    expect(classifyEllaStock({ available: 4 }).state).toBe("in");
  });

  it("labels zero stock as out — enquiry flow", () => {
    const view = classifyEllaStock({ available: 0 });
    expect(view.state).toBe("out");
    expect(view.label).toBe("Out of stock · Enquire");
    expect(isEllaProductPurchasable(view)).toBe(false);
  });

  it("shows In stock · N when quantity is known and above the low threshold", () => {
    const view = classifyEllaStock({ available: 7, availableKnown: true });
    expect(view.label).toBe("In stock · 7");
    expect(isEllaProductPurchasable(view)).toBe(true);
  });

  it("omits a guessed number when ERP hid the on-hand qty", () => {
    const view = classifyEllaStock({ available: 6, availableKnown: false });
    expect(view.label).toBe("In stock");
    expect(ellaMaxPurchaseQty(view, false)).toBe(1);
  });
});

describe("toEllaStorefrontProduct", () => {
  it("maps live ERP fields and keeps badge/spec stock in one helper", () => {
    const mapped = toEllaStorefrontProduct(sample({ stock_status: "low_stock", stock_left: 2 }));
    expect(mapped.code).toBe("EN-204");
    expect(mapped.category).toBe("Bridal");
    expect(mapped.priceLabel).toMatch(/1,85,000/);
    expect(mapped.stock.state).toBe("low");
    expect(mapped.stock.label).toBe("Only 2 left");
    expect(isEllaProductPurchasable(mapped.stock)).toBe(true);
  });

  it("treats ERP out_of_stock as enquiry-only", () => {
    const mapped = toEllaStorefrontProduct(sample({ stock_status: "out_of_stock", stock_left: null }));
    expect(availableFromPublicProduct(sample({ stock_status: "out_of_stock" }))).toEqual({
      available: 0,
      availableKnown: true,
    });
    expect(mapped.stock.state).toBe("out");
    expect(isEllaProductPurchasable(mapped.stock)).toBe(false);
  });

  it("classifies festive vs ready from category text", () => {
    expect(mapEllaCategory("Festive wear")).toBe("Festive");
    expect(mapEllaCategory("Kurta")).toBe("Ready");
  });

  it("builds a style code from the product id when brand is not a code", () => {
    expect(mapEllaStyleCode(sample({ brand: "A very long atelier brand name" }))).toBe("EN-111111");
  });

  it("uses a SKU-like product name as the style code when brand is empty", () => {
    expect(mapEllaStyleCode(sample({ brand: null, name: "ELN-A2-1464" }))).toBe("ELN-A2-1464");
  });
});

describe("filter + WhatsApp", () => {
  it("filters chips client-side", () => {
    const rows = [
      toEllaStorefrontProduct(sample()),
      toEllaStorefrontProduct(sample({ id: "2", product_id: "22222222-2222-3333-4444-555555555555", category: "Festive", name: "Eid jacket" })),
    ];
    expect(filterEllaProducts(rows, "Bridal", "").map((p) => p.name)).toEqual(["Zardozi lehenga"]);
    expect(filterEllaProducts(rows, "All", "eid")).toHaveLength(1);
  });

  it("WhatsApp text carries style name, code and price", () => {
    const text = ellaProductWhatsAppText(toEllaStorefrontProduct(sample()));
    expect(text).toContain("Zardozi lehenga");
    expect(text).toContain("EN-204");
    expect(text).toMatch(/1,85,000/);
  });
});

describe("ellaCart", () => {
  it("adds lines and computes total", () => {
    const product = toEllaStorefrontProduct(sample());
    const cart = addToEllaCart([], product, 1);
    expect(ellaCartCount(cart)).toBe(1);
    expect(ellaCartTotal(cart)).toBe(185000);
    const merged = addToEllaCart(cart, product, 2);
    expect(ellaCartCount(merged)).toBe(3);
    expect(updateEllaCartQty(merged, product.productId, 0)).toHaveLength(0);
  });
});

describe("buildUpiPayLink", () => {
  it("builds a standard UPI deep link", () => {
    const link = buildUpiPayLink({ upiId: "shop@upi", payeeName: "Ella Noor", amount: 1500.5 });
    expect(link).toContain("upi://pay?");
    expect(link).toContain("pa=shop%40upi");
    expect(link).toContain("am=1500.50");
    expect(link).toContain("cu=INR");
  });
});
