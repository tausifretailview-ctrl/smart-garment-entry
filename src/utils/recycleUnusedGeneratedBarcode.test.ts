import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import {
  findReusableUnusedGeneratedSku,
  isGeneratedSeriesBarcode,
  isUnusedGeneratedSkuCandidate,
  pickLowestUnusedGeneratedSku,
  recycleUnusedGeneratedSku,
  reuseOrRecycleGeneratedSkusOnProduct,
} from "./recycleUnusedGeneratedBarcode";

function chainSelect(rows: unknown[], maybeSingle?: unknown) {
  const c: Record<string, unknown> = {};
  const self = () => c;
  c.select = () => self();
  c.eq = () => self();
  c.in = () => self();
  c.is = () => self();
  c.maybeSingle = () => Promise.resolve({ data: maybeSingle ?? rows[0] ?? null, error: null });
  c.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(resolve, reject);
  return c;
}

describe("isGeneratedSeriesBarcode", () => {
  it("treats org-series / generated source as generated", () => {
    expect(
      isGeneratedSeriesBarcode({ barcode_source: "generated", barcode: "420001730" }),
    ).toBe(true);
  });

  it("never treats Jockey EAN as generated", () => {
    expect(
      isGeneratedSeriesBarcode({
        barcode_source: "external",
        barcode: "8901326331101",
      }),
    ).toBe(false);
    expect(
      isGeneratedSeriesBarcode({
        barcode_source: null,
        barcode: "8901326331101",
      }),
    ).toBe(false);
  });
});

describe("isUnusedGeneratedSkuCandidate", () => {
  it("accepts leftover CLASSIC SAND 420001730 (stock 0, generated)", () => {
    expect(
      isUnusedGeneratedSkuCandidate({
        barcode_source: "generated",
        barcode: "420001730",
        stock_qty: 0,
      }),
    ).toBe(true);
  });

  it("rejects a generated SKU that still has stock", () => {
    expect(
      isUnusedGeneratedSkuCandidate({
        barcode_source: "generated",
        barcode: "11884089",
        stock_qty: 1,
      }),
    ).toBe(false);
  });

  it("rejects universal barcodes even at stock 0", () => {
    expect(
      isUnusedGeneratedSkuCandidate({
        barcode_source: "external",
        barcode: "8901326331101",
        stock_qty: 0,
      }),
    ).toBe(false);
  });
});

describe("pickLowestUnusedGeneratedSku", () => {
  it("reuses the lowest leftover series code first (730 before 732)", () => {
    expect(
      pickLowestUnusedGeneratedSku([
        { barcode: "420001732" },
        { barcode: "420001730" },
        { barcode: "420001731" },
      ])?.barcode,
    ).toBe("420001730");
  });

  it("returns null when there are no leftovers", () => {
    expect(pickLowestUnusedGeneratedSku([])).toBeNull();
  });
});

describe("findReusableUnusedGeneratedSku", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("returns the lowest unused CLASSIC SAND leftover and skips billed SKUs", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "product_variants") {
        return chainSelect([
          {
            id: "sku-732",
            product_id: "prod-sand",
            barcode: "420001732",
            barcode_source: "generated",
            size: "None",
            color: null,
            stock_qty: 0,
          },
          {
            id: "sku-730",
            product_id: "prod-sand",
            barcode: "420001730",
            barcode_source: "generated",
            size: "None",
            color: null,
            stock_qty: 0,
          },
        ]);
      }
      if (table === "purchase_items") return chainSelect([]);
      if (table === "sale_items") return chainSelect([]);
      throw new Error(`unexpected table ${table}`);
    });

    await expect(
      findReusableUnusedGeneratedSku({
        organizationId: "org-1",
        productId: "prod-sand",
        size: "None",
        color: null,
        excludeSkuIds: ["sku-on-bill"],
      }),
    ).resolves.toEqual({ id: "sku-730", barcode: "420001730" });
  });
});

describe("recycleUnusedGeneratedSku", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("does not recycle a SKU still sitting on the bill", async () => {
    const recycled = await recycleUnusedGeneratedSku({
      organizationId: "org-1",
      skuId: "sku-730",
      excludeSkuIds: ["sku-730"],
    });
    expect(recycled).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("reuseOrRecycleGeneratedSkusOnProduct", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  const leftovers = [
    { id: "sku-m-732", product_id: "p", barcode: "420001732", barcode_source: "generated", size: "M", color: null, stock_qty: 0 },
    { id: "sku-m-730", product_id: "p", barcode: "420001730", barcode_source: "generated", size: "M", color: null, stock_qty: 0 },
    { id: "sku-l-740", product_id: "p", barcode: "420001740", barcode_source: "generated", size: "L", color: null, stock_qty: 0 },
    { id: "sku-billed", product_id: "p", barcode: "420001750", barcode_source: "generated", size: "L", color: null, stock_qty: 0 },
    { id: "sku-on-bill", product_id: "p", barcode: "420001760", barcode_source: "generated", size: "M", color: null, stock_qty: 0 },
  ];

  function mockTables(updatedIds: string[][]) {
    let variantCalls = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === "product_variants") {
        variantCalls += 1;
        if (variantCalls === 1) return chainSelect(leftovers);
        // Soft-delete: .update().eq().in("id", ids).is().select("id")
        let ids: string[] = [];
        const c: Record<string, unknown> = {};
        c.update = () => c;
        c.eq = () => c;
        c.is = () => c;
        c.in = (_col: string, values: string[]) => {
          ids = values;
          return c;
        };
        c.select = () => {
          updatedIds.push(ids);
          return Promise.resolve({ data: ids.map((id) => ({ id })), error: null });
        };
        return c;
      }
      if (table === "purchase_items") return chainSelect([{ sku_id: "sku-billed" }]);
      if (table === "sale_items") return chainSelect([]);
      throw new Error(`unexpected table ${table}`);
    });
  }

  it("reuses the lowest leftover for the size and recycles the other unused leftovers in one update", async () => {
    const updatedIds: string[][] = [];
    mockTables(updatedIds);

    const result = await reuseOrRecycleGeneratedSkusOnProduct({
      organizationId: "org-1",
      productId: "p",
      size: "M",
      color: null,
      excludeSkuIds: ["sku-on-bill"],
    });

    expect(result.reusable).toEqual({ id: "sku-m-730", barcode: "420001730" });
    // Never the reused SKU, a SKU with purchase/sale history, or one on the bill.
    expect(updatedIds).toEqual([["sku-m-732", "sku-l-740"]]);
    expect(result.recycled).toBe(2);
  });

  it("recycles every unused leftover when none matches the size", async () => {
    const updatedIds: string[][] = [];
    mockTables(updatedIds);

    const result = await reuseOrRecycleGeneratedSkusOnProduct({
      organizationId: "org-1",
      productId: "p",
      size: "XL",
      color: null,
      excludeSkuIds: ["sku-on-bill"],
    });

    expect(result.reusable).toBeNull();
    expect(updatedIds).toEqual([["sku-m-732", "sku-m-730", "sku-l-740"]]);
  });
});
