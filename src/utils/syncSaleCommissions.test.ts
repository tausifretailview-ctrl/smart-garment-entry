import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  inserted: [] as Row[],
  deletedIds: [] as string[],
  deleteFilters: [] as string[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const filters: Array<(r: Row) => boolean> = [];
      let op: "select" | "delete" = "select";
      const b: Record<string, any> = {};
      b.select = () => b;
      b.order = () => b;
      b.eq = (c: string, v: unknown) => (filters.push((r) => r[c] === undefined || r[c] === v), b);
      b.neq = (c: string, v: unknown) => (db.deleteFilters.push(`${c}!=${v}`), filters.push((r) => r[c] !== v), b);
      b.is = (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b);
      b.in = (c: string, vals: unknown[]) => {
        filters.push((r) => vals.includes(r[c]));
        if (op === "delete") {
          db.deletedIds.push(...(db.tables[table] ?? []).filter((r) => filters.every((f) => f(r))).map((r) => String(r.id)));
          return Promise.resolve({ error: null });
        }
        return b;
      };
      b.delete = () => ((op = "delete"), b);
      b.insert = async (rows: Row[]) => (db.inserted.push(...rows), { error: null });
      const rows = () => (db.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      b.range = async () => ({ data: rows(), error: null });
      b.then = (resolve: (v: unknown) => void) => resolve({ data: rows(), error: null });
      return b;
    },
  },
}));

import { istDay, syncSaleCommissions } from "./syncSaleCommissions";

const sale = (id: string, extra: Row = {}) => ({
  id, organization_id: "org", sale_number: `POS/${id}`, sale_date: "2026-11-05T20:00:00Z", customer_name: "RAVI",
  salesman: "ARYAN", net_amount: 1000, sale_type: "pos", deleted_at: null, is_cancelled: false, ...extra,
});
const item = (id: string, saleId: string, extra: Row = {}) => ({
  id, sale_id: saleId, organization_id: "org", product_id: "p1", product_name: "SAREE", quantity: 1,
  line_total: 1000, discount_share: 0, net_after_discount: 1000, salesman: null, deleted_at: null, ...extra,
});
const employees = [
  { id: "e-aryan", employee_name: "ARYAN", commission_percent: 2 },
  { id: "e-jiya", employee_name: "JIYA", commission_percent: 1 },
];

describe("syncSaleCommissions (commission rows follow the bill)", () => {
  beforeEach(() => {
    db.inserted = [];
    db.deletedIds = [];
    db.deleteFilters = [];
    db.tables = { products: [{ id: "p1", organization_id: "org", brand: "B", category: "SAREE", style: null }] };
  });

  it("a bill with a salesman and no rows gets its rows (held / edited / Sale Bill)", async () => {
    db.tables.sales = [sale("s1"), sale("s2", { sale_type: "invoice" })];
    db.tables.sale_items = [item("i1", "s1"), item("i2", "s2")];
    db.tables.salesman_commissions = [];
    const r = await syncSaleCommissions("org", ["s1", "s2"], { employees, rules: [] });
    expect(r).toMatchObject({ bills: 2, rows: 2, paidKept: 0, noSalesmanBills: 0 });
    expect(db.inserted[0]).toMatchObject({
      sale_id: "s1", employee_id: "e-aryan", employee_name: "ARYAN", sale_amount: 1000, commission_amount: 20,
      sale_date: "2026-11-06", payment_status: "pending",
    });
  });

  it("per-line salesman without a header salesman still earns", async () => {
    db.tables.sales = [sale("s1", { salesman: null })];
    db.tables.sale_items = [item("i1", "s1", { salesman: "JIYA" }), item("i2", "s1")];
    db.tables.salesman_commissions = [];
    const r = await syncSaleCommissions("org", ["s1"], { employees, rules: [] });
    expect(db.inserted.map((x) => x.employee_name)).toEqual(["JIYA"]);
    expect(r.noSalesmanBills).toBe(0);
  });

  it("an edited bill: new rows in, old pending rows out", async () => {
    db.tables.sales = [sale("s1", { salesman: "JIYA" })];
    db.tables.sale_items = [item("i1", "s1")];
    db.tables.salesman_commissions = [{ id: "c-old", sale_id: "s1", organization_id: "org", payment_status: "pending" }];
    await syncSaleCommissions("org", ["s1"], { employees, rules: [] });
    expect(db.inserted.map((x) => x.employee_name)).toEqual(["JIYA"]);
    expect(db.deletedIds).toEqual(["c-old"]);
    expect(db.deleteFilters).toContain("payment_status!=paid");
  });

  it("a bill whose commission is already paid is left exactly as it is", async () => {
    db.tables.sales = [sale("s1")];
    db.tables.sale_items = [item("i1", "s1")];
    db.tables.salesman_commissions = [
      { id: "c1", sale_id: "s1", organization_id: "org", payment_status: "paid" },
      { id: "c2", sale_id: "s1", organization_id: "org", payment_status: "pending" },
    ];
    const r = await syncSaleCommissions("org", ["s1"], { employees, rules: [] });
    expect(r).toMatchObject({ bills: 0, rows: 0, paidKept: 1 });
    expect(db.inserted).toEqual([]);
    expect(db.deletedIds).toEqual([]);
  });

  it("cancelled bills and delivery challans keep no pending rows; no-salesman bills are counted", async () => {
    db.tables.sales = [
      sale("s1", { is_cancelled: true }),
      sale("s2", { sale_type: "delivery_challan" }),
      sale("s3", { salesman: null, net_amount: 750 }),
    ];
    db.tables.sale_items = [item("i1", "s1"), item("i2", "s2"), item("i3", "s3")];
    db.tables.salesman_commissions = [{ id: "c1", sale_id: "s1", organization_id: "org", payment_status: "pending" }];
    const r = await syncSaleCommissions("org", ["s1", "s2", "s3"], { employees, rules: [] });
    expect(db.inserted).toEqual([]);
    expect(db.deletedIds).toEqual(["c1"]);
    expect(r).toMatchObject({ bills: 1, rows: 0, noSalesmanBills: 1, noSalesmanAmount: 750 });
  });

  it("India calendar day for the row", () => {
    expect(istDay("2026-11-30T19:00:00Z")).toBe("2026-12-01");
    expect(istDay("2026-11-30T10:00:00Z")).toBe("2026-11-30");
  });
});
