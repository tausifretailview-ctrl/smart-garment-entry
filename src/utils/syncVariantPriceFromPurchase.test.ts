import { describe, expect, it, vi, beforeEach } from "vitest";

const updateMock = vi.fn();
const eqCalls: unknown[][] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.update = (...args: unknown[]) => {
        updateMock(...args);
        return self();
      };
      chain.eq = (...args: unknown[]) => {
        eqCalls.push(args);
        return self();
      };
      chain.is = () => self();
      // Terminal thenable so `await query` resolves
      chain.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ error: null }).then(resolve);
      return chain;
    }),
  },
}));

import { syncVariantPriceFromPurchase } from "./syncVariantPriceFromPurchase";

describe("syncVariantPriceFromPurchase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eqCalls.length = 0;
  });

  it("updates master and last_purchase sale/pur prices together", async () => {
    await syncVariantPriceFromPurchase({
      barcode: "100003411",
      purPrice: 1,
      salePrice: 1000,
      organizationId: "org-1",
      variantId: "sku-1",
      purchaseDate: "2026-08-07",
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pur_price: 1,
        sale_price: 1000,
        last_purchase_pur_price: 1,
        last_purchase_sale_price: 1000,
        last_purchase_date: expect.any(String),
      }),
    );
    expect(eqCalls.some((args) => args[0] === "id" && args[1] === "sku-1")).toBe(true);
  });

  it("skips when sale price is not positive", async () => {
    await syncVariantPriceFromPurchase({
      barcode: "100003411",
      purPrice: 1,
      salePrice: 0,
      organizationId: "org-1",
      variantId: "sku-1",
    });
    expect(updateMock).not.toHaveBeenCalled();
  });
});
