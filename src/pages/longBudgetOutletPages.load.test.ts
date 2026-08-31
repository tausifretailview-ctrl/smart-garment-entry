/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { LONG_BUDGET_OUTLET_ENTRY_PATHS } from "@/lib/tabCacheReadiness";

const LOADERS: Record<(typeof LONG_BUDGET_OUTLET_ENTRY_PATHS)[number], () => Promise<{ default: unknown }>> = {
  "pos-sales": () => import("@/pages/POSSales"),
  "pos-delivery-challan": () => import("@/pages/PosDeliveryChallan"),
  "sales-invoice": () => import("@/pages/SalesInvoice"),
  "sale-return-entry": () => import("@/pages/SaleReturnEntry"),
  "quotation-entry": () => import("@/pages/QuotationEntry"),
  "sale-order-entry": () => import("@/pages/SaleOrderEntry"),
  "purchase-return-entry": () => import("@/pages/PurchaseReturnEntry"),
};

describe("each long-budget Outlet page module loads", () => {
  it.each([...LONG_BUDGET_OUTLET_ENTRY_PATHS])(
    "%s default export is a component",
    async (path) => {
      const mod = await LOADERS[path]();
      expect(mod.default).toEqual(expect.any(Function));
    },
    30_000,
  );
});
