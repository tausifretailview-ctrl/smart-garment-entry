import type { PublicStorefrontShop } from "@/lib/websiteTypes";
import { publicOrgSlugKey } from "@/lib/storefrontPath";
import { normalizeInstagramUrl } from "@/lib/storefrontShare";

export type OrgPublicInfoSlice = {
  name?: string;
  business_name?: string | null;
  settings?: Record<string, unknown> | null;
  bill_barcode_settings?: {
    logo_url?: string | null;
    login_display_name?: string | null;
    upi_id?: string | null;
    upi_business_name?: string | null;
    instagram_link?: string | null;
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

  const mobile =
    typeof orgSettings.mobile_number === "string" ? orgSettings.mobile_number.trim() : "";
  const instagram =
    normalizeInstagramUrl(shop.instagram_url) ||
    normalizeInstagramUrl(bill.instagram_link) ||
    "";
  const whatsapp = (shop.whatsapp_number || "").trim() || mobile || "";

  return {
    ...shop,
    name: shop.name || org.name || displayName,
    display_name: displayName,
    logo_url: bill.logo_url || shop.logo_url || null,
    address: address || shop.address || null,
    whatsapp_number: whatsapp || shop.whatsapp_number || null,
    instagram_url: instagram || shop.instagram_url || null,
    upi_id: (bill.upi_id || "").trim() || null,
    upi_business_name:
      (bill.upi_business_name || org.business_name || displayName || "").trim() || displayName,
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

/** Ella'Noor atelier tokens. Used only when the public store slug is ella-noor. */
export const theme = {
  ink: "#12100e",
  inkRaised: "#171410",
  panel: "#241f19",
  paper: "#f4f1ea",
  paperMuted: "rgba(244,241,234,.55)",
  paperFaint: "rgba(244,241,234,.40)",
  gold: "#c9a227",
  goldLine: "rgba(201,162,39,.28)",
  hairline: "rgba(244,241,234,.12)",
  radius: "0px",
} as const;

export const ELLA_NOOR_SLUG = "ella-noor";

export function isEllaNoorSlug(slug: string | null | undefined): boolean {
  return publicOrgSlugKey(slug || "") === publicOrgSlugKey(ELLA_NOOR_SLUG);
}

export const ellaCopy = {
  wordmark: "Ella'Noor",
  designer: "by Sheza Amani",
  collectionTitle: "Noor — the bridal edit",
  collectionLead: "Hand-worked zardozi, made to order in 4–6 weeks.",
  studioNote:
    "Each piece is cut and embroidered to order. Lead time 4–6 weeks from confirmation. Studio visits by appointment.",
  address: "Ella'Noor atelier · by appointment",
  hours: "Tue–Sun · by appointment",
  erpNote: "Stock synced live from Ezzy ERP",
  enquiryNote: "Sent straight into Ezzy ERP as a customer enquiry against this style.",
  defaultLeadWeeks: 6,
  defaultFabric: "Raw silk · zardozi",
  lowStockThreshold: 3,
} as const;

export const ELLA_CATEGORY_CHIPS = ["All", "Bridal", "Festive", "Ready"] as const;

export type EllaChipCategory = (typeof ELLA_CATEGORY_CHIPS)[number];
