import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import { searchSaleOrderVariants } from "./saleOrderProductSearch";

type Call = { table: string; ops: Array<[string, unknown[]]> };

/**
 * Lazy thenable like a Supabase query: records filters, and only "sends"
 * (logs `start:<label>`) when awaited / .then() is called.
 */
function mockSupabase(
  handler: (call: Call) => Promise<unknown[]> | unknown[],
  events: string[],
) {
  const calls: Call[] = [];
  fromMock.mockImplementation((table: string) => {
    const call: Call = { table, ops: [] };
    calls.push(call);
    const chain: Record<string, unknown> = {};
    for (const op of ["select", "eq", "is", "or", "in", "order", "limit", "ilike"]) {
      chain[op] = (...args: unknown[]) => {
        call.ops.push([op, args]);
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      events.push(`start:${label(call)}`);
      return Promise.resolve(handler(call))
        .then((data) => {
          events.push(`end:${label(call)}`);
          return { data, error: null };
        })
        .then(resolve, reject);
    };
    return chain;
  });
  return calls;
}

function label(call: Call): string {
  if (call.table === "products") return "products";
  const orArg = call.ops.find(([op]) => op === "or")?.[1][0];
  if (typeof orArg === "string" && orArg.includes("barcode.ilike")) return "barcode";
  const inArg = call.ops.find(([op]) => op === "in")?.[1][1] as string[] | undefined;
  if (inArg) return `chunk:${inArg[0]}`;
  return call.table;
}

const products = Array.from({ length: 100 }, (_, i) => ({
  id: `p${String(i).padStart(3, "0")}`,
  product_name: `Shirt ${i}`,
  brand: "",
  style: "",
  category: "",
}));

function variantRows(productIds: string[], perChunk: number) {
  return Array.from({ length: perChunk }, (_, i) => ({
    id: `v-${productIds[0]}-${i}`,
    product_id: productIds[i % productIds.length],
    size: "M",
    color: "",
    barcode: "",
    stock_qty: 1,
    sale_price: 100,
    mrp: 100,
    products: { product_name: "Shirt", size_group_id: null },
  }));
}

describe("searchSaleOrderVariants round trips", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("sends the barcode lookup before the products lookup finishes", async () => {
    const events: string[] = [];
    let releaseProducts: () => void = () => {};
    const productsGate = new Promise<void>((r) => {
      releaseProducts = r;
    });
    mockSupabase(async (call) => {
      if (call.table === "products") {
        await productsGate;
        return products.slice(0, 5);
      }
      if (label(call) === "barcode") return [];
      return variantRows(["p000"], 3);
    }, events);

    const pending = searchSaleOrderVariants("org-1", "shirt");
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toContain("start:barcode");
    expect(events).not.toContain("end:products");
    releaseProducts();
    await pending;
  });

  it("fetches the first two variant chunks together and stops at 200 rows, as before", async () => {
    const events: string[] = [];
    const calls = mockSupabase((call) => {
      if (call.table === "products") return products;
      if (label(call) === "barcode") return [];
      const ids = call.ops.find(([op]) => op === "in")![1][1] as string[];
      return variantRows(ids, 120);
    }, events);

    const results = await searchSaleOrderVariants("org-1", "shirt");

    const chunkCalls = calls.filter((c) => label(c).startsWith("chunk:"));
    // 100 product ids → chunks at 0 and 40 (120 rows each = 240 ≥ 200); chunk 80 never sent.
    expect(chunkCalls.map(label)).toEqual(["chunk:p000", "chunk:p040"]);
    // Both started before either finished.
    expect(events.indexOf("start:chunk:p040")).toBeLessThan(events.indexOf("end:chunk:p000"));
    expect(results).toHaveLength(240);
  });

  it("still fetches later chunks one at a time when the first two return under 200 rows", async () => {
    const events: string[] = [];
    const calls = mockSupabase((call) => {
      if (call.table === "products") return products;
      if (label(call) === "barcode") return [];
      const ids = call.ops.find(([op]) => op === "in")![1][1] as string[];
      return variantRows(ids, 50);
    }, events);

    const results = await searchSaleOrderVariants("org-1", "shirt");

    const chunkCalls = calls.filter((c) => label(c).startsWith("chunk:"));
    expect(chunkCalls.map(label)).toEqual(["chunk:p000", "chunk:p040", "chunk:p080"]);
    expect(events.indexOf("start:chunk:p080")).toBeGreaterThan(events.indexOf("end:chunk:p040"));
    expect(results).toHaveLength(150);
  });
});
