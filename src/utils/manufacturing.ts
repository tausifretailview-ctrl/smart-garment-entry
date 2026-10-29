/**
 * Manufacturer ERP helpers (pure, no DB): settings, default stages and the design-card
 * standard cost. Screens live in src/pages/Manufacturing.tsx.
 */

export const MANUFACTURER_ERP_FEATURE = "manufacturer_erp";

export type MfgOverIssueAction = "warn" | "block";
export type MfgEndBitsDefault = "wastage" | "stock";
export type MfgWorkType = "in_house" | "job_work" | "both";

export interface ManufacturerERPConfig {
  enabled?: boolean;
  /** Fabric used above the design card by more than this % is flagged. */
  allowed_wastage_percent?: number;
  /** What happens when fabric issued to a lot is above standard + allowed %. */
  over_issue_action?: MfgOverIssueAction;
  /** Leftover fabric after cutting: count as wastage, or put back in stock. User can change per lot. */
  end_bits_default?: MfgEndBitsDefault;
}

export interface ManufacturerERPSettings {
  enabled: boolean;
  allowed_wastage_percent: number;
  over_issue_action: MfgOverIssueAction;
  end_bits_default: MfgEndBitsDefault;
}

export const DEFAULT_MANUFACTURER_ERP: ManufacturerERPSettings = {
  enabled: false,
  allowed_wastage_percent: 5,
  over_issue_action: "warn",
  end_bits_default: "wastage",
};

/** On only when Platform Admin enabled the feature for the shop AND the shop switched it on. */
export function resolveManufacturerERP(
  featureEnabled: boolean,
  config: ManufacturerERPConfig | null | undefined,
): ManufacturerERPSettings {
  if (!featureEnabled || !config?.enabled) return { ...DEFAULT_MANUFACTURER_ERP };
  const pct = Number(config.allowed_wastage_percent);
  return {
    enabled: true,
    allowed_wastage_percent: Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : DEFAULT_MANUFACTURER_ERP.allowed_wastage_percent,
    over_issue_action: config.over_issue_action === "block" ? "block" : "warn",
    end_bits_default: config.end_bits_default === "stock" ? "stock" : "wastage",
  };
}

/** Stages the user listed. Product ready is the finish step, not a stage. Polishing / Master Sheet details are set per shop. */
export const DEFAULT_MFG_STAGES: ReadonlyArray<{ name: string; work_type: MfgWorkType }> = [
  { name: "Cutting", work_type: "in_house" },
  { name: "Polishing", work_type: "both" },
  { name: "Colouring", work_type: "both" },
  { name: "Master Sheet Ready", work_type: "both" },
  { name: "Button & Other Work", work_type: "both" },
  { name: "Ironing", work_type: "both" },
];

export const MFG_WORK_TYPE_LABEL: Record<MfgWorkType, string> = {
  in_house: "Shop staff",
  job_work: "Outside job worker",
  both: "Staff or job worker",
};

export interface DesignMaterialLine {
  material_type: "fabric" | "trim";
  qty_per_piece: number;
  wastage_percent: number;
  /** Purchase price per metre (fabric) or per unit (trim). */
  unit_price: number;
}

export interface DesignCostBreakdown {
  fabric: number;
  trims: number;
  labour: number;
  overhead: number;
  total: number;
  /** Fabric metres one piece needs, wastage included. */
  fabric_meters: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/** Standard (planned) cost of one piece from its design card. */
export function computeDesignStandardCost(
  materials: DesignMaterialLine[],
  stageRates: number[],
  overheadPerPiece: number,
): DesignCostBreakdown {
  let fabric = 0;
  let trims = 0;
  let fabricMeters = 0;
  for (const m of materials) {
    const qty = num(m.qty_per_piece) * (1 + Math.min(num(m.wastage_percent), 100) / 100);
    const amount = qty * num(m.unit_price);
    if (m.material_type === "fabric") {
      fabric += amount;
      fabricMeters += qty;
    } else {
      trims += amount;
    }
  }
  const labour = stageRates.reduce((s, r) => s + num(r), 0);
  const overhead = num(overheadPerPiece);
  return {
    fabric: round2(fabric),
    trims: round2(trims),
    labour: round2(labour),
    overhead: round2(overhead),
    total: round2(fabric + trims + labour + overhead),
    fabric_meters: Math.round(fabricMeters * 1000) / 1000,
  };
}

/** How many pieces the metres in stock can still make for a design (0 when the card has no fabric). */
export function piecesFromMeters(metersInStock: number, fabricMetersPerPiece: number): number {
  const per = num(fabricMetersPerPiece);
  if (per === 0) return 0;
  return Math.floor((num(metersInStock) + 1e-9) / per);
}

// ───────────────────────────── Phase 2: lots ─────────────────────────────

export type MfgLotStatus = "open" | "cut" | "finished" | "cancelled";

export const MFG_LOT_STATUS_LABEL: Record<MfgLotStatus, string> = {
  open: "Cutting pending",
  cut: "In process",
  finished: "Finished",
  cancelled: "Cancelled",
};

export interface LotJobReceipt {
  good_qty: number;
  rejected_qty: number;
  wasted_qty: number;
}

export interface LotJobCard {
  stage_id: string;
  sent_qty: number;
  rate: number;
  status: "open" | "closed";
  closed_short_qty: number;
  receipts: LotJobReceipt[];
}

export interface LotStageFlow {
  stage_id: string;
  /** Pieces that reached this stage (cut pieces for the first stage, good from the stage before otherwise). */
  input: number;
  sent: number;
  good: number;
  rejected: number;
  wasted: number;
  /** Pieces never returned on cards closed short. */
  missing: number;
  /** Still with workers on open cards. */
  pending: number;
  /** Not yet sent to any worker. */
  available: number;
}

export interface LotFlow {
  stages: LotStageFlow[];
  /** Good pieces coming out of the last stage (or cut pieces when the lot has no stages). */
  output: number;
  /** Output not yet put into stock. */
  readyForStock: number;
}

const n0 = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** Pieces a job card still owes (sent − received − closed short). */
export function jobCardRemaining(card: Pick<LotJobCard, "sent_qty" | "closed_short_qty" | "receipts">): number {
  const back = card.receipts.reduce((s, r) => s + n0(r.good_qty) + n0(r.rejected_qty) + n0(r.wasted_qty), 0);
  return round3(Math.max(n0(card.sent_qty) - back - n0(card.closed_short_qty), 0));
}

/** Where every piece of a lot is: per stage in the lot's order, then what is ready for stock. */
export function computeLotFlow(stageIds: string[], cutTotal: number, cards: LotJobCard[], finishedTotal: number): LotFlow {
  let input = Math.max(n0(cutTotal), 0);
  const stages: LotStageFlow[] = stageIds.map((stageId) => {
    const own = cards.filter((c) => c.stage_id === stageId);
    let sent = 0, good = 0, rejected = 0, wasted = 0, missing = 0, pending = 0;
    for (const c of own) {
      sent += n0(c.sent_qty);
      missing += n0(c.closed_short_qty);
      for (const r of c.receipts) {
        good += n0(r.good_qty);
        rejected += n0(r.rejected_qty);
        wasted += n0(r.wasted_qty);
      }
      if (c.status === "open") pending += jobCardRemaining(c);
    }
    const row: LotStageFlow = {
      stage_id: stageId,
      input: round3(input),
      sent: round3(sent),
      good: round3(good),
      rejected: round3(rejected),
      wasted: round3(wasted),
      missing: round3(missing),
      pending: round3(pending),
      available: round3(Math.max(input - sent, 0)),
    };
    input = good;
    return row;
  });
  const output = round3(input);
  return { stages, output, readyForStock: round3(Math.max(output - n0(finishedTotal), 0)) };
}

export interface LotRollCost {
  issued_meters: number;
  leftover_meters: number;
  leftover_action: "wastage" | "stock" | null;
  pur_price: number;
}

export interface LotCostInput {
  rolls: LotRollCost[];
  /** Standard trims cost of one piece, from the design card. */
  trimsPerPiece: number;
  cutTotal: number;
  cuttingRate: number;
  cards: LotJobCard[];
  overheadPerPiece: number;
  /** Good pieces the cost is shared over. */
  goodPieces: number;
}

export interface LotCost {
  fabric_meters: number;
  fabric: number;
  trims: number;
  cutting: number;
  labour: number;
  overhead: number;
  total: number;
  per_piece: number;
}

/**
 * Real cost of a lot. Fabric counts every metre issued except leftover put back in stock
 * (wasted end bits are part of the cost). Stage labour is paid on good pieces. Rejected and
 * wasted pieces are not dropped: their cost is shared by the good pieces.
 */
export function computeLotCost(input: LotCostInput): LotCost {
  let meters = 0;
  let fabric = 0;
  for (const r of input.rolls) {
    const back = r.leftover_action === "stock" ? n0(r.leftover_meters) : 0;
    const used = Math.max(n0(r.issued_meters) - back, 0);
    meters += used;
    fabric += used * Math.max(n0(r.pur_price), 0);
  }
  const cut = Math.max(n0(input.cutTotal), 0);
  const trims = Math.max(n0(input.trimsPerPiece), 0) * cut;
  const cutting = Math.max(n0(input.cuttingRate), 0) * cut;
  let labour = 0;
  for (const c of input.cards) {
    const good = c.receipts.reduce((s, r) => s + n0(r.good_qty), 0);
    labour += good * Math.max(n0(c.rate), 0);
  }
  const goodPieces = Math.max(n0(input.goodPieces), 0);
  const overhead = Math.max(n0(input.overheadPerPiece), 0) * goodPieces;
  const total = fabric + trims + cutting + labour + overhead;
  return {
    fabric_meters: round3(meters),
    fabric: round2(fabric),
    trims: round2(trims),
    cutting: round2(cutting),
    labour: round2(labour),
    overhead: round2(overhead),
    total: round2(total),
    per_piece: goodPieces > 0 ? round2(total / goodPieces) : 0,
  };
}
