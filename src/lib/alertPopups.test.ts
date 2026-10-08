import { describe, expect, it } from "vitest";
import {
  TODAY_SOLD_REPEAT_MS,
  aggregateTodaySold,
  formatInrShort,
  isAlertPopupDue,
} from "./alertPopups";

describe("isAlertPopupDue", () => {
  const morning = new Date(2026, 9, 8, 10, 0, 0).getTime();

  it("is due when never shown", () => {
    expect(isAlertPopupDue("low_stock", {}, morning)).toBe(true);
  });

  it("shows daily kinds once per calendar day", () => {
    const evening = new Date(2026, 9, 8, 21, 0, 0).getTime();
    const nextDay = new Date(2026, 9, 9, 0, 5, 0).getTime();
    expect(isAlertPopupDue("low_stock", { low_stock: morning }, evening)).toBe(false);
    expect(isAlertPopupDue("low_stock", { low_stock: morning }, nextDay)).toBe(true);
  });

  it("repeats today's sales after the repeat window", () => {
    const log = { today_sold: morning };
    expect(isAlertPopupDue("today_sold", log, morning + TODAY_SOLD_REPEAT_MS - 1)).toBe(false);
    expect(isAlertPopupDue("today_sold", log, morning + TODAY_SOLD_REPEAT_MS)).toBe(true);
  });
});

describe("aggregateTodaySold", () => {
  it("sums lines per variant and sorts by quantity", () => {
    const lines = aggregateTodaySold(
      [
        { variant_id: "a", product_name: "Shirt", size: "M", color: "Blue", quantity: 1 },
        { variant_id: "b", product_name: "Jeans", size: "32", color: null, quantity: 1 },
        { variant_id: "a", product_name: "Shirt", size: "M", color: "Blue", quantity: 2 },
        { variant_id: null, product_name: "Loose", size: null, color: null, quantity: 5 },
        { variant_id: "c", product_name: "Returned", size: null, color: null, quantity: -1 },
      ],
      5,
    );
    expect(lines).toEqual([
      { variantId: "a", name: "Shirt (M / Blue)", qty: 3, stock: null },
      { variantId: "b", name: "Jeans (32)", qty: 1, stock: null },
    ]);
  });

  it("caps the list", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      variant_id: `v${i}`,
      product_name: `P${i}`,
      size: null,
      color: null,
      quantity: i + 1,
    }));
    const lines = aggregateTodaySold(rows, 3);
    expect(lines.map((l) => l.variantId)).toEqual(["v9", "v8", "v7"]);
  });
});

describe("formatInrShort", () => {
  it("rounds and groups Indian style", () => {
    expect(formatInrShort(123456.7)).toBe("₹1,23,457");
  });
});
