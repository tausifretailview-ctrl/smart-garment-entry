import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFakeLedgerClient } from "../helpers/fakeLedgerSupabase";
import { AFREEN_CUSTOMER, AFREEN_ORG, buildAfreenExchangeDb } from "../helpers/afreenExchangeFixture";
import {
  findBalanceCheckCandidates,
  scanCustomersForBalanceCheck,
} from "@/utils/customerBalanceCheckScan";

describe("scanCustomersForBalanceCheck", () => {
  it("lists Afreen before the duplicate return/refund are removed", async () => {
    const client = createFakeLedgerClient(buildAfreenExchangeDb({ cleaned: false })) as never;
    const progress: number[] = [];
    const { findings, checked, failed } = await scanCustomersForBalanceCheck(client, AFREEN_ORG, [AFREEN_CUSTOMER], {
      onProgress: (p) => progress.push(p.done),
    });
    expect(checked).toBe(1);
    expect(failed).toBe(0);
    expect(progress).toEqual([1]);
    expect(findings).toHaveLength(1);
    expect(findings[0].customerId).toBe(AFREEN_CUSTOMER);
    expect(Math.round(findings[0].tableBalance)).toBe(-3900);
  });

  it("does not list her once the data is clean", async () => {
    const client = createFakeLedgerClient(buildAfreenExchangeDb({ cleaned: true })) as never;
    const { findings } = await scanCustomersForBalanceCheck(client, AFREEN_ORG, [AFREEN_CUSTOMER]);
    expect(findings).toEqual([]);
  });

  it("stops at the cap, honours cancel, and counts a failing account without stopping", async () => {
    const client = createFakeLedgerClient(buildAfreenExchangeDb({ cleaned: true })) as never;
    const capped = await scanCustomersForBalanceCheck(client, AFREEN_ORG, ["missing", AFREEN_CUSTOMER, "x"], { max: 2 });
    expect(capped.checked).toBe(2);
    expect(capped.skipped).toBe(1);
    expect(capped.failed).toBe(1); // "missing" has no customer row
    const cancelled = await scanCustomersForBalanceCheck(client, AFREEN_ORG, [AFREEN_CUSTOMER], {
      signal: { cancelled: true },
    });
    expect(cancelled.checked).toBe(0);
  });
});

describe("findBalanceCheckCandidates", () => {
  it("merges customers from returns, credit notes, exchange refunds and deleted credit bills", async () => {
    const rowsByTable: Record<string, Record<string, unknown>[]> = {
      sale_returns: [{ customer_id: "a" }, { customer_id: "b" }],
      credit_notes: [{ customer_id: "b" }],
      voucher_entries: [{ reference_id: "c" }],
      sales: [{ customer_id: "d" }],
    };
    const client = {
      from: (table: string) => {
        const q: any = {};
        for (const m of ["select", "eq", "is", "not", "gt", "ilike"]) q[m] = () => q;
        q.limit = () => Promise.resolve({ data: rowsByTable[table] ?? [], error: null });
        return q;
      },
    } as unknown as SupabaseClient;
    const ids = await findBalanceCheckCandidates(client, "org");
    expect(ids.sort()).toEqual(["a", "b", "c", "d"]);
  });
});
