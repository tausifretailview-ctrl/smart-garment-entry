import { describe, expect, it } from "vitest";
import { applyCustomerPoints, isMissingApplyPointsRpc, type PointsDb } from "./customerPoints";

/** Loyalty points (Nov 2026): one database step; the old steps only while the SQL is not run. */
function fakeDb(rpcResult: { data: unknown; error: { code?: string; message?: string } | null }, customer = { points_balance: 10, total_points_earned: 50, points_redeemed: 5 }) {
  const calls: Array<{ op: string; table?: string; args?: unknown }> = [];
  const db: PointsDb = {
    rpc: (fn, args) => {
      calls.push({ op: "rpc", table: fn, args });
      return Promise.resolve(rpcResult);
    },
    from: (table) => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: customer, error: null }) }) }),
      update: (patch) => ({
        eq: () => {
          calls.push({ op: "update", table, args: patch });
          return Promise.resolve({ error: null });
        },
      }),
      insert: (row) => {
        calls.push({ op: "insert", table, args: row });
        return Promise.resolve({ error: null });
      },
    }),
  };
  return { db, calls };
}

const base = { organizationId: "org-1", customerId: "c-1", saleId: "s-1", description: "x" };

describe("applyCustomerPoints", () => {
  it("uses the one-step database function", async () => {
    const { db, calls } = fakeDb({ data: { applied: 7, duplicate: false, balance: 17 }, error: null });
    const res = await applyCustomerPoints(db, { ...base, kind: "earned", points: 7 });
    expect(res).toEqual({ mode: "one-step", applied: 7, duplicate: false });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ op: "rpc", table: "apply_customer_points", args: { p_kind: "earned", p_points: 7, p_sale_id: "s-1" } });
  });

  it("reports a bill that already had its points", async () => {
    const { db } = fakeDb({ data: { applied: 0, duplicate: true, balance: 17 }, error: null });
    expect(await applyCustomerPoints(db, { ...base, kind: "earned", points: 7 })).toMatchObject({ applied: 0, duplicate: true });
  });

  it("falls back to the old steps while the SQL is not run", async () => {
    const { db, calls } = fakeDb({ data: null, error: { code: "PGRST202", message: "Could not find the function public.apply_customer_points" } });
    const res = await applyCustomerPoints(db, { ...base, kind: "redeemed", points: 15 });
    expect(res.mode).toBe("steps");
    expect(calls.find((c) => c.op === "insert")?.args).toMatchObject({ transaction_type: "redeemed", points: -15 });
    // Never below 0; all 15 count as redeemed, as before.
    expect(calls.find((c) => c.op === "update")?.args).toEqual({ points_balance: 0, points_redeemed: 20 });
  });

  it("other database errors are not hidden", async () => {
    const { db } = fakeDb({ data: null, error: { code: "42501", message: "permission denied" } });
    await expect(applyCustomerPoints(db, { ...base, kind: "earned", points: 1 })).rejects.toMatchObject({ code: "42501" });
  });

  it("zero points writes nothing", async () => {
    const { db, calls } = fakeDb({ data: null, error: null });
    await applyCustomerPoints(db, { ...base, kind: "earned", points: 0 });
    expect(calls).toHaveLength(0);
  });

  it("recognises the missing function", () => {
    expect(isMissingApplyPointsRpc({ code: "42883" })).toBe(true);
    expect(isMissingApplyPointsRpc({ message: "function apply_customer_points does not exist" })).toBe(true);
    expect(isMissingApplyPointsRpc({ code: "23505", message: "dup" })).toBe(false);
    expect(isMissingApplyPointsRpc(null)).toBe(false);
  });
});
