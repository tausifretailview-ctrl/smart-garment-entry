// Customer bill-page link carried in a push, so tapping the notification opens the bill.
// Pure helpers (no Deno APIs) so Vitest covers them.

/** Lower-case host suffix like "inventoryshop.in"; null when not a plain domain. */
export function cleanCustomerPageDomain(raw: string | null | undefined): string | null {
  const d = String(raw ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null;
}

/** https://<subdomain>.<domain>/t/<token>, or null when any part is invalid. */
export function buildCustomerBillUrl(
  subdomain: string | null | undefined,
  domain: string | null | undefined,
  token: string | null | undefined,
): string | null {
  const sub = String(subdomain ?? "").trim().toLowerCase();
  const host = cleanCustomerPageDomain(domain);
  const t = String(token ?? "").trim();
  if (!/^[a-z0-9-]+$/.test(sub) || !host || !/^[A-Za-z0-9_-]+$/.test(t)) return null;
  return `https://${sub}.${host}/t/${t}`;
}

/** True when a URL is a bill-page link (/t/<token>) on the given origin. */
export function isBillPagePath(url: string, origin: string): boolean {
  try {
    const u = new URL(url, origin);
    return u.origin === new URL(origin).origin && /^\/t\/[A-Za-z0-9_-]+$/.test(u.pathname);
  } catch {
    return false;
  }
}
