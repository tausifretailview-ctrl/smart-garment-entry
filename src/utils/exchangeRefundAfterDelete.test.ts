import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findLeftoverExchangeRefunds, leftoverExchangeRefundMessage } from "./exchangeRefundAfterDelete";

function stub(rows: unknown[] | null, fail = false) {
  const asked: Record<string, unknown> = {};
  const q: any = {
    select: () => q,
    eq: (k: string, v: unknown) => ((asked[k] = v), q),
    is: () => (fail ? Promise.reject(new Error("boom")) : Promise.resolve({ data: rows, error: null })),
  };
  return { client: { from: () => q } as unknown as SupabaseClient, asked };
}

describe("findLeftoverExchangeRefunds", () => {
  it("matches the refund voucher by the exact exchange description", async () => {
    const { client, asked } = stub([{ voucher_number: "PAY/26-27/2130", total_amount: 300 }]);
    const out = await findLeftoverExchangeRefunds(client, "org", "POS/26-27/451");
    expect(out).toEqual([{ voucher_number: "PAY/26-27/2130", total_amount: 300 }]);
    expect(asked.description).toBe("Refund paid for POS exchange POS/26-27/451");
  });

  it("returns nothing for a blank sale number or a failed lookup", async () => {
    expect(await findLeftoverExchangeRefunds(stub([]).client, "org", "")).toEqual([]);
    expect(await findLeftoverExchangeRefunds(stub(null, true).client, "org", "POS/1")).toEqual([]);
  });
});

describe("leftoverExchangeRefundMessage", () => {
  it("names the amount and vouchers", () => {
    const msg = leftoverExchangeRefundMessage("POS/26-27/451", [{ voucher_number: "PAY/26-27/2130", total_amount: 300 }]);
    expect(msg).toContain("₹300");
    expect(msg).toContain("PAY/26-27/2130");
  });
});
