import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const { applyRecomputedSalePaymentState } = vi.hoisted(() => ({
  applyRecomputedSalePaymentState: vi.fn(),
}));

vi.mock("@/utils/recomputeSalePaymentState", () => ({
  applyRecomputedSalePaymentState,
}));

import { syncSalePaymentsFromVouchersBatch } from "@/utils/customerBalanceUtils";

describe("syncSalePaymentsFromVouchersBatch — canonical writer", () => {
  beforeEach(() => {
    applyRecomputedSalePaymentState.mockReset();
    applyRecomputedSalePaymentState.mockResolvedValue({
      paidAmount: 5000,
      paymentStatus: "partial",
      skipped: false,
    });
  });

  it("delegates paid_amount writes to applyRecomputedSalePaymentState", async () => {
    const invoiceId = "sale-1";
    const orgId = "org-1";
    const existingSale = {
      id: invoiceId,
      net_amount: 10000,
      paid_amount: 2000,
      sale_return_adjust: 0,
      customer_id: "cust-1",
      sale_number: "INV/26-27/1",
    };

    const updateEq = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const update = vi.fn().mockReturnValue({ eq: updateEq });

    const client = {
      from: vi.fn((table: string) => {
        if (table === "sales") {
          return { update };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }),
    } as unknown as SupabaseClient;

    const results = await syncSalePaymentsFromVouchersBatch(
      [invoiceId],
      orgId,
      "2026-08-22",
      client,
      { existingSalesById: new Map([[invoiceId, existingSale]]) },
    );

    expect(applyRecomputedSalePaymentState).toHaveBeenCalledWith(invoiceId, orgId, client);
    expect(update).toHaveBeenCalledWith({ payment_date: "2026-08-22" });
    const rec = results.get(invoiceId);
    expect(rec?.paid_amount).toBe(5000);
    expect(rec?.payment_status).toBe("partial");
  });
});
