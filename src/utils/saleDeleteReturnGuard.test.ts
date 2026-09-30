import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findLiveReturnsLinkedToSale, saleDeleteBlockedByReturnMessage } from "./saleDeleteReturnGuard";

function stub(rows: unknown[] | null, fail = false) {
  const asked: Record<string, unknown> = {};
  const q: any = {
    select: () => q,
    eq: (k: string, v: unknown) => ((asked[k] = v), q),
    is: () => (fail ? Promise.reject(new Error("boom")) : Promise.resolve({ data: rows, error: null })),
  };
  return { client: { from: () => q } as unknown as SupabaseClient, asked };
}

describe("findLiveReturnsLinkedToSale", () => {
  it("returns the return numbers linked to the bill", async () => {
    const { client, asked } = stub([{ return_number: "SR/26-27/49" }]);
    await expect(findLiveReturnsLinkedToSale(client, "sale-1")).resolves.toEqual(["SR/26-27/49"]);
    expect(asked.linked_sale_id).toBe("sale-1");
  });

  it("returns nothing when no live return is linked", async () => {
    await expect(findLiveReturnsLinkedToSale(stub([]).client, "s")).resolves.toEqual([]);
  });

  it("fails open: a lookup error never blocks a delete", async () => {
    await expect(findLiveReturnsLinkedToSale(stub(null, true).client, "s")).resolves.toEqual([]);
  });
});

describe("saleDeleteBlockedByReturnMessage", () => {
  it("names the bill and the returns to delete first", () => {
    const msg = saleDeleteBlockedByReturnMessage("POS/26-27/464", ["SR/26-27/49"]);
    expect(msg).toContain("POS/26-27/464");
    expect(msg).toContain("SR/26-27/49");
    expect(msg).toContain("Delete the sale return first");
  });
});
