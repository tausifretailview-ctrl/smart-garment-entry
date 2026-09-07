import { readFile } from "node:fs/promises";
import path from "path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("premium mobile theme stays opt-in", () => {
  it("scopes Archivo and zero-radius to .ez, not the document", async () => {
    const css = await readFile(path.join(ROOT, "src/index.css"), "utf8");
    expect(css).toMatch(/\.ez,\s*\.ez \* \{[\s\S]*?font-family:\s*"Archivo"/);
    expect(css).toMatch(/\.ez,\s*\.ez \* \{[\s\S]*?border-radius:\s*0 !important/);
    expect(css).not.toMatch(/html(?:\s|,)[^{]*\{[^}]*Archivo/);
    expect(css).not.toMatch(/body[^{]*\{[^}]*Archivo/);
  });

  it("does not preload Archivo on every page load", async () => {
    const html = await readFile(path.join(ROOT, "index.html"), "utf8");
    expect(html).toMatch(/font-family:\s*'Archivo'/);
    expect(html).toMatch(/src:\s*url\('\/fonts\/archivo-latin\.woff2'\)/);
    expect(html).not.toMatch(/rel=["']preload["'][^>]*archivo-latin/);
  });

  it("only mounts the .ez shell when the premium theme is selected", async () => {
    const files = [
      "src/components/mobile/OwnerDashboard.tsx",
      "src/components/mobile/OwnerBottomNav.tsx",
      "src/pages/mobile/MobilePosBilling.tsx",
      "src/pages/mobile/MobilePurchaseEntry.tsx",
    ];
    for (const rel of files) {
      const src = await readFile(path.join(ROOT, rel), "utf8");
      expect(src, rel).toMatch(/theme === ["']premium["']/);
      expect(src, rel).toMatch(/className="ez[\s"]/);
    }
  });

  it("keeps a More-menu toggle without replacing the classic desktop-view row", async () => {
    const more = await readFile(path.join(ROOT, "src/pages/mobile/MobileMoreMenu.tsx"), "utf8");
    expect(more).toMatch(/<MobileThemeToggle \/>/);
    expect(more).toMatch(/DesktopViewToggle variant="menu-row"/);
  });
});
