import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  Info,
  Loader2,
  Printer,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  formatInsightsINR,
  useProductPerformance,
  useSlowMovingStock,
  type ProductPerformanceRow,
} from "@/hooks/useBusinessInsights";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { marginBarColor } from "@/components/business-insights/insightsMarginUtils";
import {
  computePareto,
  pctChange,
  periodLengthDays,
  previousPeriod,
} from "@/components/business-insights/executiveSummaryUtils";
import {
  INSIGHTS_BODY_CELL,
  INSIGHTS_BODY_CELL_NUM,
  INSIGHTS_BODY_ROW,
  INSIGHTS_TAB_SHELL,
  InsightsKpiCard,
  InsightsKpiStrip,
  InsightsPanel,
  InsightsStaticTh,
  InsightsTableHeader,
} from "@/components/business-insights/insightsLayout";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatPeriodLabel(iso: string): string {
  try {
    return format(parseISO(iso), "d MMM yyyy");
  } catch {
    return iso;
  }
}

function formatSignedPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function formatApproxRatio(value: number | null, decimals = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(decimals);
}

type PeriodTotals = {
  revenue: number;
  cogs: number;
  grossProfit: number;
  marginPct: number | null;
  unitsSold: number;
  returnRatePct: number | null;
  stockValue: number;
};

function sumPeriod(rows: ProductPerformanceRow[]): PeriodTotals {
  let revenue = 0;
  let cogs = 0;
  let grossProfit = 0;
  let unitsSold = 0;
  let returnAmount = 0;
  let stockValue = 0;

  for (const row of rows) {
    revenue += num(row.revenue);
    cogs += num(row.cost);
    grossProfit += num(row.gross_profit);
    unitsSold += num(row.units_sold);
    returnAmount += num(row.return_amount);
    stockValue += num(row.stock_value);
  }

  return {
    revenue,
    cogs,
    grossProfit,
    marginPct: revenue > 0 ? (grossProfit / revenue) * 100 : null,
    unitsSold,
    returnRatePct: revenue > 0 ? (returnAmount / revenue) * 100 : null,
    stockValue,
  };
}

function deltaClass(pct: number | null, invert = false): string {
  if (pct === null || !Number.isFinite(pct) || pct === 0) return "text-slate-600";
  const positiveIsGood = invert ? pct < 0 : pct > 0;
  const negativeIsBad = invert ? pct > 0 : pct < 0;
  if (positiveIsGood) return "text-emerald-600 font-semibold";
  if (negativeIsBad) return "text-red-600 font-semibold";
  return "text-slate-600";
}

interface ExecutiveSummaryTabProps {
  startDate: string;
  endDate: string;
}

export function ExecutiveSummaryTab({ startDate, endDate }: ExecutiveSummaryTabProps) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  const priorRange = useMemo(
    () => previousPeriod({ startDate, endDate }),
    [startDate, endDate],
  );
  const daysInPeriod = useMemo(
    () => periodLengthDays({ startDate, endDate }),
    [startDate, endDate],
  );

  const current = useProductPerformance(orgId, { startDate, endDate, enabled: true });
  const prior = useProductPerformance(orgId, {
    startDate: priorRange.startDate,
    endDate: priorRange.endDate,
    enabled: true,
  });
  const dead = useSlowMovingStock(orgId, 90, true);

  const metrics = useMemo(() => {
    const currentRows = current.data ?? [];
    const priorRows = prior.data ?? [];
    const deadRows = dead.data ?? [];

    const cur = sumPeriod(currentRows);
    const prv = sumPeriod(priorRows);

    const stockTurnApprox =
      cur.stockValue > 0 && daysInPeriod > 0
        ? (cur.cogs / cur.stockValue) * (365 / daysInPeriod)
        : null;
    const gmroiApprox = cur.stockValue > 0 ? cur.grossProfit / cur.stockValue : null;

    const deadStockCapital = deadRows.reduce((s, r) => s + num(r.stock_value), 0);
    const pareto = computePareto(currentRows);

    const topSkus = [...currentRows]
      .sort((a, b) => num(b.gross_profit) - num(a.gross_profit))
      .slice(0, 10)
      .map((row) => {
        const revenue = num(row.revenue);
        const grossProfit = num(row.gross_profit);
        const marginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
        const name = (row.product_name || "—").trim();
        return {
          name: name.length > 28 ? `${name.slice(0, 27)}…` : name,
          fullName: name,
          gross_profit: grossProfit,
          marginPct,
        };
      });

    return {
      cur,
      prv,
      stockTurnApprox,
      gmroiApprox,
      deadStockCapital,
      deadVariantCount: deadRows.length,
      pareto,
      topSkus,
      deltas: {
        revenue: pctChange(cur.revenue, prv.revenue),
        grossProfit: pctChange(cur.grossProfit, prv.grossProfit),
        marginPct:
          cur.marginPct === null || prv.marginPct === null
            ? null
            : pctChange(cur.marginPct, prv.marginPct),
        unitsSold: pctChange(cur.unitsSold, prv.unitsSold),
        returnRatePct:
          cur.returnRatePct === null || prv.returnRatePct === null
            ? null
            : pctChange(cur.returnRatePct, prv.returnRatePct),
      },
    };
  }, [current.data, prior.data, dead.data, daysInPeriod]);

  const isLoading = current.isLoading || prior.isLoading || dead.isLoading;
  const error = current.error || prior.error || dead.error;

  const hasNoSales =
    !isLoading &&
    !error &&
    metrics.cur.revenue === 0 &&
    metrics.cur.unitsSold === 0;

  const periodLine = `${formatPeriodLabel(startDate)} – ${formatPeriodLabel(endDate)} compared with ${formatPeriodLabel(priorRange.startDate)} – ${formatPeriodLabel(priorRange.endDate)}`;

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-destructive" />
        <p className="font-medium text-destructive">Failed to load executive summary</p>
        <p className="mt-1 text-sm text-muted-foreground">{(error as Error).message}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading executive summary…
      </div>
    );
  }

  if (hasNoSales) {
    return (
      <div className={INSIGHTS_TAB_SHELL}>
        <div className="executive-summary-print flex flex-col flex-1 min-h-0 gap-2 overflow-y-auto">
          <div className="flex items-start justify-between gap-2 shrink-0">
            <p className="text-sm text-muted-foreground">{periodLine}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 no-print shrink-0"
              onClick={() => window.print()}
            >
              <Printer className="h-4 w-4 mr-1" />
              Print
            </Button>
          </div>
          <div className="flex flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white p-8 text-center">
            <div>
              <p className="text-base font-semibold text-slate-800">No sales in this period</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try widening the date range.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { cur, prv, deltas, pareto, topSkus } = metrics;
  const skuShareFor80 =
    pareto.totalProfitableSkus > 0
      ? (pareto.skusFor80PctProfit / pareto.totalProfitableSkus) * 100
      : 0;

  const movementRows: {
    label: string;
    current: string;
    prior: string;
    change: number | null;
    invert?: boolean;
  }[] = [
    {
      label: "Revenue",
      current: formatInsightsINR(cur.revenue),
      prior: formatInsightsINR(prv.revenue),
      change: deltas.revenue,
    },
    {
      label: "Gross Profit",
      current: formatInsightsINR(cur.grossProfit),
      prior: formatInsightsINR(prv.grossProfit),
      change: deltas.grossProfit,
    },
    {
      label: "Margin %",
      current: formatPct(cur.marginPct),
      prior: formatPct(prv.marginPct),
      change: deltas.marginPct,
    },
    {
      label: "Units Sold",
      current: cur.unitsSold.toLocaleString("en-IN"),
      prior: prv.unitsSold.toLocaleString("en-IN"),
      change: deltas.unitsSold,
    },
    {
      label: "Return Rate",
      current: formatPct(cur.returnRatePct),
      prior: formatPct(prv.returnRatePct),
      change: deltas.returnRatePct,
      invert: true,
    },
  ];

  return (
    <div className={INSIGHTS_TAB_SHELL}>
      <div className="executive-summary-print flex flex-col flex-1 min-h-0 gap-2 overflow-y-auto">
      <div className="flex items-start justify-between gap-2 shrink-0">
        <p className="text-sm text-muted-foreground leading-snug">{periodLine}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 no-print shrink-0"
          onClick={() => window.print()}
        >
          <Printer className="h-4 w-4 mr-1" />
          Print
        </Button>
      </div>

      <InsightsKpiStrip>
        <InsightsKpiCard
          label="Revenue"
          value={formatInsightsINR(cur.revenue)}
          sub={`${formatSignedPct(deltas.revenue)} vs prior period`}
          gradient="bg-gradient-to-br from-blue-500 to-blue-600"
        />
        <InsightsKpiCard
          label="Gross Profit"
          value={formatInsightsINR(cur.grossProfit)}
          sub={`${formatSignedPct(deltas.grossProfit)} vs prior period`}
          gradient="bg-gradient-to-br from-emerald-500 to-emerald-600"
        />
        <InsightsKpiCard
          label="Margin %"
          value={formatPct(cur.marginPct)}
          sub={`${formatSignedPct(deltas.marginPct)} vs prior period`}
          gradient="bg-gradient-to-br from-amber-500 to-amber-600"
        />
      </InsightsKpiStrip>

      <InsightsPanel title="Period on Period" className="shrink-0">
        <Table>
          <InsightsTableHeader>
            <InsightsStaticTh label="Metric" />
            <InsightsStaticTh label="Current" className="text-right" />
            <InsightsStaticTh label="Prior" className="text-right" />
            <InsightsStaticTh label="Change" className="text-right" />
          </InsightsTableHeader>
          <TableBody>
            {movementRows.map((row) => (
              <TableRow key={row.label} className={INSIGHTS_BODY_ROW}>
                <TableCell className={cn(INSIGHTS_BODY_CELL, "font-medium")}>{row.label}</TableCell>
                <TableCell className={INSIGHTS_BODY_CELL_NUM}>{row.current}</TableCell>
                <TableCell className={INSIGHTS_BODY_CELL_NUM}>{row.prior}</TableCell>
                <TableCell
                  className={cn(INSIGHTS_BODY_CELL_NUM, deltaClass(row.change, row.invert))}
                >
                  {formatSignedPct(row.change)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </InsightsPanel>

      <InsightsPanel
        title="Profit Concentration"
        className="min-h-[280px] shrink-0"
        subtitle={
          pareto.totalProfitableSkus > 0
            ? `${pareto.skusFor80PctProfit.toLocaleString("en-IN")} of ${pareto.totalProfitableSkus.toLocaleString("en-IN")} profitable SKUs (${skuShareFor80.toFixed(1)}%) drive 80% of gross profit — ${pareto.concentrationLabel}. The top 20% of SKUs earn ${pareto.top20PctProfitShare.toFixed(1)}% of gross profit.`
            : "No profitable SKUs in this period."
        }
      >
        {topSkus.length === 0 ? (
          <p className="py-10 text-center text-base text-muted-foreground">
            No product profit to chart
          </p>
        ) : (
          <div className="h-[260px] w-full p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={topSkus}
                margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
              >
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => formatInsightsINR(v)}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  formatter={(v: number) => [formatInsightsINR(v), "Gross profit"]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""}
                />
                <Bar dataKey="gross_profit" name="Gross profit" radius={[0, 4, 4, 0]}>
                  {topSkus.map((entry) => (
                    <Cell key={entry.fullName} fill={marginBarColor(entry.marginPct)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </InsightsPanel>

      <InsightsPanel title="Capital Efficiency" className="shrink-0">
        <TooltipProvider delayDuration={200}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
            <div className="px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Stock value on hand
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                {formatInsightsINR(cur.stockValue)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Closing stock from product performance</p>
            </div>

            <div className="px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1">
                Stock turn (approx.)
                <UiTooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-slate-400" aria-label="About stock turn" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    Uses closing stock rather than average inventory.
                  </TooltipContent>
                </UiTooltip>
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                {formatApproxRatio(metrics.stockTurnApprox)}
                {metrics.stockTurnApprox !== null ? "×" : ""}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Annualised · {daysInPeriod} day period
              </p>
            </div>

            <div className="px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1">
                GMROI (approx.)
                <UiTooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-slate-400" aria-label="About GMROI" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    Uses closing stock rather than average inventory.
                  </TooltipContent>
                </UiTooltip>
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                {formatApproxRatio(metrics.gmroiApprox)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Gross profit ÷ stock value</p>
            </div>

            <div className="px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Dead stock capital
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                {formatInsightsINR(metrics.deadStockCapital)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {metrics.deadVariantCount.toLocaleString("en-IN")} variants · idle ≥ 90 days
              </p>
            </div>
          </div>
        </TooltipProvider>
      </InsightsPanel>
      </div>
    </div>
  );
}
