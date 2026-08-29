import { describe, expect, it } from "vitest";
import {
  estimatePurchaseSavePipeline,
  estimateTierResolveRoundTrips,
  PURCHASE_EDIT_UPDATE_CHUNK,
  PURCHASE_INSERT_CHUNK,
  summarizePurchaseSaveBenchmark,
} from "./purchaseSavePipelineCost";

describe("purchase save pipeline cost model", () => {
  it("tier resolve stays a handful of reads at 200 unique barcodes (morning fix)", () => {
    const rt = estimateTierResolveRoundTrips({
      uniqueVariantIds: 200,
      uniqueBarcodes: 200,
      uniqueProductIds: 80,
    });
    // 2 + 2 + 1 = 5 IN(100) reads, no per-line chatty loop
    expect(rt).toBe(5);
  });

  it("create-atomic: one fat RPC, not insert chunks", () => {
    const pipe = estimatePurchaseSavePipeline({
      mode: "create-atomic",
      lineCount: 180,
      uniqueVariantIds: 180,
      uniqueBarcodes: 40,
      uniqueProductIds: 40,
    });
    const atomic = pipe.stages.find((s) => s.stage === "save_purchase_bill_with_items_atomic");
    expect(atomic?.roundTrips).toBe(1);
    expect(atomic?.fatStatementUnderDefaultTimeout).toBe(false);
    expect(pipe.fatStages).toEqual([]);
  });

  it("edit of 180 changed lines is one bulk_update chunk under the default 8s timeout", () => {
    const pipe = estimatePurchaseSavePipeline({
      mode: "edit",
      lineCount: 180,
      uniqueVariantIds: 180,
      uniqueBarcodes: 40,
      uniqueProductIds: 40,
      changedLineCount: 180,
      newLineCount: 0,
      priceTouchedCount: 180,
    });
    const bulk = pipe.stages.find((s) => s.stage === "bulk_update_purchase_items");
    expect(PURCHASE_EDIT_UPDATE_CHUNK).toBe(200);
    expect(bulk?.roundTrips).toBe(1);
    expect(bulk?.fatStatementUnderDefaultTimeout).toBe(true);
    expect(pipe.fatStages).toContain("bulk_update_purchase_items");
  });

  it("legacy create of 250 lines is 3 insert chunks, each a fat 8s statement", () => {
    const pipe = estimatePurchaseSavePipeline({
      mode: "create-legacy",
      lineCount: 250,
      uniqueVariantIds: 250,
      uniqueBarcodes: 50,
      uniqueProductIds: 50,
    });
    const ins = pipe.stages.find((s) => s.stage === "purchase_items-insert");
    expect(PURCHASE_INSERT_CHUNK).toBe(100);
    expect(ins?.roundTrips).toBe(3);
    expect(ins?.fatStatementUnderDefaultTimeout).toBe(true);
  });

  it("normal 40-line new bill is not an edit fat-statement case", () => {
    const pipe = estimatePurchaseSavePipeline({
      mode: "create-atomic",
      lineCount: 40,
      uniqueVariantIds: 40,
      uniqueBarcodes: 40,
      uniqueProductIds: 20,
    });
    expect(pipe.fatStages).toEqual([]);
    expect(pipe.totalRoundTrips).toBeGreaterThan(1);
  });

  it("syncLastPurchase is serial waves of 20, not one trip per line", () => {
    const pipe = estimatePurchaseSavePipeline({
      mode: "create-atomic",
      lineCount: 60,
      uniqueVariantIds: 60,
      uniqueBarcodes: 8,
      uniqueProductIds: 8,
    });
    const sync = pipe.stages.find((s) => s.stage === "syncLastPurchaseFromBillLines");
    // re-resolve (3 IN chunks) + ceil(60/20) = 3 waves
    expect(sync?.roundTrips).toBe(6);
    expect(sync?.fatStatementUnderDefaultTimeout).toBe(false);
  });

  it("pins realistic-bill cost table used in the 57014 report", () => {
    const rows = [
      ...summarizePurchaseSaveBenchmark("normal-60"),
      ...summarizePurchaseSaveBenchmark("large-300"),
    ].map((r) => ({
      caseName: r.caseName,
      mode: r.mode,
      lineCount: r.lineCount,
      totalRoundTrips: r.totalRoundTrips,
      fatStages: r.fatStages,
      fatRoundTrips: r.fatRoundTrips,
    }));

    expect(rows).toEqual([
      {
        caseName: "normal-60",
        mode: "create-atomic",
        lineCount: 60,
        totalRoundTrips: 12,
        fatStages: [],
        fatRoundTrips: 0,
      },
      {
        caseName: "normal-60",
        mode: "create-legacy",
        lineCount: 60,
        totalRoundTrips: 13,
        fatStages: ["purchase_items-insert"],
        fatRoundTrips: 1,
      },
      {
        caseName: "normal-60",
        mode: "edit",
        lineCount: 60,
        totalRoundTrips: 15,
        fatStages: ["bulk_update_purchase_items", "purchase_items-insert"],
        fatRoundTrips: 2,
      },
      {
        caseName: "large-300",
        mode: "create-atomic",
        lineCount: 300,
        totalRoundTrips: 29,
        fatStages: [],
        fatRoundTrips: 0,
      },
      {
        caseName: "large-300",
        mode: "create-legacy",
        lineCount: 300,
        totalRoundTrips: 32,
        fatStages: ["purchase_items-insert"],
        fatRoundTrips: 3,
      },
      {
        caseName: "large-300",
        mode: "edit",
        lineCount: 300,
        totalRoundTrips: 33,
        fatStages: ["bulk_update_purchase_items", "purchase_items-insert"],
        fatRoundTrips: 3,
      },
    ]);
  });
});
