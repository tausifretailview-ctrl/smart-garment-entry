import { describe, expect, it } from "vitest";
import {
  classifyCustomerSegment,
  diffCustomerSegmentEquivalence,
  type CustomerSegmentIndex,
} from "./customerSegments";

describe("classifyCustomerSegment — SQL CASE parity", () => {
  it("no sales → regular", () => {
    expect(classifyCustomerSegment(undefined)).toBe("regular");
    expect(classifyCustomerSegment({ orders: 0, revenue: 0, lastSaleDate: null })).toBe(
      "regular",
    );
  });

  it("recent VIP by orders / revenue", () => {
    const today = new Date();
    const ymd = today.toISOString().slice(0, 10);
    expect(
      classifyCustomerSegment({ orders: 5, revenue: 100, lastSaleDate: ymd }),
    ).toBe("vip");
    expect(
      classifyCustomerSegment({ orders: 1, revenue: 50_000, lastSaleDate: ymd }),
    ).toBe("vip");
  });

  it("risk / lost by recency bands", () => {
    const d = new Date();
    d.setDate(d.getDate() - 100);
    expect(
      classifyCustomerSegment({
        orders: 10,
        revenue: 100_000,
        lastSaleDate: d.toISOString().slice(0, 10),
      }),
    ).toBe("risk");

    d.setDate(d.getDate() - 300);
    expect(
      classifyCustomerSegment({
        orders: 10,
        revenue: 100_000,
        lastSaleDate: d.toISOString().slice(0, 10),
      }),
    ).toBe("lost");
  });
});

describe("diffCustomerSegmentEquivalence", () => {
  it("returns null when counts match", () => {
    const client: CustomerSegmentIndex = {
      counts: { vip: 1, regular: 2, risk: 3, lost: 4, total: 10 },
      segments: { a: "vip", b: "regular" },
      stats: {},
    };
    expect(
      diffCustomerSegmentEquivalence(client, {
        vip: 1,
        regular: 2,
        risk: 3,
        lost: 4,
        total: 10,
      }),
    ).toBeNull();
  });

  it("reports count and segment diffs", () => {
    const client: CustomerSegmentIndex = {
      counts: { vip: 1, regular: 1, risk: 0, lost: 0, total: 2 },
      segments: { a: "vip", b: "regular" },
      stats: {},
    };
    const rpcIndex: CustomerSegmentIndex = {
      counts: { vip: 0, regular: 2, risk: 0, lost: 0, total: 2 },
      segments: { a: "regular", b: "regular" },
      stats: {},
    };
    const diff = diffCustomerSegmentEquivalence(
      client,
      rpcIndex.counts,
      rpcIndex,
    );
    expect(diff?.countsMatch).toBe(false);
    expect(diff?.segmentMismatchCount).toBe(1);
  });
});
