/**
 * Shop custom domains for the public storefront.
 *
 * A shop owner saves e.g. `ellanoor.in` in Settings → Website → Domain
 * (stored in `website_settings.custom_domain`). Once that domain points
 * at this app, main.tsx looks the visiting host up here and, when it belongs to
 * a published store, boots the storefront at `/` instead of the ERP.
 */

/** Hosts that always serve the ERP itself and never need a domain lookup. */
const APP_HOST_SUFFIXES = [
  "inventoryshop.in",
  "vercel.app",
  "lovable.app",
  "lovableproject.com",
  "lovable.dev",
];

/**
 * Turn whatever the owner typed (`https://www.EllaNoor.in/store`) into the bare
 * host we store and match on (`ellanoor.in`). Returns null when it is not a
 * usable public domain.
 */
export function normalizeStoreDomain(raw: string | null | undefined): string | null {
  let v = String(raw || "").trim().toLowerCase();
  if (!v) return null;
  v = v.replace(/^[a-z]+:\/\//, "");
  v = v.split(/[/?#]/)[0];
  v = v.replace(/:\d+$/, "");
  v = v.replace(/\.+$/, "");
  v = v.replace(/^www\./, "");
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(v)) return null;
  if (isAppHost(v)) return null;
  return v;
}

export function isAppHost(hostname: string): boolean {
  const host = String(hostname || "").trim().toLowerCase().replace(/\.+$/, "");
  if (!host || host === "localhost" || !host.includes(".")) return true;
  if (/^[\d.]+$/.test(host) || host.includes(":")) return true; // IPv4 / IPv6
  return APP_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/** Should main.tsx ask the backend whether this host is a shop domain? */
export function isPossibleStoreHost(location: Pick<Location, "protocol" | "hostname">): boolean {
  if (location.protocol !== "https:" && location.protocol !== "http:") return false;
  return !isAppHost(location.hostname);
}

/**
 * Org slug of the published store whose custom domain is `hostname`, or null.
 * Plain fetch (no supabase-js) so the entry chunk stays small; anon can read
 * slug/custom_domain of published stores via existing RLS + column grants.
 */
export async function resolveStoreSlugForHost(hostname: string): Promise<string | null> {
  const domain = normalizeStoreDomain(hostname);
  if (!domain) return null;
  const base = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "");
  if (!base || !key) return null;
  const url =
    `${base}/rest/v1/website_settings?select=slug` +
    `&custom_domain=eq.${encodeURIComponent(domain)}&is_published=eq.true&limit=1`;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ slug?: string | null }>;
    const slug = rows?.[0]?.slug?.trim();
    return slug || null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}
