import { readFile } from "node:fs/promises";
import path from "path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("Ella Noor desktop storefront layout", () => {
  it("uses a full-width shell with the HTML mock header, home, and footer", async () => {
    const css = await readFile(path.join(ROOT, "src/storefront/ella-storefront.css"), "utf8");
    const home = await readFile(path.join(ROOT, "src/storefront/EllaStorefrontHome.tsx"), "utf8");
    const root = await readFile(path.join(ROOT, "src/storefront/EllaStorefront.tsx"), "utf8");

    expect(css).toMatch(/--ella-max:\s*none/);
    expect(css).not.toMatch(/--ella-max:\s*1200px/);
    expect(css).toMatch(/--ella-page:\s*1360px/);
    expect(css).toMatch(/\.ella-site-header/);
    expect(css).toMatch(/\.ella-site-footer/);
    expect(css).toMatch(/min-height:\s*min\(78vh,\s*680px\)/);
    expect(css).toMatch(/object-position:\s*center 20%/);
    expect(css).toMatch(/font-size:\s*16px/);
    expect(css).toMatch(/\.ella-arrivals-title/);
    expect(css).toMatch(/\.ella-collection-layout/);
    expect(css).toMatch(/\.ella-filter-rail/);

    expect(home).toMatch(/ella-site-header/);
    expect(home).toMatch(/ella-site-nav/);
    expect(home).toMatch(/ella-site-footer/);
    expect(home).toMatch(/Search by style code, colour or fabric/);
    expect(home).toMatch(/New arrivals/);
    expect(home).toMatch(/View all/);
    expect(home).toMatch(/Shop ready to wear/);
    expect(home).toMatch(/Cut for you, in four steps/);
    expect(home).toMatch(/ella-collection-page/);
    expect(home).toMatch(/aria-label="Instagram"/);
    expect(root).toMatch(/StorefrontFloatingSocial/);
  });

  it("does not change the default storefront boxed wrap", async () => {
    const css = await readFile(path.join(ROOT, "src/storefront/storefront.css"), "utf8");
    expect(css).toMatch(/\.storefront-wrap/);
    expect(css).not.toMatch(/ella-site-header/);
  });
});
