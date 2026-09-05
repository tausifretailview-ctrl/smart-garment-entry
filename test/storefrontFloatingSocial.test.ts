import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("storefront form label contrast", () => {
  it("uses a readable Ella label token instead of faint paper", async () => {
    const css = await readFile(path.join(ROOT, "src/storefront/ella-storefront.css"), "utf8");
    expect(css).toMatch(/--ella-label:/);
    expect(css).toMatch(/\.ella-form label span \{[\s\S]*?color: var\(--ella-label\)/);
  });

  it("darkens default storefront field labels", async () => {
    const css = await readFile(path.join(ROOT, "src/storefront/storefront.css"), "utf8");
    expect(css).toMatch(/\.storefront-field label[\s\S]*store-charcoal/);
  });
});

describe("StorefrontFloatingSocial", () => {
  it("defines official brand floating button styles", async () => {
    const css = await readFile(path.join(ROOT, "src/storefront/storefront.css"), "utf8");
    expect(css).toMatch(/\.storefront-floating-social-wa[\s\S]*#25d366/);
    expect(css).toMatch(/\.storefront-floating-social-ig[\s\S]*linear-gradient/);
  });

  it("mounts floating social on default chrome and Ella storefront", async () => {
    const component = await readFile(
      path.join(ROOT, "src/storefront/StorefrontFloatingSocial.tsx"),
      "utf8",
    );
    const chrome = await readFile(path.join(ROOT, "src/storefront/StorefrontChrome.tsx"), "utf8");
    const ella = await readFile(path.join(ROOT, "src/storefront/EllaStorefront.tsx"), "utf8");

    expect(component).toMatch(/WhatsAppBrandIcon/);
    expect(component).toMatch(/InstagramBrandIcon/);
    expect(component).toMatch(/aria-label="WhatsApp"/);
    expect(chrome).toMatch(/StorefrontFloatingSocial/);
    expect(ella).toMatch(/StorefrontFloatingSocial/);
    expect(ella).toMatch(/variant="ella"/);
  });
});
