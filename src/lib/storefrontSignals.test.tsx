/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EMPTY_STOREFRONT_SIGNALS,
  STOREFRONT_SIGNALS_KEY,
  arrivedLabel,
  indexStorefrontSignals,
  parseStorefrontSignals,
  parseStorefrontSignalsEnabled,
  storefrontSignalFlag,
} from "./storefrontSignals";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("store live shop signals", () => {
  it("reads the function's answer and drops anything malformed", () => {
    const signals = parseStorefrontSignals({
      best_sellers: ["p1", "p2", "p1", 5, "bad id!"],
      selling_fast: ["p2"],
      just_arrived: [
        { product_id: "p3", at: "2026-11-17T10:00:00Z" },
        { product_id: "p3", at: "2026-11-16T10:00:00Z" },
        { product_id: "p4", at: "not a date" },
        { at: "2026-11-17T10:00:00Z" },
        null,
      ],
      bought_together: [
        { product_id: "p1", with: ["p2", "p1", "p3", "p4", "p5", "p6"] },
        { product_id: "p9", with: [] },
        { with: ["p1"] },
      ],
    });
    expect(signals.bestSellers).toEqual(["p1", "p2"]);
    expect(signals.sellingFast).toEqual(["p2"]);
    expect(signals.justArrived).toEqual([
      { productId: "p3", at: "2026-11-17T10:00:00Z" },
      { productId: "p4", at: null },
    ]);
    // Never the product itself; four others at most.
    expect(signals.boughtTogether).toEqual({ p1: ["p2", "p3", "p4"] });
    expect(parseStorefrontSignals(null)).toBe(EMPTY_STOREFRONT_SIGNALS);
    expect(parseStorefrontSignals("x")).toBe(EMPTY_STOREFRONT_SIGNALS);
    expect(parseStorefrontSignals({})).toEqual(EMPTY_STOREFRONT_SIGNALS);
  });

  it("is on unless the shop switched it off", () => {
    expect(parseStorefrontSignalsEnabled(null)).toBe(true);
    expect(parseStorefrontSignalsEnabled({})).toBe(true);
    expect(parseStorefrontSignalsEnabled({ [STOREFRONT_SIGNALS_KEY]: { enabled: true } })).toBe(true);
    expect(parseStorefrontSignalsEnabled({ [STOREFRONT_SIGNALS_KEY]: { enabled: false } })).toBe(false);
  });

  it("says when stock arrived in plain words", () => {
    const now = new Date(2026, 10, 18, 15, 0, 0);
    expect(arrivedLabel(new Date(2026, 10, 18, 9, 0, 0).toISOString(), now)).toBe("Arrived today");
    expect(arrivedLabel(new Date(2026, 10, 17, 23, 0, 0).toISOString(), now)).toBe("Arrived yesterday");
    expect(arrivedLabel(new Date(2026, 10, 14, 9, 0, 0).toISOString(), now)).toBe("Arrived 4 days ago");
    expect(arrivedLabel(null, now)).toBeNull();
    expect(arrivedLabel("junk", now)).toBeNull();
  });

  it("gives a card one live flag: rank first, then selling fast, then just in", () => {
    const index = indexStorefrontSignals({
      bestSellers: ["a", "b", "c", "d"],
      sellingFast: ["a", "d", "e"],
      justArrived: [{ productId: "e", at: null }, { productId: "f", at: null }],
      boughtTogether: {},
    });
    expect(storefrontSignalFlag("a", index)).toEqual({ kind: "best", text: "#1 this week" });
    expect(storefrontSignalFlag("c", index)).toEqual({ kind: "best", text: "#3 this week" });
    // Fourth place shows its rank only in the best-seller row; elsewhere it falls to the next flag.
    expect(storefrontSignalFlag("d", index)).toEqual({ kind: "fast", text: "Selling fast" });
    expect(storefrontSignalFlag("d", index, true)).toEqual({ kind: "best", text: "#4 this week" });
    expect(storefrontSignalFlag("e", index)).toEqual({ kind: "fast", text: "Selling fast" });
    expect(storefrontSignalFlag("f", index)).toEqual({ kind: "arrived", text: "Just in" });
    expect(storefrontSignalFlag("z", index)).toBeNull();
  });

  it("is wired into the store and the theme settings, and the function gives away no numbers", () => {
    const client = read("src/storefront/storefrontClient.ts");
    expect(client).toContain('"get_public_storefront_signals"');
    expect(client).toContain("payload.signals = parseStorefrontSignals(");
    const street = read("src/storefront/StreetStorefront.tsx");
    expect(street).toContain("<StreetSignalsContext.Provider value={signalIndex}>");
    expect(street).toContain("Best sellers this week");
    expect(street).toContain("Complete the look");
    expect(street).toContain("Just arrived");
    // Stock flags win over live flags on a card.
    expect(street).toContain('flag === "sold-out" || flag === "few-left"');
    expect(read("src/storefront/StorefrontApp.tsx")).toContain("signals={payload.signals}");
    expect(read("src/components/website/WebsiteThemePanel.tsx")).toContain("<StoreSignalsSettings orgId={orgId} />");

    const sql = read("supabase/migrations/20270504120000_public_storefront_signals.sql");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.get_public_storefront_signals(text) TO anon, authenticated, service_role;");
    // The cache table is reachable only through the function.
    expect(sql).toContain("REVOKE ALL ON TABLE public.storefront_signals_cache FROM PUBLIC, anon, authenticated;");
    // What leaves the database: product ids and arrival dates only.
    const built = sql.slice(sql.indexOf("SELECT jsonb_build_object("), sql.indexOf(") INTO v_out;"));
    expect(built).not.toMatch(/'(qty|quantity|bills|together|amount|total)'/);
    expect(built.match(/jsonb_build_object\(/g)).toHaveLength(3);
    // Held and cancelled bills never count, and the shop's switch is checked before the cache.
    expect(sql).toContain("lower(coalesce(s.payment_status, '')) <> 'hold'");
    expect(sql.indexOf("storefront_signals,enabled")).toBeLessThan(sql.indexOf("FROM public.storefront_signals_cache c"));
  });
});
