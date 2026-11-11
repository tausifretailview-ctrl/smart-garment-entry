import { publicOrgSlugKey } from "@/lib/storefrontPath";

/**
 * Public store themes. The choice is saved on organizations.settings (already
 * returned to the public store by get_org_public_info), so picking a theme
 * needs no database change.
 */
export const STOREFRONT_THEME_KEY = "storefront_theme";

export type StorefrontThemeId = "classic" | "ella-noor" | "street";

export type StorefrontThemeOption = {
  id: StorefrontThemeId;
  label: string;
  tagline: string;
  features: string[];
  /** Shown under the option when choosing it has a catch. */
  note?: string;
};

export const STOREFRONT_THEMES: StorefrontThemeOption[] = [
  {
    id: "classic",
    label: "Classic",
    tagline: "Simple catalogue with enquiry on each product.",
    features: ["Product cards with photo, price and stock", "Menu filters", "Enquiry form and WhatsApp"],
  },
  {
    id: "ella-noor",
    label: "Ella Noor",
    tagline: "Boutique look made for Ella'Noor: editorial banners, bag and UPI checkout.",
    features: [
      "Banner slider, collections and lookbook",
      "Size-wise live stock, bag and checkout",
      "Reward points and offer codes",
    ],
    note: "Banners and wording on the home page are Ella'Noor's own photos and text.",
  },
  {
    id: "street",
    label: "Street",
    tagline: "Bold black-and-white fashion store built from your own catalogue.",
    features: [
      "Offer strip, banner slider and shop-by-category tiles from your products",
      "Wishlist, search, size / price / in-stock filters and sorting",
      "Quick add with size, product page, bag and UPI checkout",
      "Phone bottom bar: Home, Shop, Search, Wishlist, Bag",
    ],
  },
];

export const ELLA_NOOR_SLUG = "ella-noor";

export function isStorefrontThemeId(value: unknown): value is StorefrontThemeId {
  return typeof value === "string" && STOREFRONT_THEMES.some((t) => t.id === value);
}

/** Theme saved in organizations.settings, or null when the shop never chose one. */
export function parseStorefrontTheme(orgSettings: unknown): StorefrontThemeId | null {
  if (!orgSettings || typeof orgSettings !== "object" || Array.isArray(orgSettings)) return null;
  const raw = (orgSettings as Record<string, unknown>)[STOREFRONT_THEME_KEY];
  return isStorefrontThemeId(raw) ? raw : null;
}

/** Before any choice is saved: Ella'Noor keeps its own theme, every other shop the classic one. */
export function defaultStorefrontTheme(slug: string | null | undefined): StorefrontThemeId {
  return publicOrgSlugKey(slug || "") === publicOrgSlugKey(ELLA_NOOR_SLUG) ? "ella-noor" : "classic";
}

export function resolveStorefrontTheme(
  saved: StorefrontThemeId | null | undefined,
  slug: string | null | undefined,
): StorefrontThemeId {
  return saved ?? defaultStorefrontTheme(slug);
}
