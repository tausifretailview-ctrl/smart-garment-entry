import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ tables: [] as string[], inserted: null as unknown, insertError: null as unknown }));
vi.mock("@/lib/errorLogger", () => ({ logError: vi.fn() }));
vi.mock("@/utils/salesmanCommissionLineRepair", () => ({
  buildSalesmanCommissionRecords: (input: { employees: unknown[]; rules: unknown[] }) =>
    input.employees.length ? [{ employees: input.employees.length, rules: input.rules.length }] : [],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      db.tables.push(table);
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "in"]) b[m] = () => b;
      b.insert = async (rows: unknown) => ((db.inserted = rows), { error: db.insertError });
      const rows: Record<string, unknown[]> = {
        employees: [{ id: "e-db" }],
        commission_rules: [{ id: "r-db" }],
        sale_items: [{ product_id: "p1" }],
        products: [{ id: "p1" }],
      };
      b.then = (resolve: (v: unknown) => void) => resolve({ data: rows[table] ?? [], error: null });
      return b;
    },
  },
}));

import { logError } from "@/lib/errorLogger";
import { recordPosSalesmanCommission } from "@/utils/posSalesmanCommission";

const base = {
  organizationId: "org-1",
  saleId: "s1",
  saleNumber: "POS/1",
  saleDate: "2026-11-15",
  customerName: "RAVI",
  salesmanName: "AMIT",
  totalNetAmount: 100,
};

describe("recordPosSalesmanCommission", () => {
  beforeEach(() => {
    db.tables = [];
    db.inserted = null;
    db.insertError = null;
    vi.mocked(logError).mockClear();
  });

  it("uses the staff and rules POS already has (no re-read)", async () => {
    await recordPosSalesmanCommission({ ...base, employees: [{ id: "e1" }, { id: "e2" }], rules: [] });
    expect(db.tables).not.toContain("employees");
    expect(db.tables).not.toContain("commission_rules");
    expect(db.inserted).toEqual([{ employees: 2, rules: 0 }]);
  });

  it("reads staff and rules itself when not given (phone / offline POS)", async () => {
    await recordPosSalesmanCommission(base);
    expect(db.tables).toEqual(expect.arrayContaining(["employees", "commission_rules", "sale_items", "products"]));
    expect(db.inserted).toEqual([{ employees: 1, rules: 1 }]);
  });

  it("never throws; a failed insert is logged", async () => {
    db.insertError = { message: "denied" };
    await expect(recordPosSalesmanCommission({ ...base, employees: [{ id: "e1" }], rules: [] })).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledTimes(1);
  });
});
