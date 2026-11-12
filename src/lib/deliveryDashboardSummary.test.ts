import { describe, expect, it } from "vitest";
import {
  DELIVERY_LIST_COLUMNS,
  deliveryStatusPie,
  deliverySummaryFromRpc,
  deliveryTrendChart,
  istDay,
  summarizeDeliveryRows,
} from "./deliveryDashboardSummary";

describe("delivery dashboard summary", () => {
  it("reads the database summary, tolerating missing fields", () => {
    const s = deliverySummaryFromRpc({
      total: 1502,
      delivered: 502,
      pending: 500,
      in_process: 500,
      delivered_value: "50100",
      pending_value: 50000,
      trend: [{ day: "2026-11-12", delivered: 51, pending: 50, in_process: 50 }],
    });
    expect(s).toMatchObject({ total: 1502, delivered: 502, inProcess: 500, deliveredValue: 50100 });
    expect(s.trend).toEqual([{ day: "2026-11-12", delivered: 51, pending: 50, in_process: 50 }]);
    expect(deliverySummaryFromRpc(null).total).toBe(0);
  });

  it("uses IST days, so a bill just after midnight IST is on the new day", () => {
    expect(istDay("2026-11-11T18:31:00Z")).toBe("2026-11-12");
    expect(istDay("2026-11-11T18:29:00Z")).toBe("2026-11-11");
  });

  it("browser fallback gives the same counts and a 7-day trend", () => {
    const now = new Date("2026-11-12T06:00:00Z");
    const s = summarizeDeliveryRows(
      [
        { delivery_status: "delivered", net_amount: 100, sale_date: "2026-11-12T05:00:00Z" },
        { delivery_status: "undelivered", net_amount: "250", sale_date: "2026-11-11T18:31:00Z" },
        { delivery_status: "in_process", net_amount: 10, sale_date: "2026-11-06T10:00:00Z" },
        { delivery_status: "delivered", net_amount: 5, sale_date: "2026-10-01T10:00:00Z" },
      ],
      7,
      now,
    );
    expect(s).toMatchObject({ total: 4, delivered: 2, pending: 1, inProcess: 1, deliveredValue: 105, pendingValue: 250 });
    expect(s.trend.map((d) => d.day)).toEqual([
      "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12",
    ]);
    expect(s.trend[6]).toEqual({ day: "2026-11-12", delivered: 1, pending: 1, in_process: 0 });
    expect(s.trend[0].in_process).toBe(1);
  });

  it("keeps the chart and pie shapes the screen already draws", () => {
    expect(deliveryTrendChart([{ day: "2026-11-12", delivered: 1, pending: 2, in_process: 3 }])).toEqual([
      { name: "Nov 12", delivered: 1, pending: 2, inProcess: 3 },
    ]);
    expect(deliveryStatusPie({ delivered: 1, pending: 2, inProcess: 3 }).map((p) => p.value)).toEqual([1, 2, 3]);
  });

  it("list fetches every column the screen reads", () => {
    for (const col of [
      "id", "sale_number", "sale_date", "customer_id", "customer_name", "customer_phone",
      "customer_address", "net_amount", "paid_amount", "payment_status", "delivery_status",
    ]) {
      expect(DELIVERY_LIST_COLUMNS.split(", ")).toContain(col);
    }
  });
});
