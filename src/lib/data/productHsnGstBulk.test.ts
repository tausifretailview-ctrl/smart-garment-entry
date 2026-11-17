import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updates: Array<{ cols: Record<string, unknown>; ids: string[]; org: string | null }> = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from() {
      const call = { cols: {} as Record<string, unknown>, ids: [] as string[], org: null as string | null };
      const q: Record<string, unknown> = {};
      q.update = (cols: Record<string, unknown>) => {
        call.cols = cols;
        return q;
      };
      q.eq = (col: string, v: string) => {
        if (col === "organization_id") call.org = v;
        return q;
      };
      q.in = (_c: string, ids: string[]) => {
        call.ids = ids;
        return q;
      };
      q.is = () => q;
      q.select = () => {
        updates.push(call);
        return Promise.resolve({ data: call.ids.map((id) => ({ id })), error: null });
      };
      return q;
    },
  },
}));

import {
  isValidHsn,
  normalizeHsnInput,
  productHsnGstColumns,
  updateProductsHsnGst,
} from "./productHsnGstBulk";

describe("product HSN / GST bulk edit", () => {
  beforeEach(() => {
    updates.length = 0;
  });

  it("writes the sale and purchase GST together with gst_per (bills read those first)", () => {
    expect(productHsnGstColumns({ gstPercent: 40 })).toEqual({
      gst_per: 40,
      sale_gst_percent: 40,
      purchase_gst_percent: 40,
    });
    expect(productHsnGstColumns({ hsn: "6109" })).toEqual({ hsn_code: "6109" });
    expect(productHsnGstColumns({})).toEqual({});
  });

  it("keeps only digits in an HSN and accepts 2 to 8 of them", () => {
    expect(normalizeHsnInput("61-09 ab 1234567")).toBe("61091234");
    expect(isValidHsn("61")).toBe(true);
    expect(isValidHsn("61091000")).toBe(true);
    expect(isValidHsn("6")).toBe(false);
    expect(isValidHsn("")).toBe(false);
  });

  it("updates the selected products of this shop only, 200 per request", async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `p${i}`);
    const count = await updateProductsHsnGst({
      organizationId: "org-1",
      productIds: [...ids, "p1"],
      patch: { hsn: "6109", gstPercent: 5 },
    });
    expect(count).toBe(450);
    expect(updates.map((u) => u.ids.length)).toEqual([200, 200, 50]);
    expect(updates.every((u) => u.org === "org-1")).toBe(true);
    expect(updates[0].cols).toEqual({ hsn_code: "6109", gst_per: 5, sale_gst_percent: 5, purchase_gst_percent: 5 });
  });

  it("refuses a bad HSN or a rate that is not a product GST rate, and does nothing", async () => {
    await expect(
      updateProductsHsnGst({ organizationId: "org-1", productIds: ["p1"], patch: { hsn: "6" } }),
    ).rejects.toThrow(/2 to 8 digits/);
    await expect(
      updateProductsHsnGst({ organizationId: "org-1", productIds: ["p1"], patch: { gstPercent: 3 } }),
    ).rejects.toThrow(/not a product GST rate/);
    expect(updates).toHaveLength(0);
  });
});

describe("where HSN / GST can be changed", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

  it("Product Dashboard offers Edit HSN / GST for the selected products", () => {
    const src = read("src/pages/ProductDashboard.tsx");
    expect(src).toContain("<BulkHsnGstDialog");
    expect(src).toContain("productIds={Array.from(selectedProducts)}");
  });

  it("Bulk Product Update sets all three GST columns and no longer rewrites GST on saved bills", () => {
    const src = read("src/hooks/useBulkProductUpdate.tsx");
    expect(src).toContain("productHsnGstColumns({ gstPercent: gstConfig.newGst })");
    expect(src).not.toMatch(/gst_per:\s*"gst_percent"/);
    expect(src).not.toMatch(/batchCascade\("gst_per"/);
  });

  it("Sales Invoice lets the HSN cell be edited (click / Enter), outside the Tab order", () => {
    const hook = read("src/hooks/useSalesInvoiceLineGridKeyboard.ts");
    expect(hook).toContain('const CLICK_EDIT_TEXT_COLS = new Set<SaleLineGridColKey>(["hsn"]);');
    expect(hook).toMatch(/const EDITABLE_COLS: SaleLineGridColKey\[\] = \[\s*"qty",\s*"box",\s*"mrp",\s*"price",\s*"disc_percent",\s*"disc_amount",\s*\];/);
    const page = read("src/pages/SalesInvoice.tsx");
    expect(page).toContain('onChange={(e) => updateHsnCode(item.id, e.target.value)}');
    expect(page).toContain("hsn_code: item.hsnCode || null");
  });
});
