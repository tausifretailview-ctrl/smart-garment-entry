import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Stock functions must keep decimal quantities (metres, kg). They held quantities in INTEGER
 * variables, which rounded 1.5 to 2 in batch stock and stock history, and dropped 0.4
 * entirely (review item D4). 20270517120000 turns those variables to NUMERIC on the live
 * functions. This keeps it that way:
 *  - every stock function the migration files still define with whole-number quantity
 *    variables is in that migration's list;
 *  - no later migration defines one again with whole numbers.
 */
const DIR = join(process.cwd(), "supabase/migrations");
const PATCH = "20270517120000_stock_triggers_keep_decimal_quantities.sql";
const QTY_VARS = [
  "v_remaining_qty",
  "v_deduct_qty",
  "v_restore_qty",
  "v_current_stock",
  "v_total_sold",
  "v_total_returned",
  "v_qty_difference",
  "v_qty_restored",
];
const WHOLE_NUMBER_QTY = new RegExp(`\\b(${QTY_VARS.join("|")})\\s+(integer|int4|int)\\b`, "i");

type Definition = { file: string; body: string };

function latestDefinitions(files: string[]): Map<string, Definition> {
  const out = new Map<string, Definition>();
  for (const file of files) {
    const sql = readFileSync(join(DIR, file), "utf8");
    const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql))) {
      const rest = sql.slice(m.index);
      const tag = /AS\s+(\$[a-z_]*\$)/i.exec(rest);
      if (!tag) continue;
      const end = rest.indexOf(tag[1], tag.index + tag[0].length);
      out.set(m[1].toLowerCase(), { file, body: rest.slice(0, end < 0 ? undefined : end) });
    }
  }
  return out;
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const patch = readFileSync(join(DIR, PATCH), "utf8");
const listed = new Set(
  [...patch.slice(patch.indexOf("v_functions constant text[]"), patch.indexOf("];")).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]),
);

const touchesStock = (body: string) => /stock_movements|batch_stock|stock_qty/i.test(body);

describe("stock functions keep decimal quantities", () => {
  it("the migration lists 13 functions", () => {
    expect(listed.size).toBe(13);
  });

  it("every stock function still defined with whole-number quantities before it is patched by it", () => {
    const before = latestDefinitions(files.filter((f) => f < PATCH));
    const needing = [...before.entries()]
      .filter(([, d]) => touchesStock(d.body) && WHOLE_NUMBER_QTY.test(d.body))
      .map(([name]) => name)
      .sort();
    expect(needing.length).toBeGreaterThan(0);
    expect(needing.filter((name) => !listed.has(name))).toEqual([]);
  });

  it("no later migration brings whole-number quantities back", () => {
    const after = latestDefinitions(files.filter((f) => f > PATCH));
    const offenders = [...after.entries()]
      .filter(([, d]) => touchesStock(d.body) && WHOLE_NUMBER_QTY.test(d.body))
      .map(([name, d]) => `${name} (${d.file})`);
    expect(offenders).toEqual([]);
  });

  it("the migration only rewrites those declarations and reports the result", () => {
    expect(patch).toContain("pg_get_functiondef(v_fn.oid)");
    expect(patch).toMatch(/regexp_replace\([\s\S]*'\\1numeric'/);
    expect(patch).toContain("IF v_patched IS DISTINCT FROM v_live THEN");
    expect(patch).toContain("STILL WHOLE NUMBERS");
  });
});
