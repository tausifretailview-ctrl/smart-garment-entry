import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  writes: [] as Array<{ patch: unknown; ids: unknown; bill: unknown }>,
  failOn: null as string | null,
  inFlight: 0,
  maxInFlight: 0,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        const finish = (ids: unknown) => ({
          eq: (_k: string, bill: string) => ({
            is: async () => {
              db.inFlight += 1;
              db.maxInFlight = Math.max(db.maxInFlight, db.inFlight);
              await new Promise((r) => setTimeout(r, 1));
              db.inFlight -= 1;
              db.writes.push({ patch, ids, bill });
              const hit = Array.isArray(ids) ? ids.includes(db.failOn) : ids === db.failOn;
              return { error: hit ? { message: "denied" } : null };
            },
          }),
        });
        return {
          in: (_k: string, ids: string[]) => finish(ids),
          eq: (_k: string, id: string) => ({ eq: (k2: string, bill: string) => finish(id).eq(k2, bill) }),
        };
      },
    }),
  },
}));

import { syncPurchaseLineBrands, updatePurchaseLines, updatePurchaseLinesEach } from "@/lib/data/purchaseLineWrites";

describe("purchase line writes", () => {
  beforeEach(() => {
    db.writes = [];
    db.failOn = null;
    db.inFlight = 0;
    db.maxInFlight = 0;
  });

  it("same change: one request per 200 lines, scoped to the bill", async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `l${i}`);
    expect(await updatePurchaseLines("b1", ids, { brand: "X" })).toBe("");
    expect(db.writes.map((w) => (w.ids as string[]).length)).toEqual([200, 200, 50]);
    expect(db.writes.every((w) => w.bill === "b1")).toBe(true);
  });

  it("per-line changes run a few at a time, not one after another", async () => {
    const changes = Array.from({ length: 20 }, (_, i) => ({ id: `l${i}`, patch: { line_total: i } }));
    expect(await updatePurchaseLinesEach("b1", changes, 8)).toBe("");
    expect(db.writes).toHaveLength(20);
    expect(db.maxInFlight).toBeGreaterThan(1);
    expect(db.maxInFlight).toBeLessThanOrEqual(8);
  });

  it("stops starting new writes after the first error and reports it", async () => {
    db.failOn = "l2";
    const changes = Array.from({ length: 20 }, (_, i) => ({ id: `l${i}`, patch: {} }));
    expect(await updatePurchaseLinesEach("b1", changes, 4)).toBe("denied");
    expect(db.writes.length).toBe(4); // first batch only
  });

  it("brand sync: one write group per brand; first error returned", async () => {
    const groups = new Map([
      ["A", ["l1", "l2"]],
      ["B", ["l3"]],
    ]);
    expect(await syncPurchaseLineBrands("b1", groups)).toBe("");
    expect(db.writes.map((w) => w.patch)).toEqual([{ brand: "A" }, { brand: "B" }]);
    db.writes = [];
    db.failOn = "l1";
    expect(await syncPurchaseLineBrands("b1", groups)).toBe("denied");
    expect(db.writes).toHaveLength(1);
  });
});
