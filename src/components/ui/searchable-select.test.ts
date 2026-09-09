import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SEARCHABLE_SELECT_TRIGGER_CLASS } from "./searchable-select";

const here = dirname(fileURLToPath(import.meta.url));

describe("SearchableSelect trigger", () => {
  it("does not shrink on click — the chevron sits on the right edge and scale makes mouseup miss", () => {
    expect(SEARCHABLE_SELECT_TRIGGER_CLASS).toContain("active:scale-100");
    expect(SEARCHABLE_SELECT_TRIGGER_CLASS).toContain("min-w-0");
  });

  it("keeps the chevron inside the button click target", () => {
    const src = readFileSync(resolve(here, "searchable-select.tsx"), "utf8");
    expect(src).toContain("pointer-events-none");
    expect(src).toContain("ChevronDown");
    expect(src).not.toMatch(/<ChevronsUpDown/);
    expect(src).toContain('type="button"');
    expect(src).toContain("onMouseDown={(e) => e.preventDefault()}");
  });
});

describe("Stock Report filter row", () => {
  it("lets grid cells shrink so the select chevron is not clipped", () => {
    const src = readFileSync(resolve(here, "../../pages/StockReport.tsx"), "utf8");
    expect(src).toMatch(/grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 min-w-0/);
    expect(src).toContain('<div className="space-y-0.5 relative min-w-0">');
  });
});
