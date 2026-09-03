import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const srcRoot = join(root, "src");

function src(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function walkTsx(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === "integrations") continue;
      out.push(...walkTsx(p));
    } else if (/\.(ts|tsx)$/.test(name.name)) {
      out.push(p);
    }
  }
  return out;
}

/** product_variants select that names current_stock but not stock_qty. */
const LEGACY_ONLY = /\.select\(\s*["'`][^"'`]*current_stock[^"'`]*["'`]\s*\)/;

describe("Phase 8 Daily Sale Analysis stock_qty", () => {
  const page = src("src/pages/DailySaleAnalysis.tsx");

  it("reads stock_qty with org + deleted_at filters", () => {
    expect(page).toContain("canonicalOnHandQty");
    expect(page).toMatch(/select\("id, stock_qty, current_stock,/);
    expect(page).toMatch(/\.eq\("organization_id", orgId\)/);
    expect(page).toMatch(/\.is\("deleted_at", null\)/);
    expect(page).not.toMatch(/select\("id, current_stock, sale_price/);
    expect(page).toContain("canonicalOnHandQty(vd ?? {})");
  });

  it("no product_variants select lists current_stock without stock_qty", () => {
    const hits: string[] = [];
    for (const file of walkTsx(srcRoot)) {
      const text = readFileSync(file, "utf8");
      if (!text.includes("product_variants")) continue;
      if (!LEGACY_ONLY.test(text)) continue;
      const rel = file.slice(root.length + 1);
      if (rel.includes("phase7") || rel.includes("phase8") || rel.includes("canonicalOnHandQty.test")) {
        continue;
      }
      const selectHasStockQty = /select\(\s*["'`][^"'`]*stock_qty[^"'`]*current_stock|select\(\s*["'`][^"'`]*current_stock[^"'`]*stock_qty/.test(
        text,
      );
      if (!selectHasStockQty) hits.push(rel);
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });
});
