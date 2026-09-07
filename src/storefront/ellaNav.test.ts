import { describe, expect, it } from "vitest";
import { ELLA_LUXURY_NAV, inferEllaNavAvailability, resolveEllaHeaderNav } from "./ellaNav";

describe("resolveEllaHeaderNav", () => {
  it("keeps the HTML-mock nav when Website menus are empty or only Home", () => {
    expect(resolveEllaHeaderNav([])).toEqual(ELLA_LUXURY_NAV);
    expect(
      resolveEllaHeaderNav([{ id: "h", label: "HOME", category_filter: null, display_order: 1 }]),
    ).toEqual(ELLA_LUXURY_NAV);
  });

  it("uses Website → Menus when real shop links exist", () => {
    const nav = resolveEllaHeaderNav(
      [
        { id: "1", label: "New in", category_filter: null, display_order: 0 },
        { id: "2", label: "Ready to wear", category_filter: "Ready", display_order: 1 },
      ],
      [{ id: "s1", slug: "new-arrival", label: "New Arrival", display_order: 0 }],
    );
    expect(nav.map((item) => item.label)).toEqual(["New in", "Ready to wear"]);
    expect(nav[1]?.chip).toBe("Ready");
    expect(nav[1]?.availability).toBe("in-stock");
  });

  it("maps a menu label onto a matching website section slug", () => {
    const nav = resolveEllaHeaderNav(
      [
        { id: "1", label: "Eid Collection", category_filter: null, display_order: 0 },
        { id: "2", label: "Lookbook", category_filter: "Ready", display_order: 1 },
      ],
      [{ id: "s", slug: "eid-collection", label: "Eid Collection", display_order: 1 }],
    );
    expect(nav[0]?.chip).toBe("eid-collection");
  });
});

describe("inferEllaNavAvailability", () => {
  it("treats ready-to-wear as in-stock and bridal/MTO as made-to-order", () => {
    expect(inferEllaNavAvailability("Ready to wear", null)).toBe("in-stock");
    expect(inferEllaNavAvailability("Made to order", null)).toBe("made-to-order");
    expect(inferEllaNavAvailability("Sale", null)).toBe("all");
  });
});
