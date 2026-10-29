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
