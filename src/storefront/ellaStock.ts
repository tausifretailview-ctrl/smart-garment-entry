export type EllaStockState = "in" | "low" | "out";

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

/** In-stock pieces can be added to cart; zero on-hand opens the enquiry flow. */
export function isEllaProductPurchasable(stock: EllaStockView): boolean {
  return stock.state === "in" || stock.state === "low";
}

/**
 * Single helper for Ella'Noor badges and spec-table Availability.
 */
export function classifyEllaStock(input: EllaStockInput): EllaStockView {
  const available = Number.isFinite(input.available) ? Math.floor(input.available) : 0;
  const threshold = input.lowStockThreshold ?? DEFAULT_LOW;
  const known = input.availableKnown !== false;

  if (available <= 0) {
    return { state: "out", label: "Out of stock · Enquire", available: 0 };
  }
  if (available > 0 && available <= threshold) {
    return { state: "low", label: `Only ${available} left`, available };
  }
  if (!known) {
    return { state: "in", label: "In stock", available };
  }
  return { state: "in", label: `In stock · ${available}`, available };
}

export function ellaStockBadgeClass(state: EllaStockState): string {
  if (state === "low") return "ella-badge ella-badge-low";
  if (state === "out") return "ella-badge ella-badge-out";
  return "ella-badge ella-badge-in";
}

export function ellaMaxPurchaseQty(stock: EllaStockView, availableKnown: boolean): number {
  if (!isEllaProductPurchasable(stock)) return 0;
  if (!availableKnown) return 1;
  return Math.max(1, stock.available);
}
