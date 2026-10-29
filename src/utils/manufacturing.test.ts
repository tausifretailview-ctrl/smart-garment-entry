import { describe, expect, it } from "vitest";
import {
  computeDesignStandardCost,
  DEFAULT_MANUFACTURER_ERP,
  DEFAULT_MFG_STAGES,
  piecesFromMeters,
  resolveManufacturerERP,
} from "./manufacturing";

describe("resolveManufacturerERP", () => {
  it("stays off unless Platform Admin enabled the feature and the shop switched it on", () => {
    expect(resolveManufacturerERP(false, { enabled: true }).enabled).toBe(false);
    expect(resolveManufacturerERP(true, { enabled: false }).enabled).toBe(false);
    expect(resolveManufacturerERP(true, null)).toEqual(DEFAULT_MANUFACTURER_ERP);
    expect(resolveManufacturerERP(true, { enabled: true }).enabled).toBe(true);
  });

  it("keeps saved choices and falls back on bad values", () => {
    expect(
      resolveManufacturerERP(true, {
        enabled: true,
        allowed_wastage_percent: 8,
        over_issue_action: "block",
        end_bits_default: "stock",
      }),
    ).toEqual({ enabled: true, allowed_wastage_percent: 8, over_issue_action: "block", end_bits_default: "stock" });
    const bad = resolveManufacturerERP(true, { enabled: true, allowed_wastage_percent: 150 });
    expect(bad.allowed_wastage_percent).toBe(5);
    expect(bad.over_issue_action).toBe("warn");
    expect(bad.end_bits_default).toBe("wastage");
  });
});

describe("DEFAULT_MFG_STAGES", () => {
  it("lists the user's stages in order, without Product ready", () => {
    expect(DEFAULT_MFG_STAGES.map((s) => s.name)).toEqual([
      "Cutting",
      "Polishing",
      "Colouring",
      "Master Sheet Ready",
      "Button & Other Work",
      "Ironing",
    ]);
  });
});

describe("computeDesignStandardCost", () => {
  it("adds fabric with wastage, trims, stage rates and overhead", () => {
    const cost = computeDesignStandardCost(
      [
        { material_type: "fabric", qty_per_piece: 1.45, wastage_percent: 5, unit_price: 110 },
        { material_type: "trim", qty_per_piece: 8, wastage_percent: 0, unit_price: 1.5 },
      ],
      [12, 8, 10, 5, 6, 4],
      5,
    );
    // 1.45 x 1.05 = 1.5225 m x 110 = 167.475
    expect(cost.fabric_meters).toBe(1.523);
    expect(cost.fabric).toBe(167.48);
    expect(cost.trims).toBe(12);
    expect(cost.labour).toBe(45);
    expect(cost.overhead).toBe(5);
    expect(cost.total).toBe(229.48);
  });

  it("ignores empty, negative or bad numbers", () => {
    const cost = computeDesignStandardCost(
      [{ material_type: "fabric", qty_per_piece: Number.NaN, wastage_percent: -3, unit_price: 100 }],
      [-5, Number.NaN],
      -1,
    );
    expect(cost.total).toBe(0);
  });
});

describe("piecesFromMeters", () => {
  it("rounds down to whole pieces", () => {
    expect(piecesFromMeters(100, 1.5225)).toBe(65);
    expect(piecesFromMeters(3, 1.5)).toBe(2);
    expect(piecesFromMeters(100, 0)).toBe(0);
  });
});
