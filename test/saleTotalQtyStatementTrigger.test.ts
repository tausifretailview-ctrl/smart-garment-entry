import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * sales.total_qty is kept by statement triggers on sale_items (20270519120000): once per
 * save, not once per line (review item D9: a 100-line bill rewrote its bill row 100 times).
 * No later migration may bring the per-line trigger back.
 */
const DIR = join(process.cwd(), "supabase/migrations");
const FILE = "20270519120000_sale_total_qty_once_per_save.sql";
const sql = readFileSync(join(DIR, FILE), "utf8");

describe("bill total quantity is worked out once per save", () => {
  it("replaces the per-line trigger with three statement triggers using transition tables", () => {
    expect(sql).toContain("DROP TRIGGER IF EXISTS trg_update_sale_total_qty ON public.sale_items;");
    for (const [name, event, ref] of [
      ["trg_sale_total_qty_ins", "AFTER INSERT", "REFERENCING NEW TABLE AS new_rows"],
      ["trg_sale_total_qty_upd", "AFTER UPDATE", "REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows"],
      ["trg_sale_total_qty_del", "AFTER DELETE", "REFERENCING OLD TABLE AS old_rows"],
    ]) {
      const at = sql.indexOf(`CREATE TRIGGER ${name}`);
      expect(at, name).toBeGreaterThan(-1);
      const def = sql.slice(at, sql.indexOf(";", at));
      expect(def).toContain(event);
      expect(def).toContain(ref);
      expect(def).toContain("FOR EACH STATEMENT");
    }
  });

  it("writes total_qty only where it changed, and counts only lines not deleted", () => {
    expect(sql.match(/AND s\.total_qty IS DISTINCT FROM t\.qty/g)).toHaveLength(3);
    expect(sql.match(/si\.deleted_at IS NULL/g)).toHaveLength(3);
  });

  it("no later migration creates the per-line trigger again", () => {
    const later = readdirSync(DIR).filter((f) => f.endsWith(".sql") && f > FILE);
    const offenders = later.filter((f) => /CREATE\s+TRIGGER\s+trg_update_sale_total_qty\b/i.test(readFileSync(join(DIR, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});
