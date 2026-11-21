import { readFile } from "node:fs/promises";
import path from "path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("mobile app look stays scoped to .ez", () => {
  it("styles only .ez screens: no document-wide font, radius or shadow reset", async () => {
    const all = await readFile(path.join(ROOT, "src/index.css"), "utf8");
    const css = all.slice(all.indexOf("EZZY MOBILE APP — design tokens"));
    expect(css.length).toBeGreaterThan(1000);
    expect(css).toMatch(/\.ez \{ background: var\(--ez-ground\)/);
    // The Field Sales look: rounded cards with a soft shadow (the square, shadowless reset is gone).
    expect(css).not.toMatch(/border-radius:\s*0 !important/);
    expect(css).not.toMatch(/box-shadow:\s*none !important/);
    expect(css).toMatch(/\.ez-card \{[\s\S]*?border-radius: var\(--ez-radius\)[\s\S]*?box-shadow: var\(--ez-card-shadow\)/);
    expect(css).not.toMatch(/html(?:\s|,)[^{]*\{[^}]*Archivo/);
    expect(css).not.toMatch(/body[^{]*\{[^}]*Archivo/);
  });

  it("turns motion off when the phone asks for reduced motion", async () => {
    const css = await readFile(path.join(ROOT, "src/index.css"), "utf8");
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.ez-enter,[\s\S]*?\.mobile-page-enter \{ animation: none !important; \}/,
    );
  });

  it("does not preload Archivo on every page load", async () => {
    const html = await readFile(path.join(ROOT, "index.html"), "utf8");
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

  it("paints the Home header as a blue gradient band with a Today / This month switch", async () => {
    const css = await readFile(path.join(ROOT, "src/index.css"), "utf8");
    const home = await readFile(path.join(ROOT, "src/components/mobile/OwnerDashboard.tsx"), "utf8");
    const shell = await readFile(path.join(ROOT, "src/components/mobile/premium/index.tsx"), "utf8");
    expect(css).toMatch(/\.ez-shell[\s\S]*?background:\s*var\(--ez-shell-grad\)\s*!important/);
    expect(shell).toMatch(/className="ez-shell/);
    // Headers clear the status bar in the Android app (inset or fallback).
    expect(shell).toContain("FIELD_SALES_SAFE_TOP");
    expect(home).toMatch(/setHeroPeriod/);
    expect(home).toMatch(/This month/);
    expect(home).toMatch(/fetchErpDashboardStatsAfterSr<ErpDashboardStats>\(orgId, statsStart, statsEnd(, (hideDc|\{ hideDc, onlyDc \}))?\)/);
  });

  it("bill entry screens are full-screen in the app look: no bottom bar, Save not covered", async () => {
    const { isMobileEntryScreenPath } = await import("./mobileShell");
    expect(isMobileEntryScreenPath("/demo/mobile-pos")).toBe(true);
    expect(isMobileEntryScreenPath("/demo/mobile-purchase-entry")).toBe(true);
    expect(isMobileEntryScreenPath("/demo/mobile-sales")).toBe(false);
    expect(isMobileEntryScreenPath("/demo/mobile-dashboard")).toBe(false);
    const nav = await readFile(path.join(ROOT, "src/components/mobile/OwnerBottomNav.tsx"), "utf8");
    expect(nav).toMatch(/isMobileEntryScreenPath\(location\.pathname\)\) return null/);
    // Home must not light up on every screen ("/" as a prefix matches everything).
    expect(nav).toMatch(/if \(p === "\/"\) return false/);
  });
});
