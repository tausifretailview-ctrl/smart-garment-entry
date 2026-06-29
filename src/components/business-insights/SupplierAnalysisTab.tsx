import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Loader2, Star, TrendingDown } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  formatInsightsINR,
  useSupplierPerformance,
  type SupplierPerformanceRow,
} from "@/hooks/useBusinessInsights";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  INSIGHTS_TAB_SHELL,
  InsightsKpiCard,
  InsightsKpiStrip,
  InsightsPanel,
  InsightsSortableTh,
  InsightsTableHeader,
} from "@/components/business-insights/insightsLayout";

type SortDir = "asc" | "desc";

type SupplierSortKey = keyof Pick<
  SupplierPerformanceRow,
  | "supplier_name"
  | "bill_count"
  | "total_purchased"
  | "units_sold"
  | "sell_through_rate_pct"
  | "return_to_supplier"
  | "current_stock_value"
>;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sortRows<T>(rows: T[], key: keyof T, dir: SortDir): T[] {
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === "number" && typeof bv === "number") {
      return dir === "asc" ? av - bv : bv - av;
    }
    const as = String(av ?? "").toLowerCase();
    const bs = String(bv ?? "").toLowerCase();
    if (as < bs) return dir === "asc" ? -1 : 1;
    if (as > bs) return dir === "asc" ? 1 : -1;
    return 0;
  });
}

function sellThroughBadgeClass(rate: number): string {
  if (rate > 70) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300";
  if (rate >= 40) return "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300";
  return "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300";
}

function estimatedSoldValue(row: SupplierPerformanceRow): number {
  const unitsPurchased = num(row.units_purchased);
  const unitsSold = num(row.units_sold);
  const totalPurchased = num(row.total_purchased);
  if (unitsPurchased <= 0 || unitsSold <= 0) return 0;
  const avgUnitCost = totalPurchased / unitsPurchased;
  return unitsSold * avgUnitCost;
}

interface SupplierAnalysisTabProps {
  startDate: string;
  endDate: string;
}

export function SupplierAnalysisTab({ startDate, endDate }: SupplierAnalysisTabProps) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  const {
    data: suppliers = [],
    isLoading,
    error,
  } = useSupplierPerformance(orgId, { startDate, endDate, enabled: true });

  const [sortKey, setSortKey] = useState<SupplierSortKey>("sell_through_rate_pct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: SupplierSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "supplier_name" ? "asc" : "desc");
    }
  };

  const highlights = useMemo(() => {
    if (!suppliers.length) return { bestValueId: null as string | null, reviewId: null as string | null };
    const bestValue = suppliers.reduce((best, s) =>
      num(s.sell_through_rate_pct) > num(best.sell_through_rate_pct) ? s : best,
    );
    const review = suppliers.reduce((max, s) =>
      num(s.current_stock_value) > num(max.current_stock_value) ? s : max,
    );
    return {
      bestValueId: bestValue.supplier_id,
      reviewId: num(review.current_stock_value) > 0 ? review.supplier_id : null,
    };
  }, [suppliers]);

  const sortedSuppliers = useMemo(
    () => sortRows(suppliers, sortKey, sortDir),
    [suppliers, sortKey, sortDir],
  );

  const chartData = useMemo(
    () =>
      [...suppliers]
        .sort((a, b) => num(b.total_purchased) - num(a.total_purchased))
        .slice(0, 8)
        .map((s) => ({
          name:
            (s.supplier_name?.length ?? 0) > 14
              ? `${s.supplier_name.slice(0, 12)}…`
              : s.supplier_name || "—",
          fullName: s.supplier_name,
          purchased: num(s.total_purchased),
          soldValue: Math.round(estimatedSoldValue(s)),
        })),
    [suppliers],
  );

  const topPerformers = useMemo(
    () =>
      [...suppliers]
        .sort((a, b) => num(b.sell_through_rate_pct) - num(a.sell_through_rate_pct))
        .slice(0, 3),
    [suppliers],
  );

  const needsReview = useMemo(
    () =>
      [...suppliers]
        .filter((s) => num(s.bill_count) >= 5)
        .sort((a, b) => num(a.sell_through_rate_pct) - num(b.sell_through_rate_pct))
        .slice(0, 3),
    [suppliers],
  );

  const totalPurchased = useMemo(
    () => suppliers.reduce((s, r) => s + num(r.total_purchased), 0),
    [suppliers],
  );
  const avgSellThrough = useMemo(() => {
    if (!suppliers.length) return 0;
    return suppliers.reduce((s, r) => s + num(r.sell_through_rate_pct), 0) / suppliers.length;
  }, [suppliers]);

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-destructive" />
        <p className="font-medium text-destructive">Failed to load supplier data</p>
        <p className="mt-1 text-sm text-muted-foreground">{(error as Error).message}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading supplier insights…
      </div>
    );
  }

  return (
    <div className={INSIGHTS_TAB_SHELL}>
      <InsightsKpiStrip>
        <InsightsKpiCard
          label="Suppliers Active"
          value={suppliers.length}
          sub="With purchases in period"
          gradient="bg-gradient-to-br from-blue-500 to-blue-600"
        />
        <InsightsKpiCard
          label="Total Purchased"
          value={formatInsightsINR(totalPurchased)}
          sub={`Avg sell-through ${avgSellThrough.toFixed(1)}%`}
          gradient="bg-gradient-to-br from-emerald-500 to-emerald-600"
        />
        <InsightsKpiCard
          label="Top Performer"
          value={topPerformers[0]?.supplier_name ?? "—"}
          sub={
            topPerformers[0]
              ? `${num(topPerformers[0].sell_through_rate_pct).toFixed(1)}% sell-through`
              : "No data"
          }
          gradient="bg-gradient-to-br from-slate-600 to-slate-700"
        />
      </InsightsKpiStrip>

      <InsightsPanel className="flex-1" title="Supplier Scorecard">
        <Table>
          <InsightsTableHeader>
            <InsightsSortableTh
              label="Supplier"
              active={sortKey === "supplier_name"}
              dir={sortDir}
              onClick={() => toggleSort("supplier_name")}
            />
            <InsightsSortableTh
              label="Bills"
              active={sortKey === "bill_count"}
              dir={sortDir}
              onClick={() => toggleSort("bill_count")}
              className="text-right"
            />
            <InsightsSortableTh
              label="Total Purchased"
              active={sortKey === "total_purchased"}
              dir={sortDir}
              onClick={() => toggleSort("total_purchased")}
              className="text-right"
            />
            <InsightsSortableTh
              label="Units Sold"
              active={sortKey === "units_sold"}
              dir={sortDir}
              onClick={() => toggleSort("units_sold")}
              className="text-right"
            />
            <InsightsSortableTh
              label="Sell-through %"
              active={sortKey === "sell_through_rate_pct"}
              dir={sortDir}
              onClick={() => toggleSort("sell_through_rate_pct")}
              className="text-right"
            />
            <InsightsSortableTh
              label="Returns"
              active={sortKey === "return_to_supplier"}
              dir={sortDir}
              onClick={() => toggleSort("return_to_supplier")}
              className="text-right"
            />
            <InsightsSortableTh
              label="Stock Sitting"
              active={sortKey === "current_stock_value"}
              dir={sortDir}
              onClick={() => toggleSort("current_stock_value")}
              className="text-right"
            />
          </InsightsTableHeader>
          <TableBody>
            {sortedSuppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No supplier purchases in the selected period
                </TableCell>
              </TableRow>
            ) : (
              sortedSuppliers.map((row) => {
                const rate = num(row.sell_through_rate_pct);
                return (
                  <TableRow key={row.supplier_id}>
                    <TableCell className="min-w-[160px] px-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{row.supplier_name}</span>
                        {row.supplier_id === highlights.bestValueId && (
                          <Badge variant="outline" className="text-xs border-emerald-300 text-emerald-700">
                            Best Value
                          </Badge>
                        )}
                        {row.supplier_id === highlights.reviewId && (
                          <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">
                            Review
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums px-3">{num(row.bill_count)}</TableCell>
                    <TableCell className="text-right tabular-nums px-3">
                      {formatInsightsINR(num(row.total_purchased))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums px-3">{num(row.units_sold)}</TableCell>
                    <TableCell className="text-right px-3">
                      <Badge className={cn("tabular-nums font-semibold", sellThroughBadgeClass(rate))}>
                        {rate.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums px-3">
                      {num(row.return_to_supplier)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums px-3">
                      {formatInsightsINR(num(row.current_stock_value))}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </InsightsPanel>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-2 shrink-0 min-h-[160px] max-h-[min(32vh,280px)]">
        <InsightsPanel
          title="Purchase vs Sold Value"
          subtitle="Top 8 by purchase volume"
          className="xl:col-span-2 min-h-0"
        >
          {chartData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No chart data</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 48 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  angle={-35}
                  textAnchor="end"
                  height={70}
                />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatInsightsINR(v)} width={72} />
                <Tooltip
                  formatter={(v: number, name: string) => [
                    formatInsightsINR(v),
                    name === "purchased" ? "Total purchased" : "Est. sold value",
                  ]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""}
                />
                <Legend />
                <Bar dataKey="purchased" name="Total purchased" fill="hsl(210, 70%, 50%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="soldValue" name="Est. sold value" fill="hsl(150, 60%, 45%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </InsightsPanel>

        <div className="grid grid-rows-2 gap-2 min-h-0">
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-3 overflow-hidden min-h-0">
            <div className="flex items-center gap-2 mb-2">
              <Star className="h-4 w-4 text-emerald-600 shrink-0" />
              <h3 className="text-sm font-bold text-slate-800">Best Suppliers</h3>
            </div>
            {topPerformers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No supplier data</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {topPerformers.map((s, i) => (
                  <li key={s.supplier_id} className="flex justify-between gap-2 border-b border-slate-100 pb-1.5 last:border-0">
                    <span className="truncate font-medium">
                      <span className="text-muted-foreground text-xs">#{i + 1}</span> {s.supplier_name}
                    </span>
                    <Badge className={cn("tabular-nums shrink-0 text-xs", sellThroughBadgeClass(num(s.sell_through_rate_pct)))}>
                      {num(s.sell_through_rate_pct).toFixed(1)}%
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-3 overflow-hidden min-h-0">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-4 w-4 text-amber-600 shrink-0" />
              <h3 className="text-sm font-bold text-slate-800">Needs Review</h3>
              <span className="text-xs text-muted-foreground">(5+ bills)</span>
            </div>
            {needsReview.length === 0 ? (
              <p className="text-xs text-muted-foreground">No qualifying suppliers</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {needsReview.map((s, i) => (
                  <li key={s.supplier_id} className="flex justify-between gap-2 border-b border-slate-100 pb-1.5 last:border-0">
                    <span className="truncate font-medium">
                      <span className="text-muted-foreground text-xs">#{i + 1}</span> {s.supplier_name}
                    </span>
                    <Badge className={cn("tabular-nums shrink-0 text-xs", sellThroughBadgeClass(num(s.sell_through_rate_pct)))}>
                      {num(s.sell_through_rate_pct).toFixed(1)}%
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
