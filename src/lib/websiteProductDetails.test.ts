import { describe, expect, it } from "vitest";
import type { PublicStorefrontProduct } from "@/lib/websiteTypes";
import {
  applyWebsiteProductDetails,
  cleanWebsiteDescription,
  cleanWebsiteName,
  isMissingWebsiteDetailsColumns,
} from "./websiteProductDetails";

function product(id: string, name: string): PublicStorefrontProduct {
  return {
    id,
    product_id: `p-${id}`,
    name,
    brand: null,
    category: null,
    display_order: 0,
    display_price: 1000,
    photo_urls: [],
    stock_status: "in_stock",
    stock_left: null,
    variants: [],
  };
}

describe("websiteProductDetails", () => {
  it("cleans names and descriptions", () => {
    expect(cleanWebsiteName("  Silk   kurta set ")).toBe("Silk kurta set");
    expect(cleanWebsiteName("   ")).toBeNull();
    expect(cleanWebsiteDescription("Line one  \r\n\r\n\r\nLine two ")).toBe("Line one\n\nLine two");
    expect(cleanWebsiteDescription("")).toBeNull();
  });

  it("overlays website name and description, keeping the ERP name", () => {
    const [a, b] = applyWebsiteProductDetails(
      [product("1", "AB-A01"), product("2", "AK-30")],
      [{ id: "1", display_name: "Embroidered 3-piece suit", description: "Pure cotton." }],
    );
    expect(a.name).toBe("Embroidered 3-piece suit");
    expect(a.erp_name).toBe("AB-A01");
    expect(a.description).toBe("Pure cotton.");
    expect(b).toEqual(product("2", "AK-30"));
  });

  it("keeps the ERP name when only a description is set", () => {
    const [a] = applyWebsiteProductDetails(
      [product("1", "AB-A01")],
      [{ id: "1", display_name: null, description: "Chanderi with zari." }],
    );
    expect(a.name).toBe("AB-A01");
    expect(a.description).toBe("Chanderi with zari.");
  });

  it("detects the missing-column error", () => {
    expect(
      isMissingWebsiteDetailsColumns("Could not find the 'description' column of 'website_products' in the schema cache"),
    ).toBe(true);
    expect(isMissingWebsiteDetailsColumns('column "display_name" does not exist')).toBe(true);
    expect(isMissingWebsiteDetailsColumns("Could not find the 'section_id' column")).toBe(false);
    expect(isMissingWebsiteDetailsColumns("permission denied")).toBe(false);
  });
});
