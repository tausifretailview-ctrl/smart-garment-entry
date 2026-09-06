export const NEW_ARRIVAL_SLUG = "new-arrival";
export const NEW_ARRIVAL_LABEL = "New Arrival";

export type WebsiteSection = {
  id: string;
  organization_id: string;
  slug: string;
  label: string;
  display_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type PublicStorefrontSection = {
  id: string;
  slug: string;
  label: string;
  display_order: number;
};

export function slugifySectionLabel(label: string): string {
  const slug = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "section";
}

export function isNewArrivalSlug(slug: string | null | undefined): boolean {
  return String(slug || "")
    .toLowerCase()
    .replace(/-/g, "") === NEW_ARRIVAL_SLUG.replace(/-/g, "");
}

export function sortSectionsNewArrivalFirst<T extends { slug: string; display_order?: number }>(
  sections: T[],
): T[] {
  return [...sections].sort((a, b) => {
    const aNew = isNewArrivalSlug(a.slug) ? 0 : 1;
    const bNew = isNewArrivalSlug(b.slug) ? 0 : 1;
    if (aNew !== bNew) return aNew - bNew;
    const order = (a.display_order ?? 0) - (b.display_order ?? 0);
    if (order !== 0) return order;
    return a.slug.localeCompare(b.slug);
  });
}

export function activeWebsiteSections(sections: WebsiteSection[]): WebsiteSection[] {
  return sortSectionsNewArrivalFirst(sections.filter((s) => s.is_active));
}

export type EllaNavChip = { id: string; label: string };

export function ellaNavChipsFromSections(
  sections: PublicStorefrontSection[] | WebsiteSection[] | undefined,
  fallback: readonly string[],
): EllaNavChip[] {
  const active = (sections || []).filter((s) => ("is_active" in s ? s.is_active !== false : true));
  if (active.length === 0) {
    return fallback.map((label) => ({
      id: label === "All" ? "all" : label,
      label,
    }));
  }
  return [
    { id: "all", label: "All" },
    ...sortSectionsNewArrivalFirst(active).map((s) => ({ id: s.slug, label: s.label })),
  ];
}

export type SectionedProducts<T> = {
  slug: string;
  label: string;
  products: T[];
};

export function groupProductsBySection<T extends { sectionSlug?: string | null }>(
  products: T[],
  sections: PublicStorefrontSection[] | WebsiteSection[],
): SectionedProducts<T>[] {
  const sorted = sortSectionsNewArrivalFirst(sections);
  const used = new Set<T>();
  const groups: SectionedProducts<T>[] = [];
  for (const section of sorted) {
    const items = products.filter((p) => p.sectionSlug === section.slug);
    for (const item of items) used.add(item);
    if (items.length > 0) {
      groups.push({ slug: section.slug, label: section.label, products: items });
    }
  }
  const rest = products.filter((p) => !used.has(p));
  if (rest.length > 0) {
    groups.push({ slug: "", label: "The collection", products: rest });
  }
  return groups;
}

export function defaultNewArrivalSection(orgId: string, displayOrder = 0): Omit<WebsiteSection, "id"> {
  return {
    organization_id: orgId,
    slug: NEW_ARRIVAL_SLUG,
    label: NEW_ARRIVAL_LABEL,
    display_order: displayOrder,
    is_active: true,
  };
}
