/**
 * Home-page banners for the public store (used by the Street theme).
 * Saved on organizations.settings next to the theme choice, so the public
 * store reads them through get_org_public_info with no database change.
 */
export const STOREFRONT_BANNERS_KEY = "storefront_banners";
export const STOREFRONT_BANNERS_MAX = 6;

export type StorefrontBanner = {
  id: string;
  image_url: string;
  /** Optional wording drawn over the image. Leave empty when the image already has text. */
  heading: string;
  subheading: string;
  /** Section slug or category the banner opens; empty opens all products. */
  target: string;
};

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isSafeImageUrl(url: string): boolean {
  return /^https:\/\/[^\s"'<>]+$/i.test(url);
}

/** Banners saved in organizations.settings; anything malformed is dropped. */
export function parseStorefrontBanners(orgSettings: unknown): StorefrontBanner[] {
  if (!orgSettings || typeof orgSettings !== "object" || Array.isArray(orgSettings)) return [];
  const raw = (orgSettings as Record<string, unknown>)[STOREFRONT_BANNERS_KEY];
  if (!Array.isArray(raw)) return [];
  const banners: StorefrontBanner[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const image_url = text(row.image_url, 600);
    if (!isSafeImageUrl(image_url)) continue;
    banners.push({
      id: text(row.id, 80) || `banner-${banners.length + 1}`,
      image_url,
      heading: text(row.heading, 60),
      subheading: text(row.subheading, 120),
      target: text(row.target, 120),
    });
    if (banners.length >= STOREFRONT_BANNERS_MAX) break;
  }
  return banners;
}

export function moveStorefrontBanner(banners: StorefrontBanner[], index: number, delta: -1 | 1): StorefrontBanner[] {
  const to = index + delta;
  if (index < 0 || index >= banners.length || to < 0 || to >= banners.length) return banners;
  const next = [...banners];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
