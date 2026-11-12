import { describe, expect, it, vi } from "vitest";
import {
  ATOMIC_RETURN_ID_PLACEHOLDER,
  isMissingAtomicReturnSaveRpc,
  parseAtomicReturnSaveResult,
  saveReturnWithItemsAtomic,
} from "./saveReturnAtomic";

const okReply = {
  return: { id: "r1", return_number: "SR/26-27/5" },
  return_number: "SR/26-27/5",
  items_inserted: 2,
  dropped_header_keys: [],
  dropped_item_keys: ["is_dc_item"],
};

function client(reply: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn().mockResolvedValue({ data: reply.data ?? null, error: reply.error ?? null });
  return { sb: { rpc } as never, rpc };
}

describe("one-step return save", () => {
  it("sends the kind, header and lines in one call and returns the number the database took", async () => {
    const { sb, rpc } = client({ data: okReply });
    const lines = [{ return_id: ATOMIC_RETURN_ID_PLACEHOLDER, quantity: 1 }, { return_id: ATOMIC_RETURN_ID_PLACEHOLDER, quantity: 2 }];
    const r = await saveReturnWithItemsAtomic(sb, "sale_return", "org", { net_amount: 500 }, lines);
    expect(rpc).toHaveBeenCalledWith("save_return_with_items_atomic", {
      p_kind: "sale_return",
      p_organization_id: "org",
      p_header: { net_amount: 500 },
      p_items: lines,
    });
    expect(r?.row.id).toBe("r1");
    expect(r?.returnNumber).toBe("SR/26-27/5");
    expect(r?.droppedItemKeys).toEqual(["is_dc_item"]);
  });

  it("falls back (null) only when the function is missing; other errors are thrown", async () => {
    for (const error of [{ code: "PGRST202", message: "Could not find the function" }, { code: "42883", message: "x" }]) {
      await expect(saveReturnWithItemsAtomic(client({ error }).sb, "purchase_return", "org", {}, [{}])).resolves.toBeNull();
    }
    const stock = client({ error: { code: "P0001", message: "No Stock available For Return." } });
    await expect(saveReturnWithItemsAtomic(stock.sb, "purchase_return", "org", {}, [{}])).rejects.toMatchObject({
      message: "No Stock available For Return.",
    });
    expect(isMissingAtomicReturnSaveRpc({ code: "23505", message: "duplicate key" })).toBe(false);
  });

  it("refuses a reply with no return, the wrong line count or no number", () => {
    expect(() => parseAtomicReturnSaveResult({}, 1)).toThrow(/no return/);
    expect(() => parseAtomicReturnSaveResult({ ...okReply, items_inserted: 1 }, 2)).toThrow(/1 of 2/);
    expect(() =>
      parseAtomicReturnSaveResult({ ...okReply, return_number: "", return: { id: "r1" } }, 2),
    ).toThrow(/no return number/);
  });
});
