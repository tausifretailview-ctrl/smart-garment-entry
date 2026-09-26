import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const tsx = readFileSync(join(here, "VastrakalaThermalReceipt80mm.tsx"), "utf8");
const css = readFileSync(join(here, "../styles/vastrakala-thermal-receipt.css"), "utf8");

describe("Vastrakala 80mm receipt layout", () => {
  it("does not print the former subtitle below the shop name", () => {
    expect(tsx).not.toContain("shopHeader.tagline");
    expect(tsx).not.toContain(">Sarees & ladies wear<");
  });

  it("uses BILL OF SUPPLY as the standard retail document heading", () => {
    expect(tsx).toContain('customTitle || "BILL OF SUPPLY"');
    expect(tsx.indexOf('className="vk-doc-title"')).toBeLessThan(
      tsx.indexOf('className="vk-meta vk-section"'),
    );
  });

  it("adds compact, consistent spacing between all receipt sections", () => {
    expect(tsx).toContain("sectionGap: is58 ? 4 : 7");
    expect(tsx).toContain('className="vk-header vk-section"');
    expect(tsx).toContain('className="vk-meta vk-section"');
    expect(tsx).toContain('className="vk-items-body"');
    expect(tsx).toContain('className="vk-totals vk-section"');
    expect(tsx).toContain('className="vk-terms vk-section"');
  });

  it("keeps the logo in its own column beside the shop details, never over them", () => {
    expect(tsx).toContain('logoHeight: is58 ? "15mm" : "24mm"');
    expect(tsx).not.toContain('position: "absolute"');
    expect(tsx).toContain('className="vk-header-brand-row"');
    expect(tsx).toContain('flex: "0 0 auto"');
    // Name, address, contact and Instagram all sit in the column next to the logo.
    const shop = tsx.slice(tsx.indexOf("const shopDetails"), tsx.indexOf("if (!settings)"));
    expect(shop).toContain("VastrakalaHeaderBrandText");
    expect(shop).toContain("address.toUpperCase()");
    expect(shop).toContain("CONTACT :");
    expect(shop).toContain("instagramHandle");
  });

  it("pins the printed logo height so print CSS `height: auto` can't enlarge it", () => {
    expect(css).toMatch(/\.vk-header-logo \{[^}]*height: var\(--vk-logo-h, 24mm\) !important/);
    expect(css).toMatch(/\.vk-header-logo \{[^}]*width: auto !important/);
    // Inline fallback: width derived from the logo's shape, since height is forced to auto in print.
    expect(tsx).toContain("naturalWidth / naturalHeight");
  });
});
