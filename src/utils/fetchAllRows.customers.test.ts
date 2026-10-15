import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  total: 0,
  countAvailable: true,
  ranges: [] as Array<[number, number]>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const from = () => {
    let withCount = false;
    const chain: any = {
      select: (_cols: string, opts?: { count?: string }) => {
        withCount = opts?.count === "exact";
        return chain;
      },
      eq: () => chain,
      is: () => chain,
      order: () => chain,
      range: async (start: number, end: number) => {
        state.ranges.push([start, end]);
        const rows = [];
        for (let i = start; i <= end && i < state.total; i++) rows.push({ id: `c${i}` });
        return {
          data: rows,
          error: null,
          count: withCount && state.countAvailable ? state.total : null,
        };
      },
    };
    return chain;
  };
  return { supabase: { from } };
});

import { fetchAllCustomers } from "@/utils/fetchAllRows";

describe("fetchAllCustomers", () => {
  beforeEach(() => {
    state.ranges = [];
    state.countAvailable = true;
  });

  it("returns a small directory in one request", async () => {
    state.total = 40;
    const rows = await fetchAllCustomers("org");
    expect(rows).toHaveLength(40);
    expect(state.ranges).toEqual([[0, 999]]);
  });

  it("loads every page of a big directory in order, without gaps or repeats", async () => {
    state.total = 7_800;
    const rows = await fetchAllCustomers("org");
    expect(rows).toHaveLength(7_800);
    expect(rows.map((r: { id: string }) => r.id)).toEqual(
      Array.from({ length: 7_800 }, (_, i) => `c${i}`),
    );
    expect(state.ranges).toHaveLength(8);
  });

  it("checks one more page when the count is an exact multiple of the page size", async () => {
    state.total = 2_000;
    const rows = await fetchAllCustomers("org");
    expect(rows).toHaveLength(2_000);
    expect(state.ranges.map(([s]) => s)).toEqual([0, 1000, 2000]);
  });

  it("falls back to one page after another when no count comes back", async () => {
    state.total = 2_500;
    state.countAvailable = false;
    const rows = await fetchAllCustomers("org");
    expect(rows).toHaveLength(2_500);
    expect(state.ranges.map(([s]) => s)).toEqual([0, 1000, 2000]);
  });
});
