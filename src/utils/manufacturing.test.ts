import { describe, expect, it } from "vitest";
import {
  computeDesignStandardCost,
  computeLotCost,
  computeLotFlow,
  DEFAULT_MANUFACTURER_ERP,
  DEFAULT_MFG_STAGES,
  jobCardRemaining,
  piecesFromMeters,
  resolveManufacturerERP,
  type LotJobCard,
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

describe("computeLotFlow", () => {
  const card = (stage_id: string, sent: number, receipts: [number, number, number][], extra: Partial<LotJobCard> = {}): LotJobCard => ({
    stage_id,
    sent_qty: sent,
    rate: 10,
    status: "open",
    closed_short_qty: 0,
    receipts: receipts.map(([good_qty, rejected_qty, wasted_qty]) => ({ good_qty, rejected_qty, wasted_qty })),
    ...extra,
  });

  it("passes good pieces from one stage to the next", () => {
    const flow = computeLotFlow(
      ["polish", "colour"],
      100,
      [
        card("polish", 60, [[58, 2, 0]], { status: "closed" }),
        card("polish", 40, [[30, 0, 0]]),
        card("colour", 50, [[45, 1, 1]]),
      ],
      20,
    );
    expect(flow.stages[0]).toMatchObject({ input: 100, sent: 100, good: 88, rejected: 2, pending: 10, available: 0 });
    expect(flow.stages[1]).toMatchObject({ input: 88, sent: 50, good: 45, rejected: 1, wasted: 1, pending: 3, available: 38 });
    expect(flow.output).toBe(45);
    expect(flow.readyForStock).toBe(25);
  });

  it("counts pieces on cards closed short as missing, not pending", () => {
    const flow = computeLotFlow(["iron"], 10, [card("iron", 10, [[8, 0, 0]], { status: "closed", closed_short_qty: 2 })], 0);
    expect(flow.stages[0]).toMatchObject({ good: 8, missing: 2, pending: 0 });
  });

  it("with no stages, cut pieces are ready for stock", () => {
    expect(computeLotFlow([], 30, [], 10)).toEqual({ stages: [], output: 30, readyForStock: 20 });
  });
});

describe("jobCardRemaining", () => {
  it("never goes below zero", () => {
    expect(jobCardRemaining({ sent_qty: 5, closed_short_qty: 0, receipts: [{ good_qty: 6, rejected_qty: 0, wasted_qty: 0 }] })).toBe(0);
    expect(jobCardRemaining({ sent_qty: 5, closed_short_qty: 1, receipts: [{ good_qty: 2, rejected_qty: 1, wasted_qty: 0 }] })).toBe(1);
  });
});

describe("computeLotCost", () => {
  it("adds fabric (minus leftover put back), trims, cutting, labour and overhead, shared by good pieces", () => {
    const cost = computeLotCost({
      rolls: [
        { issued_meters: 100, leftover_meters: 4, leftover_action: "stock", pur_price: 110 },
        { issued_meters: 52, leftover_meters: 2, leftover_action: "wastage", pur_price: 110 },
      ],
      trimsPerPiece: 12,
      cutTotal: 100,
      cuttingRate: 5,
      cards: [
        { stage_id: "a", sent_qty: 100, rate: 8, status: "closed", closed_short_qty: 0, receipts: [{ good_qty: 98, rejected_qty: 2, wasted_qty: 0 }] },
        { stage_id: "b", sent_qty: 98, rate: 10, status: "closed", closed_short_qty: 0, receipts: [{ good_qty: 96, rejected_qty: 2, wasted_qty: 0 }] },
      ],
      overheadPerPiece: 5,
      goodPieces: 96,
    });
    // fabric: (96 + 52) m × 110
    expect(cost.fabric_meters).toBe(148);
    expect(cost.fabric).toBe(16280);
    expect(cost.trims).toBe(1200);
    expect(cost.cutting).toBe(500);
    expect(cost.labour).toBe(98 * 8 + 96 * 10);
    expect(cost.overhead).toBe(480);
    expect(cost.total).toBe(16280 + 1200 + 500 + 1744 + 480);
    expect(cost.per_piece).toBe(Math.round(((16280 + 1200 + 500 + 1744 + 480) / 96) * 100) / 100);
  });

  it("returns 0 per piece when nothing is good yet", () => {
    expect(computeLotCost({ rolls: [], trimsPerPiece: 0, cutTotal: 0, cuttingRate: 0, cards: [], overheadPerPiece: 0, goodPieces: 0 }).per_piece).toBe(0);
  });
});
