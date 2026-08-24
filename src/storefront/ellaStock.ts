export type EllaStockState = "in" | "low" | "mto";

export type EllaStockInput = {
  available: number;
  /** False when ERP only reports “in stock” without a quantity (qty hidden above the public threshold). */
  availableKnown?: boolean;
  madeToOrder?: boolean;
  leadTimeWeeks?: number | null;
  lowStockThreshold?: number;
};

export type EllaStockView = {
  state: EllaStockState;
  label: string;
  available: number;
};

const DEFAULT_LOW = 3;
const DEFAULT_LEAD = 6;

/**
 * Single helper for Ella'Noor badges and spec-table Availability.
 * A made-to-order studio is never “out of stock” — zero on-hand is a lead time.
 */
export function classifyEllaStock(input: EllaStockInput): EllaStockView {
  const available = Number.isFinite(input.available) ? Math.floor(input.available) : 0;
  const threshold = input.lowStockThreshold ?? DEFAULT_LOW;
  const known = input.availableKnown !== false;
  const weeks = input.leadTimeWeeks != null && input.leadTimeWeeks > 0 ? input.leadTimeWeeks : DEFAULT_LEAD;

  if (available > 0 && available <= threshold) {
    return { state: "low", label: `Only ${available} left`, available };
  }
  if (available <= 0) {
    return { state: "mto", label: `Made to order · ${weeks} weeks`, available: 0 };
  }
  if (!known) {
    return { state: "in", label: "In stock", available };
  }
  return { state: "in", label: `In stock · ${available}`, available };
}

export function ellaStockBadgeClass(state: EllaStockState): string {
  if (state === "low") return "ella-badge ella-badge-low";
  if (state === "mto") return "ella-badge ella-badge-mto";
  return "ella-badge ella-badge-in";
}
