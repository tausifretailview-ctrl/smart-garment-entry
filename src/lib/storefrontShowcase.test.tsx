/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { STOREFRONT_SHOWCASE_KEY, parseStorefrontShowcase, showcaseOffset } from "./storefrontShowcase";
import { StreetShowcase } from "@/storefront/StreetShowcase";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const items = Array.from({ length: 8 }, (_, i) => ({
  id: `p${i}`,
  name: `Product ${i}`,
  priceLabel: `₹${100 + i}`,
  image: `https://cdn.example/${i}.jpg`,
}));

describe("Street product slideshow", () => {
  it("is on unless the shop switched it off", () => {
    expect(parseStorefrontShowcase(null)).toBe(true);
    expect(parseStorefrontShowcase({})).toBe(true);
    expect(parseStorefrontShowcase({ [STOREFRONT_SHOWCASE_KEY]: false })).toBe(false);
  });

  it("places the front card and its neighbours, wrapping round the ends", () => {
    expect(showcaseOffset(0, 0, 8)).toBe(0);
    expect(showcaseOffset(1, 0, 8)).toBe(1);
    expect(showcaseOffset(7, 0, 8)).toBe(-1);
    expect(showcaseOffset(6, 0, 8)).toBe(-2);
    expect(showcaseOffset(4, 0, 8)).toBeNull();
    // Three products: one each side, never the same product twice.
    expect([0, 1, 2].map((i) => showcaseOffset(i, 0, 3))).toEqual([0, 1, -1]);
  });

  it("shows one product in front, moves on by itself, and opens the product", () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const onOpen = vi.fn();
    act(() => root.render(<StreetShowcase title="Featured styles" items={items} onOpen={onOpen} />));

    expect(host.querySelectorAll(".st-show-card")).toHaveLength(5);
    expect(host.querySelector(".st-show-name")?.textContent).toBe("Product 0");

    act(() => vi.advanceTimersByTime(3300));
    expect(host.querySelector(".st-show-name")?.textContent).toBe("Product 1");

    act(() => (host.querySelector('[aria-label="Previous product"]') as HTMLButtonElement).click());
    expect(host.querySelector(".st-show-name")?.textContent).toBe("Product 0");

    // A side card comes to the front when clicked; the front card opens the product.
    act(() => (host.querySelector('.st-show-card[data-offset="1"]') as HTMLButtonElement).click());
    expect(host.querySelector(".st-show-name")?.textContent).toBe("Product 1");
    expect(onOpen).not.toHaveBeenCalled();
    act(() => (host.querySelector(".st-show-front") as HTMLButtonElement).click());
    expect(onOpen).toHaveBeenCalledWith("p1");

    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  it("is placed after the videos on the Street home page and can be switched off in Website → Theme", () => {
    const street = readFileSync(join(process.cwd(), "src/storefront/StreetStorefront.tsx"), "utf8");
    expect(street.indexOf("<StreetVideoRail")).toBeGreaterThan(-1);
    expect(street.indexOf("<StreetShowcase")).toBeGreaterThan(street.indexOf("<StreetVideoRail"));
    // Home order: videos, then shop by category (oval cards), then the slideshow.
    expect(street.indexOf('className="st-section st-cats"')).toBeGreaterThan(street.indexOf("<StreetVideoRail"));
    expect(street.indexOf("<StreetShowcase")).toBeGreaterThan(street.indexOf('className="st-section st-cats"'));
    expect(readFileSync(join(process.cwd(), "src/components/website/WebsiteThemePanel.tsx"), "utf8")).toContain(
      "saveStorefrontShowcase",
    );
  });
});
