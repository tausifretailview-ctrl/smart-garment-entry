import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findLeftoverExchangeRefunds,
  leftoverExchangeRefundMessage,
  posExchangeVoucherRequestId,
} from "./exchangeRefundAfterDelete";

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

describe("findLeftoverExchangeRefunds by bill id", () => {
  it("also looks the voucher up by its bill-id key and does not list it twice", async () => {
    const keys: unknown[] = [];
    const q: any = {
      select: () => q,
      eq: (k: string, v: unknown) => {
        if (k === "client_request_id") keys.push(v);
        return q;
      },
      is: () => Promise.resolve({ data: [{ voucher_number: "PAY/26-27/2135", total_amount: 300 }], error: null }),
    };
    const client = { from: () => q } as unknown as SupabaseClient;
    const out = await findLeftoverExchangeRefunds(client, "org", "POS/26-27/464", "sale-464");
    expect(keys).toEqual(["pos-exchange-refund:sale-464"]);
    expect(out).toEqual([{ voucher_number: "PAY/26-27/2135", total_amount: 300 }]);
  });

  it("builds stable keys per bill", () => {
    expect(posExchangeVoucherRequestId("refund", "s1")).toBe("pos-exchange-refund:s1");
    expect(posExchangeVoucherRequestId("roundoff", "s1")).toBe("pos-exchange-roundoff:s1");
  });
});

describe("leftoverExchangeRefundMessage", () => {
  it("names the amount and vouchers", () => {
    const msg = leftoverExchangeRefundMessage("POS/26-27/451", [{ voucher_number: "PAY/26-27/2130", total_amount: 300 }]);
    expect(msg).toContain("₹300");
    expect(msg).toContain("PAY/26-27/2130");
  });
});
