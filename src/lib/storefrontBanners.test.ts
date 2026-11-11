import { describe, expect, it } from "vitest";
import { moveStorefrontBanner, parseStorefrontBanners } from "./storefrontBanners";

describe("store banners saved in organization settings", () => {
  it("keeps only well-formed https banners, at most six", () => {
    const banners = parseStorefrontBanners({
      storefront_banners: [
        { id: "a", image_url: "https://cdn.example/a.jpg", heading: "  New  ", subheading: "", target: "new-arrival" },
        { id: "b", image_url: "javascript:alert(1)" },
        { id: "c", image_url: "http://cdn.example/c.jpg" },
        "nope",
        ...Array.from({ length: 8 }, (_, i) => ({ image_url: `https://cdn.example/${i}.jpg` })),
      ],
    });
    expect(banners).toHaveLength(6);
    expect(banners[0]).toEqual({
      id: "a",
      image_url: "https://cdn.example/a.jpg",
      heading: "New",
      subheading: "",
      target: "new-arrival",
    });
    expect(banners[1].id).toBe("banner-2");
  });

  it("is empty when nothing usable is saved", () => {
    expect(parseStorefrontBanners(null)).toEqual([]);
    expect(parseStorefrontBanners({})).toEqual([]);
    expect(parseStorefrontBanners({ storefront_banners: "x" })).toEqual([]);
  });

  it("reorders within bounds only", () => {
    const list = parseStorefrontBanners({
      storefront_banners: [{ id: "a", image_url: "https://x/a.jpg" }, { id: "b", image_url: "https://x/b.jpg" }],
    });
    expect(moveStorefrontBanner(list, 0, 1).map((b) => b.id)).toEqual(["b", "a"]);
    expect(moveStorefrontBanner(list, 0, -1)).toBe(list);
    expect(moveStorefrontBanner(list, 1, 1)).toBe(list);
  });
});
