import { describe, expect, it } from "vitest";
import {
  attachSectionsToPublicPayload,
  buildSettingsSection,
  filterReservedStorefrontMenus,
  isMissingWebsiteSectionsSchema,
  mergeFallbackSections,
  mergeOrgSettingsSections,
  parseProductSectionsFromMenus,
  parseSectionsFromMenus,
  parseStoredProductSections,
  parseStoredSections,
  productMenuFilter,
  sectionIdForProduct,
  sectionMenuFilter,
  withDefaultNewArrival,
} from "./websiteSectionStore";

describe("isMissingWebsiteSectionsSchema", () => {
  it("matches the live PostgREST missing-table error", () => {
    expect(
      isMissingWebsiteSectionsSchema(
        "Could not find the table 'public.website_sections' in the schema cache",
      ),
    ).toBe(true);
  });
});

describe("parseStoredSections", () => {
  it("reads storefront_sections from org settings JSON", () => {
    const rows = parseStoredSections(
      {
        address: "keep me",
        storefront_sections: [
          { id: "e1", slug: "eid-collection", label: "Eid Collection", display_order: 2 },
          { id: "n1", slug: "new-arrival", label: "New Arrival", display_order: 0, is_active: true },
        ],
      },
      "org-1",
    );
    expect(rows.map((s) => s.slug)).toEqual(["new-arrival", "eid-collection"]);
    expect(rows[0].organization_id).toBe("org-1");
  });

  it("ignores malformed settings", () => {
    expect(parseStoredSections(null, "org-1")).toEqual([]);
    expect(parseStoredSections({ storefront_sections: "nope" }, "org-1")).toEqual([]);
  });
});

describe("withDefaultNewArrival + merge", () => {
  it("seeds New Arrival and preserves other org settings keys", () => {
    const seeded = withDefaultNewArrival("org-1", []);
    expect(seeded).toHaveLength(1);
    expect(seeded[0].slug).toBe("new-arrival");
    const merged = mergeOrgSettingsSections({ mobile_number: "91" }, seeded, { p1: "new-arrival" });
    expect(merged.mobile_number).toBe("91");
    expect(parseStoredProductSections(merged)).toEqual({ p1: "new-arrival" });
  });
});

describe("sectionIdForProduct", () => {
  const sections = [
    buildSettingsSection("org-1", { id: "n", label: "New Arrival", slug: "new-arrival", display_order: 0 }),
    buildSettingsSection("org-1", { id: "e", label: "Eid Collection", slug: "eid-collection", display_order: 1 }),
  ];

  it("prefers the listing section_id when it still exists", () => {
    expect(sectionIdForProduct("p1", "e", sections, {})).toBe("e");
  });

  it("falls back to the settings product map", () => {
    expect(sectionIdForProduct("p1", null, sections, { p1: "eid-collection" })).toBe("e");
  });
});

describe("menu fallback helpers", () => {
  it("reads sections and product assignments from reserved website_menus rows", () => {
    const menus = [
      { id: "m-new", label: "New Arrival", category_filter: sectionMenuFilter("new-arrival"), display_order: 0 },
      { id: "m-eid", label: "Eid Collection", category_filter: sectionMenuFilter("eid-collection"), display_order: 2 },
      {
        id: "m-p1",
        parent_id: "m-eid",
        label: "Assigned product",
        category_filter: productMenuFilter("p1"),
        display_order: 0,
      },
      { id: "m-real", label: "Women", category_filter: "SAREE", display_order: 1 },
    ];
    expect(parseSectionsFromMenus(menus, "org-1").map((s) => s.slug)).toEqual([
      "new-arrival",
      "eid-collection",
    ]);
    expect(parseProductSectionsFromMenus(menus)).toEqual({ p1: "eid-collection" });
    expect(filterReservedStorefrontMenus(menus).map((m) => m.id)).toEqual(["m-real"]);
  });

  it("lets menu rows win over settings when slugs overlap", () => {
    const merged = mergeFallbackSections(
      [buildSettingsSection("org-1", { id: "s", label: "Old Eid", slug: "eid-collection", display_order: 9 })],
      [buildSettingsSection("org-1", { id: "m", label: "Eid Collection", slug: "eid-collection", display_order: 2 })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("m");
    expect(merged[0].label).toBe("Eid Collection");
  });
});

describe("attachSectionsToPublicPayload", () => {
  it("fills sections from reserved menus when settings and the RPC omitted them", () => {
    const next = attachSectionsToPublicPayload(
      {
        published: true,
        shop: { name: "Ella", slug: "ella-noor" },
        menus: [
          { id: "m-new", parent_id: null, label: "New Arrival", category_filter: sectionMenuFilter("new-arrival"), display_order: 0 },
          { id: "m-p1", parent_id: "m-new", label: "Assigned product", category_filter: productMenuFilter("p1"), display_order: 0 },
          { id: "m-real", parent_id: null, label: "Lookbook", category_filter: "SAREE", display_order: 3 },
        ],
        products: [
          {
            id: "l1",
            product_id: "p1",
            name: "Jacket",
            brand: null,
            category: null,
            display_order: 1,
            display_price: 100,
            photo_urls: [],
            stock_status: "in_stock",
            stock_left: null,
            variants: [],
          },
        ],
      },
      {},
    );
    expect(next.sections?.map((s) => s.label)).toEqual(["New Arrival"]);
    expect(next.products?.[0].section_slug).toBe("new-arrival");
    expect(next.menus?.map((m) => m.label)).toEqual(["Lookbook"]);
  });

  it("fills sections and product slugs from org settings when the RPC omitted them", () => {
    const next = attachSectionsToPublicPayload(
      {
        published: true,
        shop: { name: "Ella", slug: "ella-noor" },
        products: [
          {
            id: "l1",
            product_id: "p1",
            name: "Jacket",
            brand: null,
            category: null,
            display_order: 1,
            display_price: 100,
            photo_urls: [],
            stock_status: "in_stock",
            stock_left: null,
            variants: [],
          },
        ],
      },
      {
        storefront_sections: [
          { id: "n", slug: "new-arrival", label: "New Arrival", display_order: 0 },
        ],
        storefront_product_sections: { p1: "new-arrival" },
      },
    );
    expect(next.sections?.[0].label).toBe("New Arrival");
    expect(next.products?.[0].section_slug).toBe("new-arrival");
    expect(next.products?.[0].section_label).toBe("New Arrival");
  });
});
