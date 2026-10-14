import { describe, expect, it } from "vitest";
import {
  buildStockSummaryArticles,
  countArticleStatuses,
  type StockSummaryVariant,
} from "./stockSummaryArticles";

function v(partial: Partial<StockSummaryVariant> & { id: string; size: string; stock_qty: number }): StockSummaryVariant {
  return {
    product_name: "SHIRT",
    brand: "KS",
    category: "",
    style: "",
    color: "RED",
    barcode: "",
    uom: "NOS",
    opening_qty: 0,
    purchase_qty: 0,
    purchase_return_qty: 0,
    sales_qty: 0,
    sale_return_qty: 0,
    sale_price: 100,
    pur_price: 60,
    ...partial,
  };
}

describe("buildStockSummaryArticles", () => {
  it("flags a broken size set as cut and lists the missing sizes in size order", () => {
    const [a] = buildStockSummaryArticles(
      [v({ id: "1", size: "XL", stock_qty: 0 }), v({ id: "2", size: "M", stock_qty: 3 }), v({ id: "3", size: "S", stock_qty: 0 })],
      { byColor: true },
    );
    expect(a.status).toBe("cut");
    expect(a.sizes.map((s) => s.size)).toEqual(["S", "M", "XL"]);
    expect(a.cutSizes).toEqual(["S", "XL"]);
    expect(a.inStockSizes).toEqual(["M"]);
    expect(a.totalStock).toBe(3);
    expect(a.stockValue).toBe(180);
    expect(a.saleValue).toBe(300);
  });

  it("keeps colours apart when grouped by colour and merges them otherwise", () => {
    const rows = [
      v({ id: "1", size: "M", stock_qty: 2 }),
      v({ id: "2", size: "L", stock_qty: 0 }),
      v({ id: "3", size: "M", stock_qty: 0, color: "BLUE" }),
      v({ id: "4", size: "L", stock_qty: 4, color: "BLUE" }),
    ];
    const byColor = buildStockSummaryArticles(rows, { byColor: true });
    expect(byColor).toHaveLength(2);
    expect(countArticleStatuses(byColor)).toMatchObject({ all: 2, cut: 2 });

    const merged = buildStockSummaryArticles(rows, { byColor: false });
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe("full");
    expect(merged[0].colors).toEqual(["RED", "BLUE"]);
    expect(merged[0].sizes.map((s) => s.qty)).toEqual([2, 4]);
  });

  it("marks full, out and single-size articles", () => {
    const list = buildStockSummaryArticles(
      [
        v({ id: "1", product_name: "A", size: "S", stock_qty: 1 }),
        v({ id: "2", product_name: "A", size: "M", stock_qty: 1 }),
        v({ id: "3", product_name: "B", size: "S", stock_qty: 0 }),
        v({ id: "4", product_name: "B", size: "M", stock_qty: -1 }),
        v({ id: "5", product_name: "C", size: "Free", stock_qty: 5 }),
      ],
      { byColor: true },
    );
    expect(list.map((a) => [a.productName, a.status])).toEqual([
      ["A", "full"],
      ["B", "out"],
      ["C", "single"],
    ]);
  });
});
