import { describe, expect, it } from "vitest";
import {
  daysSinceLastCompletedBill,
  splitQuietCustomers,
} from "../src/utils/quietCustomers";
import type { CustomerSegmentIndex } from "../src/utils/customerSegments";

function indexFixture(): CustomerSegmentIndex {
  return {
    counts: { vip: 0, regular: 3, risk: 0, lost: 0, total: 3 },
    segments: {
      a: "regular",
      b: "regular",
      c: "regular",
    },
    stats: {
      a: { orders: 2, revenue: 80_000, lastSaleDate: "2026-07-01" },
      b: { orders: 1, revenue: 800, lastSaleDate: "2025-01-01" },
      c: { orders: 0, revenue: 0, lastSaleDate: null },
    },
  };
}

describe("splitQuietCustomers", () => {
  it("keeps never-purchased out of the dormant list", () => {
    const { dormant, neverPurchasedIds } = splitQuietCustomers(
      indexFixture(),
      30,
      new Date("2026-08-14T12:00:00"),
    );
    expect(neverPurchasedIds).toEqual(["c"]);
    expect(dormant.map((r) => r.customerId).sort()).toEqual(["a", "b"]);
  });

  it("sorts dormant by lifetime revenue descending", () => {
    const { dormant } = splitQuietCustomers(
      indexFixture(),
      30,
      new Date("2026-08-14T12:00:00"),
    );
    expect(dormant.map((r) => r.customerId)).toEqual(["a", "b"]);
    expect(dormant[0].revenue).toBeGreaterThan(dormant[1].revenue);
  });

  it("excludes customers still inside the quiet window", () => {
    const { dormant } = splitQuietCustomers(
      indexFixture(),
      60,
      new Date("2026-08-14T12:00:00"),
    );
    // a is ~44 days quiet → out; b is far past → in
    expect(dormant.map((r) => r.customerId)).toEqual(["b"]);
  });
});

describe("daysSinceLastCompletedBill", () => {
  it("counts whole days from last completed bill", () => {
    expect(daysSinceLastCompletedBill("2026-08-01", new Date("2026-08-14T12:00:00"))).toBe(13);
  });
});
