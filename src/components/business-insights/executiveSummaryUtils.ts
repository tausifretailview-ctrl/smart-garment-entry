import { differenceInCalendarDays, format, parseISO, subDays } from "date-fns";

export type PeriodRange = { startDate: string; endDate: string };

/** Inclusive day count between two yyyy-MM-dd dates. */
export function periodLengthDays(range: PeriodRange): number {
  const start = parseISO(range.startDate);
  const end = parseISO(range.endDate);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return 0;
  const days = differenceInCalendarDays(end, start) + 1;
  return days > 0 ? days : 0;
}

/**
 * The equal-length window immediately preceding `range`.
 * e.g. 2026-04-01..2026-07-26 (117 days) -> 2025-12-05..2026-03-31
 */
export function previousPeriod(range: PeriodRange): PeriodRange {
  const days = periodLengthDays(range);
  if (days <= 0) {
    return { startDate: range.startDate, endDate: range.startDate };
  }
  const start = parseISO(range.startDate);
  const priorEnd = subDays(start, 1);
  const priorStart = subDays(priorEnd, days - 1);
  return {
    startDate: format(priorStart, "yyyy-MM-dd"),
    endDate: format(priorEnd, "yyyy-MM-dd"),
  };
}

/**
 * Percent change from `prior` to `current`.
 * Returns null when `prior` is 0 or when either value is not finite —
 * callers must render null as an em dash, never as Infinity or NaN.
 */
export function pctChange(current: number, prior: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(prior) || prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

export type ParetoResult = {
  skusFor80PctProfit: number;
  totalProfitableSkus: number;
  top20PctProfitShare: number;
  concentrationLabel: "Highly concentrated" | "Balanced" | "Widely spread";
};

const EMPTY_PARETO: ParetoResult = {
  skusFor80PctProfit: 0,
  totalProfitableSkus: 0,
  top20PctProfitShare: 0,
  concentrationLabel: "Widely spread",
};

/**
 * Pareto over gross_profit. Consider only rows with gross_profit > 0.
 * Sort desc, walk cumulative until >= 80% of the positive-profit total.
 */
export function computePareto(rows: { gross_profit: number }[]): ParetoResult {
  const profitable = rows
    .map((r) => Number(r.gross_profit))
    .filter((g) => Number.isFinite(g) && g > 0)
    .sort((a, b) => b - a);

  if (profitable.length === 0) return { ...EMPTY_PARETO };

  const totalPositive = profitable.reduce((s, g) => s + g, 0);
  if (!(totalPositive > 0)) return { ...EMPTY_PARETO };

  let cumulative = 0;
  let skusFor80PctProfit = 0;
  for (const gp of profitable) {
    cumulative += gp;
    skusFor80PctProfit += 1;
    if (cumulative >= totalPositive * 0.8) break;
  }

  const topCount = Math.max(1, Math.ceil(profitable.length * 0.2));
  const topProfit = profitable.slice(0, topCount).reduce((s, g) => s + g, 0);
  const top20PctProfitShare = (topProfit / totalPositive) * 100;

  const skuSharePct = (skusFor80PctProfit / profitable.length) * 100;
  const concentrationLabel: ParetoResult["concentrationLabel"] =
    skuSharePct <= 20
      ? "Highly concentrated"
      : skuSharePct <= 50
        ? "Balanced"
        : "Widely spread";

  return {
    skusFor80PctProfit,
    totalProfitableSkus: profitable.length,
    top20PctProfitShare,
    concentrationLabel,
  };
}
