import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const migration = readFileSync(
  join(root, "supabase/migrations/20261215120000_sale_order_number_race_safe.sql"),
  "utf8",
);
const desktop = readFileSync(join(root, "src/pages/SaleOrderEntry.tsx"), "utf8");
const salesman = readFileSync(join(root, "src/pages/salesman/SalesmanOrderEntry.tsx"), "utf8");

describe("sale order number race-safe allocator", () => {
  it("locks per org+FY, persists GREATEST(seq, live max)+1, and peeks without consuming", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.peek_sale_order_number");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.generate_sale_order_number");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("GREATEST(public.bill_number_sequences.last_number, v_actual_max) + 1");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.peek_sale_order_number(uuid) TO authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.generate_sale_order_number(uuid) TO authenticated");
    expect(migration).toContain("REVOKE EXECUTE ON FUNCTION public.peek_sale_order_number(uuid) FROM PUBLIC");
    expect(migration).toContain("REVOKE EXECUTE ON FUNCTION public.generate_sale_order_number(uuid) FROM PUBLIC");
    expect(migration).toContain("Not authorized for this organization");
    expect(migration).not.toMatch(/LOCK TABLE public\.sale_orders/);
  });

  it("previews with peek and allocates with generate on desktop + salesman save", () => {
    expect(desktop).toContain("peek_sale_order_number");
    expect(desktop).toContain("generate_sale_order_number");
    expect(desktop).toContain("isSaleOrderNumberConflict");
    expect(salesman).toContain("peek_sale_order_number");
    expect(salesman).toContain("generate_sale_order_number");
    expect(salesman).toContain("isSaleOrderNumberConflict");
    expect(salesman).toContain("saleOrderFyPrefixIst");
  });
});
