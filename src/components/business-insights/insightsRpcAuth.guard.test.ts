import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("Insights RPC org guards", () => {
  it("closes fail-open uid-is-not-null skip on low-stock and slow-moving", () => {
    const sql = readFileSync(
      join(root, "supabase/migrations/20261128120100_fix_insights_rpc_fail_open.sql"),
      "utf8",
    );
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.get_low_stock_alerts");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.get_slow_moving_stock");
    expect(sql).toContain("auth.role() = 'anon'");
    const bodies = [...sql.matchAll(/AS \$\$([\s\S]*?)\$\$;/g)].map((m) => m[1]);
    expect(bodies.length).toBe(2);
    for (const body of bodies) {
      expect(body).toContain("auth.role() = 'anon'");
      expect(body).not.toMatch(/IF auth\.uid\(\) IS NOT NULL THEN/);
    }
  });
});
