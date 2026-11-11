/**
 * Pure helpers for the "Street" store theme. Everything on the page is built
 * from the shop's own catalogue (menus, sections, products): no fixed photos
 * or wording, so any shop can pick the theme.
 */
import type { PublicStorefrontMenu } from "@/lib/websiteTypes";
import { isNewArrivalSlug, type PublicStorefrontSection } from "@/lib/websiteSections";
import { ellaCartLineKey, type EllaCartLine } from "./ellaCart";
import type { EllaSortKey, EllaStorefrontProduct } from "./ellaProduct";
import { ellaSizeSortKey } from "./ellaVariants";

export type StreetNavItem = {
  id: string;
  label: string;
  /** Section slugs / category names this link shows. Empty = every product. */
  chips: string[];
  sort: EllaSortKey;
  children: StreetNavItem[];
};

function key(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

export function streetMatchesChip(product: EllaStorefrontProduct, chip: string): boolean {
  const k = key(chip);
  if (!k || k === "all") return true;
  return key(product.sectionSlug) === k || key(product.sectionLabel) === k || key(product.sourceCategory) === k;
}

export function streetProductsFor(
  products: EllaStorefrontProduct[],
  item: Pick<StreetNavItem, "chips"> | null,
): EllaStorefrontProduct[] {
  if (!item || item.chips.length === 0) return products;
  return products.filter((p) => item.chips.some((chip) => streetMatchesChip(p, chip)));
}

function isHomeLabel(label: string): boolean {
  return /^(home|shop|all)$/i.test(label.trim());
}

function menuChip(menu: PublicStorefrontMenu, sections: PublicStorefrontSection[]): string {
  const filter = String(menu.category_filter || "").trim();
  if (filter) return filter;
  const label = key(menu.label);
  const section = sections.find((s) => key(s.label) === label || key(s.slug) === label);
  return section?.slug || menu.label.trim();
}

function menuToNav(menu: PublicStorefrontMenu, sections: PublicStorefrontSection[]): StreetNavItem {
  const children = (menu.children || [])
    .filter((child) => child.label.trim())
    .map((child) => menuToNav(child, sections));
  const hasOwnFilter = Boolean(String(menu.category_filter || "").trim());
  // A heading with children and no filter of its own shows everything under it.
  const chips =
    children.length > 0 && !hasOwnFilter
      ? [...new Set(children.flatMap((c) => c.chips))]
      : [menuChip(menu, sections)];
  return {
    id: menu.id,
    label: menu.label.trim(),
    chips,
    sort: /\bnew\b/i.test(menu.label) ? "newest" : "featured",
    children,
  };
}

/**
 * Header links: Website → Menus when the shop made any, else its sections,
 * else the ERP categories of the published products.
 */
export function buildStreetNav(
  menus: PublicStorefrontMenu[] | undefined,
  sections: PublicStorefrontSection[] | undefined,
  products: EllaStorefrontProduct[],
): StreetNavItem[] {
  const sectionList = sections || [];
  const roots = (menus || []).filter((m) => m.label.trim() && !isHomeLabel(m.label));
  if (roots.length > 0) return roots.map((m) => menuToNav(m, sectionList));

  if (sectionList.length > 0) {
    return [...sectionList]
      .sort((a, b) => a.display_order - b.display_order)
      .map((s) => ({
        id: `section:${s.slug}`,
        label: s.label,
        chips: [s.slug],
        sort: isNewArrivalSlug(s.slug) ? ("newest" as const) : ("featured" as const),
        children: [],
      }));
  }

  const counts = new Map<string, { label: string; count: number }>();
  for (const p of products) {
    const label = (p.sourceCategory || "").trim();
    if (!label) continue;
    const entry = counts.get(key(label)) || { label, count: 0 };
    entry.count += 1;
    counts.set(key(label), entry);
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 8)
    .map((c) => ({ id: `category:${key(c.label)}`, label: c.label, chips: [c.label], sort: "featured" as const, children: [] }));
}

export type StreetTile = { item: StreetNavItem; photo: string | null; count: number };

/** "Shop by category" tiles: one per header link that has products, with one of its photos. */
export function buildStreetTiles(nav: StreetNavItem[], products: EllaStorefrontProduct[], max = 6): StreetTile[] {
  const used = new Set<string>();
  const tiles: StreetTile[] = [];
  const flat = nav.flatMap((item) => (item.children.length > 0 ? item.children : [item]));
  for (const item of flat) {
    const list = streetProductsFor(products, item);
    if (list.length === 0) continue;
    const withPhoto = list.find((p) => p.images[0] && !used.has(p.images[0])) || list.find((p) => p.images[0]);
    const photo = withPhoto?.images[0] || null;
    if (photo) used.add(photo);
    tiles.push({ item, photo, count: list.length });
    if (tiles.length >= max) break;
  }
  return tiles;
}

export function isStreetNewProduct(product: EllaStorefrontProduct): boolean {
  return isNewArrivalSlug(product.sectionSlug);
}

/** Banner slides: the shop's own product photos, new arrivals first. */
export function buildStreetHeroSlides(products: EllaStorefrontProduct[], max = 4): EllaStorefrontProduct[] {
  const withPhoto = products.filter((p) => p.images.length > 0 && p.available > 0);
  const pool = withPhoto.length > 0 ? withPhoto : products.filter((p) => p.images.length > 0);
  const fresh = pool.filter(isStreetNewProduct);
  const rest = pool.filter((p) => !isStreetNewProduct(p));
  return [...fresh, ...rest].slice(0, max);
}

/** New arrivals rail: the New Arrival section when used, else the latest listings. */
export function streetNewArrivals(products: EllaStorefrontProduct[], max = 12): EllaStorefrontProduct[] {
  const fresh = products.filter(isStreetNewProduct);
  if (fresh.length > 0) return fresh.slice(0, max);
  return [...products].sort((a, b) => b.displayOrder - a.displayOrder).slice(0, max);
}

export function streetSizeFacets(products: EllaStorefrontProduct[]): string[] {
  const labels = new Set<string>();
  for (const p of products) for (const s of p.sizes) if (s.inStock) labels.add(s.label);
  return [...labels].sort((a, b) => ellaSizeSortKey(a) - ellaSizeSortKey(b) || a.localeCompare(b));
}

export type StreetCardFlag = "sold-out" | "few-left" | "new" | null;

export function streetCardFlag(product: EllaStorefrontProduct): StreetCardFlag {
  if (product.available <= 0) return "sold-out";
  if (product.stock.state === "low") return "few-left";
  return isStreetNewProduct(product) ? "new" : null;
}

export function streetRelatedProducts(
  products: EllaStorefrontProduct[],
  product: EllaStorefrontProduct,
  max = 8,
): EllaStorefrontProduct[] {
  const others = products.filter((p) => p.productId !== product.productId);
  const sameSection = others.filter((p) => product.sectionSlug && p.sectionSlug === product.sectionSlug);
  const sameCategory = others.filter(
    (p) => product.sourceCategory && key(p.sourceCategory) === key(product.sourceCategory) && !sameSection.includes(p),
  );
  const rest = others.filter((p) => !sameSection.includes(p) && !sameCategory.includes(p));
  return [...sameSection, ...sameCategory, ...rest].slice(0, max);
}

/* --- wishlist (kept on the shopper's device) ------------------------------ */

export function streetWishlistKey(slug: string): string {
  return `ezzy:store-wishlist:${key(slug)}`;
}

export function parseStreetWishlist(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0))].slice(0, 200);
  } catch {
    return [];
  }
}

export function toggleStreetWishlist(list: string[], productId: string): string[] {
  return list.includes(productId) ? list.filter((id) => id !== productId) : [productId, ...list];
}

/* --- bag kept across a page reload ---------------------------------------- */

export function streetCartKey(slug: string): string {
  return `ezzy:store-bag:${key(slug)}`;
}

/**
 * Re-check a saved bag against the live catalogue: drop lines whose product or
 * size is gone or sold out, and cap each quantity at the stock the ERP reports now.
 */
export function restoreStreetCart(raw: string | null | undefined, products: EllaStorefrontProduct[]): EllaCartLine[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const lines: EllaCartLine[] = [];
  for (const entry of parsed as Array<Partial<EllaCartLine>>) {
    if (!entry || typeof entry.productId !== "string") continue;
    const product = products.find((p) => p.productId === entry.productId);
    if (!product) continue;
    const size = product.sizes.find((s) => s.label === entry.size) || (entry.size ? null : product.defaultSize);
    if (!size || !size.inStock) continue;
    const maxQty = size.availableKnown ? size.available : null;
    const wanted = Math.max(1, Math.floor(Number(entry.qty) || 1));
    lines.push({
      key: ellaCartLineKey(product.productId, entry.size ?? null),
      productId: product.productId,
      variantId: size.variantId,
      code: product.code,
      name: product.name,
      size: entry.size ?? null,
      price: size.price ?? product.price,
      priceLabel: product.priceLabel,
      qty: maxQty != null ? Math.min(maxQty, wanted) : wanted,
      maxQty,
      madeToOrder: false,
      image: product.images[0],
    });
  }
  return lines;
}
