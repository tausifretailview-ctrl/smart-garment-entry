import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Customer Balances list speed: the balance list comes from one call
 * (get_customer_party_balances_all) instead of one full re-computation per 1000 rows,
 * and still works on a database where that function is not applied yet.
 */

const rpcCalls: Array<{ fn: string; range?: [number, number] }> = [];
let allRpcAnswer: { data: unknown; error: unknown } = { data: [], error: null };
let pagedRows: unknown[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string) => {
      if (fn === "get_customer_party_balances_all") {
        rpcCalls.push({ fn });
        return Promise.resolve(allRpcAnswer);
      }
      return {
        range: (from: number, to: number) => {
          rpcCalls.push({ fn, range: [from, to] });
          return Promise.resolve({ data: pagedRows.slice(from, to + 1), error: null });
        },
      };
    },
  },
}));

import {
  fetchAllCustomerPartyBalances,
  isMissingRpcFunctionError,
  resetPartyBalancesAllRpcProbe,
} from "@/utils/fetchAllRows";

const row = (i: number) => ({
  customer_id: `c${i}`,
  customer_name: `Customer ${i}`,
  signed_balance: i,
  advance_available: 0,
  direction: "Dr",
  net_position: i,
  total_dr: 0,
  total_cr: 0,
  net_receivable: 0,
});

beforeEach(() => {
  rpcCalls.length = 0;
  resetPartyBalancesAllRpcProbe();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("fetchAllCustomerPartyBalances — one call", () => {
  it("uses get_customer_party_balances_all once, no paging", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => row(i));
    allRpcAnswer = { data: rows, error: null };
    const out = await fetchAllCustomerPartyBalances("org-1");
    expect(out).toHaveLength(2500);
    expect(out[0].customer_id).toBe("c0");
    expect(rpcCalls).toEqual([{ fn: "get_customer_party_balances_all" }]);
  });

  it("falls back to paging when the function is not applied, and stops asking", async () => {
    allRpcAnswer = {
      data: null,
      error: { code: "PGRST202", message: "Could not find the function public.get_customer_party_balances_all" },
    };
    pagedRows = Array.from({ length: 1500 }, (_, i) => row(i));
    const first = await fetchAllCustomerPartyBalances("org-1");
    expect(first).toHaveLength(1500);
    expect(rpcCalls.map((c) => c.fn)).toEqual([
      "get_customer_party_balances_all",
      "get_customer_party_balances",
      "get_customer_party_balances",
    ]);

    rpcCalls.length = 0;
    await fetchAllCustomerPartyBalances("org-1");
    expect(rpcCalls.every((c) => c.fn === "get_customer_party_balances")).toBe(true);
  });

  it("passes a statement timeout through so callers can show the fallback list", async () => {
    allRpcAnswer = { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } };
    await expect(fetchAllCustomerPartyBalances("org-1")).rejects.toMatchObject({ code: "57014" });
    expect(rpcCalls).toHaveLength(1);
  });

  it("recognises the missing-function answers", () => {
    expect(isMissingRpcFunctionError({ code: "PGRST202" })).toBe(true);
    expect(isMissingRpcFunctionError({ code: "42883" })).toBe(true);
    expect(isMissingRpcFunctionError({ code: "57014", message: "timeout" })).toBe(false);
    expect(isMissingRpcFunctionError(null)).toBe(false);
  });
});

describe("get_customer_party_balances_all migration", () => {
  const sql = readFileSync(
    resolve(__dirname, "../../supabase/migrations/20270107120000_get_customer_party_balances_all.sql"),
    "utf8",
  );

  it("reads through the guarded public wrapper, keeping its row order", () => {
    expect(sql).toContain("FROM public.get_customer_party_balances(p_organization_id, p_search)");
    expect(sql).toContain("WITH ORDINALITY");
    expect(sql).toContain("ORDER BY r.ord");
    expect(sql).toContain("SECURITY INVOKER");
  });

  it("is not callable by anon", () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.get_customer_party_balances_all(uuid, text) FROM PUBLIC;");
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_customer_party_balances_all\(uuid, text\) TO authenticated, service_role;/);
    expect(sql).not.toMatch(/TO\s+anon/);
  });
});
