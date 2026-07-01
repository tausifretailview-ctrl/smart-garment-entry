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
  INSIGHTS_BODY_CELL,
  INSIGHTS_BODY_CELL_NUM,
  INSIGHTS_BODY_ROW,
  INSIGHTS_TAB_SHELL,
  InsightsKpiCard,
  InsightsKpiStrip,
  InsightsPanel,
  InsightsSortableTh,
  InsightsSubTabPanel,
  InsightsSubTabs,
  InsightsTableHeader,
} from "@/components/business-insights/insightsLayout";

type SortDir = "asc" | "desc";
type SupplierSubTab = "scorecard" | "chart" | "highlights";

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

const SUPPLIER_SUB_TABS = [
  { id: "scorecard" as const, label: "Supplier Scorecard" },
  { id: "chart" as const, label: "Purchase vs Sold" },
  { id: "highlights" as const, label: "Best & Review" },
];

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

  const [subTab, setSubTab] = useState<SupplierSubTab>("scorecard");
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
        .slice(0, 10),
    [suppliers],
  );

  const needsReview = useMemo(
    () =>
      [...suppliers]
        .filter((s) => num(s.bill_count) >= 5)
        .sort((a, b) => num(a.sell_through_rate_pct) - num(b.sell_through_rate_pct))
        .slice(0, 10),
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

      <InsightsSubTabs value={subTab} onValueChange={setSubTab} items={SUPPLIER_SUB_TABS}>
        <InsightsSubTabPanel value="scorecard">
          <InsightsPanel
            className="flex-1 min-h-0"
            title="Supplier Scorecard"
            footer={
              <p className="text-xs text-muted-foreground tabular-nums">
                {sortedSuppliers.length.toLocaleString("en-IN")} supplier
                {sortedSuppliers.length !== 1 ? "s" : ""} in period
              </p>
            }
          >
            <Table className="w-full min-w-max">
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
                    <TableCell colSpan={7} className="py-10 text-center text-base text-muted-foreground">
                      No supplier purchases in the selected period
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedSuppliers.map((row) => {
                    const rate = num(row.sell_through_rate_pct);
                    return (
                      <TableRow key={row.supplier_id} className={INSIGHTS_BODY_ROW}>
                        <TableCell className={cn(INSIGHTS_BODY_CELL, "min-w-[180px]")}>
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
                        <TableCell className={INSIGHTS_BODY_CELL_NUM}>{num(row.bill_count)}</TableCell>
                        <TableCell className={INSIGHTS_BODY_CELL_NUM}>
                          {formatInsightsINR(num(row.total_purchased))}
                        </TableCell>
                        <TableCell className={INSIGHTS_BODY_CELL_NUM}>{num(row.units_sold)}</TableCell>
                        <TableCell className={cn(INSIGHTS_BODY_CELL, "text-right")}>
                          <Badge className={cn("tabular-nums font-semibold text-sm", sellThroughBadgeClass(rate))}>
                            {rate.toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell className={INSIGHTS_BODY_CELL_NUM}>{num(row.return_to_supplier)}</TableCell>
                        <TableCell className={INSIGHTS_BODY_CELL_NUM}>
                          {formatInsightsINR(num(row.current_stock_value))}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </InsightsPanel>
        </InsightsSubTabPanel>

        <InsightsSubTabPanel value="chart">
          <InsightsPanel
            className="flex-1 min-h-0"
            title="Purchase vs Sold Value"
            subtitle="Top 8 suppliers by purchase volume"
          >
            {chartData.length === 0 ? (
              <p className="py-16 text-center text-base text-muted-foreground">No chart data for selected period</p>
            ) : (
              <div className="flex h-full min-h-[360px] flex-col p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 12, right: 24, left: 12, bottom: 56 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      angle={-35}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatInsightsINR(v)} width={80} />
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
              </div>
            )}
          </InsightsPanel>
        </InsightsSubTabPanel>

        <InsightsSubTabPanel value="highlights">
          <div className="grid flex-1 min-h-0 grid-cols-1 gap-2 xl:grid-cols-2">
            <InsightsPanel className="flex-1 min-h-0" title="Best Suppliers" subtitle="Top sell-through in period">
              {topPerformers.length === 0 ? (
                <p className="py-10 text-center text-base text-muted-foreground">No supplier data</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {topPerformers.map((s, i) => (
                    <li
                      key={s.supplier_id}
                      className="flex items-center justify-between gap-3 px-3 py-3 text-base hover:bg-sky-50/70 even:bg-slate-50/80"
                    >
                      <span className="truncate font-medium">
                        <Star className="mr-1.5 inline h-4 w-4 text-emerald-600" />
                        <span className="text-muted-foreground tabular-nums">#{i + 1}</span> {s.supplier_name}
                      </span>
                      <Badge className={cn("tabular-nums shrink-0", sellThroughBadgeClass(num(s.sell_through_rate_pct)))}>
                        {num(s.sell_through_rate_pct).toFixed(1)}%
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </InsightsPanel>

            <InsightsPanel
              className="flex-1 min-h-0"
              title="Needs Review"
              subtitle="5+ bills, lowest sell-through"
            >
              {needsReview.length === 0 ? (
                <p className="py-10 text-center text-base text-muted-foreground">No qualifying suppliers</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {needsReview.map((s, i) => (
                    <li
                      key={s.supplier_id}
                      className="flex items-center justify-between gap-3 px-3 py-3 text-base hover:bg-sky-50/70 even:bg-slate-50/80"
                    >
                      <span className="truncate font-medium">
                        <TrendingDown className="mr-1.5 inline h-4 w-4 text-amber-600" />
                        <span className="text-muted-foreground tabular-nums">#{i + 1}</span> {s.supplier_name}
                      </span>
                      <Badge className={cn("tabular-nums shrink-0", sellThroughBadgeClass(num(s.sell_through_rate_pct)))}>
                        {num(s.sell_through_rate_pct).toFixed(1)}%
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </InsightsPanel>
          </div>
        </InsightsSubTabPanel>
      </InsightsSubTabs>
    </div>
  );
}
