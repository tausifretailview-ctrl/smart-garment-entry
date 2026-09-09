import { describe, expect, it } from "vitest";
import {
  buildOutstandingReminderInvoices,
  outstandingReminderBalance,
} from "./salesmanOutstandingReminder";

const INV236 = {
  id: "236",
  sale_number: "INV/26-27/236",
  sale_date: "2026-04-20",
  net_amount: 16606,
  paid_amount: 14721,
  sale_return_adjust: 1885,
  cash_amount: 0,
  card_amount: 0,
  upi_amount: 0,
};

describe("outstandingReminderBalance", () => {
  it("omits INV/26-27/236 when Invoice Dashboard already shows Paid", () => {
    const rec = outstandingReminderBalance({
      sale: { ...INV236, payment_status: "completed" },
      split: { cash: 0, cn: 0, adv: 0, discount: 0 },
    });
    expect(rec.balance).toBe(0);
  });

  it("omits INV/26-27/236 when S/R sits on top of the full bill (items_gross)", () => {
    const rec = outstandingReminderBalance({
      sale: { ...INV236, payment_status: "partial" },
      split: { cash: 0, cn: 0, adv: 0, discount: 0 },
      itemsGross: 16606,
    });
    expect(rec.balance).toBe(0);
  });

  it("keeps a genuinely unpaid bill", () => {
    const rec = outstandingReminderBalance({
      sale: {
        id: "1489",
        sale_number: "INV/26-27/1489",
        sale_date: "2026-08-15",
        net_amount: 10756,
        paid_amount: 0,
        sale_return_adjust: 0,
        payment_status: "pending",
      },
      split: { cash: 0, cn: 0, adv: 0, discount: 0 },
    });
    expect(rec.balance).toBe(10756);
  });

  it("does not hide a post-return unpaid invoice (SRA already in net)", () => {
    const rec = outstandingReminderBalance({
      sale: {
        id: "pr",
        sale_number: "INV/x",
        sale_date: "2026-05-01",
        net_amount: 1000,
        paid_amount: 0,
        sale_return_adjust: 1000,
        payment_status: "pending",
      },
      split: { cash: 0, cn: 0, adv: 0, discount: 0 },
      itemsGross: 2000,
    });
    expect(rec.balance).toBe(1000);
  });
});

describe("buildOutstandingReminderInvoices", () => {
  it("omits INV/26-27/236 from the WhatsApp pending list", () => {
    const now = Date.parse("2026-09-07T00:00:00+05:30");
    const list = buildOutstandingReminderInvoices({
      nowMs: now,
      sales: [
        {
          id: "1489",
          sale_number: "INV/26-27/1489",
          sale_date: "2026-08-15",
          net_amount: 10756,
          paid_amount: 0,
          sale_return_adjust: 0,
          payment_status: "pending",
        },
        { ...INV236, payment_status: "completed" },
      ],
    });
    expect(list.map((i) => i.sale_number)).toEqual(["INV/26-27/1489"]);
    expect(list[0]?.balance).toBe(10756);
  });
});
