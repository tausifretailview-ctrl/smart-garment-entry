/** Public storefront lives at `/:orgSlug/store` and `/:orgSlug/store/p/:productId`. */

export function isPublicStorefrontPath(pathname: string): boolean {
  const segments = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  return segments.length >= 2 && segments[1] === "store";
}

export function parseStorefrontPath(pathname: string): {
  orgSlug: string;
  productId: string | null;
} | null {
  const segments = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (segments.length < 2 || segments[1] !== "store") return null;
  const orgSlug = segments[0];
  const productId = segments[2] === "p" && segments[3] ? segments[3] : null;
  return { orgSlug, productId };
}

export function storefrontHomePath(orgSlug: string): string {
  return `/${orgSlug}/store`;
}

export function storefrontProductPath(orgSlug: string, productId: string): string {
  return `/${orgSlug}/store/p/${productId}`;
}
