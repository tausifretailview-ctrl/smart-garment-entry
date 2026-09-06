import { supabase } from "@/integrations/supabase/client";
import { websiteFrom } from "@/lib/websiteDb";
import { coerceToArray } from "@/lib/coerceToMap";
import {
  isNewArrivalSlug,
  sortSectionsNewArrivalFirst,
  type WebsiteSection,
} from "@/lib/websiteSections";
import {
  isMissingWebsiteSectionsSchema,
  mergeFallbackSections,
  mergeOrgSettingsSections,
  parseProductSectionsFromMenus,
  parseStoredProductSections,
  parseStoredSections,
  parseSectionsFromMenus,
  productMenuFilter,
  sectionMenuFilter,
  sectionSlugFromMenuFilter,
  withDefaultNewArrival,
  type SectionMenuRow,
  type WebsiteSectionsState,
} from "@/lib/websiteSectionStore";

type MenuRow = SectionMenuRow & {
  organization_id?: string;
};

async function readOrgSettings(orgId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if (error) return null;
  const settings = data?.settings;
  return settings && typeof settings === "object" && !Array.isArray(settings)
    ? (settings as Record<string, unknown>)
    : {};
}

async function tryWriteOrgSettings(orgId: string, settings: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from("organizations").update({ settings }).eq("id", orgId);
  if (error && !/permission|policy|42501|not authorized|row-level/i.test(error.message)) {
    throw error;
  }
}

async function loadMenus(orgId: string): Promise<MenuRow[]> {
  const { data, error } = await websiteFrom("website_menus")
    .select("*")
    .eq("organization_id", orgId)
    .order("display_order", { ascending: true });
  if (error) throw error;
  return coerceToArray<MenuRow>(data);
}

async function syncSectionMenus(orgId: string, sections: WebsiteSection[]): Promise<void> {
  const menus = await loadMenus(orgId);
  const sectionMenus = menus.filter((menu) => sectionSlugFromMenuFilter(menu.category_filter));
  const keepSlugs = new Set(sections.map((section) => section.slug));

  for (const section of sections) {
    const category_filter = sectionMenuFilter(section.slug);
    const match = sectionMenus.find((menu) => menu.category_filter === category_filter);
    const values = {
      label: section.label,
      category_filter,
      display_order: section.display_order,
      is_active: section.is_active,
      parent_id: null,
    };
    if (match) {
      const { error } = await websiteFrom("website_menus")
        .update(values)
        .eq("id", match.id)
        .eq("organization_id", orgId);
      if (error) throw error;
    } else {
      const { error } = await websiteFrom("website_menus").insert({
        organization_id: orgId,
        ...values,
      });
      if (error) throw error;
    }
  }

  for (const menu of sectionMenus) {
    const slug = sectionSlugFromMenuFilter(menu.category_filter);
    if (!slug || keepSlugs.has(slug)) continue;
    const children = menus.filter((row) => row.parent_id === menu.id);
    for (const child of children) {
      const { error } = await websiteFrom("website_menus")
        .delete()
        .eq("id", child.id)
        .eq("organization_id", orgId);
      if (error) throw error;
    }
    const { error } = await websiteFrom("website_menus")
      .delete()
      .eq("id", menu.id)
      .eq("organization_id", orgId);
    if (error) throw error;
  }
}

export async function loadWebsiteSectionsState(orgId: string): Promise<WebsiteSectionsState> {
  const table = await websiteFrom("website_sections")
    .select("*")
    .eq("organization_id", orgId)
    .order("display_order", { ascending: true });

  if (!table.error) {
    let sections = sortSectionsNewArrivalFirst(coerceToArray<WebsiteSection>(table.data));
    if (!sections.some((s) => isNewArrivalSlug(s.slug))) {
      const { error: insertError } = await websiteFrom("website_sections").insert({
        organization_id: orgId,
        slug: "new-arrival",
        label: "New Arrival",
        display_order: 0,
        is_active: true,
      });
      if (!insertError) {
        const refreshed = await websiteFrom("website_sections")
          .select("*")
          .eq("organization_id", orgId)
          .order("display_order", { ascending: true });
        if (!refreshed.error) sections = coerceToArray<WebsiteSection>(refreshed.data);
      } else if (!isMissingWebsiteSectionsSchema(insertError.message)) {
        throw insertError;
      }
    }
    return { sections: sortSectionsNewArrivalFirst(sections), storage: "table", productSections: {} };
  }

  if (!isMissingWebsiteSectionsSchema(table.error.message)) throw table.error;

  const settings = await readOrgSettings(orgId);
  const menus = await loadMenus(orgId);
  const menuSections = parseSectionsFromMenus(menus, orgId);
  const settingsSections = settings ? parseStoredSections(settings, orgId) : [];
  const productSections = {
    ...(settings ? parseStoredProductSections(settings) : {}),
    ...parseProductSectionsFromMenus(menus),
  };
  const sections = withDefaultNewArrival(orgId, mergeFallbackSections(settingsSections, menuSections));
  const alreadySeeded =
    menuSections.some((s) => isNewArrivalSlug(s.slug)) ||
    settingsSections.some((s) => isNewArrivalSlug(s.slug));
  if (!alreadySeeded) {
    await syncSectionMenus(orgId, sections);
    if (settings) {
      await tryWriteOrgSettings(orgId, mergeOrgSettingsSections(settings, sections, productSections));
    }
  }
  return { sections, storage: "settings", productSections };
}

export async function saveWebsiteSections(
  orgId: string,
  storage: WebsiteSectionsState["storage"],
  sections: WebsiteSection[],
  productSections: Record<string, string> = {},
): Promise<void> {
  if (storage === "table") {
    throw new Error("Table writes should go through website_sections");
  }
  await syncSectionMenus(orgId, sections);
  const settings = await readOrgSettings(orgId);
  if (settings) {
    await tryWriteOrgSettings(orgId, mergeOrgSettingsSections(settings, sections, productSections));
  }
}

export async function saveProductSectionAssignment(
  orgId: string,
  productId: string,
  slug: string,
): Promise<void> {
  const settings = await readOrgSettings(orgId);
  if (settings) {
    const sections = withDefaultNewArrival(orgId, parseStoredSections(settings, orgId));
    const productSections = { ...parseStoredProductSections(settings), [productId]: slug };
    await tryWriteOrgSettings(orgId, mergeOrgSettingsSections(settings, sections, productSections));
  }

  const menus = await loadMenus(orgId);
  const assignedFilter = productMenuFilter(productId);
  for (const menu of menus) {
    if (menu.category_filter !== assignedFilter) continue;
    const { error } = await websiteFrom("website_menus")
      .delete()
      .eq("id", menu.id)
      .eq("organization_id", orgId);
    if (error) throw error;
  }

  let parent = menus.find((menu) => menu.category_filter === sectionMenuFilter(slug));
  if (!parent) {
    const { error } = await websiteFrom("website_menus").insert({
      organization_id: orgId,
      parent_id: null,
      label: slug,
      category_filter: sectionMenuFilter(slug),
      display_order: 0,
      is_active: true,
    });
    if (error) throw error;
    parent = (await loadMenus(orgId)).find((menu) => menu.category_filter === sectionMenuFilter(slug));
  }
  if (!parent) throw new Error("Could not save section");

  const { error } = await websiteFrom("website_menus").insert({
    organization_id: orgId,
    parent_id: parent.id,
    label: "Assigned product",
    category_filter: assignedFilter,
    display_order: 0,
    is_active: true,
  });
  if (error) throw error;
}
