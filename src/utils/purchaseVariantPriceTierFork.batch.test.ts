import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();
const insertMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import { resolveVariantsForIncomingPriceTiers } from "./purchaseVariantPriceTierFork";

type VariantRow = {
  id: string;
  product_id: string;
  size: string;
  color: string | null;
  barcode: string | null;
  pur_price: number | null;
  sale_price: number | null;
  mrp: number | null;
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
  });
});
