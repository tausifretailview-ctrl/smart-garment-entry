import { describe, expect, it } from "vitest";
import { insertVoucherRetryingNumber, isVoucherNumberClash } from "./voucherNumberRetry";

const clash = { code: "23505", message: 'duplicate key value violates unique constraint "uq_voucher_entries_number_active"' };
const sameSubmit = { code: "23505", message: 'duplicate key value violates unique constraint "uq_voucher_entries_client_request_active"' };

function fakeClient(numbers: string[], rpcError: unknown = null) {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    rpc: async (_fn: string, args: Record<string, unknown>) => {
      calls.push(args);
      return rpcError ? { data: null, error: rpcError } : { data: numbers[calls.length - 1], error: null };
    },
  };
}

/** Review item D2: a voucher number taken by another cashier is replaced, not an error. */
describe("insertVoucherRetryingNumber", () => {
  it("saves with the first number when it is free", async () => {
    const client = fakeClient(["RCP/26-27/15"]);
    const written: string[] = [];
    const res = await insertVoucherRetryingNumber(client, {
      type: "receipt",
      date: "2026-11-22",
      write: async (n) => (written.push(n), { data: { id: "v1" }, error: null }),
    });
    expect(res).toEqual({ data: { id: "v1" }, error: null, voucherNumber: "RCP/26-27/15" });
    expect(written).toEqual(["RCP/26-27/15"]);
    expect(client.calls).toEqual([{ p_type: "receipt", p_date: "2026-11-22" }]);
  });

  it("takes a new number when another cashier got the same one", async () => {
    const client = fakeClient(["PAY/26-27/7", "PAY/26-27/8"]);
    const written: string[] = [];
    const res = await insertVoucherRetryingNumber(client, {
      type: "payment",
      date: "2026-11-22",
      write: async (n) => (written.push(n), written.length === 1 ? { data: null, error: clash } : { data: { id: "v2" }, error: null }),
    });
    expect(written).toEqual(["PAY/26-27/7", "PAY/26-27/8"]);
    expect(res.error).toBeNull();
    expect(res.voucherNumber).toBe("PAY/26-27/8");
  });

  it("does not retry a repeat of the same submit, or any other error", async () => {
    for (const error of [sameSubmit, { code: "42501", message: "permission denied" }, { code: "P0431", message: "RECEIPT_OVER_CREDIT" }]) {
      const client = fakeClient(["RCP/26-27/1", "RCP/26-27/2"]);
      let writes = 0;
      const res = await insertVoucherRetryingNumber(client, {
        type: "receipt",
        date: "2026-11-22",
        write: async () => ((writes += 1), { data: null, error }),
      });
      expect(writes).toBe(1);
      expect(res.error).toBe(error);
    }
  });

  it("later rows of one payment reuse the number, and move to a new one on a clash", async () => {
    const client = fakeClient(["PAY/26-27/9"]);
    const written: string[] = [];
    const first = await insertVoucherRetryingNumber(client, {
      type: "payment",
      date: "2026-11-22",
      baseNumber: "PAY/26-27/7",
      write: async (n) => (written.push(`${n}-2`), written.length === 1 ? { error: clash } : { error: null }),
    });
    // No number was fetched for the first try; one was fetched after the clash.
    expect(written).toEqual(["PAY/26-27/7-2", "PAY/26-27/9-2"]);
    expect(client.calls).toHaveLength(1);
    expect(first.voucherNumber).toBe("PAY/26-27/9");
  });

  it("gives up after the attempt limit and returns the clash", async () => {
    const client = fakeClient(["A", "B", "C"]);
    let writes = 0;
    const res = await insertVoucherRetryingNumber(client, {
      type: "expense",
      date: "2026-11-22",
      maxAttempts: 3,
      write: async () => ((writes += 1), { data: null, error: clash }),
    });
    expect(writes).toBe(3);
    expect(isVoucherNumberClash(res.error)).toBe(true);
  });

  it("a failed number request is thrown, nothing is written", async () => {
    const client = fakeClient([], { message: "rpc down" });
    let writes = 0;
    await expect(
      insertVoucherRetryingNumber(client, { type: "receipt", date: "2026-11-22", write: async () => ((writes += 1), { error: null }) }),
    ).rejects.toMatchObject({ message: "rpc down" });
    expect(writes).toBe(0);
  });
});

describe("isVoucherNumberClash", () => {
  it("is only the voucher number index", () => {
    expect(isVoucherNumberClash(clash)).toBe(true);
    expect(isVoucherNumberClash(sameSubmit)).toBe(false);
    expect(isVoucherNumberClash({ code: "23505", message: "duplicate key", details: "Key (voucher_number)=(x) uq_voucher_entries_number_active" })).toBe(true);
    expect(isVoucherNumberClash(null)).toBe(false);
  });
});
