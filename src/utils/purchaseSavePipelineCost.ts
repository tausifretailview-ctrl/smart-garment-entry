/**
 * Client-side cost model for a full purchase-bill save.
 * Chunk sizes are copied from PurchaseEntry / sync / tier-fork — do not
 * "optimize" them here. This file only estimates round trips so we can
 * compare stages without guessing.
 */

export const PURCHASE_TIER_IN_CHUNK = 100;
export const PURCHASE_EDIT_UPDATE_CHUNK = 200;
export const PURCHASE_INSERT_CHUNK = 100;
export const PURCHASE_VARIANT_FLAG_CHUNK = 200;
export const PURCHASE_SYNC_UPDATE_PARALLEL = 20;

/** Default Postgres/PostgREST statement_timeout for statements that do not raise it. */
export const DEFAULT_STATEMENT_TIMEOUT_MS = 8_000;

export type PurchaseSaveMode = "create-atomic" | "create-legacy" | "edit";

export type PurchaseSaveStageCost = {
  stage: string;
  roundTrips: number;
  /** True when a single statement can see the whole bill and runs under default 8s. */
  fatStatementUnderDefaultTimeout: boolean;
  notes: string;
};

export type PurchaseSavePipelineInput = {
  mode: PurchaseSaveMode;
  lineCount: number;
  uniqueVariantIds: number;
  uniqueBarcodes: number;
  uniqueProductIds: number;
  /** Edit: lines that actually changed (bulk_update payload). */
  changedLineCount?: number;
  /** Edit: new lines to insert. */
  newLineCount?: number;
  /** Lines sent to last-purchase sync (defaults to lineCount on create). */
  priceTouchedCount?: number;
  forkInserts?: number;
};

function ceilDiv(n: number, size: number): number {
  if (n <= 0) return 0;
  return Math.ceil(n / size);
}

export function estimateTierResolveRoundTrips(input: {
  uniqueVariantIds: number;
  uniqueBarcodes: number;
  uniqueProductIds: number;
  forkInserts?: number;
}): number {
  return (
    ceilDiv(input.uniqueVariantIds, PURCHASE_TIER_IN_CHUNK) +
    ceilDiv(input.uniqueBarcodes, PURCHASE_TIER_IN_CHUNK) +
    ceilDiv(input.uniqueProductIds, PURCHASE_TIER_IN_CHUNK) +
    Math.max(0, input.forkInserts || 0)
  );
}

export function estimatePurchaseSavePipeline(input: PurchaseSavePipelineInput): {
  stages: PurchaseSaveStageCost[];
  totalRoundTrips: number;
  fatStages: string[];
} {
  const lines = Math.max(0, input.lineCount);
  const changed = input.changedLineCount ?? (input.mode === "edit" ? lines : 0);
  const inserted = input.newLineCount ?? (input.mode === "edit" ? 0 : lines);
  const priceTouched =
    input.priceTouchedCount ?? (input.mode === "edit" ? changed : lines);

  const stages: PurchaseSaveStageCost[] = [];

  const tierRt = estimateTierResolveRoundTrips(input);
  stages.push({
    stage: "price-tier-resolve",
    roundTrips: tierRt,
    fatStatementUnderDefaultTimeout: false,
    notes: "Batched IN(100) reads + optional fork inserts. Morning 57014 fix.",
  });

  if (input.mode === "create-atomic") {
    stages.push({
      stage: "save_purchase_bill_with_items_atomic",
      roundTrips: 1,
      fatStatementUnderDefaultTimeout: false,
      notes: "One RPC; function sets statement_timeout=300s. Stock applied set-based.",
    });
  } else if (input.mode === "create-legacy") {
    stages.push({
      stage: "legacy-bill-insert",
      roundTrips: 1,
      fatStatementUnderDefaultTimeout: false,
      notes: "Header insert only.",
    });
    stages.push({
      stage: "purchase_items-insert",
      roundTrips: ceilDiv(inserted, PURCHASE_INSERT_CHUNK),
      fatStatementUnderDefaultTimeout: inserted > 0,
      notes: `Chunks of ${PURCHASE_INSERT_CHUNK}. Per-row stock triggers. No 300s raise.`,
    });
  } else {
    stages.push({
      stage: "bulk_update_purchase_items",
      roundTrips: ceilDiv(changed, PURCHASE_EDIT_UPDATE_CHUNK),
      fatStatementUnderDefaultTimeout: changed > 0,
      notes: `Chunks of ${PURCHASE_EDIT_UPDATE_CHUNK}. Per-row stock triggers. Function does NOT set 300s.`,
    });
    stages.push({
      stage: "purchase_items-insert",
      roundTrips: ceilDiv(inserted, PURCHASE_INSERT_CHUNK),
      fatStatementUnderDefaultTimeout: inserted > 0,
      notes: `Chunks of ${PURCHASE_INSERT_CHUNK}. Per-row stock triggers. No 300s raise.`,
    });
    stages.push({
      stage: "header-and-line-number",
      roundTrips: 2,
      fatStatementUnderDefaultTimeout: false,
      notes: "line_number sync + purchase_bills header update.",
    });
  }

  stages.push({
    stage: "variant-dc-and-product-flags",
    roundTrips:
      ceilDiv(input.uniqueVariantIds, PURCHASE_VARIANT_FLAG_CHUNK) +
      ceilDiv(input.uniqueProductIds, PURCHASE_VARIANT_FLAG_CHUNK),
    fatStatementUnderDefaultTimeout: false,
    notes: `IN-updates of ${PURCHASE_VARIANT_FLAG_CHUNK}. After bill commit on create.`,
  });

  const syncResolve = estimateTierResolveRoundTrips({
    uniqueVariantIds: Math.min(input.uniqueVariantIds, priceTouched),
    uniqueBarcodes: Math.min(input.uniqueBarcodes, priceTouched),
    uniqueProductIds: Math.min(input.uniqueProductIds, priceTouched),
    forkInserts: input.forkInserts,
  });
  const syncWaves = ceilDiv(priceTouched, PURCHASE_SYNC_UPDATE_PARALLEL);
  stages.push({
    stage: "syncLastPurchaseFromBillLines",
    roundTrips: syncResolve + syncWaves,
    fatStatementUnderDefaultTimeout: false,
    notes:
      `Re-resolve then ${PURCHASE_SYNC_UPDATE_PARALLEL} parallel single-row updates ` +
      `(${priceTouched} statements, ${syncWaves} serial waves). After commit — not Draft Preserved.`,
  });

  const totalRoundTrips = stages.reduce((s, st) => s + st.roundTrips, 0);
  return {
    stages,
    totalRoundTrips,
    fatStages: stages.filter((s) => s.fatStatementUnderDefaultTimeout).map((s) => s.stage),
  };
}

/** Realistic bill sizes used in the 57014 investigation report. */
export const PURCHASE_SAVE_BENCHMARK_CASES = [
  {
    name: "normal-60",
    lineCount: 60,
    uniqueVariantIds: 60,
    uniqueBarcodes: 8,
    uniqueProductIds: 8,
    changedLineCount: 60,
    newLineCount: 8,
    priceTouchedCount: 60,
  },
  {
    name: "large-300",
    lineCount: 300,
    uniqueVariantIds: 300,
    uniqueBarcodes: 40,
    uniqueProductIds: 40,
    changedLineCount: 300,
    newLineCount: 40,
    priceTouchedCount: 300,
  },
] as const;

export function summarizePurchaseSaveBenchmark(caseName: (typeof PURCHASE_SAVE_BENCHMARK_CASES)[number]["name"]) {
  const c = PURCHASE_SAVE_BENCHMARK_CASES.find((x) => x.name === caseName);
  if (!c) throw new Error(`unknown case ${caseName}`);
  const modes: PurchaseSaveMode[] = ["create-atomic", "create-legacy", "edit"];
  return modes.map((mode) => {
    const pipe = estimatePurchaseSavePipeline({
      mode,
      lineCount: c.lineCount,
      uniqueVariantIds: c.uniqueVariantIds,
      uniqueBarcodes: c.uniqueBarcodes,
      uniqueProductIds: c.uniqueProductIds,
      ...(mode === "edit"
        ? {
            changedLineCount: c.changedLineCount,
            newLineCount: c.newLineCount,
            priceTouchedCount: c.priceTouchedCount,
          }
        : { priceTouchedCount: c.lineCount }),
    });
    return {
      caseName: c.name,
      mode,
      lineCount: c.lineCount,
      totalRoundTrips: pipe.totalRoundTrips,
      fatStages: pipe.fatStages,
      fatRoundTrips: pipe.stages
        .filter((s) => s.fatStatementUnderDefaultTimeout)
        .reduce((n, s) => n + s.roundTrips, 0),
      stages: pipe.stages,
    };
  });
}
