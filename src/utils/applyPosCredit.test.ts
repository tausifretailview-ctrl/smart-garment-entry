import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyPosCredit } from "./applyPosCredit";

describe("apply_pos_credit retry", () => {
  it("a second call with the same key does not apply the credit twice", async () => {
    const calls: string[] = [];
    const supabase = {
      rpc: vi.fn(async (_fn: string, args: { p_idempotency_key: string }) => {
        calls.push(args.p_idempotency_key);
        if (calls.length === 1) {
          return {
            data: null,
            error: { message: "Invoice has no outstanding balance to adjust" },
          };
        }
        return {
          data: {
            success: true,
            already_applied: true,
            amount_applied: 250,
            voucher_entry_id: "voucher-1",
            voucher_number: "RCP/1",
          },
          error: null,
        };
      }),
    } as unknown as SupabaseClient;

    await expect(
      applyPosCredit(supabase, {
        organizationId: "org",
        saleId: "sale",
        idempotencyKey: "key-1:note-1",
        sourceDocumentId: "note-1",
        amountApplied: 250,
      }),
    ).rejects.toThrow(/outstanding balance/i);

    const second = await applyPosCredit(supabase, {
      organizationId: "org",
      saleId: "sale",
      idempotencyKey: "key-1:note-1",
      sourceDocumentId: "note-1",
      amountApplied: 250,
    });
    expect(second.alreadyApplied).toBe(true);
    expect(second.amountApplied).toBe(250);
    expect(calls).toEqual(["key-1:note-1", "key-1:note-1"]);
  });
});
