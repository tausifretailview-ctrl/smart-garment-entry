import type { PublicStorefrontShop } from "@/lib/websiteTypes";

export type OrgPublicInfoSlice = {
  name?: string;
  business_name?: string | null;
  settings?: Record<string, unknown> | null;
  bill_barcode_settings?: {
    logo_url?: string | null;
    login_display_name?: string | null;
  } | null;
};

/** Merge whitelisted org branding into the public storefront shop payload. */
export function enrichPublicStorefrontShop(
  shop: PublicStorefrontShop,
  org?: OrgPublicInfoSlice | null,
): PublicStorefrontShop {
  if (!org) return shop;
  const bill = org.bill_barcode_settings || {};
  const orgSettings = org.settings || {};
  const address =
    typeof orgSettings.address === "string" && orgSettings.address.trim()
      ? orgSettings.address.trim()
      : shop.address ?? null;
  const displayName =
    (org.business_name || "").trim() ||
    (bill.login_display_name || "").trim() ||
    shop.display_name ||
    shop.name;

  return {
    ...shop,
    name: shop.name || org.name || displayName,
    display_name: displayName,
    logo_url: bill.logo_url || shop.logo_url || null,
    address: address || shop.address || null,
  };
}

/** Short location line for header — last segment of address when comma-separated. */
export function storefrontLocationLine(address?: string | null): string | null {
  const raw = (address || "").trim();
  if (!raw) return null;
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join(" · ");
  return parts[0] || null;
}

export function applyStorefrontThemeVars(accent?: string | null): void {
  const root = document.documentElement;
  const accentColor = (accent || "#E2A33B").trim();
  root.style.setProperty("--store-accent", accentColor);
  root.style.setProperty(
    "--store-accent-dark",
    accentColor.startsWith("#") && accentColor.length === 7
      ? adjustHexBrightness(accentColor, -0.12)
      : "#B87F26",
  );
}

function adjustHexBrightness(hex: string, delta: number): string {
  const n = hex.replace("#", "");
  if (n.length !== 6) return hex;
  const r = Math.max(0, Math.min(255, Math.round(parseInt(n.slice(0, 2), 16) * (1 + delta))));
  const g = Math.max(0, Math.min(255, Math.round(parseInt(n.slice(2, 4), 16) * (1 + delta))));
  const b = Math.max(0, Math.min(255, Math.round(parseInt(n.slice(4, 6), 16) * (1 + delta))));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
