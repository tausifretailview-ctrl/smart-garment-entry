import { describe, expect, it, vi, beforeEach } from "vitest";

const updateMock = vi.fn();
const eqCalls: unknown[][] = [];

const resolveMock = vi.fn();

vi.mock("@/utils/purchaseVariantPriceTierFork", () => ({
  resolveVariantForIncomingPriceTier: (...args: unknown[]) => resolveMock(...args),
}));

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
    resolveMock.mockReset();
  });

  it("updates master and last_purchase sale/pur prices on the resolved variant", async () => {
    resolveMock.mockResolvedValue({
      variantId: "sku-1",
      productId: "prod-1",
      forked: false,
    });

    const result = await syncVariantPriceFromPurchase({
      barcode: "8901326331101",
      purPrice: 510,
      salePrice: 729,
      organizationId: "org-1",
      variantId: "sku-1",
      purchaseDate: "2026-08-27",
    });

    expect(result).toEqual({
      variantId: "sku-1",
      productId: "prod-1",
      forked: false,
    });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pur_price: 510,
        sale_price: 729,
        last_purchase_pur_price: 510,
        last_purchase_sale_price: 729,
      }),
    );
    expect(eqCalls.some((args) => args[0] === "id" && args[1] === "sku-1")).toBe(true);
  });

  it("forks to a new variant id when sale tier differs (729 → 749)", async () => {
    resolveMock.mockResolvedValue({
      variantId: "sku-749",
      productId: "prod-749",
      forked: true,
    });

    const result = await syncVariantPriceFromPurchase({
      barcode: "8901326331101",
      purPrice: 524,
      salePrice: 749,
      organizationId: "org-1",
      variantId: "sku-729",
      purchaseDate: "2026-08-27",
    });

    expect(result?.forked).toBe(true);
    expect(result?.variantId).toBe("sku-749");
    expect(eqCalls.some((args) => args[0] === "id" && args[1] === "sku-749")).toBe(true);
    expect(eqCalls.some((args) => args[0] === "id" && args[1] === "sku-729")).toBe(false);
  });

  it("skips when sale price is not positive", async () => {
    await syncVariantPriceFromPurchase({
      barcode: "8901326331101",
      purPrice: 510,
      salePrice: 0,
      organizationId: "org-1",
      variantId: "sku-1",
    });
    expect(resolveMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
