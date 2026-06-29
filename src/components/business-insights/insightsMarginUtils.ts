/** Margin tier colors for Business Insights charts and table borders. */
export function marginBarColor(marginPct: number): string {
  if (marginPct > 30) return "#22c55e";
  if (marginPct >= 15) return "#f59e0b";
  return "#ef4444";
}

export function marginBorderClass(marginPct: number): string {
  if (marginPct > 30) return "border-l-4 border-l-emerald-500";
  if (marginPct >= 15) return "border-l-4 border-l-amber-500";
  return "border-l-4 border-l-red-500";
}

export const INSIGHTS_CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(210, 70%, 50%)",
  "hsl(150, 60%, 45%)",
  "hsl(45, 90%, 55%)",
  "hsl(280, 65%, 55%)",
  "hsl(0, 70%, 55%)",
  "hsl(180, 60%, 45%)",
  "hsl(330, 65%, 55%)",
  "hsl(120, 50%, 40%)",
  "hsl(60, 80%, 50%)",
];
