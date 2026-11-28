import { describe, expect, it, vi } from "vitest";
import { colorKey, findCardForGuess, importNameGuesses, normalizeName } from "./productColorImages";

const card = (product_name: string, color: string, style: string | null = null) => ({ product_name, color, style });

describe("colour photos: import names", () => {
  it("normalises file names", () => {
    expect(normalizeName("rc_5001-Brown (1).JPG")).toBe("RC 5001 BROWN 1");
    expect(colorKey("p1", " Navy Blue ")).toBe("p1|navy blue");
  });

  it("reads the last 1–3 words as the colour, then the whole name; drops a copy number", () => {
    expect(importNameGuesses("RC 5001 NAVY BLUE (2).jpg")).toEqual([
      { article: "RC 5001 NAVY", color: "BLUE" },
      { article: "RC 5001", color: "NAVY BLUE" },
      { article: "RC", color: "5001 NAVY BLUE" },
      { article: "RC 5001 NAVY BLUE", color: "" },
    ]);
  });

  it("matches article (name or style) and colour, spaces and case ignored", () => {
    const cards = [card("RC 5001", "BROWN"), card("RC 5001", "BLACK"), card("MR50", "TAN", "AW-50"), card("KURTI 9", "")];
    expect(findCardForGuess(cards, { article: "RC5001", color: "brown" })).toBe(cards[0]);
    expect(findCardForGuess(cards, { article: "AW 50", color: "TAN" })).toBe(cards[2]);
    expect(findCardForGuess(cards, { article: "RC 5001", color: "RED" })).toBeNull();
    // No colour in the file name: only an article with one colour.
    expect(findCardForGuess(cards, { article: "RC 5001", color: "" })).toBeNull();
    expect(findCardForGuess(cards, { article: "MR50", color: "" })).toBe(cards[2]);
    expect(findCardForGuess(cards, { article: "KURTI 9", color: "" })).toBe(cards[3]);
  });
});

describe("colour photo filters", () => {
  it("sends the filters; before SQL 78 retries without them", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const { supabase } = await import("@/integrations/supabase/client");
    const { fetchColorCards, colorCardFiltersAvailable, resetColorCardFiltersForTests } = await import("./productColorImages");
    resetColorCardFiltersForTests();
    const spy = vi.spyOn(supabase, "rpc").mockImplementation(((_fn: string, args: Record<string, unknown>) => {
      calls.push(args);
      return Promise.resolve(
        "p_brand" in args
          ? { data: null, error: { code: "PGRST202", message: "Could not find the function" } }
          : { data: [{ product_id: "p1", product_name: "MR50", color: "TAN", total_count: 1, all_count: 1, with_photo_count: 0 }], error: null },
      );
    }) as never);
    const page = await fetchColorCards("o1", { brand: "A WALK", photo: "missing" });
    expect(calls[0]).toMatchObject({ p_brand: "A WALK", p_photo: "missing", p_only_missing: true });
    expect(calls[1]).not.toHaveProperty("p_brand");
    expect(page?.cards[0]).toMatchObject({ product_name: "MR50", color: "TAN" });
    expect(colorCardFiltersAvailable()).toBe(false);
    spy.mockRestore();
    resetColorCardFiltersForTests();
  });

  it("filter lists: most cards first", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { fetchColorFilterOptions } = await import("./productColorImages");
    const spy = vi.spyOn(supabase, "rpc").mockImplementation((() =>
      Promise.resolve({
        data: [
          { kind: "brand", value: "A WALK", cards: 2 },
          { kind: "brand", value: "RED CHEIF", cards: 9 },
          { kind: "color", value: "BK", cards: 4 },
        ],
        error: null,
      })) as never);
    expect(await fetchColorFilterOptions("o1")).toEqual({ brand: ["RED CHEIF", "A WALK"], category: [], color: ["BK"] });
    spy.mockRestore();
  });
});
