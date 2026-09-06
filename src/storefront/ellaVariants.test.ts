import { describe, expect, it } from "vitest";
import type { PublicStorefrontProduct } from "@/lib/websiteTypes";
import { mapEllaVariants } from "./ellaVariants";
import { toEllaStorefrontProduct } from "./ellaProduct";
import { addToEllaCart } from "./ellaCart";
import { formatEllaOrderMessage, validateEllaCheckout } from "./ellaOrder";

const product: PublicStorefrontProduct = {
  id: "listing-1",
  product_id: "11111111-2222-3333-4444-555555555555",
  name: "Zardozi lehenga",
  brand: "EN-204",
  category: "Bridal",
  display_order: 0,
  display_price: 185000,
  photo_urls: ["https://cdn.example/a.jpg"],
  stock_status: "in_stock",
  stock_left: 3,
  variants: [
    {
      id: "v-38",
      size: "38",
      color: null,
      display_price: 185000,
      stock_status: "in_stock",
      stock_left: 2,
    },
    {
      id: "v-40",
      size: "40",
      color: null,
      display_price: 185000,
      stock_status: "out_of_stock",
      stock_left: 0,
    },
  ],
};

describe("mapEllaVariants", () => {
  it("marks sold-out sizes and keeps purchasable ones", () => {
    const sizes = mapEllaVariants(product);
    expect(sizes.map((s) => [s.size, s.purchasable, s.available])).toEqual([
      ["38", true, 2],
      ["40", false, 0],
    ]);
  });
});

describe("addToEllaCart qty cap", () => {
  it("will not exceed units on hand for a size", () => {
    const mapped = toEllaStorefrontProduct(product);
    const size = mapped.sizes[0];
    const once = addToEllaCart([], mapped, 2, size);
    expect(once[0].qty).toBe(2);
    const over = addToEllaCart(once, mapped, 4, size);
    expect(over[0].qty).toBe(2);
  });
});

describe("validateEllaCheckout", () => {
  it("blocks UPI checkout without a reference", () => {
    const mapped = toEllaStorefrontProduct(product);
    const cart = addToEllaCart([], mapped, 1, mapped.sizes[0]);
    const missing = validateEllaCheckout(
      {
        customerName: "Sheza",
        customerPhone: "9876543210",
        address: "12 Atelier Lane, Mumbai",
        pincode: "400001",
        paymentMethod: "upi",
        upiReference: "",
      },
      cart,
    );
    expect(missing.ok).toBe(false);
    if (missing.ok === false) expect(missing.error).toMatch(/UPI reference/i);

    const ok = validateEllaCheckout(
      {
        customerName: "Sheza",
        customerPhone: "9876543210",
        address: "12 Atelier Lane, Mumbai",
        pincode: "400001",
        paymentMethod: "upi",
        upiReference: "AXIS123456",
      },
      cart,
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(formatEllaOrderMessage(cart, ok.value)).toContain("UPI ref: AXIS123456");
  });
});
