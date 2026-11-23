import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fetchVariantStock, qtyByVariant, saleLineLiveStock } from "./saleLineLiveStock";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Sale Invoice: live stock per line", () => {
  it("shows stock and what is left after this bill", () => {
    expect(saleLineLiveStock({ variantId: "v1", stockNow: 10, freedByEdit: 0, onBill: 1 })).toMatchObject({
      available: 10,
      left: 9,
      tone: "ok",
      label: "Stock 10 · 9 left",
    });
    expect(saleLineLiveStock({ variantId: "v1", stockNow: 3, freedByEdit: 0, onBill: 2 })).toMatchObject({ left: 1, tone: "low" });
    const short = saleLineLiveStock({ variantId: "v1", stockNow: 2, freedByEdit: 0, onBill: 5 })!;
    expect(short).toMatchObject({ left: -3, tone: "out", label: "Stock 2 · 3 short" });
    expect(short.title).toContain("3 more than stock");
    expect(saleLineLiveStock({ variantId: "v1", stockNow: 4, freedByEdit: 0, onBill: 0 })!.label).toBe("Stock 4");
  });

  it("editing a saved invoice counts the pieces it already took", () => {
    // 5 left in the shop; the saved invoice took 3 of this barcode and still has 3 on it.
    expect(saleLineLiveStock({ variantId: "v1", stockNow: 5, freedByEdit: 3, onBill: 3 })).toMatchObject({ available: 8, left: 5 });
  });

  it("shows nothing for service / combo lines, empty rows or before stock loads", () => {
    expect(saleLineLiveStock({ productType: "service", variantId: "v1", stockNow: 999999, freedByEdit: 0, onBill: 1 })).toBeNull();
    expect(saleLineLiveStock({ productType: "combo", variantId: "v1", stockNow: 5, freedByEdit: 0, onBill: 1 })).toBeNull();
    expect(saleLineLiveStock({ variantId: "", stockNow: 5, freedByEdit: 0, onBill: 1 })).toBeNull();
    expect(saleLineLiveStock({ variantId: "v1", stockNow: undefined, freedByEdit: 0, onBill: 1 })).toBeNull();
  });

  it("adds up the same barcode across lines", () => {
    const m = qtyByVariant([{ variantId: "v1", quantity: 2 }, { variantId: "v2", quantity: 1 }, { variantId: "v1", quantity: 3 }, { variantId: "", quantity: 9 }]);
    expect(Object.fromEntries(m)).toEqual({ v1: 5, v2: 1 });
  });

  it("reads only the bill's barcodes, scoped to the shop", async () => {
    const calls: Array<[string, unknown]> = [];
    const chain: any = {
      select: (c: string) => (calls.push(["select", c]), chain),
      eq: (c: string, v: unknown) => (calls.push([`eq:${c}`, v]), chain),
      in: (c: string, v: unknown) => (calls.push([`in:${c}`, v]), chain),
      order: () => chain,
      range: () => Promise.resolve({ data: [{ id: "v1", stock_qty: 7 }, { id: "v2", stock_qty: null }], error: null }),
      then: (r: any) => Promise.resolve({ data: [{ id: "v1", stock_qty: 7 }, { id: "v2", stock_qty: null }], error: null }).then(r),
    };
    const client = { from: vi.fn(() => chain) };
    expect(await fetchVariantStock(client, "org-1", ["v2", "v1", "v1", ""])).toEqual({ v1: 7, v2: 0 });
    expect(client.from).toHaveBeenCalledWith("product_variants");
    expect(calls).toContainEqual(["eq:organization_id", "org-1"]);
    expect(calls).toContainEqual(["in:id", ["v1", "v2"]]);
    expect(await fetchVariantStock(client, "org-1", [])).toEqual({});
  });

  it("is shown under the barcode on desktop and phone, refreshed while open", () => {
    const page = read("src/pages/SalesInvoice.tsx");
    // Phone cards draw the badge in the page; the desktop row (SaleBillLineRow) gets the same
    // figures from the page and draws it under the barcode.
    expect(page.match(/<SaleLineStockBadge view=\{liveStockFor\(item\)\} \/>/g)).toHaveLength(1);
    expect(page).toContain("const stock = liveStockFor(item);");
    expect(page).toContain("stockLabel={stock?.label ?? null}");
    expect(read("src/components/sales-invoice/SaleBillLineRow.tsx")).toContain("<SaleLineStockBadge view={stockView} />");
    expect(page).toContain("refetchInterval: LIVE_STOCK_REFRESH_MS");
    expect(page).toContain("freedByEdit: editFreedQty(item.variantId)");
    // Screen only: the badge hides when the browser prints the page.
    expect(read("src/components/sales/SaleLineStockBadge.tsx")).toContain("print:hidden");
  });
});
