import { describe, expect, it, vi } from "vitest";
import { applyPosCreditFifo, isMissingPosCreditFifoRpc, parsePosCreditFifoResult } from "./applyPosCredit";

const params = {
  organizationId: "org",
  saleId: "sale1",
  customerId: "cust1",
  amount: 1200.004,
  idempotencyKey: "key-1",
  adjustedBy: "user1",
  notes: "POS credit apply",
};

function client(reply: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn().mockResolvedValue({ data: reply.data ?? null, error: reply.error ?? null });
  return { sb: { rpc } as never, rpc };
}

describe("applyPosCreditFifo (one transaction)", () => {
  it("sends one call with the key and returns the chunks", async () => {
    const { sb, rpc } = client({
      data: {
        applied: 1200,
        settled: true,
        chunks: [
          { sale_return_id: "sr1", credit_note_id: "cn1", voucher_entry_id: "v1", voucher_number: "RCT/1", amount: 800, already_applied: false },
          { sale_return_id: "sr2", credit_note_id: "cn2", voucher_entry_id: "v2", voucher_number: "RCT/2", amount: 400, already_applied: false },
        ],
      },
    });
    const r = await applyPosCreditFifo(sb, params);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("apply_pos_credit_fifo", {
      p_organization_id: "org",
      p_sale_id: "sale1",
      p_customer_id: "cust1",
      p_amount: 1200,
      p_idempotency_key: "key-1",
      p_adjusted_by: "user1",
      p_notes: "POS credit apply",
    });
    expect(r?.applied).toBe(1200);
    expect(r?.settled).toBe(true);
    expect(r?.chunks.map((c) => [c.creditNoteId, c.amount])).toEqual([["cn1", 800], ["cn2", 400]]);
  });

  it("returns null only when the function is not applied yet", async () => {
    for (const error of [{ code: "PGRST202", message: "Could not find the function" }, { code: "42883", message: "x" }]) {
      await expect(applyPosCreditFifo(client({ error }).sb, params)).resolves.toBeNull();
    }
    expect(isMissingPosCreditFifoRpc({ message: "Insufficient credit note balance. Applied ₹0, requested ₹1200." })).toBe(false);
  });

  it("throws business errors (nothing was applied)", async () => {
    const { sb } = client({ error: { code: "P0001", message: "Insufficient credit note balance. Applied ₹0, requested ₹1200." } });
    await expect(applyPosCreditFifo(sb, params)).rejects.toThrow(/Insufficient credit note balance/);
  });

  it("refuses a call without an idempotency key", async () => {
    await expect(applyPosCreditFifo(client({}).sb, { ...params, idempotencyKey: " " })).rejects.toThrow(/idempotency key/);
  });

  it("reads an empty reply safely", () => {
    expect(parsePosCreditFifoResult(null)).toEqual({ applied: 0, chunks: [], settled: false });
  });
});
