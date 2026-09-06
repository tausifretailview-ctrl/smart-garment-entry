import type { PublicStorefrontPayload } from "@/lib/websiteTypes";
import {
  defaultNewArrivalSection,
  isNewArrivalSlug,
  NEW_ARRIVAL_LABEL,
  NEW_ARRIVAL_SLUG,
  sortSectionsNewArrivalFirst,
  type WebsiteSection,
} from "@/lib/websiteSections";

export const STOREFRONT_SECTIONS_KEY = "storefront_sections";
export const STOREFRONT_PRODUCT_SECTIONS_KEY = "storefront_product_sections";
export const SECTION_MENU_PREFIX = "ezzy-section:";
export const PRODUCT_MENU_PREFIX = "ezzy-product:";

export type WebsiteSectionsStorage = "table" | "settings";

export type SectionMenuRow = {
  id: string;
  parent_id?: string | null;
  label: string;
  category_filter: string | null;
  display_order?: number;
  is_active?: boolean;
};

export type WebsiteSectionsState = {
  sections: WebsiteSection[];
  storage: WebsiteSectionsStorage;
  productSections: Record<string, string>;
};

export function isMissingWebsiteSectionsSchema(message: string | null | undefined): boolean {
  const text = String(message || "");
  return /website_sections|schema cache|PGRST205|PGRST202|column.*section_id/i.test(text);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function newSectionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sec-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function parseStoredSections(settings: unknown, orgId: string): WebsiteSection[] {
  const raw = asRecord(settings)[STOREFRONT_SECTIONS_KEY];
  if (!Array.isArray(raw)) return [];
  const rows: WebsiteSection[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    const slug = String(row.slug || "").trim();
    const label = String(row.label || "").trim();
    if (!slug || !label) continue;
    rows.push({
      id: String(row.id || `${orgId}:${slug}`),
      organization_id: orgId,
      slug,
      label,
      display_order: Number.isFinite(Number(row.display_order)) ? Number(row.display_order) : 0,
      is_active: row.is_active !== false,
    });
  }
  return sortSectionsNewArrivalFirst(rows);
}

export function parseStoredProductSections(settings: unknown): Record<string, string> {
  const raw = asRecord(settings)[STOREFRONT_PRODUCT_SECTIONS_KEY];
  const source = asRecord(raw);
  const map: Record<string, string> = {};
  for (const [productId, slug] of Object.entries(source)) {
    if (productId && typeof slug === "string" && slug.trim()) map[productId] = slug.trim();
  }
  return map;
}

export function withDefaultNewArrival(orgId: string, sections: WebsiteSection[]): WebsiteSection[] {
  if (sections.some((s) => isNewArrivalSlug(s.slug))) return sortSectionsNewArrivalFirst(sections);
  return sortSectionsNewArrivalFirst([
    {
      id: newSectionId(),
      ...defaultNewArrivalSection(orgId),
    },
    ...sections,
  ]);
}

export function buildSettingsSection(
  orgId: string,
  input: { label: string; slug: string; display_order: number; is_active?: boolean; id?: string },
): WebsiteSection {
  return {
    id: input.id || newSectionId(),
    organization_id: orgId,
    slug: input.slug,
    label: input.label,
    display_order: input.display_order,
    is_active: input.is_active !== false,
  };
}

export function sectionMenuFilter(slug: string): string {
  return `${SECTION_MENU_PREFIX}${slug}`;
}

export function productMenuFilter(productId: string): string {
  return `${PRODUCT_MENU_PREFIX}${productId}`;
}

export function sectionSlugFromMenuFilter(filter: string | null | undefined): string | null {
  const text = String(filter || "");
  if (!text.startsWith(SECTION_MENU_PREFIX)) return null;
  const slug = text.slice(SECTION_MENU_PREFIX.length).trim();
  return slug || null;
}

export function productIdFromMenuFilter(filter: string | null | undefined): string | null {
  const text = String(filter || "");
  if (!text.startsWith(PRODUCT_MENU_PREFIX)) return null;
  const id = text.slice(PRODUCT_MENU_PREFIX.length).trim();
  return id || null;
}

export function isReservedStorefrontMenuFilter(filter: string | null | undefined): boolean {
  const text = String(filter || "");
  return text.startsWith(SECTION_MENU_PREFIX) || text.startsWith(PRODUCT_MENU_PREFIX);
}

export function parseSectionsFromMenus(menus: SectionMenuRow[] | undefined, orgId: string): WebsiteSection[] {
  const rows: WebsiteSection[] = [];
  for (const menu of menus || []) {
    const slug = sectionSlugFromMenuFilter(menu.category_filter);
    if (!slug) continue;
    rows.push({
      id: menu.id,
      organization_id: orgId,
      slug,
      label: String(menu.label || "").trim() || slug,
      display_order: Number.isFinite(Number(menu.display_order)) ? Number(menu.display_order) : 0,
      is_active: menu.is_active !== false,
    });
  }
  return sortSectionsNewArrivalFirst(rows);
}

export function parseProductSectionsFromMenus(menus: SectionMenuRow[] | undefined): Record<string, string> {
  const list = menus || [];
  const byId = Object.fromEntries(list.map((menu) => [menu.id, menu]));
  const map: Record<string, string> = {};
  for (const menu of list) {
    const productId = productIdFromMenuFilter(menu.category_filter);
    if (!productId) continue;
    const parent = menu.parent_id ? byId[menu.parent_id] : undefined;
    const slug = parent ? sectionSlugFromMenuFilter(parent.category_filter) : null;
    if (slug) map[productId] = slug;
  }
  return map;
}

export function mergeFallbackSections(
  settingsSections: WebsiteSection[],
  menuSections: WebsiteSection[],
): WebsiteSection[] {
  const bySlug = new Map<string, WebsiteSection>();
  for (const section of settingsSections) bySlug.set(section.slug, section);
  for (const section of menuSections) bySlug.set(section.slug, section);
  return sortSectionsNewArrivalFirst([...bySlug.values()]);
}

export function filterReservedStorefrontMenus<T extends { category_filter?: string | null }>(
  menus: T[] | undefined,
): T[] {
  return (menus || []).filter((menu) => !isReservedStorefrontMenuFilter(menu.category_filter));
}

export function mergeOrgSettingsSections(
  settings: unknown,
  sections: WebsiteSection[],
  productSections?: Record<string, string>,
): Record<string, unknown> {
  const next = { ...asRecord(settings) };
  next[STOREFRONT_SECTIONS_KEY] = sections.map((s) => ({
    id: s.id,
    slug: s.slug,
    label: s.label,
    display_order: s.display_order,
    is_active: s.is_active,
  }));
  if (productSections) next[STOREFRONT_PRODUCT_SECTIONS_KEY] = productSections;
  return next;
}

export function sectionIdForProduct(
  productId: string,
  listingSectionId: string | null | undefined,
  sections: WebsiteSection[],
  productSections: Record<string, string>,
): string {
  if (listingSectionId && sections.some((s) => s.id === listingSectionId)) return listingSectionId;
  const slug = productSections[productId];
  const bySlug = slug ? sections.find((s) => s.slug === slug) : undefined;
  if (bySlug) return bySlug.id;
  return sections.find((s) => isNewArrivalSlug(s.slug))?.id || sections[0]?.id || "";
}

export function attachSectionsToPublicPayload(
  payload: PublicStorefrontPayload,
  orgSettings: unknown,
): PublicStorefrontPayload {
  const orgKey = payload.shop?.slug || "";
  const settingsSections = parseStoredSections(orgSettings, orgKey);
  const menuSections = parseSectionsFromMenus(payload.menus, orgKey);
  const fallbackSections = mergeFallbackSections(settingsSections, menuSections);
  const productSections = {
    ...parseProductSectionsFromMenus(payload.menus),
    ...parseStoredProductSections(orgSettings),
  };
  const resolvedSections =
    payload.sections && payload.sections.length > 0
      ? payload.sections
      : fallbackSections
          .filter((s) => s.is_active)
          .map((s) => ({
            id: s.id,
            slug: s.slug,
            label: s.label,
            display_order: s.display_order,
          }));

  const products = (payload.products || []).map((product) => {
    if (product.section_slug) return product;
    const slug = productSections[product.product_id] || null;
    const label = slug
      ? resolvedSections.find((s) => s.slug === slug)?.label ||
        (isNewArrivalSlug(slug) ? NEW_ARRIVAL_LABEL : null)
      : null;
    return {
      ...product,
      section_slug: slug,
      section_label: label,
    };
  });

  return {
    ...payload,
    sections: resolvedSections,
    products,
    menus: payload.menus ? filterReservedStorefrontMenus(payload.menus) : payload.menus,
  };
}

export { NEW_ARRIVAL_SLUG };
