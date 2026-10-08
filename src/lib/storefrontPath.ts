/**
 * Public storefront lives at `/:orgSlug/store` and `/:orgSlug/store/p/:productId`.
 * On a shop's own custom domain (see `storefrontDomain.ts`) the same pages are
 * served at `/` and `/p/:productId` once `setStorefrontCustomDomainSlug` is set.
 */

let customDomainSlug: string | null = null;

/** Called by main.tsx after the visiting host resolved to a published store. */
export function setStorefrontCustomDomainSlug(slug: string | null): void {
  customDomainSlug = slug && slug.trim() ? slug.trim() : null;
}

export function getStorefrontCustomDomainSlug(): string | null {
  return customDomainSlug;
}

/** Hyphens ignored so /ellanoor/store matches org slug ella-noor. */
export function publicOrgSlugKey(slug: string): string {
  return slug.trim().toLowerCase().replace(/-/g, "");
}

export function isPublicStorefrontPath(pathname: string): boolean {
  const segments = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  return segments.length >= 2 && segments[1] === "store";
}

export function parseStorefrontPath(pathname: string): {
  orgSlug: string;
  productId: string | null;
} | null {
  const segments = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (customDomainSlug && !(segments.length >= 2 && segments[1] === "store")) {
    // Custom domain: every path is this one store; only /p/:id selects a product.
    const productId = segments[0] === "p" && segments[1] ? segments[1] : null;
    return { orgSlug: customDomainSlug, productId };
  }
  if (segments.length < 2 || segments[1] !== "store") return null;
  const orgSlug = segments[0];
  const productId = segments[2] === "p" && segments[3] ? segments[3] : null;
  return { orgSlug, productId };
}

export function storefrontHomePath(orgSlug: string): string {
  if (customDomainSlug) return "/";
  return `/${orgSlug}/store`;
}

export function storefrontProductPath(orgSlug: string, productId: string): string {
  if (customDomainSlug) return `/p/${productId}`;
  return `/${orgSlug}/store/p/${productId}`;
}

/** Absolute store link for share buttons, on whichever host the visitor is on. */
export function storefrontHomeUrl(orgSlug: string): string {
  return `${window.location.origin}${storefrontHomePath(orgSlug)}`;
}

export function storefrontProductUrl(orgSlug: string, productId: string): string {
  return `${window.location.origin}${storefrontProductPath(orgSlug, productId)}`;
}
