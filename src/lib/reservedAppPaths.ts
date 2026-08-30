/**
 * First URL segment values that are app routes, not organization slugs.
 * `organization-setup` matches the slug regex, so treating it as a shop
 * caused a native/Electron redirect loop (white screen after install).
 */
export const RESERVED_APP_PATH_SEGMENTS = [
  "auth",
  "reset-password",
  "organization-setup",
  "platform-admin",
  "invoice",
  "pay",
  "payment-status",
  "oauth",
  "downloads",
  "assets",
  "fonts",
  "install",
  "purchase-bills",
  "purchase-entry",
  "purchase-returns",
  "purchase-return-entry",
  "payments-dashboard",
  "accounts",
  "accounts-payments",
  "sale-returns",
  "sale-return-entry",
  "sale-return-dashboard",
  "product-dashboard",
  "purchase-bill-dashboard",
  "purchase-return-dashboard",
] as const;

const RESERVED = new Set<string>(RESERVED_APP_PATH_SEGMENTS);

export function isReservedAppPathSegment(value?: string | null): boolean {
  const key = String(value ?? "")
    .trim()
    .toLowerCase();
  return key.length > 0 && RESERVED.has(key);
}
