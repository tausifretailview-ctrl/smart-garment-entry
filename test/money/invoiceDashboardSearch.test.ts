import { describe, expect, it, vi } from "vitest";
import {
  EMPTY_INVOICE_DASHBOARD_STATS,
  fetchInvoiceDashboardStats,
  shouldUnionSaleItemsForInvoiceSearch,
} from "@/utils/invoiceDashboardData";

describe("shouldUnionSaleItemsForInvoiceSearch", () => {
  it("runs line-item path for customer-like names ≥4 letters (item 1 NOT gating)", () => {
    expect(shouldUnionSaleItemsForInvoiceSearch("ANUSHA PATHAN")).toBe(true);
    expect(shouldUnionSaleItemsForInvoiceSearch("ABC")).toBe(false);
  });

  it("requires ≥8 digits for numeric barcode-like terms", () => {
    expect(shouldUnionSaleItemsForInvoiceSearch("1234567")).toBe(false);
    expect(shouldUnionSaleItemsForInvoiceSearch("12345678")).toBe(true);
  });

  it("skips empty search", () => {
    expect(shouldUnionSaleItemsForInvoiceSearch("")).toBe(false);
    expect(shouldUnionSaleItemsForInvoiceSearch("   ")).toBe(false);
  });
});

describe("fetchInvoiceDashboardStats resilience", () => {
  const filters = {
    organizationId: "org-1",
    saleDateFilter: {
      start: "2026-04-01T00:00:00.000Z",
      end: "2026-08-12T23:59:59.999Z",
    },
    debouncedSearch: "",
    customerId: null as string | null,
    deliveryFilter: "all",
    shopFilter: "all",
    userFilter: "all",
    voucherDateFrom: null as string | null,
    voucherDateTo: null as string | null,
    paymentStatusFilter: [] as string[],
  };

  it("returns empty stats when RPC times out and client fallback also fails (never throws)", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "canceling statement due to statement timeout" },
      }),
      from: vi.fn(() => {
        throw new Error("simulated 500 on sales scan");
      }),
    };

    await expect(
      fetchInvoiceDashboardStats(client as any, filters as any),
    ).resolves.toEqual(EMPTY_INVOICE_DASHBOARD_STATS);
  });

  it("returns empty stats when RPC throws and fallback cannot run", async () => {
    const client = {
      rpc: vi.fn().mockRejectedValue(new Error("network down")),
      from: vi.fn(() => {
        throw new Error("fallback also down");
      }),
    };

    await expect(
      fetchInvoiceDashboardStats(client as any, filters as any),
    ).resolves.toEqual(EMPTY_INVOICE_DASHBOARD_STATS);
  });

  it("parses a successful RPC row", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          totalInvoices: 2,
          totalAmount: 5000,
          totalDiscount: 100,
          totalQty: 3,
          pendingAmount: 500,
          deliveredCount: 1,
          deliveredAmount: 2000,
          undeliveredCount: 1,
          undeliveredAmount: 3000,
        },
        error: null,
      }),
      from: vi.fn(),
    };

    await expect(
      fetchInvoiceDashboardStats(client as any, filters as any),
    ).resolves.toMatchObject({
      totalInvoices: 2,
      totalAmount: 5000,
      pendingAmount: 500,
    });
    expect(client.from).not.toHaveBeenCalled();
  });
});
