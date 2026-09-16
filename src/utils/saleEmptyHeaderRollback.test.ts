import { describe, expect, it, vi } from "vitest";
import {
  EMPTY_HEADER_ROLLBACK_REASON,
  evaluateEmptyHeaderRollback,
  softCancelEmptySaleHeader,
} from "@/utils/saleEmptyHeaderRollback";

describe("softCancelEmptySaleHeader", () => {
  it("soft-cancels the header with the standard rollback fields", async () => {
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "sale_items") {
          return { delete: vi.fn(() => ({ eq: deleteEq })) };
        }
        return {
          update: vi.fn(() => ({ eq: updateEq })),
        };
      }),
    } as any;

    await softCancelEmptySaleHeader(client, "sale-1", "user-1");

    expect(deleteEq).toHaveBeenCalledWith("sale_id", "sale-1");
    expect(updateEq).toHaveBeenCalledWith("id", "sale-1");
    const updatePayload = client.from.mock.results[1].value.update.mock.calls[0][0];
    expect(updatePayload).toMatchObject({
      deleted_by: "user-1",
      is_cancelled: true,
      cancelled_by: "user-1",
      cancelled_reason: EMPTY_HEADER_ROLLBACK_REASON,
      payment_status: "cancelled",
    });
  });
});

describe("evaluateEmptyHeaderRollback", () => {
  it("requests rollback for a settled header with zero items", async () => {
    const client = {
      from: vi.fn((table: string) => {
        if (table === "sale_items") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn().mockResolvedValue({ count: 0, error: null }),
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { sale_type: "pos", payment_status: "completed" },
                error: null,
              }),
            })),
          })),
        };
      }),
    } as any;

    const result = await evaluateEmptyHeaderRollback(client, "sale-1");
    expect(result.decision).toEqual({ action: "rollback_empty_header" });
  });
});
