import { describe, expect, it } from "vitest";
import {
  cashierMessage,
  dueCashierSlot,
  dueDayEndSlot,
  dueLowStockSlot,
  formatHm,
  istClock,
  istDayStartUtc,
  invoiceMessage,
  lowStockMessage,
  shouldSendInvoiceAlert,
  type OwnerAlertSettings,
  reviewMessage,
} from "../supabase/functions/_shared/ownerAlertSchedule";

const base: OwnerAlertSettings = {
  enabled: true,
  cashier_enabled: true,
  cashier_every_hours: 2,
  shop_open: "10:00",
  shop_close: "22:00",
  low_stock_enabled: true,
  low_stock_times: ["10:30", "17:00"],
  low_stock_threshold: 5,
  invoice_mode: "above",
  invoice_min_amount: 5000,
  day_end_enabled: true,
  day_end_time: "22:15",
};

/** IST wall time on 2026-10-02 as a UTC Date. */
const ist = (hm: string) => new Date(Date.parse(`2026-10-02T${hm}:00+05:30`));

describe("IST clock", () => {
  it("converts UTC to IST date and minutes", () => {
    expect(istClock(ist("00:10"))).toEqual({ date: "2026-10-02", minutes: 10 });
    expect(istDayStartUtc("2026-10-02").toISOString()).toBe("2026-10-01T18:30:00.000Z");
  });
});

describe("cashier report slots", () => {
  it("fires every 2 hours after opening, inside the 15-minute window", () => {
    expect(dueCashierSlot(base, ist("12:00"))).toBe("2026-10-02@12:00");
    expect(dueCashierSlot(base, ist("12:14"))).toBe("2026-10-02@12:00");
    expect(dueCashierSlot(base, ist("12:15"))).toBeNull();
    expect(dueCashierSlot(base, ist("13:00"))).toBeNull();
    expect(dueCashierSlot(base, ist("20:00"))).toBe("2026-10-02@20:00");
  });
  it("does not fire at opening, at/after closing, or when off", () => {
    expect(dueCashierSlot(base, ist("10:00"))).toBeNull();
    expect(dueCashierSlot(base, ist("22:00"))).toBeNull();
    expect(dueCashierSlot({ ...base, enabled: false }, ist("12:00"))).toBeNull();
    expect(dueCashierSlot({ ...base, cashier_enabled: false }, ist("12:00"))).toBeNull();
  });
  it("supports every 3 hours", () => {
    const s = { ...base, cashier_every_hours: 3 };
    expect(dueCashierSlot(s, ist("12:00"))).toBeNull();
    expect(dueCashierSlot(s, ist("13:05"))).toBe("2026-10-02@13:00");
    expect(dueCashierSlot(s, ist("19:00"))).toBe("2026-10-02@19:00");
  });
});

describe("low stock and day-end", () => {
  it("fires once per configured time", () => {
    expect(dueLowStockSlot(base, ist("10:30"))).toBe("2026-10-02@10:30");
    expect(dueLowStockSlot(base, ist("17:10"))).toBe("2026-10-02@17:00");
    expect(dueLowStockSlot(base, ist("12:00"))).toBeNull();
    expect(dueDayEndSlot(base, ist("22:20"))).toBe("2026-10-02@22:15");
    expect(dueDayEndSlot({ ...base, day_end_enabled: false }, ist("22:20"))).toBeNull();
  });
});

describe("invoice alerts", () => {
  it("respects off / all / above", () => {
    expect(shouldSendInvoiceAlert(base, 4999)).toBe(false);
    expect(shouldSendInvoiceAlert(base, 5000)).toBe(true);
    expect(shouldSendInvoiceAlert({ ...base, invoice_mode: "all" }, 10)).toBe(true);
    expect(shouldSendInvoiceAlert({ ...base, invoice_mode: "off" }, 99999)).toBe(false);
    expect(shouldSendInvoiceAlert({ ...base, enabled: false, invoice_mode: "all" }, 99999)).toBe(false);
  });
});

describe("message text", () => {
  it("builds readable messages", () => {
    expect(formatHm(14 * 60)).toBe("2 PM");
    expect(formatHm(9 * 60 + 30)).toBe("9:30 AM");
    const m = cashierMessage(14 * 60, {
      totalBills: 32,
      totalAmount: 48200,
      totalCash: 21000,
      totalUpi: 19500,
      totalCard: 7700,
      totalBalance: 0,
      refundAmount: 0,
      totalSaleReturnAdjust: 0,
    });
    expect(m.title).toBe("Cashier report 2 PM");
    expect(m.body).toBe("Sales ₹48,200 (32 bills) · Cash ₹21,000 · UPI ₹19,500 · Card ₹7,700");
    expect(lowStockMessage([])).toBeNull();
    expect(
      lowStockMessage([
        { product_name: "Kurti", brand: "Zoha" },
        { product_name: "Plazo" },
        { product_name: "Dupatta" },
        { product_name: "Top" },
      ]),
    ).toEqual({ title: "4 products low on stock", body: "Kurti (Zoha), Plazo, Dupatta +1 more" });
    expect(
      invoiceMessage({ sale_number: "POS/26-27/947", net_amount: 24500, customer_name: "Santosh Kumar", payment_method: "multiple" }),
    ).toEqual({ title: "New bill POS/26-27/947", body: "₹24,500 · Santosh Kumar · multiple" });
  });
});

describe("reviewMessage", () => {
  it("shows stars, customer, comment, bill and source", () => {
    expect(
      reviewMessage({ rating: 4, comment: "Nice  shop", source: "customer_app", sale_number: "S/1", customer_name: "Riya" }),
    ).toEqual({ title: "★★★★☆ review · Riya", body: "“Nice shop” · Bill S/1 · Bill & Offers app" });
  });
  it("flags unhappy reviews and uses tags without a comment", () => {
    expect(reviewMessage({ rating: 1, tags: ["Prices"], source: "whatsapp" })).toEqual({
      title: "⚠️ ★☆☆☆☆ review · A customer",
      body: "Prices · WhatsApp",
    });
  });
});
