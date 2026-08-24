import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("default storefront stays unchanged for other orgs", () => {
  it("keeps the existing catalogue cards and shell (not atelier)", async () => {
    const src = await readFile(path.join(ROOT, "src/storefront/StorefrontHome.tsx"), "utf8");
    expect(src).toMatch(/storefront-card/);
    expect(src).toMatch(/StorefrontShell/);
    expect(src).not.toMatch(/ella-store/);
    expect(src).not.toMatch(/isEllaNoorSlug/);
  });

  it("keeps rounded default storefront chrome in CSS", async () => {
    const src = await readFile(path.join(ROOT, "src/storefront/storefront.css"), "utf8");
    expect(src).toMatch(/--store-radius: 14px/);
    expect(src).toMatch(/storefront-card/);
    expect(src).not.toMatch(/ella-store/);
  });

  it("keeps org branding helpers used by the default catalogue", async () => {
    const src = await readFile(path.join(ROOT, "src/storefront/storefrontTheme.ts"), "utf8");
    expect(src).toMatch(/export function enrichPublicStorefrontShop/);
    expect(src).toMatch(/export function applyStorefrontThemeVars/);
    expect(src).toMatch(/export function storefrontLocationLine/);
  });

  it("routes only ella-noor through the atelier shell", async () => {
    const src = await readFile(path.join(ROOT, "src/storefront/StorefrontApp.tsx"), "utf8");
    expect(src).toMatch(/isEllaNoorSlug/);
    expect(src).toMatch(/storefront-loading/);
    expect(src).toMatch(/<StorefrontHome/);
  });
});
