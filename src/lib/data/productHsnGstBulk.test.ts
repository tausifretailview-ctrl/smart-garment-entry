import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = {
  table: string;
  cols: Record<string, unknown> | null;
  ids: string[];
  inCol: string;
  org: string | null;
};
const updates: Call[] = [];
/** product_variants rows served to reads. */
let variantRows: Array<{ id: string; product_id: string; color: string | null }> = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      const call: Call = { table, cols: null, ids: [], inCol: "", org: null };
      const q: Record<string, unknown> = {};
      q.update = (cols: Record<string, unknown>) => {
        call.cols = cols;
        return q;
      };
      q.eq = (col: string, v: string) => {
        if (col === "organization_id") call.org = v;
        return q;
      };
      q.in = (col: string, ids: string[]) => {
        call.inCol = col;
        call.ids = ids;
        return q;
      };
      for (const m of ["is", "not", "order"]) q[m] = () => q;
      q.select = () => {
        if (call.cols) {
          updates.push(call);
          return Promise.resolve({ data: call.ids.map((id) => ({ id })), error: null });
        }
        return q;
      };
      q.range = (a: number, b: number) => {
        const rows = variantRows.filter((r) => call.ids.includes(r.product_id));
        return Promise.resolve({ data: rows.slice(a, b + 1), error: null });
      };
      q.then = (resolve: (v: unknown) => void) => {
        if (call.cols) updates.push(call);
        resolve({ data: null, error: null });
      };
      return q;
    },
  },
}));

import {
  isValidHsn,
  normalizeHsnInput,
  productHsnGstColumns,
  replaceColorText,
  replaceVariantColors,
  updateProductsHsnGst,
} from "./productHsnGstBulk";

describe("product HSN / GST bulk edit", () => {
  beforeEach(() => {
    updates.length = 0;
    variantRows = [];
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
    const { updated: count } = await updateProductsHsnGst({
      organizationId: "org-1",
      productIds: [...ids, "p1"],
      patch: { hsn: "6109", gstPercent: 5 },
    });
    expect(count).toBe(450);
    expect(updates.map((u) => u.ids.length)).toEqual([200, 200, 50]);
    expect(updates.every((u) => u.org === "org-1")).toBe(true);
    expect(updates[0].cols).toEqual({ hsn_code: "6109", gst_per: 5, sale_gst_percent: 5, purchase_gst_percent: 5 });
  });

  it("sets a colour on the product and every size, skipping products sold in several colours", async () => {
    variantRows = [
      { id: "v1", product_id: "p1", color: "RED" },
      { id: "v2", product_id: "p1", color: "RED" },
      { id: "v3", product_id: "p2", color: null },
      { id: "v4", product_id: "p3", color: "RED" },
      { id: "v5", product_id: "p3", color: "BLUE" },
    ];
    const result = await updateProductsHsnGst({
      organizationId: "org-1",
      productIds: ["p1", "p2", "p3"],
      patch: { color: "NAVY" },
    });
    expect(result).toEqual({ updated: 2, colorSkipped: 1 });
    const variantUpdate = updates.find((u) => u.table === "product_variants");
    expect(variantUpdate?.cols).toEqual({ color: "NAVY" });
    expect(variantUpdate?.inCol).toBe("product_id");
    expect(variantUpdate?.ids).toEqual(["p1", "p2"]);
    const productUpdate = updates.find((u) => u.table === "products");
    expect(productUpdate?.cols).toEqual({ color: "NAVY" });
    expect(productUpdate?.ids).toEqual(["p1", "p2"]);
  });

  it("find & replace on colour changes the sizes too, with special characters taken literally", async () => {
    expect(replaceColorText("RED (DARK)", "(dark)", "MAROON", false)).toBe("RED MAROON");
    expect(replaceColorText("RED", "RE", "X", true)).toBeNull();
    variantRows = [
      { id: "v1", product_id: "p1", color: "LIGHT RED" },
      { id: "v2", product_id: "p1", color: "BLUE" },
      { id: "v3", product_id: "p2", color: "RED" },
    ];
    const changed = await replaceVariantColors({
      organizationId: "org-1",
      productIds: ["p1", "p2"],
      find: "red",
      replace: "MAROON",
      exactMatch: false,
    });
    expect(changed).toBe(2);
    const byColor = Object.fromEntries(updates.map((u) => [String(u.cols?.color), u.ids]));
    expect(byColor).toEqual({ "LIGHT MAROON": ["v1"], MAROON: ["v3"] });
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
    // The line row is its own component; the page hands it the handler.
    const row = read("src/components/sales-invoice/SaleBillLineRow.tsx");
    expect(row).toContain('onChange={(e) => actions.updateHsnCode(item.id, e.target.value)}');
    const page = read("src/pages/SalesInvoice.tsx");
    expect(page).toContain("updateHsnCode: (id, hsnCode) => saleRowHandlersRef.current.updateHsnCode(id, hsnCode)");
    expect(page).toContain("hsn_code: item.hsnCode || null");
  });
});

describe("where colour can be changed", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

  it("Product Entry and the purchase line edit no longer lock colour after a sale", () => {
    expect(read("src/pages/ProductEntry.tsx")).not.toContain("Cannot Change Color");
    expect(read("src/components/ProductEditPanel.tsx")).not.toContain("Cannot change color");
    expect(read("src/pages/ProductEntry.tsx")).toContain("Cannot Change Barcode");
  });

  it("Bulk Product Update colour reaches the sizes", () => {
    const hook = read("src/hooks/useBulkProductUpdate.tsx");
    expect(hook).toContain('if (ufConfig.field === "color")');
    expect(hook).toContain("await replaceVariantColors({");
  });

  it("Product Dashboard bulk edit offers colour", () => {
    expect(read("src/components/products/BulkHsnGstDialog.tsx")).toContain("Change colour");
  });
});
