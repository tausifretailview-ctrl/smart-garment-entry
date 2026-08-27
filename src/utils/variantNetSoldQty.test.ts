import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import { getNetSoldQtyByVariantIds } from "./variantNetSoldQty";

function chain(resolver: () => Promise<{ data: unknown; error: unknown }>) {
  const c: Record<string, unknown> = {};
  const self = () => c;
  c.select = () => self();
  c.in = () => self();
  c.is = () => self();
  c.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    resolver().then(resolve, reject);
  return c;
}

describe("getNetSoldQtyByVariantIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: null, error: { message: "missing" } });
  });

  it("returns empty map for no ids", async () => {
    const map = await getNetSoldQtyByVariantIds([]);
    expect(map.size).toBe(0);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("aggregates net sold via client path when RPC is unavailable", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "sale_items") {
        return chain(async () => ({
          data: [
            { variant_id: "sku-a", quantity: 10, sale_id: "sale-1" },
            { variant_id: "sku-a", quantity: 3, sale_id: "sale-2" },
            { variant_id: "sku-b", quantity: 5, sale_id: "sale-1" },
          ],
          error: null,
        }));
      }
      if (table === "sales") {
        return chain(async () => ({
          data: [{ id: "sale-1" }, { id: "sale-2" }],
          error: null,
        }));
      }
      if (table === "sale_return_items") {
        return chain(async () => ({
          data: [{ variant_id: "sku-a", quantity: 2, return_id: "ret-1" }],
          error: null,
        }));
      }
      if (table === "sale_returns") {
        return chain(async () => ({
          data: [{ id: "ret-1" }],
          error: null,
        }));
      }
      throw new Error(`unexpected table ${table}`);
    });

    const map = await getNetSoldQtyByVariantIds(["sku-a", "sku-b"]);

    expect(map.get("sku-a")).toBe(11); // 10 + 3 - 2
    expect(map.get("sku-b")).toBe(5);
  });

  it("uses RPC result when available for a single variant", async () => {
    rpcMock.mockResolvedValue({ data: 7, error: null });

    const map = await getNetSoldQtyByVariantIds(["sku-only"]);

    expect(map.get("sku-only")).toBe(7);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
