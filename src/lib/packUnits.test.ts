import { describe, expect, it } from "vitest";
import { packRateFromPieceRate, packUnitOf, packsFromPieces, pieceRateFromPackRate, piecesFromPacks } from "./packUnits";
import { isMissingRepackRpc, repackStock, repackUnitCost, type RepackDb } from "./data/repackStock";

/** Buying in cases, selling in pieces; repack (supermarket go-live, Nov 2026). */
describe("pack units", () => {
  const caseOf24 = packUnitOf({ alt_uom: "CASE", alt_uom_factor: 24 })!;

  it("needs a unit and a factor above 1", () => {
    expect(caseOf24).toEqual({ uom: "CASE", factor: 24 });
    expect(packUnitOf({ alt_uom: "CASE", alt_uom_factor: 1 })).toBeNull();
    expect(packUnitOf({ alt_uom: "", alt_uom_factor: 24 })).toBeNull();
    expect(packUnitOf(null)).toBeNull();
  });

  it("5 cases of 24 at ₹480 a case → 120 pieces at ₹20", () => {
    expect(piecesFromPacks(5, caseOf24)).toBe(120);
    expect(pieceRateFromPackRate(480, caseOf24)).toBe(20);
    expect(packsFromPieces(120, caseOf24)).toBe(5);
    expect(packRateFromPieceRate(20, caseOf24)).toBe(480);
    // A loose count works back to part of a case.
    expect(packsFromPieces(130, caseOf24)).toBe(5.417);
  });

  it("a 50 kg bag: 2 bags → 100 kg", () => {
    const bag = packUnitOf({ alt_uom: "BAG", alt_uom_factor: "50" })!;
    expect(piecesFromPacks(2, bag)).toBe(100);
    expect(pieceRateFromPackRate(2150, bag)).toBe(43);
  });
});

describe("repack", () => {
  it("cost of a packet: bulk used × price + packing, over packets made", () => {
    expect(repackUnitCost(1, 2000, 50, 50)).toBe(41);
    expect(repackUnitCost(2, 44, 8, 0)).toBe(11);
    expect(repackUnitCost(1, 2000, 0)).toBe(0);
  });

  it("calls the database step and reads its answer", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const db: RepackDb = {
      rpc: (_fn, args) => {
        calls.push(args);
        return Promise.resolve({ data: { bill_number: "RPK-1", from_stock_after: 2, to_stock_after: 60, to_pur_price: 41.17 }, error: null });
      },
    };
    const res = await repackStock(db, { organizationId: "o", fromVariantId: "a", fromQty: 1, toVariantId: "b", toQty: 50, packingCost: 50, notes: " " });
    expect(res).toEqual({ billNumber: "RPK-1", fromStockAfter: 2, toStockAfter: 60, toPurPrice: 41.17 });
    expect(calls[0]).toMatchObject({ p_from_qty: 1, p_to_qty: 50, p_packing_cost: 50, p_notes: null });
  });

  it("explains a missing SQL and short stock", async () => {
    const fail = (error: { code?: string; message?: string }): RepackDb => ({ rpc: () => Promise.resolve({ data: null, error }) });
    expect(isMissingRepackRpc({ code: "PGRST202" })).toBe(true);
    await expect(repackStock(fail({ code: "PGRST202", message: "x" }), { organizationId: "o", fromVariantId: "a", fromQty: 1, toVariantId: "b", toQty: 1 })).rejects.toThrow("SQL 70");
    await expect(repackStock(fail({ code: "P0001", message: "Insufficient stock" }), { organizationId: "o", fromVariantId: "a", fromQty: 1, toVariantId: "b", toQty: 1 })).rejects.toThrow("Not enough stock");
  });
});
