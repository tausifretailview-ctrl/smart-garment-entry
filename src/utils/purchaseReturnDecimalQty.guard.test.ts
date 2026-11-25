import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * purchase_return_items.qty is NUMERIC(10,3), but update_purchase_return_items read qty as
 * ::integer, so saving an edited purchase return with a decimal quantity failed with
 * "invalid input syntax for type integer" (Nov 2026). gst_per was INTEGER, so a decimal GST
 * failed every save. SQL file 33 fixes both; a later rewrite must not bring ::integer back.
 */
const migrations = resolve(dirname(fileURLToPath(import.meta.url)), "../../supabase/migrations");
const files = readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort();
const read = (f: string) => readFileSync(resolve(migrations, f), "utf8");

describe("purchase return: decimal quantity and GST", () => {
  it("file 33 reads qty as numeric and widens gst_per", () => {
    const sql = read("20270525120000_purchase_return_decimal_qty_gst.sql");
    expect(sql).toContain("'(item->>''qty'')::numeric'");
    expect(sql).toContain("'(v_item->>''qty'')::numeric'");
    expect(sql).toContain("ALTER COLUMN gst_per TYPE numeric(5,2)");
  });

  it("no migration after file 33 defines update_purchase_return_items with an integer qty", () => {
    const after = files.filter((f) => f > "20270525120000");
    for (const f of after) {
      const sql = read(f);
      if (!/FUNCTION public\.update_purchase_return_items\(/.test(sql)) continue;
      expect(sql, f).not.toMatch(/'qty'\)::integer/);
    }
  });
});
