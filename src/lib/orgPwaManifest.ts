import { isValidOrgSlug, normalizeOrgSlug } from "@/lib/orgSlug";

const FIELD_SALES_MANIFEST = "manifest-field-sales";

let orgManifestBlobUrl: string | null = null;

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
  if (link?.getAttribute("href")?.includes(FIELD_SALES_MANIFEST)) return;

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
