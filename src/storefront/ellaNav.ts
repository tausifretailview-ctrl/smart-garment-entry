import type { PublicStorefrontMenu } from "@/lib/websiteTypes";
import type { PublicStorefrontSection } from "@/lib/websiteSections";
import type { EllaSortKey } from "./ellaProduct";

export type EllaNavAvailability = "all" | "in-stock" | "made-to-order";

export type EllaHeaderNavItem = {
  id: string;
  label: string;
  chip: string;
  title: string;
  lead: string;
  availability: EllaNavAvailability;
  sort: EllaSortKey;
};

/** HTML-mock header — used when Website → Menus has no public shop links. */
export const ELLA_HOME_NAV: EllaHeaderNavItem = {
  id: "home",
  label: "Home",
  chip: "all",
  title: "Home",
  lead: "Everyday chikankari and festive formals from the studio.",
  availability: "all",
  sort: "featured",
};

export const ELLA_LUXURY_NAV: EllaHeaderNavItem[] = [
  ELLA_HOME_NAV,
  {
    id: "new-in",
    label: "New in",
    chip: "all",
    title: "New in",
    lead: "The latest studio drop — chikankari and prints just in from the rack.",
    availability: "all",
    sort: "newest",
  },
  {
    id: "ready",
    label: "Ready to wear",
    chip: "Ready",
    title: "Ready to wear",
    lead: "Chikankari and printed kurtas held in studio stock — dispatched within 48 hours.",
    availability: "in-stock",
    sort: "featured",
  },
  {
    id: "formals",
    label: "Formals",
    chip: "Festive",
    title: "Formals",
    lead: "Occasion pieces cut to your measurements in 3–4 weeks.",
    availability: "all",
    sort: "featured",
  },
  {
    id: "mto",
    label: "Made to order",
    chip: "Bridal",
    title: "Made to order",
    lead: "Formals and bridals stitched to your measurements. Pay 30% to start; the balance before dispatch.",
    availability: "made-to-order",
    sort: "featured",
  },
  {
    id: "sale",
    label: "Sale",
    chip: "all",
    title: "Sale",
    lead: "Selected studio pieces while they last.",
    availability: "all",
    sort: "featured",
  },
];

export function inferEllaNavAvailability(label: string, filter: string | null | undefined): EllaNavAvailability {
  const text = `${label} ${filter || ""}`.toLowerCase();
  if (/made[\s-]?to[\s-]?order|\bmto\b|bridal/.test(text)) return "made-to-order";
  if (/ready[\s-]?to[\s-]?wear|\bready\b/.test(text)) return "in-stock";
  return "all";
}

function chipFromMenu(menu: PublicStorefrontMenu, sections: PublicStorefrontSection[]): string {
  const filter = (menu.category_filter || "").trim();
  if (filter) return filter;
  const label = menu.label.trim().toLowerCase();
  const section = sections.find((s) => s.label.trim().toLowerCase() === label || s.slug === label);
  return section?.slug || "all";
}

function isHomeOnlyLabel(label: string): boolean {
  return /^home$|^shop$|^all$/i.test(label.trim());
}

export function isEllaHomeNav(item: { id: string; label: string }): boolean {
  return item.id === "home" || /^home$/i.test(item.label.trim());
}

/** Prefer Website → Menus when real shop links exist; otherwise the HTML-mock nav. */
export function resolveEllaHeaderNav(
  menus: PublicStorefrontMenu[] | undefined,
  sections: PublicStorefrontSection[] = [],
  fallback: EllaHeaderNavItem[] = ELLA_LUXURY_NAV,
): EllaHeaderNavItem[] {
  const roots = (menus || []).filter((menu) => menu.label.trim());
  const hasShopLinks =
    roots.length >= 2 ||
    roots.some((menu) => Boolean((menu.category_filter || "").trim())) ||
    roots.some((menu) => !isHomeOnlyLabel(menu.label));
  if (!hasShopLinks) return fallback;

  const mapped: EllaHeaderNavItem[] = roots.map((menu) => ({
    id: menu.id,
    label: menu.label.trim(),
    chip: chipFromMenu(menu, sections),
    title: menu.label.trim(),
    lead: "",
    availability: inferEllaNavAvailability(menu.label, menu.category_filter),
    sort: /new/i.test(menu.label) ? "newest" : "featured",
  }));
  return mapped.some((item) => isEllaHomeNav(item)) ? mapped : [ELLA_HOME_NAV, ...mapped];
}
