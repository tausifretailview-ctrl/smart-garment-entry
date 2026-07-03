import { isDecimalUOM } from "@/constants/uom";

export const DECIMAL_QTY_PATTERN = /^\d*\.?\d{0,3}$/;
export const INTEGER_QTY_PATTERN = /^\d*$/;

export function minQtyForUom(uom: string | null | undefined): number {
  return isDecimalUOM(uom) ? 0.001 : 1;
}

export function qtyStepForUom(uom: string | null | undefined): number {
  return isDecimalUOM(uom) ? 0.001 : 1;
}

export function formatQtyForDisplay(qty: number, uom?: string | null): string {
  if (!Number.isFinite(qty)) return "";
  if (isDecimalUOM(uom)) {
    return String(parseFloat(qty.toFixed(3)));
  }
  return String(Math.round(qty));
}

export function parseQtyValue(raw: string, uom?: string | null): number | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === ".") return null;

  if (isDecimalUOM(uom)) {
    const n = parseFloat(trimmed);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 1000) / 1000;
  }

  const n = parseInt(trimmed, 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function isPartialQtyInput(raw: string, uom?: string | null): boolean {
  if (raw === "" || raw === ".") return true;
  if (raw.endsWith(".")) return true;

  if (isDecimalUOM(uom)) {
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n === 0) return true;
  }

  return false;
}

export function clampQty(value: number, uom?: string | null): number {
  const min = minQtyForUom(uom);
  if (isDecimalUOM(uom)) {
    const rounded = Math.round(value * 1000) / 1000;
    return rounded < min ? min : rounded;
  }
  const rounded = Math.round(value);
  return rounded < min ? min : rounded;
}

export function adjustQtyByStep(current: number, delta: number, uom?: string | null): number {
  const step = qtyStepForUom(uom);
  return clampQty(current + delta * step, uom);
}
