/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  STANDARD_SIZE_CHARTS,
  STOREFRONT_SIZE_HELPER_KEY,
  alphaSize,
  cmToFeetInches,
  estimateBody,
  feetInchesToCm,
  parseSizeProfile,
  parseStorefrontSizeHelper,
  serializeStorefrontSizeHelper,
  sizeGuideRows,
  sizeScaleFor,
  suggestSize,
  type SizeProfile,
} from "./sizeHelper";
import { StreetSizeHelper } from "@/storefront/StreetSizeHelper";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const charts = STANDARD_SIZE_CHARTS;
const man = (heightCm: number, weightKg: number, fit: SizeProfile["fit"] = "regular"): SizeProfile => ({
  gender: "men",
  heightCm,
  weightKg,
  fit,
});

describe("store size helper", () => {
  it("is on with the standard chart unless the shop changes it", () => {
    expect(parseStorefrontSizeHelper(null)).toEqual({ enabled: true, charts: STANDARD_SIZE_CHARTS });
    expect(parseStorefrontSizeHelper({ other: 1 }).enabled).toBe(true);
    const custom = parseStorefrontSizeHelper({
      [STOREFRONT_SIZE_HELPER_KEY]: { enabled: false, charts: { men_tops: { M: "40", L: 900, XL: "abc" }, junk: { S: 1 } } },
    });
    expect(custom.enabled).toBe(false);
    expect(custom.charts.men_tops.M).toBe(40);
    // Out-of-range and non-number values keep the standard figure.
    expect(custom.charts.men_tops.L).toBe(STANDARD_SIZE_CHARTS.men_tops.L);
    expect(custom.charts.men_tops.XL).toBe(STANDARD_SIZE_CHARTS.men_tops.XL);
    expect(custom.charts.women_tops).toEqual(STANDARD_SIZE_CHARTS.women_tops);
    // The standard chart itself is never changed by a shop's values.
    expect(STANDARD_SIZE_CHARTS.men_tops.M).toBe(39);
    // Only the changed values are saved, and they read back the same.
    const saved = serializeStorefrontSizeHelper(custom);
    expect(saved).toEqual({ enabled: false, charts: { men_tops: { M: 40 } } });
    expect(parseStorefrontSizeHelper({ [STOREFRONT_SIZE_HELPER_KEY]: saved })).toEqual(custom);
    expect(serializeStorefrontSizeHelper(parseStorefrontSizeHelper(null))).toEqual({ enabled: true });
  });

  it("only offers a size for products it can size", () => {
    expect(sizeScaleFor({ name: "Oxford Cotton Shirt", sizes: ["S", "M", "L", "XL"] })).toEqual({
      gender: "men",
      kind: "tops",
      chartId: "men_tops",
      labels: "alpha",
    });
    expect(sizeScaleFor({ name: "Slim Fit Jeans", category: "Mens Jeans", sizes: ["30", "32", "34"] })).toMatchObject({
      kind: "bottoms",
      chartId: "men_bottoms",
      labels: "numeric",
    });
    expect(sizeScaleFor({ name: "Rayon Kurti", sizes: ["38", "40", "42"] })).toMatchObject({ chartId: "women_tops", labels: "numeric" });
    expect(sizeScaleFor({ name: "Formal Shirt", sizes: ["38", "40", "42", "44"] })).toMatchObject({ chartId: "men_tops", labels: "numeric" });
    // A set is sized by its top, a denim jacket is a top.
    expect(sizeScaleFor({ name: "Kurta Pajama Set", sizes: ["38", "40"] })).toMatchObject({ kind: "tops" });
    expect(sizeScaleFor({ name: "Denim Jacket", sizes: ["M", "L"] })).toMatchObject({ kind: "tops" });
    expect(sizeScaleFor({ name: "Women Palazzo", sizes: ["S", "M"] })).toMatchObject({ chartId: "women_bottoms" });
    // Not sized: free size, one size, kids, footwear, mixed or unusual labels.
    expect(sizeScaleFor({ name: "Silk Saree", sizes: ["FS"] })).toBeNull();
    expect(sizeScaleFor({ name: "Polo Tee", sizes: ["M"] })).toBeNull();
    expect(sizeScaleFor({ name: "Boys Shirt", sizes: ["S", "M"] })).toBeNull();
    expect(sizeScaleFor({ name: "Running Shoes", sizes: ["7", "8", "9"] })).toBeNull();
    expect(sizeScaleFor({ name: "Polo Tee", sizes: ["S", "40"] })).toBeNull();
    expect(sizeScaleFor({ name: "Polo Tee", sizes: ["22", "24"] })).toBeNull();
    expect(sizeScaleFor({ name: "Polo Tee", sizes: ["RED", "BLUE"] })).toBeNull();
    expect(alphaSize("2xl")).toBe("XXL");
    expect(alphaSize("xxxl")).toBe("3XL");
    expect(alphaSize("40")).toBeNull();
  });

  it("estimates a believable chest and waist from height and weight", () => {
    expect(estimateBody({ gender: "men", heightCm: 170, weightKg: 70 })).toEqual({ chestIn: 38.5, waistIn: 33 });
    expect(estimateBody({ gender: "men", heightCm: 165, weightKg: 55 })).toEqual({ chestIn: 35, waistIn: 28.5 });
    expect(estimateBody({ gender: "women", heightCm: 160, weightKg: 55 })).toEqual({ chestIn: 33.5, waistIn: 27.5 });
    // Heavier is never smaller.
    const light = estimateBody({ gender: "men", heightCm: 175, weightKg: 60 });
    const heavy = estimateBody({ gender: "men", heightCm: 175, weightKg: 95 });
    expect(heavy.chestIn).toBeGreaterThan(light.chestIn);
    expect(heavy.waistIn).toBeGreaterThan(light.waistIn);
    expect(feetInchesToCm(5, 7)).toBe(170);
    expect(cmToFeetInches(170)).toEqual({ feet: 5, inches: 7 });
  });

  it("suggests the smallest size that fits, and respects the fit the shopper likes", () => {
    const shirt = sizeScaleFor({ name: "Oxford Shirt", sizes: ["S", "M", "L", "XL"] })!;
    const sizes = ["S", "M", "L", "XL"];
    expect(suggestSize(sizes, shirt, man(170, 70), charts)).toEqual({ label: "M", bodyIn: 38.5, beyondRange: false });
    expect(suggestSize(sizes, shirt, man(170, 70, "loose"), charts)?.label).toBe("L");
    expect(suggestSize(sizes, shirt, man(170, 70, "snug"), charts)?.label).toBe("M");
    expect(suggestSize(sizes, shirt, man(160, 48), charts)?.label).toBe("S");
    // Bigger than the largest size the product comes in: say so instead of guessing.
    expect(suggestSize(sizes, shirt, man(180, 130), charts)).toMatchObject({ label: "XL", beyondRange: true });
    // Number sizes: a "40" shirt is for chest 38-39, "34" jeans for waist up to 34.
    const numShirt = sizeScaleFor({ name: "Formal Shirt", sizes: ["38", "40", "42"] })!;
    expect(suggestSize(["38", "40", "42"], numShirt, man(170, 70), charts)?.label).toBe("40");
    const jeans = sizeScaleFor({ name: "Slim Jeans", sizes: ["30", "32", "34", "36"] })!;
    expect(suggestSize(["30", "32", "34", "36"], jeans, man(170, 70), charts)?.label).toBe("34");
    // The shop's own chart changes the answer.
    const roomy = parseStorefrontSizeHelper({ [STOREFRONT_SIZE_HELPER_KEY]: { charts: { men_tops: { S: 39 } } } });
    expect(suggestSize(sizes, shirt, man(170, 70), roomy.charts)?.label).toBe("S");
    expect(sizeGuideRows(["L", "S", "M"], shirt, charts)).toEqual([
      { label: "S", inches: 37, cm: 94 },
      { label: "M", inches: 39, cm: 99 },
      { label: "L", inches: 41, cm: 104 },
    ]);
  });

  it("keeps only a sane profile from the browser", () => {
    expect(parseSizeProfile(JSON.stringify(man(170, 70)))).toEqual(man(170, 70));
    expect(parseSizeProfile(JSON.stringify({ ...man(170, 70), weightKg: 900 }))).toBeNull();
    expect(parseSizeProfile("{broken")).toBeNull();
    expect(parseSizeProfile(null)).toBeNull();
  });

  it("asks for details, then shows the size and picks it when in stock", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const scale = sizeScaleFor({ name: "Oxford Shirt", sizes: ["S", "M", "L"] })!;
    const sizes = [
      { label: "S", inStock: true, stockLabel: "In stock" },
      { label: "M", inStock: true, stockLabel: "Only 2 left" },
      { label: "L", inStock: false, stockLabel: "Sold out" },
    ];
    const onPick = vi.fn();
    const onSaveProfile = vi.fn();
    const config = { enabled: true, charts };
    const draw = (profile: SizeProfile | null) =>
      act(() =>
        root.render(
          <StreetSizeHelper
            sizes={sizes}
            scale={scale}
            suggestion={profile ? suggestSize(["S", "M", "L"], scale, profile, charts) : null}
            config={config}
            profile={profile}
            onSaveProfile={onSaveProfile}
            onPick={onPick}
          />,
        ),
      );
    draw(null);
    expect(host.querySelector(".st-fit-result")).toBeNull();
    act(() => (host.querySelector(".st-fit-open") as HTMLButtonElement).click());
    // No weight yet: asks for it and saves nothing.
    const show = () => Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "Show my size")!;
    act(() => show().click());
    expect(host.querySelector(".st-fit-error")?.textContent).toContain("weight");
    expect(onSaveProfile).not.toHaveBeenCalled();
    const weight = host.querySelector("#st-fit-weight") as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(weight, "70");
      weight.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => show().click());
    expect(onSaveProfile).toHaveBeenCalledWith({ gender: "men", heightCm: 168, weightKg: 70, fit: "regular" });
    expect(onPick).toHaveBeenCalledWith("M");
    draw(man(168, 70));
    expect(host.querySelector(".st-fit-result")?.textContent).toBe("Your size: M · Only 2 left");
    // A suggested size that is sold out is said, not picked.
    onPick.mockClear();
    draw(man(175, 82));
    expect(host.querySelector(".st-fit-result")?.textContent).toBe("Your size: L · sold out right now");
    act(() => (host.querySelector(".st-fit-guide-open") as HTMLButtonElement).click());
    expect(host.querySelectorAll(".st-fit-guide tbody tr")).toHaveLength(3);
    expect(host.querySelector(".st-fit-guide tr.st-on th")?.textContent).toBe("L");
    act(() => root.unmount());
    host.remove();
  });

  it("is wired into the store, the theme settings and the public settings function", () => {
    expect(read("src/storefront/storefrontClient.ts")).toContain("payload.sizeHelper = parseStorefrontSizeHelper(orgInfo?.settings);");
    const street = read("src/storefront/StreetStorefront.tsx");
    expect(street).toContain("<StreetSizeHelper");
    expect(street).toContain("sizeHelper={sizeHelper}");
    expect(read("src/storefront/StorefrontApp.tsx")).toContain("sizeHelper={payload.sizeHelper}");
    expect(read("src/components/website/WebsiteThemePanel.tsx")).toContain("<StoreSizeHelperSettings orgId={orgId} />");
    expect(read("supabase/migrations/20270502120000_org_public_info_size_helper.sql")).toContain(
      "'storefront_size_helper', o.settings -> 'storefront_size_helper'",
    );
  });
});
