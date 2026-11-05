import { describe, expect, it } from "vitest";
import { planReceiptSpread } from "./receiptSpreadPlan";

const bill = (sale_number: string, sale_date: string, net: number, paid = 0) => ({
  id: sale_number,
  sale_number,
  sale_date,
  net_amount: net,
  paid_amount: paid,
});

describe("planReceiptSpread", () => {
  it("spreads the Jai Hind ₹27,659 receipt over the open bills oldest first", () => {
    const bills = [
      bill("INV/26-27/1718", "2026-09-11", 5173),
      bill("INV/26-27/1657", "2026-09-06", 13272),
      bill("INV/26-27/1143", "2026-07-11", 3852, 2979),
      bill("INV/26-27/1306", "2026-07-28", 8751),
      bill("INV/26-27/1301", "2026-07-28", 1252),
      bill("POS/26-27/2521", "2026-07-28T10:52:56Z", 1049),
      bill("INV/26-27/1454", "2026-08-12", 1619),
      bill("INV/26-27/1480", "2026-08-14", 8900),
      bill("INV/26-27/1485", "2026-08-15", 2349),
      bill("INV/26-27/1625", "2026-09-01", 14678),
      bill("INV/26-27/1633", "2026-09-02", 1216),
    ];
    const plan = planReceiptSpread(27659, bills);
    expect(plan.parts.map((p) => [p.saleNumber, p.amount])).toEqual([
      ["INV/26-27/1143", 873],
      ["INV/26-27/1301", 1252],
      ["INV/26-27/1306", 8751],
      ["POS/26-27/2521", 1049],
      ["INV/26-27/1454", 1619],
      ["INV/26-27/1480", 8900],
      ["INV/26-27/1485", 2349],
      ["INV/26-27/1625", 2866],
    ]);
    expect(plan.leftover).toBe(0);
    expect(plan.parts.reduce((s, p) => s + p.amount, 0)).toBe(27659);
  });

  it("keeps what the bills cannot take as leftover", () => {
    const plan = planReceiptSpread(1000, [bill("A", "2026-01-01", 300), bill("B", "2026-01-02", 200, 50)]);
    expect(plan.parts).toEqual([
      { saleId: "A", saleNumber: "A", amount: 300 },
      { saleId: "B", saleNumber: "B", amount: 150 },
    ]);
    expect(plan.leftover).toBe(550);
  });

  it("skips bills with nothing due and keeps paise", () => {
    const plan = planReceiptSpread(100.5, [bill("A", "2026-01-01", 50, 50), bill("B", "2026-01-02", 80.25)]);
    expect(plan.parts).toEqual([{ saleId: "B", saleNumber: "B", amount: 80.25 }]);
    expect(plan.leftover).toBe(20.25);
  });
});
