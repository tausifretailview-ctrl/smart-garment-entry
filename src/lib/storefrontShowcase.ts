/**
 * Street theme home page: "Featured styles" product slideshow (products shown one by one in a
 * 3D carousel). On unless the shop switches it off in Website → Theme. Saved on
 * organizations.settings and read by the public store through get_org_public_info.
 */
export const STOREFRONT_SHOWCASE_KEY = "storefront_showcase";
/** Most products cycled in the slideshow (keeps the home page light). */
export const STOREFRONT_SHOWCASE_MAX = 24;

/** Shown unless explicitly switched off. */
export function parseStorefrontShowcase(orgSettings: unknown): boolean {
  if (!orgSettings || typeof orgSettings !== "object" || Array.isArray(orgSettings)) return true;
  return (orgSettings as Record<string, unknown>)[STOREFRONT_SHOWCASE_KEY] !== false;
}

/**
 * Where a slide sits relative to the one in front: 0 = front, ±1 / ±2 = beside it, null = not
 * drawn. Wraps around so the row never ends.
 */
export function showcaseOffset(index: number, active: number, count: number): number | null {
  if (count <= 0) return null;
  let d = (((index - active) % count) + count) % count;
  if (d > count / 2) d -= count;
  // With few slides the same product must not appear on both sides.
  const reach = count >= 5 ? 2 : count >= 3 ? 1 : 0;
  return Math.abs(d) <= reach ? d : null;
}
