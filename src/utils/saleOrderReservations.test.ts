import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  combineSaleOrderReservations,
  formatSaleOrderReservationTooltip,
  summarizeSaleOrderReservations,
  type SaleOrderReservationRow,
} from "./saleOrderReservations";

const row = (
  variant_id: string,
  order_id: string,
  pending_qty: number,
  status = "pending",
  extra: Partial<NonNullable<SaleOrderReservationRow["sale_orders"]>> = {},
): SaleOrderReservationRow => ({
  variant_id,
  order_id,
  pending_qty,
  sale_orders: {
    order_number: `SO/${order_id}`,
    customer_name: `Customer ${order_id}`,
    status,
    deleted_at: null,
    ...extra,
  },
});

describe("summarizeSaleOrderReservations", () => {
  it("sums pending qty per variant across open orders", () => {
    const map = summarizeSaleOrderReservations([
      row("v1", "1", 2),
      row("v1", "2", 1, "partial"),
      row("v2", "1", 3),
    ]);
    expect(map.get("v1")?.qty).toBe(3);
    expect(map.get("v1")?.orders.map((o) => o.orderNumber)).toEqual(["SO/1", "SO/2"]);
    expect(map.get("v2")?.qty).toBe(3);
  });

  it("ignores billed, cancelled, deleted and zero-pending lines", () => {
    const map = summarizeSaleOrderReservations([
      row("v1", "1", 2, "confirmed"),
      row("v1", "2", 2, "cancelled"),
      row("v1", "3", 2, "pending", { deleted_at: "2026-09-01" }),
      row("v1", "4", 0),
    ]);
    expect(map.has("v1")).toBe(false);
  });

  it("skips the order being edited", () => {
    const map = summarizeSaleOrderReservations([row("v1", "1", 2), row("v1", "2", 1)], "1");
    expect(map.get("v1")?.qty).toBe(1);
  });

  it("merges two lines of the same order", () => {
    const map = summarizeSaleOrderReservations([row("v1", "1", 2), row("v1", "1", 1)]);
    expect(map.get("v1")?.orders).toHaveLength(1);
    expect(map.get("v1")?.orders[0].qty).toBe(3);
  });
});

describe("combineSaleOrderReservations", () => {
  it("adds up duplicate variants merged into one size-grid cell", () => {
    const map = summarizeSaleOrderReservations([row("a", "1", 1), row("b", "1", 1), row("b", "2", 2)]);
    const combined = combineSaleOrderReservations(["a", "b", "c"], map);
    expect(combined?.qty).toBe(4);
    expect(combined?.orders.find((o) => o.orderId === "1")?.qty).toBe(2);
    expect(combineSaleOrderReservations(["c"], map)).toBeNull();
  });
});

describe("formatSaleOrderReservationTooltip", () => {
  it("lists order number, customer and qty", () => {
    const map = summarizeSaleOrderReservations([row("v1", "7", 2)]);
    expect(formatSaleOrderReservationTooltip(map.get("v1")!)).toBe(
      "Reserved in open Sale Order(s):\nSO/7 · Customer 7 · 2 pcs",
    );
  });
});
