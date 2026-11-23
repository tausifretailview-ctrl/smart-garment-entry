import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Review item D7: the functions that take stock from a variant's batches, oldest first, lock
 * those batches (20270522120000). Without the lock two counters selling the last pieces of one
 * batch at the same moment both took them and pushed the batch below zero (reproduced on a
 * local Postgres: batch 2 -> -2 before, 2 -> 0 and the next batch used after).
 */
const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20270522120000_batch_stock_locked_while_taking_stock.sql"),
  "utf8",
);

/** Same pattern as the migration's regexp_replace (Postgres \s = JS \s here). */
const UNLOCKED_LOOP =
  /FROM\s+(public\.)?batch_stock\s+WHERE\s+variant_id\s*=\s*[A-Za-z_.]+\s+AND\s+quantity\s*>\s*0\s+ORDER\s+BY\s+purchase_date\s+ASC(\s+LOOP)/gi;

/** Where each patched function was last defined in full in the repository. */
const LAST_DEFINED: Record<string, string> = {
  update_stock_on_sale: "20270210120000_allow_negative_stock_sale.sql",
  deduct_stock_on_purchase_return: "20260928140000_service_product_stock_guards.sql",
  handle_sale_return_item_delete: "20260928140000_service_product_stock_guards.sql",
  restore_sale: "20260423155426_2880dcda-ec3e-4299-9b81-facb3e0f1f79.sql",
  restore_purchase_return: "20260410052716_fe414edb-6fc4-4b91-9c91-7dcc9fbcbff3.sql",
  soft_delete_sale_return: "20260410052716_fe414edb-6fc4-4b91-9c91-7dcc9fbcbff3.sql",
};

function functionBody(file: string, name: string): string {
  const text = readFileSync(join(process.cwd(), "supabase/migrations", file), "utf8");
  const start = text.search(new RegExp(`CREATE OR REPLACE FUNCTION (public\\.)?${name}\\(`, "i"));
  expect(start, `${name} in ${file}`).toBeGreaterThan(-1);
  const rest = text.slice(start);
  const end = rest.search(/\n\$(function)?\$\s*;/);
  return end > -1 ? rest.slice(0, end) : rest;
}

describe("batch stock is locked while stock is taken from it", () => {
  it("patches exactly the six functions that take stock oldest batch first", () => {
    for (const name of Object.keys(LAST_DEFINED)) expect(migration).toContain(`'${name}'`);
    expect(migration).toContain("'\\1 FOR UPDATE\\3'");
  });

  it("finds the oldest-first batch loop in each function's last full definition", () => {
    for (const [name, file] of Object.entries(LAST_DEFINED)) {
      const body = functionBody(file, name);
      const matches = body.match(UNLOCKED_LOOP) ?? [];
      expect(matches.length, name).toBeGreaterThan(0);
      const patched = body.replace(UNLOCKED_LOOP, (m, _schema, loop: string) => m.slice(0, m.length - loop.length) + " FOR UPDATE" + loop);
      expect(patched.match(UNLOCKED_LOOP), name).toBeNull();
      expect(patched, name).toMatch(/ORDER\s+BY\s+purchase_date\s+ASC FOR UPDATE\s+LOOP/i);
    }
  });

  it("reports each function after the patch", () => {
    expect(migration).toContain("'locks batches'");
    expect(migration).toContain("'NOT LOCKED'");
  });
});
