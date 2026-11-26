import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Settings -> Purchase -> "Allow typing the return number" (Nov 2026): Sale Return and Purchase
 * Return show the next SR/ PR number and the user may type their own. The one-step save took
 * the series number every time, so a typed number was replaced. SQL file 54 keeps it.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migrations = resolve(root, "supabase/migrations");
const files = readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort();
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const FILE_54 = "20270528120000_return_number_typed_by_user.sql";

describe("typed return number", () => {
  it("file 54 uses header.manual_return_number, checks it under the lock and never inserts the key", () => {
    const sql = read(`supabase/migrations/${FILE_54}`);
    const lock = sql.indexOf("pg_advisory_xact_lock");
    const manual = sql.indexOf("p_header->>'manual_return_number'");
    expect(lock).toBeGreaterThan(0);
    expect(manual).toBeGreaterThan(lock);
    expect(sql).toMatch(/return_number = \$2 AND deleted_at IS NULL/);
    expect(sql).toContain("USING ERRCODE = '23505'");
    expect(sql).toContain("v_header := (p_header - 'id' - 'manual_return_number')");
    expect(sql).toContain("SECURITY INVOKER");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.save_return_with_items_atomic(text, uuid, jsonb, jsonb) TO authenticated");
  });

  it("no later migration redefines save_return_with_items_atomic without the typed number", () => {
    for (const f of files.filter((x) => x > FILE_54)) {
      const sql = readFileSync(resolve(migrations, f), "utf8");
      if (!/FUNCTION public\.save_return_with_items_atomic\(/.test(sql)) continue;
      expect(sql, f).toContain("manual_return_number");
    }
  });

  it("both return screens keep a changed number instead of taking the next one at save", () => {
    for (const p of ["src/pages/PurchaseReturnEntry.tsx", "src/pages/SaleReturnEntry.tsx"]) {
      const src = read(p);
      expect(src, p).toContain("isManualReturnNumberEnabled(");
      expect(src, p).toContain("typedReturnNumberToSave(");
      expect(src, p).toContain("{ manualReturnNumber: typedReturnNumber }");
      expect(src, p).toContain("readOnly={!canTypeReturnNumber}");
    }
  });
});
