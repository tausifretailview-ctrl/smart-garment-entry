import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const xlsxMock = vi.hoisted(() => ({
  utils: {
    aoa_to_sheet: vi.fn(() => ({})),
    book_new: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}));
vi.mock("xlsx", () => xlsxMock);

/**
 * excelImportUtils is imported by Purchase Entry and the party masters for its pure
 * helpers. A static `xlsx` import here puts ~430 KB of SheetJS on the first-open
 * download of those screens ("Taking longer than expected" on a cold open).
 */
describe("excelImportUtils keeps SheetJS off the static import graph", () => {
  const source = readFileSync(resolve(__dirname, "excelImportUtils.ts"), "utf8");

  it("only imports xlsx types statically", () => {
    const staticImports = source
      .split("\n")
      .filter((line) => /^import\s/.test(line) && /['"]xlsx['"]/.test(line));
    expect(staticImports.length).toBeGreaterThan(0);
    for (const line of staticImports) {
      expect(line).toMatch(/^import\s+type\s/);
    }
  });

  it("loads xlsx on demand", () => {
    expect(source).toMatch(/import\(\s*['"]xlsx['"]\s*\)/);
  });
});

describe("excelImportUtils helpers work without loading xlsx", () => {
  it("exposes pure helpers synchronously", async () => {
    const mod = await import("./excelImportUtils");
    expect(mod.normalizeImportBarcode("000000191")).toBe("000000191");
    expect(mod.roundMoney(10.005)).toBeCloseTo(10.01, 2);
  });

  it("generateSampleExcel builds and writes a workbook via the lazy module", async () => {
    const { generateSampleExcel } = await import("./excelImportUtils");
    await generateSampleExcel(
      [{ key: "a", label: "A", type: "text" }] as never,
      "sample.xlsx",
      [{ a: "x" }],
    );
    expect(xlsxMock.utils.aoa_to_sheet).toHaveBeenCalledWith([["A"], ["x"]]);
    expect(xlsxMock.writeFile).toHaveBeenCalledWith(expect.anything(), "sample.xlsx");
  });
});
