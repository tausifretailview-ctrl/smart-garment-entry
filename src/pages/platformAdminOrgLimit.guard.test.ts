import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Platform Admin: up to 1000 shops (raised from 100, Nov 2026).
 *
 * Each shop's own barcodes start at organization_number * 10,000,000 + 1001. From shop 215 that
 * is past 2,147,483,647 (the largest INTEGER), so every current function that builds it must
 * multiply as BIGINT, or new shops from number 215 could not generate barcodes.
 */
const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "PlatformAdmin.tsx"), "utf8");
const migrationsDir = join(here, "../../supabase/migrations");

describe("Platform Admin shop limit", () => {
  it("is 1000 and not hard-coded anywhere else on the page", () => {
    expect(page).toContain("const MAX_ORGANIZATIONS = 1000;");
    expect(page).not.toMatch(/>= 100\b|\/ 100<|\b100 - orgCount|Maximum 100 /);
    expect(page).toContain("orgCount >= MAX_ORGANIZATIONS");
  });

  it("counts every shop and member (paged reads, not one capped read)", () => {
    const def = (key: string) => {
      const start = page.indexOf(`queryKey: ["${key}"],\n    queryFn`);
      expect(start, `${key} query`).toBeGreaterThan(-1);
      return page.slice(start, page.indexOf("...DASHBOARD_TAB_RETURN_QUERY_OPTIONS", start));
    };
    expect(def("platform-organizations")).toContain("fetchAllRows(");
    expect(def("platform-members").match(/fetchAllRows\(/g)?.length).toBe(2);
  });

  it("the latest barcode functions build the shop's start number as BIGINT", () => {
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
    const latest = new Map<string, { file: string; body: string }>();
    const fn = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?(\w+)"?\s*\([\s\S]*?\$(\w*)\$([\s\S]*?)\$\2\$/gi;
    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      for (const m of sql.matchAll(fn)) latest.set(m[1].toLowerCase(), { file, body: m[3] });
    }
    const offenders: string[] = [];
    let checked = 0;
    for (const [name, { file, body }] of latest) {
      for (const m of body.matchAll(/\(([^()]*?)\s*\*\s*10000000\)/g)) {
        checked += 1;
        if (!/::\s*bigint/i.test(m[1])) offenders.push(`${name} (${file}): ${m[0]}`);
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
