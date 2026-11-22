import { describe, expect, it } from "vitest";
import { isDuplicateSaleRequest, saveSaleWithItemsNumbered } from "./saveSaleAtomic";

const duplicate = { code: "23505", message: 'duplicate key value violates unique constraint "uq_sales_client_request"' };
const numbering = { kind: "pos" } as never;
const items = [{ variant_id: "v1", quantity: 1 }, { variant_id: "v2", quantity: 2 }];
const reply = (id: string, number: string) => ({ sale: { id, sale_number: number, net_amount: 500 }, items_inserted: 2, dropped_sale_keys: [], dropped_item_keys: [] });

function fakeClient(opts: {
  rpcResults: Array<{ data?: unknown; error?: unknown }>;
  existing?: Record<string, unknown> | null;
  existingLines?: number;
}) {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const reads: string[] = [];
  const client = {
    rpc: async (_fn: string, args: Record<string, unknown>) => {
      rpcCalls.push(args);
      const r = opts.rpcResults[rpcCalls.length - 1] ?? {};
      return { data: r.data ?? null, error: r.error ?? null };
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => (reads.push(table), { data: opts.existing ?? null, error: null }) }),
          is: async () => (reads.push(table), { count: opts.existingLines ?? 0, error: null }),
        }),
      }),
    }),
  };
  return { client: client as never, rpcCalls, reads };
}

const handling = (same: boolean) => {
  const asked: Array<Record<string, unknown>> = [];
  return { asked, isSameBill: (existing: Record<string, unknown>) => (asked.push(existing), same), freshRequestId: () => "req-2" };
};

/** Review item B6: a bill whose save reply was lost is not saved a second time. */
describe("saveSaleWithItemsNumbered with a request id", () => {
  it("a normal save sends the request id and asks nothing", async () => {
    const { client, rpcCalls } = fakeClient({ rpcResults: [{ data: reply("s1", "POS/1") }] });
    const h = handling(true);
    const r = await saveSaleWithItemsNumbered(client, "org1", { net_amount: 500, client_request_id: "req-1" }, items, numbering, h);
    expect(r?.saleNumber).toBe("POS/1");
    expect(r?.recovered).toBeUndefined();
    expect((rpcCalls[0].p_sale as Record<string, unknown>).client_request_id).toBe("req-1");
    expect(h.asked).toEqual([]);
  });

  it("same bill sent again: the saved bill is returned and nothing new is written", async () => {
    const saved = { id: "s1", sale_number: "POS/1", net_amount: 500 };
    const { client, rpcCalls, reads } = fakeClient({ rpcResults: [{ error: duplicate }], existing: saved, existingLines: 2 });
    const h = handling(true);
    const r = await saveSaleWithItemsNumbered(client, "org1", { net_amount: 500, client_request_id: "req-1" }, items, numbering, h);
    expect(rpcCalls).toHaveLength(1);
    expect(reads).toEqual(["sales", "sale_items"]);
    expect(h.asked).toEqual([saved]);
    expect(r).toMatchObject({ sale: saved, saleNumber: "POS/1", itemsInserted: 2, recovered: true, settledInSave: false });
  });

  it("the cashier says it is a different sale: saved as a new bill with a new request id", async () => {
    const { client, rpcCalls } = fakeClient({
      rpcResults: [{ error: duplicate }, { data: reply("s2", "POS/2") }],
      existing: { id: "s1", sale_number: "POS/1" },
      existingLines: 2,
    });
    const r = await saveSaleWithItemsNumbered(client, "org1", { net_amount: 500, client_request_id: "req-1" }, items, numbering, handling(false));
    expect(rpcCalls).toHaveLength(2);
    expect((rpcCalls[1].p_sale as Record<string, unknown>).client_request_id).toBe("req-2");
    expect(r).toMatchObject({ saleNumber: "POS/2" });
    expect(r?.recovered).toBeUndefined();
  });

  it("a saved bill with other lines is never taken for this one: a new bill is saved without asking", async () => {
    const { client, rpcCalls } = fakeClient({
      rpcResults: [{ error: duplicate }, { data: reply("s2", "POS/2") }],
      existing: { id: "s1", sale_number: "POS/1" },
      existingLines: 5,
    });
    const h = handling(true);
    const r = await saveSaleWithItemsNumbered(client, "org1", { client_request_id: "req-1" }, items, numbering, h);
    expect(h.asked).toEqual([]);
    expect(rpcCalls).toHaveLength(2);
    expect(r?.saleNumber).toBe("POS/2");
  });

  it("other errors are thrown as before; without a request id a duplicate is thrown too", async () => {
    const stock = { code: "P0001", message: "Insufficient stock" };
    const a = fakeClient({ rpcResults: [{ error: stock }] });
    await expect(saveSaleWithItemsNumbered(a.client, "org1", { client_request_id: "req-1" }, items, numbering, handling(true))).rejects.toBe(stock);
    const b = fakeClient({ rpcResults: [{ error: duplicate }] });
    await expect(saveSaleWithItemsNumbered(b.client, "org1", {}, items, numbering, handling(true))).rejects.toBe(duplicate);
    const c = fakeClient({ rpcResults: [{ error: duplicate }] });
    await expect(saveSaleWithItemsNumbered(c.client, "org1", { client_request_id: "req-1" }, items, numbering)).rejects.toBe(duplicate);
  });

  it("only the request-id rule counts as a repeated bill", () => {
    expect(isDuplicateSaleRequest(duplicate)).toBe(true);
    expect(isDuplicateSaleRequest({ code: "23505", message: 'violates unique constraint "uq_sales_org_sale_number_active"' })).toBe(false);
    expect(isDuplicateSaleRequest(null)).toBe(false);
  });
});
