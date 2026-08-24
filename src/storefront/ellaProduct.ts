import type { PublicStorefrontProduct } from "@/lib/websiteTypes";
import { formatStorefrontPrice } from "@/lib/storefrontStock";
import { ellaCopy, type EllaChipCategory } from "./storefrontTheme";
import { classifyEllaStock, type EllaStockView } from "./ellaStock";

export type EllaCategory = "Bridal" | "Festive" | "Ready";

export type EllaStorefrontProduct = {
  id: string;
  productId: string;
  code: string;
  name: string;
  category: EllaCategory;
  price: number | null;
  priceLabel: string;
  images: string[];
  fabric: string;
  leadTimeWeeks: number | null;
  available: number;
  madeToOrder: boolean;
  lowStockThreshold: number;
  stock: EllaStockView;
};

export function mapEllaCategory(raw: string | null | undefined): EllaCategory {
  const c = String(raw || "").toLowerCase();
  if (/bridal|bride|lehenga|wedding|trousseau|noor/.test(c)) return "Bridal";
  if (/festive|party|occasion|sangeet|eid|reception/.test(c)) return "Festive";
  return "Ready";
}

function looksLikeStyleCode(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._/-]{2,22}$/.test(value) && !/\s/.test(value);
}

export function mapEllaStyleCode(product: PublicStorefrontProduct): string {
  const brand = String(product.brand || "").trim();
  if (brand && looksLikeStyleCode(brand)) {
    return brand.toUpperCase();
  }
  const name = String(product.name || "").trim();
  if (looksLikeStyleCode(name)) {
    return name.toUpperCase();
  }
  const compact = String(product.product_id || product.id || "").replace(/-/g, "").slice(0, 6);
  return compact ? `EN-${compact.toUpperCase()}` : "EN-STYLE";
}

export function availableFromPublicProduct(product: PublicStorefrontProduct): {
  available: number;
  availableKnown: boolean;
} {
  if (product.stock_status === "out_of_stock") {
    return { available: 0, availableKnown: true };
  }
  if (product.stock_left != null && Number.isFinite(product.stock_left)) {
    return { available: Math.floor(product.stock_left), availableKnown: true };
  }
  // Public RPC hides on-hand qty above 5; treat as at least 6 without showing a guessed number.
  return { available: 6, availableKnown: false };
}

export function toEllaStorefrontProduct(product: PublicStorefrontProduct): EllaStorefrontProduct {
  const { available, availableKnown } = availableFromPublicProduct(product);
  const madeToOrder = true;
  const leadTimeWeeks = available <= 0 ? ellaCopy.defaultLeadWeeks : null;
  const stock = classifyEllaStock({
    available,
    availableKnown,
    madeToOrder,
    leadTimeWeeks,
    lowStockThreshold: ellaCopy.lowStockThreshold,
  });
  const price =
    product.display_price != null && Number.isFinite(Number(product.display_price))
      ? Number(product.display_price)
      : null;
  const fabric = String(product.brand || "").trim().length > 18 ? String(product.brand).trim() : ellaCopy.defaultFabric;

  return {
    id: product.id,
    productId: product.product_id,
    code: mapEllaStyleCode(product),
    name: product.name,
    category: mapEllaCategory(product.category),
    price,
    priceLabel: formatStorefrontPrice(price),
    images: Array.isArray(product.photo_urls) ? product.photo_urls.filter(Boolean) : [],
    fabric,
    leadTimeWeeks,
    available,
    madeToOrder,
    lowStockThreshold: ellaCopy.lowStockThreshold,
    stock,
  };
}

export function filterEllaProducts(
  products: EllaStorefrontProduct[],
  chip: EllaChipCategory | string,
  search: string,
): EllaStorefrontProduct[] {
  const q = search.trim().toLowerCase();
  return products.filter((p) => {
    const matchesChip = !chip || chip === "All" || p.category === chip;
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q);
    return matchesChip && matchesSearch;
  });
}

export function ellaProductWhatsAppText(product: EllaStorefrontProduct): string {
  const price = product.priceLabel ? ` — ${product.priceLabel}` : "";
  return `Hi Ella'Noor, I would like to enquire about ${product.name} (${product.code})${price}.`;
}
