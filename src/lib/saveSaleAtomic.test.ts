import { describe, expect, it, vi } from "vitest";
import {
  ATOMIC_SALE_ID_PLACEHOLDER,
  isAtomicBillSaveEnabled,
  isMissingAtomicSaleSaveRpc,
  parseAtomicSaleSaveResult,
  saveSaleWithItemsAtomic,
  saveSaleWithItemsNumbered,
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

describe("one-step bill save with the number taken in the save", () => {
  const numbering = { kind: "pos" as const, format: null, year: "2026", month: "11", min_sequence: 1 };

  it("sends the numbering request and returns the number the database gave", async () => {
    const { client, rpc } = clientReturning({ data: okReply });
    const lines = [{ quantity: 1 }, { quantity: 2 }];
    const r = await saveSaleWithItemsNumbered(client, "org1", { net_amount: 500 }, lines, numbering);
    expect(rpc).toHaveBeenCalledWith("save_sale_with_items_numbered", {
      p_organization_id: "org1",
      p_sale: { net_amount: 500 },
      p_items: lines,
      p_numbering: numbering,
    });
    expect(r?.saleNumber).toBe("POS/1");
  });

  it("falls back (null) when the function is not applied, throws anything else", async () => {
    const missing = clientReturning({ error: { code: "PGRST202", message: "Could not find the function" } });
    await expect(saveSaleWithItemsNumbered(missing.client, "org1", {}, [{}], numbering)).resolves.toBeNull();
    const conflict = clientReturning({ error: { code: "23505", message: "duplicate key" } });
    await expect(saveSaleWithItemsNumbered(conflict.client, "org1", {}, [{}], numbering)).rejects.toMatchObject({ code: "23505" });
  });

  it("refuses a reply without a bill number", async () => {
    const { client } = clientReturning({ data: { ...okReply, sale: { id: "s1" } } });
    await expect(saveSaleWithItemsNumbered(client, "org1", {}, [{}, {}], numbering)).rejects.toThrow(/no bill number/);
  });
});

describe("payment state settled in the save", () => {
  it("reads settled: true from the reply, false when missing (older SQL)", () => {
    expect(parseAtomicSaleSaveResult({ ...okReply, settled: true }, 2).settledInSave).toBe(true);
    expect(parseAtomicSaleSaveResult(okReply, 2).settledInSave).toBe(false);
    expect(parseAtomicSaleSaveResult({ ...okReply, settled: "yes" }, 2).settledInSave).toBe(false);
  });
});
