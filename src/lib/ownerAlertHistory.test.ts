import { describe, expect, it } from "vitest";
import {
  groupOwnerAlertsByDay,
  isShownOwnerAlert,
  matchesOwnerAlertFilter,
  ownerAlertItem,
  saleIdsToDescribe,
  type OwnerPushLogRow,
} from "./ownerAlertHistory";

const SALE = "3f2b6c1e-8a4d-4b7e-9c11-0d2e5f6a7b8c";
const row = (r: Partial<OwnerPushLogRow>): OwnerPushLogRow => ({
  id: "log-1",
  kind: "invoice",
  ref: SALE,
  created_at: "2026-10-23T09:30:00Z",
  sent_count: 1,
  failed_count: 0,
  ...r,
});

describe("ownerAlertItem", () => {
  it("uses saved text and tap data", () => {
    const item = ownerAlertItem(
      row({ title: "New bill POS/1", body: "₹500 · Riya", data: { route: `/owner-alert/bill/${SALE}`, sale_id: SALE } }),
    );
    expect(item).toMatchObject({ title: "New bill POS/1", body: "₹500 · Riya", path: `/owner-alert/bill/${SALE}` });
  });

  it("rebuilds old bill alerts from the sale", () => {
    const item = ownerAlertItem(row({}), { sale_number: "POS/26-27/9", net_amount: 1499.6, customer_name: "" });
    expect(item.title).toBe("New bill POS/26-27/9");
    expect(item.body).toBe("₹1,500 · Walk-in");
    expect(item.path).toBe(`/owner-alert/bill/${SALE}`);
  });

  it("opens the day report for old cashier and day-end alerts", () => {
    const cashier = ownerAlertItem(row({ kind: "cashier", ref: "2026-10-22@14:00" }));
    expect(cashier.title).toBe("Business report 14:00");
    expect(cashier.path).toBe("/owner-alert/report?date=2026-10-22");
    const dayEnd = ownerAlertItem(row({ kind: "day_end", ref: "2026-10-23@22:15", created_at: "2026-10-23T16:45:00Z" }));
    expect(dayEnd.title).toBe("Day-end summary 23-10-2026");
    expect(dayEnd.path).toBe("/owner-alert/report?date=2026-10-23");
  });

  it("maps stock and review alerts", () => {
    expect(ownerAlertItem(row({ kind: "low_stock", ref: "2026-10-23@10:30" })).path).toBe("/stock-report?status=low");
    expect(ownerAlertItem(row({ kind: "review", ref: SALE })).path).toBe("/customer-reviews");
  });
});

describe("history helpers", () => {
  it("hides old low-stock rows that sent nothing", () => {
    expect(isShownOwnerAlert(row({ kind: "low_stock", sent_count: 0, failed_count: 0 }))).toBe(false);
    expect(isShownOwnerAlert(row({ kind: "low_stock", sent_count: 2 }))).toBe(true);
    expect(isShownOwnerAlert(row({ kind: "invoice", sent_count: 0 }))).toBe(true);
  });

  it("looks up only invoice rows without saved text", () => {
    expect(saleIdsToDescribe([row({}), row({ id: "2" }), row({ id: "3", title: "x" }), row({ kind: "cashier", ref: "a@b" })])).toEqual([
      SALE,
    ]);
  });

  it("filters by kind and unread", () => {
    const bill = ownerAlertItem(row({}));
    expect(matchesOwnerAlertFilter(bill, "bills", false)).toBe(true);
    expect(matchesOwnerAlertFilter(bill, "reports", false)).toBe(false);
    expect(matchesOwnerAlertFilter(bill, "unread", true)).toBe(true);
    expect(matchesOwnerAlertFilter(bill, "unread", false)).toBe(false);
  });

  it("groups by IST day", () => {
    const now = new Date("2026-10-24T05:00:00Z");
    const groups = groupOwnerAlertsByDay(
      [
        { createdAt: "2026-10-24T01:00:00Z" },
        { createdAt: "2026-10-23T19:00:00Z" }, // 00:30 IST on the 24th
        { createdAt: "2026-10-23T10:00:00Z" },
        { createdAt: "2026-10-20T10:00:00Z" },
      ],
      now,
    );
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ["Today", 2],
      ["Yesterday", 1],
      ["Tue, 20 Oct", 1],
    ]);
  });
});

describe("date helpers", () => {
  it("builds IST day bounds", async () => {
    const { istDayBoundsIso, istDayOffset, ownerAlertKindLabel } = await import("./ownerAlertHistory");
    expect(istDayBoundsIso("2026-10-27", "start")).toBe("2026-10-26T18:30:00.000Z");
    expect(istDayBoundsIso("2026-10-27", "end")).toBe("2026-10-27T18:29:59.999Z");
    expect(istDayOffset(0, new Date("2026-10-26T19:00:00Z"))).toBe("2026-10-27");
    expect(istDayOffset(-29, new Date("2026-10-27T05:00:00Z"))).toBe("2026-09-28");
    expect(ownerAlertKindLabel("day_end")).toBe("Day-end");
  });
});
