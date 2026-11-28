import { beforeEach, describe, expect, it } from "vitest";
import { badgeText, countNewSaleOrders, markSaleOrdersSeen, readSaleOrdersSeenAt, type NewSaleOrdersDb } from "./newSaleOrders";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  } as unknown as Storage;
});

describe("new sale orders badge", () => {
  it("first time counts from the start of today (India time); opening the dashboard moves the mark", () => {
    const first = readSaleOrdersSeenAt("o1", "u1", new Date("2026-11-28T08:00:00Z"));
    expect(first).toBe("2026-11-27T18:30:00.000Z");
    expect(readSaleOrdersSeenAt("o1", "u1", new Date("2026-11-29T08:00:00Z"))).toBe(first);
    markSaleOrdersSeen("o1", "u1", new Date("2026-11-28T09:00:00Z"));
    expect(readSaleOrdersSeenAt("o1", "u1")).toBe("2026-11-28T09:00:00.000Z");
  });

  it("counts orders after the mark booked by someone else", async () => {
    const calls: string[] = [];
    const q = {
      eq: (c: string, v: string) => (calls.push(`eq ${c} ${v}`), q),
      is: (c: string) => (calls.push(`is ${c}`), q),
      gt: (c: string, v: string) => (calls.push(`gt ${c} ${v}`), q),
      or: (f: string) => (calls.push(`or ${f}`), Promise.resolve({ count: 4, error: null })),
    };
    const db = { from: () => ({ select: () => q }) } as unknown as NewSaleOrdersDb;
    expect(await countNewSaleOrders(db, "o1", "u1", "2026-11-28T09:00:00.000Z")).toBe(4);
    expect(calls).toEqual([
      "eq organization_id o1",
      "is deleted_at",
      "gt created_at 2026-11-28T09:00:00.000Z",
      "or created_by.is.null,created_by.neq.u1",
    ]);
  });

  it("caps the badge at 99+", () => {
    expect(badgeText(7)).toBe("7");
    expect(badgeText(120)).toBe("99+");
  });
});
