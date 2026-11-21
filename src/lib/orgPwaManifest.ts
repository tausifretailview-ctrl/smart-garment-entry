import { isValidOrgSlug, normalizeOrgSlug } from "@/lib/orgSlug";

const FIELD_SALES_MANIFEST = "manifest-field-sales";

let orgManifestBlobUrl: string | null = null;
let fieldSalesManifestBlobUrl: string | null = null;
/** Set on the manifest <link> while the Field Sales app's manifest is attached. */
const FIELD_SALES_ATTR = "data-ezzy-field-sales-manifest";

/** True when running as an installed home-screen / standalone PWA. */
export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Absolute icon URLs — required for blob: manifests (relative /icon-*.png fails against blob origin). */
export function buildPwaIconEntries(origin?: string): Array<{
  src: string;
  sizes: string;
  type: string;
  purpose: "any" | "maskable";
}> {
  const base =
    (origin || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "") ||
    "";
  const icon192 = `${base}/icon-192.png`;
  const icon512 = `${base}/icon-512.png`;
  return [
    { src: icon192, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: icon192, sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: icon512, sizes: "512x512", type: "image/png", purpose: "any" },
    { src: icon512, sizes: "512x512", type: "image/png", purpose: "maskable" },
  ];
}

function setAppleTouchMeta(displayName: string): void {
  if (typeof document === "undefined") return;
  const title = displayName || "Ezzy ERP";
  let titleMeta = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
  if (!titleMeta) {
    titleMeta = document.createElement("meta");
    titleMeta.name = "apple-mobile-web-app-title";
    document.head.appendChild(titleMeta);
  }
  titleMeta.content = title;

  let appName = document.querySelector<HTMLMetaElement>('meta[name="application-name"]');
  if (!appName) {
    appName = document.createElement("meta");
    appName.name = "application-name";
    document.head.appendChild(appName);
  }
  appName.content = title;

  // Ensure apple-touch-icon points at a real PNG (home-screen icon on iOS / Android Chrome).
  const appleHref = `${window.location.origin}/apple-touch-icon.png`;
  let appleLink = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (!appleLink) {
    appleLink = document.createElement("link");
    appleLink.rel = "apple-touch-icon";
    document.head.appendChild(appleLink);
  }
  appleLink.href = appleHref;
  appleLink.setAttribute("sizes", "180x180");
}

/**
 * Point the web-app manifest at a shop login URL so "Add to Home Screen" /
 * install opens `/{orgSlug}` instead of Platform Admin (`/auth`) or bare `/`.
 */
export function applyOrgPwaManifest(orgSlug: string, orgName?: string | null): void {
  if (typeof document === "undefined") return;
  if (!isValidOrgSlug(orgSlug)) return;

  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  // Field Sales uses its own dedicated manifest — do not override.
  if (link?.getAttribute("href")?.includes(FIELD_SALES_MANIFEST) || link?.hasAttribute(FIELD_SALES_ATTR)) return;

  const slug = normalizeOrgSlug(orgSlug);
  const displayName = orgName?.trim() || "";
  setAppleTouchMeta(displayName || "Ezzy ERP");

  // Skip rebuild only when the live org blob manifest is already attached.
  if (
    link?.isConnected &&
    link.getAttribute("data-ezzy-org-manifest") === slug &&
    link.href.startsWith("blob:") &&
    orgManifestBlobUrl &&
    link.href === orgManifestBlobUrl
  ) {
    return;
  }

  const origin = window.location.origin;
  // Absolute same-origin URLs — relative start_url/scope against blob: manifests are
  // ignored by Chrome ("URL is invalid") and break install / update detection.
  const startUrl = `${origin}/${slug}`;
  const manifest = {
    id: `${origin}/${slug}`,
    name: displayName ? `${displayName} · EzzyERP` : "EzzyERP - Easy Billing, Smart Business",
    short_name: displayName || "EzzyERP",
    description: "EzzyERP - Easy Billing, Smart Business for garment & retail businesses",
    theme_color: "#1857A6",
    background_color: "#1857A6",
    display: "standalone",
    orientation: "any",
    scope: `${origin}/`,
    start_url: startUrl,
    categories: ["business", "finance", "productivity"],
    // Stable same-origin manifest URL so Chrome can detect an existing install.
    related_applications: [{ platform: "webapp", url: `${origin}/manifest.webmanifest` }],
    prefer_related_applications: false,
    icons: buildPwaIconEntries(origin),
  };

  if (orgManifestBlobUrl) {
    URL.revokeObjectURL(orgManifestBlobUrl);
    orgManifestBlobUrl = null;
  }

  orgManifestBlobUrl = URL.createObjectURL(
    new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" }),
  );

  let manifestLink = link;
  if (!manifestLink) {
    manifestLink = document.createElement("link");
    manifestLink.rel = "manifest";
    document.head.appendChild(manifestLink);
  }

  manifestLink.href = orgManifestBlobUrl;
  manifestLink.setAttribute("data-ezzy-org-manifest", slug);
}

/** The Field Sales install, as a manifest object (exported for tests). */
export function buildFieldSalesManifest(orgSlug: string, orgName: string | null | undefined, origin: string) {
  const slug = normalizeOrgSlug(orgSlug);
  const base = origin.replace(/\/$/, "");
  const name = orgName?.trim() || "";
  const icon192 = `${base}/icon-field-sales-192.png`;
  const icon512 = `${base}/icon-field-sales-512.png`;
  return {
    // Its own app id: installs next to (not over) the shop's owner app on the same phone.
    id: `${base}/${slug}/salesman`,
    name: name ? `${name} · Field Sales` : "Field Sales - EzzyERP",
    short_name: "Field Sales",
    description: "Field Sales app — customers, orders and outstanding for salesmen",
    theme_color: "#F97316",
    background_color: "#1a1a1a",
    display: "standalone",
    orientation: "portrait",
    scope: `${base}/`,
    // Opens straight into the salesman app (login first when signed out).
    start_url: `${base}/${slug}/salesman?app=fieldsales`,
    categories: ["business", "productivity"],
    icons: [
      { src: icon192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: icon192, sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: icon512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: icon512, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

/**
 * Field Sales screens (salesman app, field-sales login): point the manifest at the Field Sales
 * app of this shop, so Chrome's "Install" adds the orange Field Sales icon that opens
 * /{org}/salesman — not the owner app. Returns a function that puts the shop manifest back.
 */
export function applyFieldSalesPwaManifest(orgSlug: string, orgName?: string | null): () => void {
  if (typeof document === "undefined" || !isValidOrgSlug(orgSlug)) return () => {};
  const slug = normalizeOrgSlug(orgSlug);
  let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (link?.getAttribute(FIELD_SALES_ATTR) === slug && fieldSalesManifestBlobUrl && link.href === fieldSalesManifestBlobUrl) {
    return () => restoreShopManifest(slug, orgName);
  }
  if (fieldSalesManifestBlobUrl) URL.revokeObjectURL(fieldSalesManifestBlobUrl);
  fieldSalesManifestBlobUrl = URL.createObjectURL(
    new Blob([JSON.stringify(buildFieldSalesManifest(slug, orgName, window.location.origin))], {
      type: "application/manifest+json",
    }),
  );
  if (!link) {
    link = document.createElement("link");
    link.rel = "manifest";
    document.head.appendChild(link);
  }
  link.removeAttribute("data-ezzy-org-manifest");
  link.setAttribute(FIELD_SALES_ATTR, slug);
  link.href = fieldSalesManifestBlobUrl;

  let appleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
  if (!appleTitle) {
    appleTitle = document.createElement("meta");
    appleTitle.name = "apple-mobile-web-app-title";
    document.head.appendChild(appleTitle);
  }
  appleTitle.content = "Field Sales";
  return () => restoreShopManifest(slug, orgName);
}

function restoreShopManifest(slug: string, orgName?: string | null) {
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (link?.getAttribute(FIELD_SALES_ATTR) !== slug) return;
  link.removeAttribute(FIELD_SALES_ATTR);
  applyOrgPwaManifest(slug, orgName);
}

/** The link a salesman opens on the phone (log in, then install Field Sales). */
export function fieldSalesInstallLink(orgSlug: string, origin?: string): string {
  const base = (origin || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
  return `${base}/${normalizeOrgSlug(orgSlug)}/field-sales`;
}
