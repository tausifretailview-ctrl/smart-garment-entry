import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(resolve(__dirname, "SaleReturnDashboard.tsx"), "utf8");
const colgroup = src.slice(src.indexOf("<colgroup>"), src.indexOf("</colgroup>"));
const header = src.slice(src.indexOf('<TableHeader className="!static">'), src.indexOf("</TableHeader>"));

/** "w-[6.25rem]" → 6.25; "w-8" → 2 (Tailwind spacing scale). */
function remOf(cls: string): number {
  const arbitrary = /w-\[(\d+(?:\.\d+)?)rem\]/.exec(cls);
  if (arbitrary) return Number(arbitrary[1]);
  const scale = /\bw-(\d+(?:\.\d+)?)\b/.exec(cls);
  return scale ? Number(scale[1]) / 4 : NaN;
}

describe("Sale Return dashboard table fits one screen", () => {
  const always = [...colgroup.matchAll(/^\s*<col className="([^"]+)" \/>/gm)].map((m) => m[1]);
  const alwaysHeads = [...header.matchAll(/^\s{24}<TableHead\b/gm)];

  it("default columns: 9 cols, 9 header cells, and the expanded row spans 9 + optional", () => {
    expect(always.length).toBe(9);
    expect(alwaysHeads.length).toBe(9);
    expect(src).toContain("const tableColSpan = 9 + optionalColumnCount;");
  });

  it("default widths add up to at most 53rem (~1000px at the app's 19px rem)", () => {
    const total = always.reduce((sum, cls) => sum + remOf(cls), 0);
    expect(total).toBeLessThanOrEqual(53);
  });

  it("date sits under the return no and settlement under status (no separate columns)", () => {
    expect(header).toContain(">Return No / Date</TableHead>");
    expect(header).toContain(">Status / Settlement</TableHead>");
    expect(header).not.toMatch(/>Date<\/TableHead>/);
    expect(header).not.toMatch(/>Settlement<\/TableHead>/);
  });

  it("grand total spans match: label over return + customer, then qty / net, rest over 4 + optional", () => {
    expect(src).toContain("colSpan={2 + (columnSettings.phone ? 1 : 0) + (columnSettings.originalSale ? 1 : 0)}");
    expect(src).toContain("colSpan={4 + (columnSettings.adjInvoice ? 1 : 0) + (irnColumn ? 1 : 0)}");
  });

  it("action icons wrap instead of widening the table", () => {
    expect(src).toContain('className="flex flex-wrap justify-end gap-0.5 [&_button]:h-7 [&_button]:w-7"');
  });
});
