import { describe, expect, it } from "vitest";
import {
  ellaNavChipsFromSections,
  groupProductsBySection,
  isNewArrivalSlug,
  NEW_ARRIVAL_LABEL,
  NEW_ARRIVAL_SLUG,
  slugifySectionLabel,
  sortSectionsNewArrivalFirst,
} from "./websiteSections";

describe("slugifySectionLabel", () => {
  it("turns Eid Collection into a stable slug", () => {
    expect(slugifySectionLabel("Eid Collection")).toBe("eid-collection");
    expect(slugifySectionLabel("Exhibition collection")).toBe("exhibition-collection");
  });
});

describe("sortSectionsNewArrivalFirst", () => {
  it("pins New Arrival ahead of later display_order rows", () => {
    const sorted = sortSectionsNewArrivalFirst([
      { slug: "eid-collection", display_order: 1, label: "Eid Collection" },
      { slug: "new-arrival", display_order: 9, label: NEW_ARRIVAL_LABEL },
      { slug: "exhibition-collection", display_order: 2, label: "Exhibition Collection" },
    ]);
    expect(sorted.map((s) => s.slug)).toEqual([
      NEW_ARRIVAL_SLUG,
      "eid-collection",
      "exhibition-collection",
    ]);
  });
});

describe("isNewArrivalSlug", () => {
  it("treats hyphen variants as the reserved New Arrival slug", () => {
    expect(isNewArrivalSlug("new-arrival")).toBe(true);
    expect(isNewArrivalSlug("newarrival")).toBe(true);
    expect(isNewArrivalSlug("eid-collection")).toBe(false);
  });
});

describe("ellaNavChipsFromSections", () => {
  it("falls back to category chips when no sections exist", () => {
    expect(ellaNavChipsFromSections([], ["All", "Bridal"])).toEqual([
      { id: "all", label: "All" },
      { id: "Bridal", label: "Bridal" },
    ]);
  });

  it("lists All then New Arrival then custom collections", () => {
    const chips = ellaNavChipsFromSections(
      [
        { id: "2", slug: "eid-collection", label: "Eid Collection", display_order: 2 },
        { id: "1", slug: "new-arrival", label: "New Arrival", display_order: 0 },
      ],
      ["All", "Bridal"],
    );
    expect(chips.map((c) => c.label)).toEqual(["All", "New Arrival", "Eid Collection"]);
  });
});

describe("groupProductsBySection", () => {
  it("puts New Arrival products in the first block", () => {
    const groups = groupProductsBySection(
      [
        { id: "e", sectionSlug: "eid-collection" },
        { id: "n", sectionSlug: "new-arrival" },
        { id: "u", sectionSlug: null },
      ],
      [
        { id: "1", slug: "eid-collection", label: "Eid Collection", display_order: 1 },
        { id: "2", slug: "new-arrival", label: "New Arrival", display_order: 0 },
      ],
    );
    expect(groups.map((g) => [g.label, g.products.map((p) => p.id)])).toEqual([
      ["New Arrival", ["n"]],
      ["Eid Collection", ["e"]],
      ["The collection", ["u"]],
    ]);
  });
});
