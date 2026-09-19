import { readFile } from "node:fs/promises";
import path from "path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("Ella Noor storefront layout", () => {
  it("keeps sheet chrome in ella-storefront.css and wires editorial en-home", async () => {
    const css = await readFile(path.join(ROOT, "src/storefront/ella-storefront.css"), "utf8");
    const homeCss = await readFile(path.join(ROOT, "src/storefront/ella-home.css"), "utf8");
    const home = await readFile(path.join(ROOT, "src/storefront/EllaStorefrontHome.tsx"), "utf8");
    const root = await readFile(path.join(ROOT, "src/storefront/EllaStorefront.tsx"), "utf8");
    const app = await readFile(path.join(ROOT, "src/storefront/StorefrontApp.tsx"), "utf8");

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

    expect(css).toMatch(/--ella-chrome-h:\s*118px/);
    expect(css).toMatch(/\.ella-chrome\s*\{[^}]*position:\s*fixed/);
    expect(css).toMatch(/\.ella-sheet-product\s*\{[\s\S]*?top:\s*var\(--ella-chrome-h\)/);
    expect(css).toMatch(/\.ella-store button\.ella-size-btn/);
    expect(css).toMatch(/\.ella-store button\.ella-nav-link/);
    expect(css).toMatch(/\.ella-store button\.ella-header-btn/);
    expect(css).toMatch(/\.ella-site-header\s*\{[^}]*position:\s*relative/);
    expect(css).not.toMatch(/\.ella-site-header\s*\{[^}]*position:\s*sticky/);

    expect(homeCss).toMatch(/^\.en-home/m);
    expect(homeCss).toMatch(/@media \(min-width: 1024px\)/);
    expect(homeCss).toMatch(/\.en-tabs/);
    expect(homeCss).toMatch(/@media \(min-width: 1024px\) \{\s*\.en-tabs \{ display: none; \}/);
    expect(homeCss).toMatch(/\.ella-store \.storefront-floating-social \{ display: none; \}/);
    expect(homeCss).toMatch(/\.storefront-floating-social-icon \{ width: 24px; height: 24px/);

    expect(home).toMatch(/import "\.\/ella-home\.css"/);
    expect(home).toMatch(/className="en-home"/);
    expect(home).toMatch(/className="en-tabs"/);
    expect(home).toMatch(/className="en-footer"/);
    expect(home).toMatch(/resolveEllaHeaderNav/);
    expect(home).toMatch(/isEllaHomeNav/);
    expect(home).toMatch(/applyEllaFilters/);
    expect(home).toMatch(/Photo coming soon/);
    expect(home).toMatch(/Made to order/);
    expect(home).not.toMatch(/ella-chrome/);
    expect(home).not.toMatch(/goHome\(\)/);

    expect(home).toMatch(/View all pieces/);
    expect(home).toMatch(/Shop ready to wear/);
    expect(home).toMatch(/aria-label="Instagram"/);
    expect(home).toMatch(/en-tab-wa/);
    expect(home).toMatch(/WhatsApp/);

    expect(root).toMatch(/menus=\{menus\}/);
    expect(app).toMatch(/menus=\{menuTree\}/);
    expect(root).toMatch(/onNavigate/);
    expect(root).toMatch(/StorefrontFloatingSocial/);
  });

  it("does not change the default storefront boxed wrap", async () => {
    const css = await readFile(path.join(ROOT, "src/storefront/storefront.css"), "utf8");
    expect(css).toMatch(/\.storefront-wrap/);
    expect(css).not.toMatch(/ella-site-header/);
  });
});
