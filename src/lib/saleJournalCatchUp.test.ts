import { describe, expect, it, vi } from "vitest";
import {
  JOURNAL_CATCH_UP_BATCH,
  findPurchasesNeedingJournal,
  findSalesNeedingJournal,
  journalCatchUpWindow,
  runPurchaseJournalCatchUp,
  runSaleJournalCatchUp,
} from "./saleJournalCatchUp";

type Call = { table: string; ops: Array<[string, unknown[]]> };

function fakeClient(rows: unknown[]) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "in", "gt", "gte", "lte", "order", "update"]) {
        q[m] = (...args: unknown[]) => {
          call.ops.push([m, args]);
          return q;
        };
      }
      q.limit = (...args: unknown[]) => {
        call.ops.push(["limit", args]);
        return Promise.resolve({ data: rows, error: null });
      };
      q.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
      return q;
    },
  };
  return { client: client as never, calls };
}

const NOW = Date.parse("2026-11-12T10:00:00Z");

describe("sale journal catch-up", () => {
  it("looks only at the last 48 hours, at least 2 minutes old", () => {
    expect(journalCatchUpWindow(NOW)).toEqual({ from: "2026-11-10T10:00:00.000Z", to: "2026-11-12T09:58:00.000Z" });
  });

  it("asks for pending / failed live bills of the shop, oldest first, in a small batch", async () => {
    const { client, calls } = fakeClient([]);
    await findSalesNeedingJournal(client, "org", NOW);
    const ops = calls[0].ops;
    expect(calls[0].table).toBe("sales");
    expect(ops).toContainEqual(["eq", ["organization_id", "org"]]);
    expect(ops).toContainEqual(["in", ["journal_status", ["pending", "failed"]]]);
    expect(ops).toContainEqual(["is", ["deleted_at", null]]);
    expect(ops).toContainEqual(["gt", ["net_amount", 0]]);
    expect(ops).toContainEqual(["gte", ["created_at", "2026-11-10T10:00:00.000Z"]]);
    expect(ops).toContainEqual(["lte", ["created_at", "2026-11-12T09:58:00.000Z"]]);
    expect(ops).toContainEqual(["limit", [JOURNAL_CATCH_UP_BATCH]]);
  });

  it("leaves held bills out", async () => {
    const { client } = fakeClient([
      { id: "a", payment_status: "completed", sale_number: "POS/26-27/1" },
      { id: "b", payment_status: "hold", sale_number: "POS/26-27/2" },
    ]);
    expect((await findSalesNeedingJournal(client, "org", NOW)).map((r) => r.id)).toEqual(["a"]);
  });

  it("posts each bill with the shared builder and records the outcome", async () => {
    const { client, calls } = fakeClient([
      { id: "a", sale_date: "2026-11-12T08:00:00", payment_status: "completed", sale_number: "POS/1" },
      { id: "b", sale_date: "2026-11-12", payment_status: "pending", sale_number: "POS/2" },
    ]);
    const post = vi.fn(async (saleId: string) => {
      if (saleId === "b") throw new Error("Missing Tally v2 chart accounts");
    });
    const r = await runSaleJournalCatchUp(client, "org", post, NOW);
    expect(r).toEqual({ checked: 2, posted: 1, failed: 1 });
    expect(post).toHaveBeenCalledWith("a", "org", "2026-11-12");
    const updates = calls.filter((c) => c.ops.some(([m]) => m === "update")).map((c) => c.ops.find(([m]) => m === "update")?.[1][0]);
    expect(updates).toEqual([
      { journal_status: "posted", journal_error: null },
      { journal_status: "failed", journal_error: "Missing Tally v2 chart accounts" },
    ]);
  });
});

describe("purchase journal catch-up", () => {
  it("asks for pending / failed live purchase bills in the same window", async () => {
    const { client, calls } = fakeClient([]);
    await findPurchasesNeedingJournal(client, "org", NOW);
    const ops = calls[0].ops;
    expect(calls[0].table).toBe("purchase_bills");
    expect(ops).toContainEqual(["in", ["journal_status", ["pending", "failed"]]]);
    expect(ops).toContainEqual(["eq", ["is_cancelled", false]]);
    expect(ops).toContainEqual(["gte", ["created_at", "2026-11-10T10:00:00.000Z"]]);
    expect(ops).toContainEqual(["lte", ["created_at", "2026-11-12T09:58:00.000Z"]]);
  });

  it("posts with net, paid and bill date, and records the outcome", async () => {
    const { client, calls } = fakeClient([
      { id: "p1", bill_date: "2026-11-12", net_amount: 5000, paid_amount: 1000 },
      { id: "p2", bill_date: "2026-11-11", net_amount: 800, paid_amount: null },
    ]);
    const post = vi.fn(async (billId: string) => {
      if (billId === "p2") throw new Error("Missing chart account 2000");
    });
    expect(await runPurchaseJournalCatchUp(client, "org", post, NOW)).toEqual({ checked: 2, posted: 1, failed: 1 });
    expect(post).toHaveBeenCalledWith("p1", "org", 5000, 1000, "2026-11-12");
    expect(post).toHaveBeenCalledWith("p2", "org", 800, 0, "2026-11-11");
    const updates = calls
      .filter((c) => c.table === "purchase_bills" && c.ops.some(([m]) => m === "update"))
      .map((c) => c.ops.find(([m]) => m === "update")?.[1][0]);
    expect(updates).toEqual([
      { journal_status: "posted", journal_error: null },
      { journal_status: "failed", journal_error: "Missing chart account 2000" },
    ]);
  });
});
