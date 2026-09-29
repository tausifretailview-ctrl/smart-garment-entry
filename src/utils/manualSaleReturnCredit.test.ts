import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureCn = vi.fn();
const journal = vi.fn();
vi.mock("@/utils/ensureCreditNoteForSaleReturn", () => ({
  ensureCreditNoteForSaleReturn: (...a: unknown[]) => ensureCn(...a),
}));
vi.mock("@/utils/accounting/journalService", () => ({
  recordSaleReturnJournalEntry: (...a: unknown[]) => journal(...a),
}));
vi.mock("@/utils/accounting/isAccountingEngineEnabled", () => ({
  isAccountingEngineEnabled: (row: { accounting_engine_enabled?: boolean } | null) => row?.accounting_engine_enabled === true,
}));

import { createManualSaleReturnCredit, manualSrShortfall } from "./manualSaleReturnCredit";

type Op = { table: string; op: string; payload?: unknown; filters: Array<[string, unknown]> };

function fakeClient(opts: { accounting?: boolean } = {}) {
  const ops: Op[] = [];
  const client = {
    rpc: vi.fn(async () => ({ data: "SR/26-27/9", error: null })),
    from(table: string) {
      const op: Op = { table, op: "select", filters: [] };
      ops.push(op);
      const chain: Record<string, unknown> = {
        insert(payload: unknown) { op.op = "insert"; op.payload = payload; return chain; },
        update(payload: unknown) { op.op = "update"; op.payload = payload; return chain; },
        delete() { op.op = "delete"; return chain; },
        select() { return chain; },
        eq(k: string, v: unknown) { op.filters.push([k, v]); return chain; },
        single: async () => ({ data: { id: "sr-1", return_number: "SR/26-27/9" }, error: null }),
        maybeSingle: async () => ({ data: { accounting_engine_enabled: opts.accounting === true }, error: null }),
        then(resolve: (v: unknown) => unknown) { return Promise.resolve({ data: null, error: null }).then(resolve); },
      };
      return chain;
    },
  };
  return { client, ops };
}

describe("manualSrShortfall", () => {
  it("is only what the saved credit does not cover", () => {
    expect(manualSrShortfall(500, 0)).toBe(500);
    expect(manualSrShortfall(500, 200)).toBe(300);
    expect(manualSrShortfall(500, 600)).toBe(0);
  });
});

describe("createManualSaleReturnCredit", () => {
  beforeEach(() => {
    ensureCn.mockReset();
    journal.mockReset();
  });

  it("inserts an amount-only pending credit-note return and its credit note", async () => {
    ensureCn.mockResolvedValue("cn-1");
    const { client, ops } = fakeClient();
    const res = await createManualSaleReturnCredit(client as never, {
      organizationId: "org",
      customerId: "cust",
      customerName: "RAHUL",
      amount: 450,
    });
    expect(res).toEqual({ id: "sr-1", returnNumber: "SR/26-27/9" });
    const insert = ops.find((o) => o.table === "sale_returns" && o.op === "insert")!;
    expect(insert.payload).toMatchObject({
      customer_id: "cust",
      net_amount: 450,
      gross_amount: 450,
      refund_type: "credit_note",
      credit_status: "pending",
    });
    expect(ops.some((o) => o.table === "sale_return_items")).toBe(false);
    expect(ensureCn).toHaveBeenCalledTimes(1);
    expect(journal).not.toHaveBeenCalled();
  });

  it("removes the return and credit note when the journal fails", async () => {
    ensureCn.mockResolvedValue("cn-1");
    journal.mockRejectedValue(new Error("gl down"));
    const { client, ops } = fakeClient({ accounting: true });
    await expect(
      createManualSaleReturnCredit(client as never, { organizationId: "org", customerId: "c", customerName: "X", amount: 100 }),
    ).rejects.toThrow("gl down");
    const deletes = ops.filter((o) => o.op === "delete").map((o) => o.table);
    expect(deletes).toEqual(["sale_returns", "credit_notes"]);
  });

  it("rejects a zero amount", async () => {
    const { client } = fakeClient();
    await expect(
      createManualSaleReturnCredit(client as never, { organizationId: "o", customerId: "c", customerName: "X", amount: 0 }),
    ).rejects.toThrow();
  });
});
