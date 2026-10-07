import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findLeftoverExchangeRefunds,
  leftoverExchangeRefundMessage,
  posExchangeVoucherRequestId,
  restoreExchangeRefundsForSale,
  softDeleteExchangeRefundsForSale,
} from "./exchangeRefundAfterDelete";

function stub(rows: unknown[] | null, fail = false) {
  const asked: Record<string, unknown[]> = {};
  const q: any = {
    select: () => q,
    eq: (k: string, v: unknown) => ((asked[k] = [...(asked[k] ?? []), v]), q),
    is: () => (fail ? Promise.reject(new Error("boom")) : Promise.resolve({ data: rows, error: null })),
  };
  return { client: { from: () => q } as unknown as SupabaseClient, asked };
}

describe("findLeftoverExchangeRefunds", () => {
  it("matches the refund voucher by the exact exchange description", async () => {
    const { client, asked } = stub([{ voucher_number: "PAY/26-27/2130", total_amount: 300 }]);
    const out = await findLeftoverExchangeRefunds(client, "org", "POS/26-27/451");
    expect(out).toEqual([{ voucher_number: "PAY/26-27/2130", total_amount: 300 }]);
    expect(asked.description).toEqual([
      "Refund paid for POS exchange POS/26-27/451",
      "Round off adjustment for POS exchange POS/26-27/451",
    ]);
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
    expect(keys).toEqual(["pos-exchange-refund:sale-464", "pos-exchange-roundoff:sale-464"]);
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

/** Fake client: every lookup returns `rows` (live or deleted per the terminal call); rpc calls are recorded. */
function voucherClient(rows: Array<Record<string, unknown>>, rpcError: unknown = null) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const make = () => {
    const q: any = {
      select: () => q,
      eq: () => q,
      is: () => Promise.resolve({ data: rows.filter((r) => !r.deleted_at), error: null }),
      not: () => Promise.resolve({ data: rows.filter((r) => r.deleted_at), error: null }),
    };
    return q;
  };
  const client = {
    from: () => make(),
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return Promise.resolve({ data: null, error: rpcError });
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("softDeleteExchangeRefundsForSale (WAJIUDDEEN POS/26-27/136)", () => {
  it("moves the live refund voucher to the Recycle Bin once, by id", async () => {
    const { client, calls } = voucherClient([{ id: "v1", voucher_number: "PAY/26-27/2186", total_amount: 100 }]);
    const out = await softDeleteExchangeRefundsForSale(client, "org", "POS/26-27/136", "sale-136", "user-1");
    expect(out.deleted).toEqual([{ id: "v1", voucher_number: "PAY/26-27/2186", total_amount: 100 }]);
    expect(out.failed).toEqual([]);
    expect(calls).toEqual([{ fn: "soft_delete_voucher", args: { p_voucher_id: "v1", p_user_id: "user-1" } }]);
  });

  it("reports a voucher it could not delete instead of throwing", async () => {
    const { client } = voucherClient([{ id: "v1", voucher_number: "PAY/1", total_amount: 100 }], new Error("rls"));
    const out = await softDeleteExchangeRefundsForSale(client, "org", "POS/1", "s1", "u");
    expect(out.deleted).toEqual([]);
    expect(out.failed.map((v) => v.voucher_number)).toEqual(["PAY/1"]);
  });

  it("does nothing for a bill without an exchange refund", async () => {
    const { client, calls } = voucherClient([]);
    const out = await softDeleteExchangeRefundsForSale(client, "org", "POS/2", "s2", "u");
    expect(out.deleted).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe("restoreExchangeRefundsForSale", () => {
  const billDeletedAt = "2026-10-03T08:40:00.000Z";

  it("restores the refund voucher deleted together with the bill", async () => {
    const { client, calls } = voucherClient([
      { id: "v1", voucher_number: "PAY/26-27/2186", total_amount: 100, deleted_at: "2026-10-03T08:40:01.000Z" },
    ]);
    const out = await restoreExchangeRefundsForSale(client, "org", "POS/26-27/136", "sale-136", billDeletedAt);
    expect(out.map((v) => v.voucher_number)).toEqual(["PAY/26-27/2186"]);
    expect(calls).toEqual([{ fn: "restore_voucher", args: { p_voucher_id: "v1" } }]);
  });

  it("leaves a refund voucher deleted on its own (not with the bill) in the Recycle Bin", async () => {
    const { client, calls } = voucherClient([
      { id: "v1", voucher_number: "PAY/26-27/2186", total_amount: 100, deleted_at: "2026-10-01T10:00:00.000Z" },
    ]);
    expect(await restoreExchangeRefundsForSale(client, "org", "POS/26-27/136", "sale-136", billDeletedAt)).toEqual([]);
    expect(await restoreExchangeRefundsForSale(client, "org", "POS/26-27/136", "sale-136", null)).toEqual([]);
    expect(calls).toEqual([]);
  });
});
