import { describe, expect, it, vi } from "vitest";
import {
  fetchCustomerFinancialSnapshotMap,
  SNAPSHOT_ORG_WIDE_MIN_IDS,
} from "./customerFinancialSnapshot";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

function fakeClient(allRows: Array<{ customer_id: string; outstanding_dr: number }>) {
  const calls: Array<{ name: string; ids?: string[] }> = [];
  const rpc = vi.fn((name: string, args: { p_customer_ids?: string[] }) => {
    calls.push({ name, ids: args.p_customer_ids });
    const result =
      name === "get_customer_financial_snapshot_all"
        ? { data: allRows, error: null }
        : {
            data: (args.p_customer_ids ?? []).map((id) => ({ customer_id: id, outstanding_dr: 7 })),
            error: null,
          };
    return {
      range: () => Promise.resolve(result),
      then: (resolve: (v: typeof result) => unknown) => resolve(result),
    };
  });
  return { client: { rpc } as never, calls };
}

describe("fetchCustomerFinancialSnapshotMap org-wide path", () => {
  it("uses one org-wide call for a large list and batches only the missing ids", async () => {
    const ids = Array.from({ length: SNAPSHOT_ORG_WIDE_MIN_IDS + 10 }, (_, i) => `c${i}`);
    const allRows = ids.slice(1).map((id) => ({ customer_id: id, outstanding_dr: 100 }));
    const { client, calls } = fakeClient(allRows);

    const map = await fetchCustomerFinancialSnapshotMap("org", ids, client);

    expect(calls.filter((c) => c.name === "get_customer_financial_snapshot_all")).toHaveLength(1);
    const batch = calls.filter((c) => c.name === "get_customer_financial_snapshot_batch");
    expect(batch).toHaveLength(1);
    expect(batch[0].ids).toEqual(["c0"]);
    expect(map.get("c5")?.outstandingDr).toBe(100);
    expect(map.get("c0")?.outstandingDr).toBe(7);
  });

  it("falls back to the batch when the org-wide call returns nothing", async () => {
    const ids = Array.from({ length: SNAPSHOT_ORG_WIDE_MIN_IDS }, (_, i) => `c${i}`);
    const { client, calls } = fakeClient([]);

    const map = await fetchCustomerFinancialSnapshotMap("org", ids, client);

    expect(calls.filter((c) => c.name === "get_customer_financial_snapshot_batch")).toHaveLength(
      Math.ceil(ids.length / 10),
    );
    expect(map.get("c0")?.outstandingDr).toBe(7);
  });

  it("keeps small picker lists on the per-customer batch", async () => {
    const ids = ["a", "b", "c"];
    const { client, calls } = fakeClient([]);

    await fetchCustomerFinancialSnapshotMap("org", ids, client);

    expect(calls.map((c) => c.name)).toEqual(["get_customer_financial_snapshot_batch"]);
  });
});
