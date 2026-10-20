import { describe, expect, it, vi } from "vitest";
import { syncFinanceDiscountVoucher } from "./financeDiscountVoucher";

type Op = { op: string; payload?: unknown; filters: Array<unknown[]> };

/** Fake client: the first select returns `existing`, the expense-number lookup returns none. */
function mockClient(existing: Array<{ id: string }>) {
  const ops: Op[] = [];
  let selects = 0;
  const client = {
    from: vi.fn(() => {
      const op: Op = { op: "", filters: [] };
      ops.push(op);
      let result: unknown = { data: null, error: null };
      const chain: Record<string, any> = {
        then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
          Promise.resolve(result).then(resolve, reject),
      };
      chain.select = vi.fn(() => {
        op.op = "select";
        result = { data: selects++ === 0 ? existing : [], error: null };
        return chain;
      });
      chain.update = vi.fn((payload: unknown) => {
        op.op = "update";
        op.payload = payload;
        return chain;
      });
      chain.insert = vi.fn((payload: unknown) => {
        op.op = "insert";
        op.payload = payload;
        return chain;
      });
      for (const name of ["eq", "is", "in", "order", "limit"]) {
        chain[name] = vi.fn((...args: unknown[]) => {
          op.filters.push([name, ...args]);
          return chain;
        });
      }
      return chain;
    }),
  };
  return { client, ops };
}

const base = {
  organizationId: "org-1",
  saleId: "sale-1",
  saleNumber: "POS/26-27/10",
  financerName: "Bajaj",
  voucherDate: "2026-10-20",
};

describe("syncFinanceDiscountVoucher", () => {
  it("inserts one voucher when the bill has none", async () => {
    const { client, ops } = mockClient([]);
    await syncFinanceDiscountVoucher({ ...base, financeDiscount: 500, client: client as any });
    const inserts = ops.filter((o) => o.op === "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload).toMatchObject({
      total_amount: 500,
      reference_id: "sale-1",
      category: "finance_discount",
      voucher_number: "EXP-00001",
    });
  });

  it("updates the existing voucher on an edited bill instead of adding another", async () => {
    const { client, ops } = mockClient([{ id: "v1" }]);
    await syncFinanceDiscountVoucher({ ...base, financeDiscount: 700, client: client as any });
    expect(ops.some((o) => o.op === "insert")).toBe(false);
    const update = ops.find((o) => o.op === "update");
    expect(update?.payload).toMatchObject({ total_amount: 700 });
    expect(update?.filters).toContainEqual(["eq", "id", "v1"]);
  });

  it("removes duplicates left by earlier saves and keeps the oldest", async () => {
    const { client, ops } = mockClient([{ id: "v1" }, { id: "v2" }, { id: "v3" }]);
    await syncFinanceDiscountVoucher({ ...base, financeDiscount: 700, client: client as any });
    const drop = ops.find((o) => o.op === "update" && (o.payload as any)?.deleted_at);
    expect(drop?.filters).toContainEqual(["in", "id", ["v2", "v3"]]);
    const keep = ops.find((o) => o.op === "update" && (o.payload as any)?.total_amount === 700);
    expect(keep?.filters).toContainEqual(["eq", "id", "v1"]);
  });

  it("soft-deletes the voucher when the discount is removed", async () => {
    const { client, ops } = mockClient([{ id: "v1" }]);
    await syncFinanceDiscountVoucher({ ...base, financeDiscount: 0, client: client as any });
    expect(ops.some((o) => o.op === "insert")).toBe(false);
    const drop = ops.find((o) => o.op === "update");
    expect(drop?.filters).toContainEqual(["in", "id", ["v1"]]);
  });
});
