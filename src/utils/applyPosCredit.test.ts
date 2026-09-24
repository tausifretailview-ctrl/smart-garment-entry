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

  it("falls back to adjust_invoice_balance when apply_pos_credit is missing in the schema cache", async () => {
    const fns: string[] = [];
    const supabase = {
      rpc: vi.fn(async (fn: string, _args: Record<string, unknown>) => {
        fns.push(fn);
        if (fn === "apply_pos_credit") {
          return {
            data: null,
            error: {
              code: "PGRST202",
              message:
                "Could not find the function public.apply_pos_credit(p_adjusted_by, p_amount_applied) in the schema cache",
            },
          };
        }
        return {
          data: {
            success: true,
            voucher_entry_id: "voucher-9",
            voucher_number: "RCP/9",
            amount_applied: 150,
          },
          error: null,
        };
      }),
    } as unknown as SupabaseClient;

    const result = await applyPosCredit(supabase, {
      organizationId: "org",
      saleId: "sale",
      idempotencyKey: "key-9:note-9",
      sourceDocumentId: "note-9",
      amountApplied: 150,
    });
    expect(fns).toEqual(["apply_pos_credit", "adjust_invoice_balance"]);
    expect(result.alreadyApplied).toBe(false);
    expect(result.amountApplied).toBe(150);
    expect(result.voucherEntryId).toBe("voucher-9");
    expect(result.voucherNumber).toBe("RCP/9");
  });

  it("does not fall back on business errors from inside the RPC", async () => {
    const fns: string[] = [];
    const supabase = {
      rpc: vi.fn(async (fn: string, _args: Record<string, unknown>) => {
        fns.push(fn);
        return {
          data: null,
          error: { message: "Invoice has no outstanding balance to adjust" },
        };
      }),
    } as unknown as SupabaseClient;

    await expect(
      applyPosCredit(supabase, {
        organizationId: "org",
        saleId: "sale",
        idempotencyKey: "key-2:note-2",
        sourceDocumentId: "note-2",
        amountApplied: 100,
      }),
    ).rejects.toThrow(/outstanding balance/i);
    expect(fns).toEqual(["apply_pos_credit"]);
  });

  it("throws the fallback error when adjust_invoice_balance also fails", async () => {
    const supabase = {
      rpc: vi.fn(async (fn: string, _args: Record<string, unknown>) => {
        if (fn === "apply_pos_credit") {
          return {
            data: null,
            error: { code: "PGRST202", message: "Could not find the function public.apply_pos_credit in the schema cache" },
          };
        }
        return {
          data: null,
          error: { message: "Invoice has no outstanding balance to adjust" },
        };
      }),
    } as unknown as SupabaseClient;

    await expect(
      applyPosCredit(supabase, {
        organizationId: "org",
        saleId: "sale",
        idempotencyKey: "key-3:note-3",
        sourceDocumentId: "note-3",
        amountApplied: 100,
      }),
    ).rejects.toThrow(/outstanding balance/i);
  });
});
