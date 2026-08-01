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
  if (link?.getAttribute("data-ezzy-org-manifest") === slug && link.href.startsWith("blob:")) {
    return;
  }

  const startUrl = `/${slug}`;
  const displayName = orgName?.trim() || "";
  const manifest = {
    name: displayName ? `${displayName} · EzzyERP` : "EzzyERP - Easy Billing, Smart Business",
    short_name: displayName || "EzzyERP",
    description: "EzzyERP - Easy Billing, Smart Business for garment & retail businesses",
    theme_color: "#1e40af",
    background_color: "#ffffff",
    display: "standalone",
    orientation: "portrait",
    scope: "/",
    start_url: startUrl,
    categories: ["business", "finance", "productivity"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
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
