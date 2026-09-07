import { describe, expect, it } from "vitest";
import { ELLA_HOME_NAV, ELLA_LUXURY_NAV, inferEllaNavAvailability, isEllaHomeNav, resolveEllaHeaderNav } from "./ellaNav";

describe("ELLA_LUXURY_NAV", () => {
  it("starts with a Home item", () => {
    expect(ELLA_LUXURY_NAV[0]).toEqual(ELLA_HOME_NAV);
    expect(ELLA_LUXURY_NAV.map((item) => item.label)[0]).toBe("Home");
  });
});

describe("isEllaHomeNav", () => {
  it("matches the reserved home id or a Home label", () => {
    expect(isEllaHomeNav(ELLA_HOME_NAV)).toBe(true);
    expect(isEllaHomeNav({ id: "abc", label: "HOME" })).toBe(true);
    expect(isEllaHomeNav({ id: "new-in", label: "New in" })).toBe(false);
  });
});

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
    expect(nav.map((item) => item.label)).toEqual(["Home", "New in", "Ready to wear"]);
    expect(nav[1]?.sort).toBe("newest");
    expect(nav[2]?.chip).toBe("Ready");
    expect(nav[2]?.availability).toBe("in-stock");
    expect(nav[2]?.sort).toBe("featured");
  });

  it("maps a menu label onto a matching website section slug", () => {
    const nav = resolveEllaHeaderNav(
      [
        { id: "1", label: "Eid Collection", category_filter: null, display_order: 0 },
        { id: "2", label: "Lookbook", category_filter: "Ready", display_order: 1 },
      ],
      [{ id: "s", slug: "eid-collection", label: "Eid Collection", display_order: 1 }],
    );
    expect(nav[0]?.label).toBe("Home");
    expect(nav[1]?.chip).toBe("eid-collection");
  });

  it("does not prepend a second Home when Website menus already include one", () => {
    const nav = resolveEllaHeaderNav([
      { id: "h", label: "Home", category_filter: null, display_order: 0 },
      { id: "1", label: "New in", category_filter: null, display_order: 1 },
    ]);
    expect(nav.map((item) => item.label)).toEqual(["Home", "New in"]);
    expect(nav[0]?.id).toBe("h");
  });
});

describe("inferEllaNavAvailability", () => {
  it("treats ready-to-wear as in-stock and bridal/MTO as made-to-order", () => {
    expect(inferEllaNavAvailability("Ready to wear", null)).toBe("in-stock");
    expect(inferEllaNavAvailability("Made to order", null)).toBe("made-to-order");
    expect(inferEllaNavAvailability("Sale", null)).toBe("all");
  });
});
