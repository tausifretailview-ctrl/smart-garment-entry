import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();
const insertMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

import { resolveVariantsForIncomingPriceTiers } from "./purchaseVariantPriceTierFork";
import { resolvePurchaseLineItemsForPriceTiers } from "./syncVariantPriceFromPurchase";

type VariantRow = {
  id: string;
  product_id: string;
  size: string;
  color: string | null;
  barcode: string | null;
  barcode_source?: string | null;
  pur_price: number | null;
  sale_price: number | null;
  mrp: number | null;
  created_at?: string | null;
};

function chainSelect(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  const self = () => c;
  c.select = () => self();
  c.eq = () => self();
  c.in = () => self();
  c.is = () => self();
  c.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
  c.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(resolve, reject);
  return c;
}

describe("resolveVariantsForIncomingPriceTiers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockReset();
    rpcMock.mockReset();
  });

  it("resolves matching tiers without fork using batched reads", async () => {
    const variants: VariantRow[] = [
      {
        id: "sku-729",
        product_id: "prod-729",
        size: "M",
        color: null,
        barcode: "8901326331101",
        pur_price: 500,
        sale_price: 729,
        mrp: null,
      },
      {
        id: "sku-749",
        product_id: "prod-749",
        size: "M",
        color: null,
        barcode: "8901326331101",
        pur_price: 520,
        sale_price: 749,
        mrp: null,
      },
    ];

    fromMock.mockImplementation((table: string) => {
      if (table === "product_variants") return chainSelect(variants);
      if (table === "products") {
        return chainSelect([
          {
            id: "prod-729",
            product_name: "JOCKEY BRA",
            brand: "JOCKEY",
            category: "INNER",
            color: null,
            style: null,
            default_sale_price: 729,
          },
          {
            id: "prod-749",
            product_name: "JOCKEY BRA",
            brand: "JOCKEY",
            category: "INNER",
            color: null,
            style: null,
            default_sale_price: 749,
          },
        ]);
      }
      throw new Error(`unexpected table ${table}`);
    });

    const lines = Array.from({ length: 25 }, (_, i) => ({
      organizationId: "org-1",
      variantId: i % 2 === 0 ? "sku-729" : "sku-749",
      barcode: "8901326331101",
      incomingPurPrice: 500 + i,
      incomingSalePrice: i % 2 === 0 ? 729 : 749,
    }));

    const results = await resolveVariantsForIncomingPriceTiers(lines);

    expect(results).toHaveLength(25);
    expect(results.every(Boolean)).toBe(true);
    expect(results.filter((r) => r?.variantId === "sku-729")).toHaveLength(13);
    expect(results.filter((r) => r?.variantId === "sku-749")).toHaveLength(12);
    // Constant round-trips (not 25× per line): variants×2 + products×1 when no fork
    expect(fromMock.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("400-line resolve stays a constant handful of reads (client, mocked I/O)", async () => {
    const variants: VariantRow[] = [
      {
        id: "sku-729",
        product_id: "prod-729",
        size: "M",
        color: null,
        barcode: "8901326331101",
        pur_price: 500,
        sale_price: 729,
        mrp: null,
      },
    ];
    fromMock.mockImplementation((table: string) => {
      if (table === "product_variants") return chainSelect(variants);
      if (table === "products") {
        return chainSelect([
          {
            id: "prod-729",
            product_name: "JOCKEY BRA",
            brand: "JOCKEY",
            category: "INNER",
            color: null,
            style: null,
            default_sale_price: 729,
          },
        ]);
      }
      throw new Error(`unexpected table ${table}`);
    });

    const lines = Array.from({ length: 400 }, () => ({
      organizationId: "org-1",
      variantId: "sku-729",
      barcode: "8901326331101",
      incomingPurPrice: 500,
      incomingSalePrice: 729,
    }));

    const started = performance.now();
    const results = await resolveVariantsForIncomingPriceTiers(lines);
    const elapsedMs = performance.now() - started;

    expect(results).toHaveLength(400);
    expect(results.every((r) => r?.variantId === "sku-729")).toBe(true);
    expect(fromMock.mock.calls.length).toBeLessThanOrEqual(3);
    expect(elapsedMs).toBeLessThan(250);
  });

  it("dedupes fork inserts for identical tier keys on multiple lines", async () => {
    const variants: VariantRow[] = [
      {
        id: "sku-729",
        product_id: "prod-729",
        size: "M",
        color: null,
        barcode: "8901326331101",
        barcode_source: "external",
        pur_price: 500,
        sale_price: 729,
        mrp: null,
      },
    ];

    const products = [
      {
        id: "prod-729",
        product_name: "JOCKEY BRA",
        brand: "JOCKEY",
        category: "INNER",
        color: null,
        style: null,
        hsn_code: "6108",
        gst_per: 5,
        purchase_gst_percent: 5,
        sale_gst_percent: 5,
        uom: "NOS",
        requires_imei: false,
        default_pur_price: 500,
        default_sale_price: 729,
      },
    ];

    fromMock.mockImplementation((table: string) => {
      if (table === "product_variants") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                is: () => Promise.resolve({ data: variants, error: null }),
              }),
            }),
          }),
          insert: (...args: unknown[]) => {
            insertMock(...args);
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: {
                      id: "sku-new-749",
                      product_id: "prod-new-749",
                      size: "M",
                      color: null,
                      barcode: "8901326331101",
                      pur_price: 524,
                      sale_price: 749,
                      mrp: null,
                    },
                    error: null,
                  }),
              }),
            };
          },
        };
      }
      if (table === "products") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                is: () => Promise.resolve({ data: products, error: null }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: { id: "prod-new-749" }, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const lines = Array.from({ length: 5 }, () => ({
      organizationId: "org-1",
      variantId: "sku-729",
      barcode: "8901326331101",
      incomingPurPrice: 524,
      incomingSalePrice: 749,
    }));

    const results = await resolveVariantsForIncomingPriceTiers(lines);

    expect(results.every((r) => r?.variantId === "sku-new-749")).toBe(true);
    expect(insertMock).toHaveBeenCalledTimes(1);
    const inserted = insertMock.mock.calls[0][0] as { barcode: string; barcode_source: string };
    expect(inserted.barcode).toBe("8901326331101");
    expect(inserted.barcode_source).toBe("external");
  });

  it("does not fork when the bill only fills empty MRP at the same sale price", async () => {
    const variants: VariantRow[] = [
      {
        id: "sku-jeans",
        product_id: "prod-jeans",
        size: "28",
        color: null,
        barcode: "450006800",
        barcode_source: "generated",
        pur_price: 750,
        sale_price: 1199,
        mrp: null,
      },
    ];

    fromMock.mockImplementation((table: string) => {
      if (table === "product_variants") return chainSelect(variants);
      if (table === "products") {
        return chainSelect([
          {
            id: "prod-jeans",
            product_name: "JEANS - NARROW - HASTY",
            brand: null,
            category: null,
            color: null,
            style: null,
            default_sale_price: 1199,
          },
        ]);
      }
      throw new Error(`unexpected table ${table}`);
    });

    const results = await resolveVariantsForIncomingPriceTiers([
      {
        organizationId: "org-chirag",
        variantId: "sku-jeans",
        barcode: "450006800",
        incomingPurPrice: 750,
        incomingSalePrice: 1199,
        incomingMrp: 1199,
      },
    ]);

    expect(results).toEqual([
      {
        variantId: "sku-jeans",
        productId: "prod-jeans",
        forked: false,
        barcode: "450006800",
      },
    ]);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("attaches a draft/edit line that already carries an existing generated barcode instead of forking a new product", async () => {
    const variants: VariantRow[] = [
      {
        id: "sku-jeans",
        product_id: "prod-jeans",
        size: "28",
        color: null,
        barcode: "450006800",
        barcode_source: "generated",
        pur_price: 750,
        sale_price: 1199,
        mrp: null,
      },
    ];

    fromMock.mockImplementation((table: string) => {
      if (table === "purchase_items") return chainSelect([{ sku_id: "sku-jeans" }]);
      if (table === "sale_items") return chainSelect([]);
      if (table === "product_variants") return chainSelect(variants);
      if (table === "products") {
        return chainSelect([
          {
            id: "prod-jeans",
            product_name: "JEANS - NARROW - HASTY",
            brand: null,
            category: null,
            color: null,
            style: null,
            default_sale_price: 1199,
          },
        ]);
      }
      throw new Error(`unexpected table ${table}`);
    });

    const results = await resolveVariantsForIncomingPriceTiers([
      {
        organizationId: "org-chirag",
        variantId: "sku-jeans",
        barcode: "450006800",
        incomingPurPrice: 750,
        incomingSalePrice: 1299,
        incomingMrp: 1299,
      },
    ]);

    expect(results[0]).toEqual({
      variantId: "sku-jeans",
      productId: "prod-jeans",
      forked: false,
      barcode: "450006800",
    });
    expect(insertMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("still forks a generated sibling when the line barcode is empty and the SKU has posted history", async () => {
    const variants: VariantRow[] = [
      {
        id: "sku-jeans",
        product_id: "prod-jeans",
        size: "28",
        color: null,
        barcode: "450006800",
        barcode_source: "generated",
        pur_price: 750,
        sale_price: 1199,
        mrp: null,
      },
    ];

    const products = [
      {
        id: "prod-jeans",
        product_name: "JEANS - NARROW - HASTY",
        brand: null,
        category: null,
        color: null,
        style: null,
        hsn_code: null,
        gst_per: 0,
        purchase_gst_percent: 0,
        sale_gst_percent: 0,
        uom: "NOS",
        requires_imei: false,
        default_pur_price: 750,
        default_sale_price: 1199,
      },
    ];

    rpcMock.mockResolvedValue({ data: "450006801", error: null });

    fromMock.mockImplementation((table: string) => {
      if (table === "purchase_items") return chainSelect([{ sku_id: "sku-jeans" }]);
      if (table === "sale_items") return chainSelect([]);
      if (table === "product_variants") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                is: () => Promise.resolve({ data: variants, error: null }),
              }),
              eq: () => ({
                is: () => ({
                  limit: () => Promise.resolve({ data: [], error: null }),
                }),
              }),
            }),
          }),
          insert: (...args: unknown[]) => {
            insertMock(...args);
            const payload = args[0] as { barcode: string };
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: {
                      id: "sku-jeans-new",
                      product_id: "prod-jeans-new",
                      size: "28",
                      color: null,
                      barcode: payload.barcode,
                      barcode_source: "generated",
                      pur_price: 750,
                      sale_price: 1299,
                      mrp: 1299,
                    },
                    error: null,
                  }),
              }),
            };
          },
        };
      }
      if (table === "products") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                is: () => Promise.resolve({ data: products, error: null }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: { id: "prod-jeans-new" }, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const results = await resolveVariantsForIncomingPriceTiers([
      {
        organizationId: "org-chirag",
        variantId: "sku-jeans",
        barcode: "",
        incomingPurPrice: 750,
        incomingSalePrice: 1299,
        incomingMrp: 1299,
      },
    ]);

    expect(results[0]).toEqual({
      variantId: "sku-jeans-new",
      productId: "prod-jeans-new",
      forked: true,
      barcode: "450006801",
    });
    expect(rpcMock).toHaveBeenCalledWith("generate_next_barcode", {
      p_organization_id: "org-chirag",
    });
    expect(insertMock).toHaveBeenCalledTimes(1);
    const inserted = insertMock.mock.calls[0][0] as {
      barcode: string;
      barcode_source: string;
    };
    expect(inserted.barcode).toBe("450006801");
    expect(inserted.barcode_source).toBe("generated");
    expect(inserted.barcode).not.toBe("450006800");
  });

  it("updates an unused generated SKU in place (CRIMSON PUNCH 420001739 sale 550 → 590)", async () => {
    const variants: VariantRow[] = [
      {
        id: "sku-739",
        product_id: "prod-punch",
        size: "None",
        color: null,
        barcode: "420001739",
        barcode_source: "generated",
        pur_price: 442.5,
        sale_price: 550,
        mrp: 0,
      },
    ];

    fromMock.mockImplementation((table: string) => {
      if (table === "purchase_items" || table === "sale_items") return chainSelect([]);
      if (table === "product_variants") return chainSelect(variants);
      if (table === "products") {
        return chainSelect([
          {
            id: "prod-punch",
            product_name: "07 CRIMSON PUNCH",
            brand: "SWISS BEAUTY",
            category: "COSMETICS",
            color: null,
            style: "LIQ. LIPSTICK",
            default_sale_price: 550,
          },
        ]);
      }
      throw new Error(`unexpected table ${table}`);
    });

    const results = await resolveVariantsForIncomingPriceTiers([
      {
        organizationId: "org-1",
        variantId: "sku-739",
        barcode: "420001739",
        incomingPurPrice: 442.5,
        incomingSalePrice: 590,
      },
    ]);

    expect(results).toEqual([
      {
        variantId: "sku-739",
        productId: "prod-punch",
        forked: false,
        barcode: "420001739",
      },
    ]);
    expect(insertMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("edit/resave of a draft line carrying an existing barcode stocks the pre-existing item, not a new product", async () => {
    const variants: VariantRow[] = [
      {
        id: "sku-existing",
        product_id: "prod-existing",
        size: "7",
        color: "BK",
        barcode: "0040017398",
        barcode_source: "generated",
        pur_price: 80,
        sale_price: 150,
        mrp: 164.5,
        created_at: "2026-01-15T00:00:00.000Z",
      },
      {
        id: "sku-new",
        product_id: "prod-new",
        size: "7",
        color: "BK",
        barcode: "0040019999",
        barcode_source: "generated",
        pur_price: 100,
        sale_price: 200,
        mrp: 200,
        created_at: "2026-09-10T00:00:00.000Z",
      },
    ];

    fromMock.mockImplementation((table: string) => {
      if (table === "product_variants") return chainSelect(variants);
      if (table === "products") {
        return chainSelect([
          {
            id: "prod-existing",
            product_name: "PUG42",
            brand: "PUG",
            category: "FOOTWEAR",
            color: "BK",
            style: "RLX",
            default_sale_price: 150,
          },
          {
            id: "prod-new",
            product_name: "PUG42",
            brand: "PUG",
            category: "FOOTWEAR",
            color: "BK",
            style: "RLX",
            default_sale_price: 200,
          },
        ]);
      }
      throw new Error(`unexpected table ${table}`);
    });

    const resolved = await resolvePurchaseLineItemsForPriceTiers("org-ks-footwear", [
      {
        sku_id: "sku-new",
        product_id: "prod-new",
        barcode: "0040017398",
        size: "7",
        pur_price: 100,
        sale_price: 200,
        mrp: 200,
      },
    ]);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].sku_id).toBe("sku-existing");
    expect(resolved[0].product_id).toBe("prod-existing");
    expect(resolved[0].barcode).toBe("0040017398");
    expect(insertMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
