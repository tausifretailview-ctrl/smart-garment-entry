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
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

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

function SortableHead({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}) {
  return (
    <TableHead className={cn("cursor-pointer select-none whitespace-nowrap", className)} onClick={onClick}>
      {label}
      {active ? (dir === "asc" ? " ↑" : " ↓") : ""}
    </TableHead>
  );
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
    <div className="space-y-6">
      {/* Section A — scorecard */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <h3 className="text-base font-semibold">Supplier Scorecard</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead
                    label="Supplier"
                    active={sortKey === "supplier_name"}
                    dir={sortDir}
                    onClick={() => toggleSort("supplier_name")}
                  />
                  <SortableHead
                    label="Bills"
                    active={sortKey === "bill_count"}
                    dir={sortDir}
                    onClick={() => toggleSort("bill_count")}
                    className="text-right"
                  />
                  <SortableHead
                    label="Total Purchased"
                    active={sortKey === "total_purchased"}
                    dir={sortDir}
                    onClick={() => toggleSort("total_purchased")}
                    className="text-right"
                  />
                  <SortableHead
                    label="Units Sold"
                    active={sortKey === "units_sold"}
                    dir={sortDir}
                    onClick={() => toggleSort("units_sold")}
                    className="text-right"
                  />
                  <SortableHead
                    label="Sell-through %"
                    active={sortKey === "sell_through_rate_pct"}
                    dir={sortDir}
                    onClick={() => toggleSort("sell_through_rate_pct")}
                    className="text-right"
                  />
                  <SortableHead
                    label="Returns"
                    active={sortKey === "return_to_supplier"}
                    dir={sortDir}
                    onClick={() => toggleSort("return_to_supplier")}
                    className="text-right"
                  />
                  <SortableHead
                    label="Stock Sitting"
                    active={sortKey === "current_stock_value"}
                    dir={sortDir}
                    onClick={() => toggleSort("current_stock_value")}
                    className="text-right"
                  />
                </TableRow>
              </TableHeader>
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
                        <TableCell className="min-w-[160px]">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{row.supplier_name}</span>
                            {row.supplier_id === highlights.bestValueId && (
                              <Badge variant="outline" className="text-xs border-emerald-300 text-emerald-700">
                                ⭐ Best Value
                              </Badge>
                            )}
                            {row.supplier_id === highlights.reviewId && (
                              <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">
                                ⚠️ Review
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{num(row.bill_count)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatInsightsINR(num(row.total_purchased))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{num(row.units_sold)}</TableCell>
                        <TableCell className="text-right">
                          <Badge className={cn("tabular-nums font-semibold", sellThroughBadgeClass(rate))}>
                            {rate.toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {num(row.return_to_supplier)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatInsightsINR(num(row.current_stock_value))}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Section B — chart */}
      <Card>
        <CardContent className="p-4">
          <h3 className="mb-1 text-base font-semibold">Purchase vs Estimated Sold Value</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Top 8 suppliers by purchase volume. Green bar ≈ units sold × avg purchase cost.
          </p>
          {chartData.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No chart data</p>
          ) : (
            <ResponsiveContainer width="100%" height={340}>
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
                  labelFormatter={(_, payload) =>
                    payload?.[0]?.payload?.fullName ?? ""
                  }
                />
                <Legend />
                <Bar dataKey="purchased" name="Total purchased" fill="hsl(210, 70%, 50%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="soldValue" name="Est. sold value" fill="hsl(150, 60%, 45%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Section C — top vs bottom */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-emerald-600" />
              <h3 className="font-semibold">Best Suppliers</h3>
            </div>
            {topPerformers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No supplier data</p>
            ) : (
              <ul className="space-y-3">
                {topPerformers.map((s, i) => (
                  <li key={s.supplier_id} className="flex items-start justify-between gap-2 border-b pb-2 last:border-0">
                    <div>
                      <span className="text-xs text-muted-foreground">#{i + 1}</span>{" "}
                      <span className="font-medium">{s.supplier_name}</span>
                    </div>
                    <div className="text-right text-sm shrink-0">
                      <Badge className={cn("tabular-nums", sellThroughBadgeClass(num(s.sell_through_rate_pct)))}>
                        {num(s.sell_through_rate_pct).toFixed(1)}%
                      </Badge>
                      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                        {formatInsightsINR(num(s.total_purchased))} purchased
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-amber-600" />
              <h3 className="font-semibold">Needs Review</h3>
              <span className="text-xs text-muted-foreground">(min. 5 bills)</span>
            </div>
            {needsReview.length === 0 ? (
              <p className="text-sm text-muted-foreground">No qualifying suppliers</p>
            ) : (
              <ul className="space-y-3">
                {needsReview.map((s, i) => (
                  <li key={s.supplier_id} className="flex items-start justify-between gap-2 border-b pb-2 last:border-0">
                    <div>
                      <span className="text-xs text-muted-foreground">#{i + 1}</span>{" "}
                      <span className="font-medium">{s.supplier_name}</span>
                    </div>
                    <div className="text-right text-sm shrink-0">
                      <Badge className={cn("tabular-nums", sellThroughBadgeClass(num(s.sell_through_rate_pct)))}>
                        {num(s.sell_through_rate_pct).toFixed(1)}%
                      </Badge>
                      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                        {formatInsightsINR(num(s.current_stock_value))} stock sitting
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
