import type { PublicStorefrontProduct } from "@/lib/websiteTypes";
import { formatStorefrontPrice } from "@/lib/storefrontStock";
import { ellaCopy, type EllaChipCategory } from "./storefrontTheme";
import { classifyEllaStock, type EllaStockView } from "./ellaStock";
import {
  anySizeKnown,
  pickDefaultSize,
  totalAvailableFromSizes,
  toEllaSizeOptions,
  type EllaSizeOption,
} from "./ellaVariants";

export type EllaCategory = "Bridal" | "Festive" | "Ready";

export type EllaSortKey = "featured" | "newest" | "price-asc" | "price-desc" | "in-stock";

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
  /** Per-size stock straight off the ERP variant rows. */
  sizes: EllaSizeOption[];
  defaultSize: EllaSizeOption | null;
  displayOrder: number;
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
  if (brand && looksLikeStyleCode(brand)) return brand.toUpperCase();
  const name = String(product.name || "").trim();
  if (looksLikeStyleCode(name)) return name.toUpperCase();
  const compact = String(product.product_id || product.id || "").replace(/-/g, "").slice(0, 6);
  return compact ? `EN-${compact.toUpperCase()}` : "EN-STYLE";
}

export function availableFromPublicProduct(product: PublicStorefrontProduct): {
  available: number;
  availableKnown: boolean;
} {
  if (product.stock_status === "out_of_stock") return { available: 0, availableKnown: true };
  if (product.stock_left != null && Number.isFinite(product.stock_left)) {
    return { available: Math.floor(product.stock_left), availableKnown: true };
  }
  return { available: 6, availableKnown: false };
}

export function toEllaStorefrontProduct(product: PublicStorefrontProduct): EllaStorefrontProduct {
  const sizes = toEllaSizeOptions(product);
  const hasVariantRows = Array.isArray(product.variants) && product.variants.length > 0;

  // Variant rows are the source of truth when present; otherwise fall back to
  // the product-level figure the RPC exposes.
  const fallback = availableFromPublicProduct(product);
  const available = hasVariantRows ? totalAvailableFromSizes(sizes) : fallback.available;
  const availableKnown = hasVariantRows ? anySizeKnown(sizes) : fallback.availableKnown;

  const leadTimeWeeks = available <= 0 ? ellaCopy.defaultLeadWeeks : null;
  const stock = classifyEllaStock({
    available,
    availableKnown,
    leadTimeWeeks,
    lowStockThreshold: ellaCopy.lowStockThreshold,
  });
  const price =
    product.display_price != null && Number.isFinite(Number(product.display_price))
      ? Number(product.display_price)
      : null;
  const fabric =
    String(product.brand || "").trim().length > 18
      ? String(product.brand).trim()
      : ellaCopy.defaultFabric;

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
    defaultSize: pickDefaultSize(sizes),
    displayOrder: Number(product.display_order ?? 0),
  };
}

export type EllaFilterState = {
  chip: EllaChipCategory | string;
  search: string;
  sizes: string[];
  inStockOnly: boolean;
  maxPrice: number | null;
  sort: EllaSortKey;
};

export const ELLA_DEFAULT_FILTERS: EllaFilterState = {
  chip: "all",
  search: "",
  sizes: [],
  inStockOnly: false,
  maxPrice: null,
  sort: "featured",
};

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
      p.fabric.toLowerCase().includes(q) ||
      (p.sectionLabel || "").toLowerCase().includes(q);
    return matchesChip && matchesSearch;
  });
}

export function sortEllaProducts(
  products: EllaStorefrontProduct[],
  sort: EllaSortKey,
): EllaStorefrontProduct[] {
  const list = [...products];
  switch (sort) {
    case "price-asc":
      return list.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    case "price-desc":
      return list.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
    case "in-stock":
      return list.sort((a, b) => Number(b.available > 0) - Number(a.available > 0));
    case "newest":
      return list.sort((a, b) => b.displayOrder - a.displayOrder);
    default:
      return list.sort((a, b) => a.displayOrder - b.displayOrder);
  }
}

/** Full pipeline used by the collection view: chip → search → facets → sort. */
export function applyEllaFilters(
  products: EllaStorefrontProduct[],
  filters: EllaFilterState,
): EllaStorefrontProduct[] {
  let list = filterEllaProducts(products, filters.chip, filters.search);

  if (filters.inStockOnly) {
    list = list.filter((p) => p.available > 0);
  }
  if (filters.sizes.length > 0) {
    list = list.filter((p) =>
      p.sizes.some((s) => s.inStock && filters.sizes.includes(s.label)),
    );
  }
  if (filters.maxPrice != null) {
    list = list.filter((p) => p.price == null || p.price <= filters.maxPrice!);
  }
  return sortEllaProducts(list, filters.sort);
}

export function ellaPriceCeiling(products: EllaStorefrontProduct[]): number {
  const prices = products.map((p) => p.price ?? 0).filter((n) => n > 0);
  if (prices.length === 0) return 0;
  return Math.ceil(Math.max(...prices) / 500) * 500;
}

export function ellaProductWhatsAppText(product: EllaStorefrontProduct): string {
  const price = product.priceLabel ? ` — ${product.priceLabel}` : "";
  return `Hi Ella'Noor, I would like to enquire about ${product.name} (${product.code})${price}.`;
}
