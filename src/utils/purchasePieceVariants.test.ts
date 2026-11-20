import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  requests: [] as string[],
  inserts: [] as Array<Array<Record<string, unknown>>>,
  next: 1001,
  reusable: null as { id: string; barcode: string } | null,
  taken: new Set<string>(),
  collideOnce: false,
}));

vi.mock("@/lib/data/barcodeSeries", () => ({
  generateNextBarcodes: async (_org: string, n: number) => {
    st.requests.push(`barcodes:${n}`);
    return Array.from({ length: n }, () => String(st.next++));
  },
}));
vi.mock("@/utils/recycleUnusedGeneratedBarcode", () => ({
  reuseOrRecycleGeneratedSkusOnProduct: async () => {
    st.requests.push("reuse");
    return { reusable: st.reusable, recycled: 0 };
  },
}));
vi.mock("@/utils/barcodeCollisionGuard", () => ({
  isBarcodeCollisionError: (e: { code?: string } | null) => e?.code === "23505",
  ensureFreshGeneratedBarcodes: async (_org: string, list: string[], claimed: Set<string>) => {
    st.requests.push("fresh-check");
    return list.map((b) => {
      let bc = b;
      while (st.taken.has(bc) || claimed.has(bc)) bc = String(st.next++);
      claimed.add(bc);
      return bc;
    });
  },
  ensureFreshGeneratedBarcode: async (_org: string, b: string, claimed: Set<string>) => {
    st.requests.push("fresh-one");
    let bc = b;
    while (st.taken.has(bc) || claimed.has(bc)) bc = String(st.next++);
    claimed.add(bc);
    return bc;
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: (rows: Array<Record<string, unknown>>) => ({
        select: async () => {
          st.requests.push(`insert:${rows.length}`);
          st.inserts.push(rows.map((r) => ({ ...r })));
          if (st.collideOnce) {
            st.collideOnce = false;
            st.taken.add(String(rows[0].barcode));
            return { data: null, error: { code: "23505", message: "duplicate key" } };
          }
          // Returned out of order on purpose: matched back by barcode.
          return { data: rows.map((r, i) => ({ id: `sku-${r.barcode}-${i}`, barcode: r.barcode })).reverse(), error: null };
        },
      }),
    }),
  },
}));

import { createPieceVariantsInBulk } from "./purchasePieceVariants";

const base = {
  organizationId: "org-1",
  productId: "p1",
  size: "None",
  color: "",
  pur_price: 550,
  sale_price: 999,
  mrp: 0,
  excludeSkuIds: [],
};

describe("createPieceVariantsInBulk (individual barcode for every piece)", () => {
  beforeEach(() => {
    st.requests = [];
    st.inserts = [];
    st.next = 1001;
    st.reusable = null;
    st.taken = new Set();
    st.collideOnce = false;
  });

  it("65 pieces: one barcode request, one check, one insert — in series order", async () => {
    const out = await createPieceVariantsInBulk({ ...base, count: 65, reuseLeftover: false });
    expect(out).toHaveLength(65);
    expect(out[0]).toEqual({ id: "sku-1001-0", barcode: "1001" });
    expect(out[64].barcode).toBe("1065");
    expect(st.requests).toEqual(["barcodes:65", "fresh-check", "insert:65"]);
    expect(st.inserts[0][0]).toMatchObject({
      organization_id: "org-1", product_id: "p1", size: "None", barcode_source: "generated",
      pur_price: 550, sale_price: 999, stock_qty: 0, active: true,
    });
  });

  it("fork path reuses one unused leftover SKU first, then makes the rest", async () => {
    st.reusable = { id: "old-sku", barcode: "860001044" };
    const out = await createPieceVariantsInBulk({ ...base, count: 3, reuseLeftover: true });
    expect(out.map((p) => p.id)).toEqual(["old-sku", "sku-1001-0", "sku-1002-1"]);
    expect(out[0].reused).toBe(true);
    expect(st.requests).toEqual(["reuse", "barcodes:2", "fresh-check", "insert:2"]);
  });

  it("a number taken by another till at insert time is replaced and inserted again once", async () => {
    st.collideOnce = true;
    const out = await createPieceVariantsInBulk({ ...base, count: 2, reuseLeftover: false });
    expect(out.map((p) => p.barcode)).toEqual(["1003", "1002"]);
    expect(st.requests).toEqual(["barcodes:2", "fresh-check", "insert:2", "fresh-one", "fresh-one", "insert:2"]);
  });

  it("nothing to do for zero pieces", async () => {
    expect(await createPieceVariantsInBulk({ ...base, count: 0, reuseLeftover: true })).toEqual([]);
    expect(st.requests).toEqual([]);
  });
});
