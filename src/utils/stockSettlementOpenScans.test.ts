import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ pages: [] as Array<Array<{ id: string; variant_id: string }>>, ranges: [] as Array<[number, number]>, fail: false }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        range: async (from: number, to: number) => {
          db.ranges.push([from, to]);
          if (db.fail) return { data: null, error: { message: "boom" } };
          return { data: db.pages[db.ranges.length - 1] ?? [], error: null };
        },
      };
      return q;
    },
  },
}));

import { fetchAllOpenSettlementVariantIds } from "./stockSettlementScans";

const rows = (n: number, start = 0) => Array.from({ length: n }, (_, i) => ({ id: `s${start + i}`, variant_id: `v${start + i}` }));
const here = dirname(fileURLToPath(import.meta.url));

/** Review items B8 / L9 (22 Nov 2026): reads that stopped at 1,000 rows without a warning. */
describe("open stock-count scans: every locked item is returned", () => {
  beforeEach(() => {
    db.pages = [];
    db.ranges = [];
    db.fail = false;
  });

  it("reads past the first 1,000 rows", async () => {
    db.pages = [rows(1000), rows(250, 1000)];
    const ids = await fetchAllOpenSettlementVariantIds("org1");
    expect(ids.size).toBe(1250);
    expect(ids.has("v1249")).toBe(true);
    expect(db.ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("an error locks nothing rather than failing the screen (as before)", async () => {
    db.fail = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await fetchAllOpenSettlementVariantIds("org1")).size).toBe(0);
    spy.mockRestore();
  });
});

describe("totals are built from every row, not the first 1,000", () => {
  const read = (rel: string) => readFileSync(join(here, "..", rel), "utf8");

  it("owner mobile Sales screen pages its bills, lines and brands", () => {
    const src = read("components/mobile/OwnerSalesDashboard.tsx");
    expect(src.match(/fetchAllRows</g)?.length).toBe(2);
    expect(src).toContain("fetchInIdBatches<{ id: string; brand: string | null }>");
    expect(src).not.toContain(".slice(0, 500)");
  });

  it("hourly sales, purchase-return adjustments and the school ledger page their reads", () => {
    expect(read("pages/HourlySalesAnalysis.tsx")).toContain("fetchAllRows<{ id: string; net_amount: number | null; sale_date: string }>");
    expect(read("pages/PurchaseBillDashboard.tsx")).toMatch(/fetchAllRows<any>\(\(\) =>\s*supabase\s*\.from\("purchase_returns"/);
    const ledger = read("components/CustomerLedger.tsx");
    expect(ledger).toMatch(/fetchAllRows<any>\(\(\) =>\s*supabase\s*\.from\('students'\)/);
    expect(ledger).toMatch(/fetchAllRows<any>\(\(\) =>\s*supabase\s*\.from\('student_fees'\)/);
  });
});
