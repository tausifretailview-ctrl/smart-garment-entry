import { describe, expect, it, vi } from "vitest";
import {
  ATOMIC_SALE_ID_PLACEHOLDER,
  isAtomicBillSaveEnabled,
  isMissingAtomicSaleSaveRpc,
  parseAtomicSaleSaveResult,
  saveSaleWithItemsAtomic,
} from "./saveSaleAtomic";

const okReply = {
  sale: { id: "s1", sale_number: "POS/1", net_amount: 500 },
  items_inserted: 2,
  dropped_sale_keys: [],
  dropped_item_keys: ["salesman"],
};

function clientReturning(result: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  return { client: { rpc } as never, rpc };
}

describe("one-step bill save", () => {
  it("sends header and lines in one call and returns the saved bill", async () => {
    const { client, rpc } = clientReturning({ data: okReply });
    const lines = [{ sale_id: ATOMIC_SALE_ID_PLACEHOLDER, quantity: 1 }, { sale_id: ATOMIC_SALE_ID_PLACEHOLDER, quantity: 2 }];
    const r = await saveSaleWithItemsAtomic(client, "org1", { sale_number: "POS/1" }, lines);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("save_sale_with_items_atomic", {
      p_organization_id: "org1",
      p_sale: { sale_number: "POS/1" },
      p_items: lines,
    });
    expect(r?.sale.id).toBe("s1");
    expect(r?.droppedItemKeys).toEqual(["salesman"]);
  });

  it("falls back (null) only when the database function is missing", async () => {
    for (const error of [{ code: "PGRST202", message: "Could not find the function" }, { code: "42883", message: "x" }]) {
      const { client } = clientReturning({ error });
      await expect(saveSaleWithItemsAtomic(client, "org1", {}, [{}])).resolves.toBeNull();
    }
    expect(isMissingAtomicSaleSaveRpc({ code: "P0001", message: "insufficient stock" })).toBe(false);
  });

  it("throws any other error, so the old two-step insert never runs after a failed save", async () => {
    const { client } = clientReturning({ error: { code: "P0001", message: "insufficient stock" } });
    await expect(saveSaleWithItemsAtomic(client, "org1", {}, [{}])).rejects.toMatchObject({ message: "insufficient stock" });
  });

  it("refuses a reply with no bill or the wrong number of lines", () => {
    expect(() => parseAtomicSaleSaveResult({}, 1)).toThrow(/no bill/);
    expect(() => parseAtomicSaleSaveResult({ ...okReply, items_inserted: 1 }, 2)).toThrow(/1 of 2/);
    expect(parseAtomicSaleSaveResult(okReply, 2).itemsInserted).toBe(2);
  });
});

describe("isAtomicBillSaveEnabled", () => {
  it("is on by default and off only when the shop turned it off", () => {
    expect(isAtomicBillSaveEnabled(null)).toBe(true);
    expect(isAtomicBillSaveEnabled(undefined)).toBe(true);
    expect(isAtomicBillSaveEnabled({})).toBe(true);
    expect(isAtomicBillSaveEnabled({ atomic_bill_save: true })).toBe(true);
    expect(isAtomicBillSaveEnabled({ atomic_bill_save: false })).toBe(false);
  });
});
