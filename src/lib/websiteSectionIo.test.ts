import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSettingsSection, sectionMenuFilter } from "./websiteSectionStore";

const writes: { table: string; op: string; values?: unknown }[] = [];

function createQuery(result: { data: unknown; error: { message: string } | null }, table: string) {
  const query = {
    select: () => query,
    insert: (values: unknown) => {
      writes.push({ table, op: "insert", values });
      return query;
    },
    update: (values: unknown) => {
      writes.push({ table, op: "update", values });
      return query;
    },
    delete: () => {
      writes.push({ table, op: "delete" });
      return query;
    },
    eq: () => query,
    order: () => query,
    maybeSingle: () => Promise.resolve(result),
    then: (
      resolve: (value: { data: unknown; error: { message: string } | null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "website_sections") {
        return createQuery(
          {
            data: null,
            error: {
              message: "Could not find the table 'public.website_sections' in the schema cache",
            },
          },
          table,
        );
      }
      if (table === "website_menus") {
        return createQuery({ data: [], error: null }, table);
      }
      if (table === "organizations") {
        return createQuery({ data: { settings: { mobile_number: "91" } }, error: null }, table);
      }
      return createQuery({ data: null, error: { message: `unexpected table ${table}` } }, table);
    },
  },
}));

describe("saveWebsiteSections fallback when website_sections is missing", () => {
  beforeEach(() => {
    writes.length = 0;
  });

  it("loads via menus/settings and never inserts into website_sections", async () => {
    const { loadWebsiteSectionsState, saveWebsiteSections } = await import("./websiteSectionIo");
    const state = await loadWebsiteSectionsState("org-1");
    expect(state.storage).toBe("settings");
    expect(state.sections.some((s) => s.slug === "new-arrival")).toBe(true);
    expect(writes.filter((w) => w.table === "website_sections")).toEqual([]);

    await saveWebsiteSections("org-1", "settings", [
      ...state.sections,
      buildSettingsSection("org-1", {
        label: "Eid Collection",
        slug: "eid-collection",
        display_order: 1,
      }),
    ]);

    const menuInserts = writes.filter((w) => w.table === "website_menus" && w.op === "insert");
    const filters = menuInserts.map((w) => (w.values as { category_filter?: string }).category_filter);
    expect(filters).toContain(sectionMenuFilter("new-arrival"));
    expect(filters).toContain(sectionMenuFilter("eid-collection"));
    expect(writes.filter((w) => w.table === "website_sections")).toEqual([]);
  });
});
