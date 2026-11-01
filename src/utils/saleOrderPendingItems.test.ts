import { describe, expect, it } from "vitest";
import {
  filterPendingItems,
  pendingItemsTotals,
  summarizePendingItems,
  type PendingItemRow,
} from "./saleOrderPendingItems";

function row(overrides: Partial<PendingItemRow>): PendingItemRow {
  return {
    product_id: "p1",
    variant_id: "v1",
    product_name: "MS Bolt 10mm",
    size: "10MM",
    color: "",
    pending_qty: 10,
    order_id: "o1",
    sale_orders: { order_number: "SO/1", customer_name: "Desai Engg", expected_delivery_date: "2026-11-10" },
    ...overrides,
  };
}

describe("summarizePendingItems", () => {
  it("rolls lines up per variant and works out the shortfall", () => {
    const list = summarizePendingItems(
      [
        row({}),
        row({ order_id: "o2", pending_qty: 15, sale_orders: { order_number: "SO/2", customer_name: "Patil", expected_delivery_date: "2026-11-05" } }),
        row({ order_id: "o2", pending_qty: 5, sale_orders: { order_number: "SO/2", customer_name: "Patil", expected_delivery_date: "2026-11-05" } }),
      ],
      new Map([["v1", 12]]),
    );
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ pendingQty: 30, stockQty: 12, shortQty: 18, earliestDue: "2026-11-05" });
    expect(list[0].orders.map((o) => [o.orderNumber, o.qty])).toEqual([
      ["SO/2", 20],
      ["SO/1", 10],
    ]);
  });

  it("puts short items first, then the earliest due date", () => {
    const list = summarizePendingItems(
      [
        row({ variant_id: "a", product_name: "Washer", pending_qty: 5, sale_orders: { order_number: "SO/1", customer_name: "", expected_delivery_date: "2026-11-02" } }),
        row({ variant_id: "b", product_name: "Nut", pending_qty: 50, sale_orders: { order_number: "SO/3", customer_name: "", expected_delivery_date: "2026-11-20" } }),
        row({ variant_id: "c", product_name: "Gasket", pending_qty: 8, sale_orders: { order_number: "SO/4", customer_name: "", expected_delivery_date: null } }),
      ],
      new Map([
        ["a", 100],
        ["b", 10],
        ["c", 100],
      ]),
    );
    expect(list.map((s) => s.productName)).toEqual(["Nut", "Washer", "Gasket"]);
  });

  it("skips zero lines and never shows negative stock", () => {
    const list = summarizePendingItems([row({ pending_qty: 0 }), row({ variant_id: "v2", pending_qty: 3 })], new Map([["v2", -4]]));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ stockQty: 0, shortQty: 3 });
  });
});

describe("totals and filter", () => {
  const list = summarizePendingItems(
    [
      row({}),
      row({ variant_id: "v2", product_name: "Hex Nut", order_id: "o2", pending_qty: 4, sale_orders: { order_number: "SO/2", customer_name: "Patil Traders", expected_delivery_date: null } }),
    ],
    new Map([
      ["v1", 0],
      ["v2", 10],
    ]),
  );

  it("adds up the report tiles", () => {
    expect(pendingItemsTotals(list)).toEqual({ items: 2, pendingQty: 14, shortItems: 1, shortQty: 10, orders: 2 });
  });

  it("filters by item, customer and short only", () => {
    expect(filterPendingItems(list, "patil", false).map((s) => s.productName)).toEqual(["Hex Nut"]);
    expect(filterPendingItems(list, "", true).map((s) => s.productName)).toEqual(["MS Bolt 10mm"]);
  });
});
