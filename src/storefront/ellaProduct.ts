import type { PublicStorefrontProduct } from "@/lib/websiteTypes";
import { formatStorefrontPrice } from "@/lib/storefrontStock";
import { ellaCopy, type EllaChipCategory } from "./storefrontTheme";
import { classifyEllaStock, type EllaStockView } from "./ellaStock";
import { mapEllaVariants, type EllaSizeOption } from "./ellaVariants";

export type EllaCategory = "Bridal" | "Festive" | "Ready";

export type EllaStorefrontProduct = {
  id: string;
  productId: string;
  code: string;
  name: string;
  category: EllaCategory;
  sectionSlug: string | null;
  sectionLabel: string | null;
  price: number | null;
  priceLabel: string;
  images: string[];
  fabric: string;
  leadTimeWeeks: number | null;
  available: number;
  availableKnown: boolean;
  madeToOrder: boolean;
  lowStockThreshold: number;
  stock: EllaStockView;
  sizes: EllaSizeOption[];
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

function stockFromSizes(sizes: EllaSizeOption[], fallback: EllaStockView): EllaStockView {
  if (sizes.length === 0) return fallback;
  const purchasable = sizes.filter((size) => size.purchasable);
  if (purchasable.length === 0) {
    return classifyEllaStock({ available: 0, availableKnown: true, lowStockThreshold: ellaCopy.lowStockThreshold });
  }
  const known = purchasable.every((size) => size.availableKnown);
  const available = Math.min(...purchasable.map((size) => size.available));
  return classifyEllaStock({
    available,
    availableKnown: known,
    lowStockThreshold: ellaCopy.lowStockThreshold,
  });
}

export function toEllaStorefrontProduct(product: PublicStorefrontProduct): EllaStorefrontProduct {
  const header = availableFromPublicProduct(product);
  const leadTimeWeeks = header.available <= 0 ? ellaCopy.defaultLeadWeeks : null;
  const headerStock = classifyEllaStock({
    available: header.available,
    availableKnown: header.availableKnown,
    leadTimeWeeks,
    lowStockThreshold: ellaCopy.lowStockThreshold,
  });
  const sizes = mapEllaVariants(product);
  const stock = stockFromSizes(sizes, headerStock);
  const available = sizes.length > 0 ? sizes.reduce((sum, size) => sum + size.available, 0) : header.available;
  const availableKnown = sizes.length > 0 ? sizes.every((size) => size.availableKnown) : header.availableKnown;
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
    sectionSlug: product.section_slug || null,
    sectionLabel: product.section_label || null,
    price,
    priceLabel: formatStorefrontPrice(price),
    images: Array.isArray(product.photo_urls) ? product.photo_urls.filter(Boolean) : [],
    fabric,
    leadTimeWeeks,
    available,
    availableKnown,
    madeToOrder: stock.state === "out",
    lowStockThreshold: ellaCopy.lowStockThreshold,
    stock,
    sizes,
  };
}

export function filterEllaProducts(
  products: EllaStorefrontProduct[],
  chip: EllaChipCategory | string,
  search: string,
): EllaStorefrontProduct[] {
  const q = search.trim().toLowerCase();
  return products.filter((p) => {
    const matchesChip =
      !chip ||
      chip === "All" ||
      chip === "all" ||
      p.sectionSlug === chip ||
      p.sectionLabel === chip ||
      p.category === chip;
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.sectionLabel || "").toLowerCase().includes(q) ||
      p.sizes.some((size) => size.size.toLowerCase().includes(q));
    return matchesChip && matchesSearch;
  });
}

export type EllaSortKey = "featured" | "price-asc" | "price-desc";

export function sortEllaProducts(
  products: EllaStorefrontProduct[],
  sort: EllaSortKey,
): EllaStorefrontProduct[] {
  const rows = [...products];
  if (sort === "price-asc") {
    return rows.sort((a, b) => (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY));
  }
  if (sort === "price-desc") {
    return rows.sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
  }
  return rows;
}

export function filterEllaProductsBySize(
  products: EllaStorefrontProduct[],
  size: string,
): EllaStorefrontProduct[] {
  const wanted = size.trim();
  if (!wanted || wanted === "all") return products;
  return products.filter((product) => product.sizes.some((row) => row.size === wanted));
}

export function filterEllaProductsInStock(products: EllaStorefrontProduct[]): EllaStorefrontProduct[] {
  return products.filter((product) => product.stock.state !== "out");
}

export function ellaProductWhatsAppText(product: EllaStorefrontProduct): string {
  const price = product.priceLabel ? ` — ${product.priceLabel}` : "";
  return `Hi Ella'Noor, I would like to enquire about ${product.name} (${product.code})${price}.`;
}
