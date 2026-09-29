import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  findSameNameProductsInOrg,
  normalizeProductNameKey,
  pickPreferredSameNameProduct,
  pickUnusedSameNameProduct,
} from "./productNameDedupe";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn() },
}));

describe("normalizeProductNameKey", () => {
  it("is case- and whitespace-insensitive on name and category", () => {
    expect(normalizeProductNameKey("AEROSYNC PB-12", "Accessories")).toBe(
      normalizeProductNameKey("  aerosync pb-12 ", " accessories "),
    );
  });

  it("treats missing category as empty (not as wildcard)", () => {
    expect(normalizeProductNameKey("X", null)).toBe("x|");
    expect(normalizeProductNameKey("X", "")).toBe(normalizeProductNameKey("X", null));
    expect(normalizeProductNameKey("X", "MOBILE")).not.toBe(normalizeProductNameKey("X", null));
  });
});

describe("findSameNameProductsInOrg", () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReset();
  });

  function mockProductsQuery(rows: Array<Record<string, unknown>>) {
    const single = vi.fn().mockResolvedValue({ data: rows, error: null });
    // Chain: from().select().eq().is().ilike().limit() → resolved rows.
    const ilike = vi.fn().mockReturnValue({ limit: () => single() });
    const is = vi.fn().mockReturnValue({ ilike });
    const eq = vi.fn().mockReturnValue({ is });
    const select = vi.fn().mockReturnValue({ eq });
    vi.mocked(supabase.from).mockReturnValue({ select } as never);
    return { select, eq, is, ilike };
  }

  it("returns only exact normalized name+category matches (not ilike substrings)", async () => {
    mockProductsQuery([
      { id: "1", product_name: "AEROSYNC PB-12", brand: "AEROSYNC", category: "ACCESSORIES" },
      { id: "2", product_name: "AEROSYNC PB-120", brand: "AEROSYNC", category: "ACCESSORIES" },
      { id: "3", product_name: "AEROSYNC PB-12", brand: "AEROSYNC", category: "MOBILE" },
    ]);
    const matches = await findSameNameProductsInOrg("org-1", "  aerosync pb-12 ", " accessories ");
    expect(matches.map((m) => m.id)).toEqual(["1"]);
  });

  it("returns empty for blank names without querying", async () => {
    const chains = mockProductsQuery([]);
    expect(await findSameNameProductsInOrg("org-1", "   ", "")).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
    void chains;
  });
});

describe("pickUnusedSameNameProduct", () => {
  const p = (id: string, total_stock: number, created_at: string) => ({
    id,
    product_name: "1PCS",
    brand: null,
    category: "2542",
    total_stock,
    created_at,
  });
  const noHistory = async () => false;

  it("reuses the oldest when every match has 0 stock and no history", async () => {
    const matches = [p("b", 0, "2026-09-26T10:00:00Z"), p("a", 0, "2026-09-25T10:00:00Z")];
    expect(await pickUnusedSameNameProduct(matches, noHistory)).toBe("a");
  });

  it("asks (null) when any match has stock", async () => {
    expect(await pickUnusedSameNameProduct([p("a", 0, "1"), p("b", 3, "2")], noHistory)).toBeNull();
  });

  it("asks (null) when any match has transaction history", async () => {
    const hasHistory = async (id: string) => id === "b";
    expect(await pickUnusedSameNameProduct([p("a", 0, "1"), p("b", 0, "2")], hasHistory)).toBeNull();
  });

  it("returns null for no matches", async () => {
    expect(await pickUnusedSameNameProduct([], noHistory)).toBeNull();
  });
});

describe("pickPreferredSameNameProduct", () => {
  const m = (id: string, total_stock: number, created_at: string) => ({
    id,
    product_name: "FLEXI C2",
    brand: null,
    category: null,
    created_at,
    total_stock,
  });

  it("uses the product holding stock among several FLEXI C2 duplicates", () => {
    expect(
      pickPreferredSameNameProduct([
        m("dup-a", 0, "2026-09-01"),
        m("in-use", 2, "2026-09-10"),
        m("dup-b", 0, "2026-08-01"),
      ]),
    ).toBe("in-use");
  });

  it("falls back to the oldest when stock ties", () => {
    expect(
      pickPreferredSameNameProduct([m("newer", 0, "2026-09-10"), m("older", 0, "2026-08-01")]),
    ).toBe("older");
  });

  it("returns null with no matches", () => {
    expect(pickPreferredSameNameProduct([])).toBeNull();
  });
});
