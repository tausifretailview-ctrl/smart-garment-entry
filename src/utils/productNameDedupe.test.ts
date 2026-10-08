import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  filterSameProductIdentity,
  findProductNameMatch,
  findSameNameProductsInOrg,
  normalizeProductNameKey,
  pickPreferredSameNameProduct,
  pickUnusedSameNameProduct,
  pickCanonicalProductName,
  productNameIlikePattern,
  productNameMatchKey,
  resetProductNameKeyRpcProbe,
} from "./productNameDedupe";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
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

describe("filterSameProductIdentity", () => {
  const bra = (id: string, brand: string | null, style: string | null) => ({
    id,
    product_name: "BRA",
    brand,
    category: "FE41",
    style,
  });

  it("keeps only same brand + style (BRA cup C does not match cup B)", () => {
    const matches = [bra("b", "JOCKEY", "B"), bra("c", "JOCKEY", "C"), bra("x", "OTHER", "C")];
    expect(filterSameProductIdentity(matches, { brand: "jockey ", style: "c" }).map((m) => m.id)).toEqual(["c"]);
  });

  it("returns none when no product has the typed style, so a new product is created", () => {
    expect(filterSameProductIdentity([bra("b", "JOCKEY", "B")], { brand: "JOCKEY", style: "C" })).toEqual([]);
  });

  it("treats blank as blank, not as a wildcard", () => {
    const matches = [bra("blank", null, null), bra("styled", null, "C")];
    expect(filterSameProductIdentity(matches, { brand: "", style: "" }).map((m) => m.id)).toEqual(["blank"]);
  });
});

describe("product name match (name field only)", () => {
  it("case, spaces and - _ . / do not make a new name", () => {
    const k = productNameMatchKey("ELN-DUP");
    for (const typed of ["ELN-Dup", "eln dup", "ELN.DUP ", " ELN_DUP", "ELN  -  DUP", "ELNDUP", "eln/dup"]) {
      expect(productNameMatchKey(typed), typed).toBe(k);
    }
  });

  it("different words stay different names", () => {
    expect(productNameMatchKey("ELN-DUP PANT")).not.toBe(productNameMatchKey("ELN-DUP"));
    // & is a real character: ELN-Dup&Pant is not auto-matched to ELN-DUP PANT (merge suggests it)
    expect(productNameMatchKey("ELN-Dup&Pant")).not.toBe(productNameMatchKey("ELN-DUP PANT"));
  });

  it("lookup pattern finds stored spellings with or without separators", () => {
    expect(productNameIlikePattern("eln dup")).toBe("%e%l%n%d%u%p%");
    expect(productNameIlikePattern("  ")).toBeNull();
    expect(productNameIlikePattern("50%_off")).toBe("%5%0%o%f%f%");
  });

  it("picks the existing product: same key only, stock first, then oldest, skips self", () => {
    const rows = [
      { id: "a", product_name: "ELN-DUP PANT", total_stock: 50, created_at: "2026-01-01" },
      { id: "b", product_name: "ELN-Dup", total_stock: 2, created_at: "2026-02-01" },
      { id: "c", product_name: "ELN-DUP", total_stock: 12, created_at: "2026-03-01" },
    ];
    expect(pickCanonicalProductName(rows, "eln.dup")?.id).toBe("c");
    expect(pickCanonicalProductName(rows, "eln.dup", "c")?.id).toBe("b");
    expect(pickCanonicalProductName(rows, "ELN DUP SHIRT")).toBeNull();
  });
});

describe("findProductNameMatch — indexed name-key RPC with fallback", () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
    resetProductNameKeyRpcProbe();
  });

  function mockIlikeFallback(rows: Array<Record<string, unknown>>) {
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const ilike = vi.fn().mockReturnValue({ limit });
    const is = vi.fn().mockReturnValue({ ilike });
    const eq = vi.fn().mockReturnValue({ is });
    const select = vi.fn().mockReturnValue({ eq });
    vi.mocked(supabase.from).mockReturnValue({ select } as never);
    return { ilike };
  }

  it("uses the RPC result and never runs the full-catalog ilike", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [
        { id: "a", product_name: "ELN-DUP", created_at: "2026-01-01", total_stock: 0 },
        { id: "b", product_name: "ELN DUP", created_at: "2026-02-01", total_stock: 7 },
      ],
      error: null,
    } as never);
    const match = await findProductNameMatch("org-1", "eln.dup");
    expect(match?.id).toBe("b");
    expect(supabase.rpc).toHaveBeenCalledWith("find_products_by_name_key", {
      p_organization_id: "org-1",
      p_name: "eln.dup",
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("skips the product being renamed", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ id: "self", product_name: "SHIRT", created_at: "2026-01-01", total_stock: 3 }],
      error: null,
    } as never);
    expect(await findProductNameMatch("org-1", "shirt", "self")).toBeNull();
  });

  it("falls back to the ilike lookup when the function is not applied, and stops asking", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    } as never);
    const { ilike } = mockIlikeFallback([
      { id: "x", product_name: "ELN-DUP", created_at: "2026-01-01", product_variants: [{ stock_qty: 2, deleted_at: null }] },
    ]);
    expect((await findProductNameMatch("org-1", "ELN DUP"))?.id).toBe("x");
    expect(ilike).toHaveBeenCalledWith("product_name", "%e%l%n%d%u%p%");
    await findProductNameMatch("org-1", "ELN DUP");
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it("falls back on other RPC errors but tries the RPC again next time", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { code: "57014", message: "canceling statement due to statement timeout" },
    } as never);
    mockIlikeFallback([]);
    expect(await findProductNameMatch("org-1", "SHIRT")).toBeNull();
    await findProductNameMatch("org-1", "SHIRT");
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
  });
});
