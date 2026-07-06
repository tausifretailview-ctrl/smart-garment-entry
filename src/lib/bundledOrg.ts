import { Capacitor } from "@capacitor/core";
import { getOrgSlugFromUrl, getStoredOrgSlug, isValidOrgSlug, normalizeOrgSlug, storeOrgSlug } from "@/lib/orgSlug";

/**
 * Org slug baked into a per-shop APK build (optional).
 * Only honored in the native shell — never affects the public web app.
 */
export function getBundledOrgSlug(): string | null {
  if (!Capacitor.isNativePlatform()) return null;
  const raw = import.meta.env.VITE_BUNDLED_ORG_SLUG as string | undefined;
  if (!raw || !isValidOrgSlug(raw)) return null;
  return normalizeOrgSlug(raw);
}

/** Best org slug for cold start: bundled (native) → URL path → stored preference. */
export function resolveStartupOrgSlug(): string | null {
  const bundled = getBundledOrgSlug();
  if (bundled) {
    storeOrgSlug(bundled);
    return bundled;
  }

  const fromUrl = getOrgSlugFromUrl();
  if (fromUrl) {
    storeOrgSlug(fromUrl);
    return fromUrl;
  }

  return getStoredOrgSlug();
}
