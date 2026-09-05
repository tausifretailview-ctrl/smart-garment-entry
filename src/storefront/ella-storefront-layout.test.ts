import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("Ella Noor desktop storefront layout", () => {
  it("uses a full-width shell with site header and footer", async () => {
    const css = await readFile(path.join(ROOT, "src/storefront/ella-storefront.css"), "utf8");
    const home = await readFile(path.join(ROOT, "src/storefront/EllaStorefrontHome.tsx"), "utf8");
    const root = await readFile(path.join(ROOT, "src/storefront/EllaStorefront.tsx"), "utf8");

    expect(css).toMatch(/max-width:\s*none/);
    expect(css).not.toMatch(/--ella-max:\s*1200px/);
    expect(css).toMatch(/\.ella-site-header/);
    expect(css).toMatch(/\.ella-site-footer/);
    expect(css).toMatch(/height:\s*min\(82vh,\s*920px\)/);
    expect(css).toMatch(/object-position:\s*center 22%/);
    expect(css).toMatch(/font-size:\s*16px/);

    expect(home).toMatch(/ella-site-header/);
    expect(home).toMatch(/ella-site-nav/);
    expect(home).toMatch(/ella-site-footer/);
    expect(home).toMatch(/Search styles/);
    expect(home).toMatch(/Collections/);
    expect(home).toMatch(/ella-social-icon/);
    expect(home).toMatch(/aria-label="Instagram"/);
    expect(root).toMatch(/StorefrontFloatingSocial/);
  });

  it("does not change the default storefront boxed wrap", async () => {
    const css = await readFile(path.join(ROOT, "src/storefront/storefront.css"), "utf8");
    expect(css).toMatch(/\.storefront-wrap/);
    expect(css).not.toMatch(/ella-site-header/);
  });
});
