import type { PublicStorefrontProduct, PublicStorefrontVariant } from "@/lib/websiteTypes";
import { classifyEllaStock, isEllaProductPurchasable, type EllaStockView } from "./ellaStock";
import { ellaCopy } from "./storefrontTheme";

export type EllaSizeOption = {
  id: string;
  size: string;
  color: string | null;
  price: number | null;
  available: number;
  availableKnown: boolean;
  stock: EllaStockView;
  purchasable: boolean;
};

export function availableFromPublicVariant(variant: PublicStorefrontVariant): {
  available: number;
  availableKnown: boolean;
} {
  if (variant.stock_status === "out_of_stock") {
    return { available: 0, availableKnown: true };
  }
  if (variant.stock_left != null && Number.isFinite(variant.stock_left)) {
    return { available: Math.max(0, Math.floor(variant.stock_left)), availableKnown: true };
  }
  return { available: 6, availableKnown: false };
}

function sizeLabel(variant: PublicStorefrontVariant, index: number): string {
  const size = String(variant.size || "").trim();
  if (size) return size;
  const color = String(variant.color || "").trim();
  if (color) return color;
  return index === 0 ? "Free size" : `Option ${index + 1}`;
}

export function mapEllaVariants(product: PublicStorefrontProduct): EllaSizeOption[] {
  const rows = Array.isArray(product.variants) ? product.variants : [];
  return rows.map((variant, index) => {
    const { available, availableKnown } = availableFromPublicVariant(variant);
    const stock = classifyEllaStock({
      available,
      availableKnown,
      lowStockThreshold: ellaCopy.lowStockThreshold,
    });
    const price =
      variant.display_price != null && Number.isFinite(Number(variant.display_price))
        ? Number(variant.display_price)
        : product.display_price != null && Number.isFinite(Number(product.display_price))
          ? Number(product.display_price)
          : null;
    return {
      id: variant.id,
      size: sizeLabel(variant, index),
      color: variant.color ? String(variant.color) : null,
      price,
      available,
      availableKnown,
      stock,
      purchasable: isEllaProductPurchasable(stock),
    };
  });
}

export function firstPurchasableSize(sizes: EllaSizeOption[]): EllaSizeOption | null {
  return sizes.find((size) => size.purchasable) ?? null;
}

export function uniqueEllaSizes(products: { sizes: EllaSizeOption[] }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const product of products) {
    for (const size of product.sizes) {
      if (!size.size || seen.has(size.size)) continue;
      seen.add(size.size);
      out.push(size.size);
    }
  }
  return out;
}
