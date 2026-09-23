import { describe, expect, it, vi, beforeEach } from "vitest";
import { findSameNameProductsInOrg, normalizeProductNameKey } from "./productNameDedupe";
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
