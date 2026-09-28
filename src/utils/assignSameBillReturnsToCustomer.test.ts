import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assignSameBillReturnsToCustomer } from "./assignSameBillReturnsToCustomer";

function fakeClient() {
  const calls: Array<[string, unknown[]]> = [];
  const chain: Record<string, (...a: unknown[]) => unknown> = {};
  for (const m of ["update", "eq", "in", "is"]) {
    chain[m] = (...a: unknown[]) => {
      calls.push([m, a]);
      return chain;
    };
  }
  (chain as { then?: unknown }).then = (resolve: (v: { error: null }) => void) => resolve({ error: null });
  const client = {
    from: (t: string) => {
      calls.push(["from", [t]]);
      return chain;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("assignSameBillReturnsToCustomer", () => {
  it("moves only this bill's unlinked, customer-less returns onto the bill customer", async () => {
    const { client, calls } = fakeClient();
    await assignSameBillReturnsToCustomer(client, {
      organizationId: "org",
      customerId: "ziba",
      customerName: "ZIBA",
      returnIds: ["sr25", "sr25"],
    });
    expect(calls).toEqual([
      ["from", ["sale_returns"]],
      ["update", [{ customer_id: "ziba", customer_name: "ZIBA" }]],
      ["eq", ["organization_id", "org"]],
      ["in", ["id", ["sr25"]]],
      ["is", ["customer_id", null]],
      ["is", ["linked_sale_id", null]],
      ["is", ["deleted_at", null]],
    ]);
  });

  it("does nothing for a walk-in bill or when no exchange return was saved", async () => {
    const { client, calls } = fakeClient();
    await assignSameBillReturnsToCustomer(client, { organizationId: "org", customerId: null, customerName: null, returnIds: ["sr25"] });
    await assignSameBillReturnsToCustomer(client, { organizationId: "org", customerId: "ziba", customerName: "ZIBA", returnIds: [] });
    expect(calls).toEqual([]);
  });
});
