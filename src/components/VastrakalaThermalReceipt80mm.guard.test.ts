import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const tsx = readFileSync(join(here, "VastrakalaThermalReceipt80mm.tsx"), "utf8");

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

  it("keeps the logo at a balanced medium size without consuming the title row", () => {
    expect(tsx).toContain('logoSize: is58 ? "10mm" : "14mm"');
    expect(tsx).toContain('position: "absolute"');
    expect(tsx).toContain('paddingInline: layout.logoSize');
    expect(tsx).toContain('width: layout.logoSize');
    expect(tsx).toContain('height: layout.logoSize');
  });
});