import { isDecimalUOM } from "@/constants/uom";

export const DECIMAL_QTY_PATTERN = /^\d*\.?\d{0,3}$/;
export const INTEGER_QTY_PATTERN = /^\d*$/;

/**
 * What decides whether a qty may be fractional: a bare UOM string (KG, MTR…),
 * or a line with its UOM and product type. Service lines always allow up to
 * 3 decimals (e.g. 0.5 kg of a service charged by weight).
 */
export type QtyUnit =
  | string
  | null
  | undefined
  | { uom?: string | null; productType?: string | null; quantity?: number | null };

export function allowsDecimalQty(unit: QtyUnit): boolean {
  if (unit == null || typeof unit === "string") return isDecimalUOM(unit);
  if (isDecimalUOM(unit.uom)) return true;
  if (unit.productType === "service") return true;
  // A line already holding a fraction (e.g. a saved 0.5 service line loaded
  // before its product type is known) must stay editable as a fraction.
  const q = Number(unit.quantity);
  return Number.isFinite(q) && q > 0 && !Number.isInteger(q);
}

export function minQtyForUom(unit: QtyUnit): number {
  return allowsDecimalQty(unit) ? 0.001 : 1;
}

export function qtyStepForUom(unit: QtyUnit): number {
  return allowsDecimalQty(unit) ? 0.001 : 1;
}

/** Step for +/− buttons: KG/MTR-type UOMs move by 0.001; service lines still move by 1. */
function buttonStepFor(unit: QtyUnit): number {
  const uom = unit == null || typeof unit === "string" ? unit : unit.uom;
  return isDecimalUOM(uom) ? 0.001 : 1;
}

export function formatQtyForDisplay(qty: number, unit?: QtyUnit): string {
  if (!Number.isFinite(qty)) return "";
  if (allowsDecimalQty(unit)) {
    return String(parseFloat(qty.toFixed(3)));
  }
  return String(Math.round(qty));
}

export function parseQtyValue(raw: string, unit?: QtyUnit): number | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === ".") return null;

  if (allowsDecimalQty(unit)) {
    const n = parseFloat(trimmed);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 1000) / 1000;
  }

  const n = parseInt(trimmed, 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function isPartialQtyInput(raw: string, unit?: QtyUnit): boolean {
  if (raw === "" || raw === ".") return true;
  if (raw.endsWith(".")) return true;

  if (allowsDecimalQty(unit)) {
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n === 0) return true;
  }

  return false;
}

export function clampQty(value: number, unit?: QtyUnit): number {
  const min = minQtyForUom(unit);
  if (allowsDecimalQty(unit)) {
    const rounded = Math.round(value * 1000) / 1000;
    return rounded < min ? min : rounded;
  }
  const rounded = Math.round(value);
  return rounded < min ? min : rounded;
}

export function adjustQtyByStep(current: number, delta: number, unit?: QtyUnit): number {
  const step = buttonStepFor(unit);
  const next = current + delta * step;
  // A service line at 0.5 stays 0.5 on "−" instead of jumping to the 0.001 floor.
  if (next <= 0 && current > 0) return clampQty(current, unit);
  return clampQty(next, unit);
}
