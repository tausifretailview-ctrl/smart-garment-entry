import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  formatInsightsINR,
  useCategoryPerformance,
  useProductPerformance,
} from "@/hooks/useBusinessInsights";
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
import {
  marginBarColor,
  marginBorderClass,
} from "@/components/business-insights/insightsMarginUtils";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function truncateLabel(text: string, max = 28): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

interface SalesTrendsTabProps {
  startDate: string;
  endDate: string;
}

export function SalesTrendsTab({ startDate, endDate }: SalesTrendsTabProps) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const range = { startDate, endDate, enabled: true };

  const {
    data: products = [],
    isLoading: productsLoading,
    error: productsError,
  } = useProductPerformance(orgId, range);

  const {
    data: categories = [],
    isLoading: categoriesLoading,
    error: categoriesError,
  } = useCategoryPerformance(orgId, range);

  const topProducts = useMemo(
    () =>
      [...products]
        .filter((p) => num(p.units_sold) > 0)
        .sort((a, b) => num(b.units_sold) - num(a.units_sold))
        .slice(0, 10),
    [products],
  );

  const topProductsChart = useMemo(
    () =>
      topProducts.map((p) => ({
        name: truncateLabel(p.product_name || "—"),
        fullName: p.product_name,
        units_sold: num(p.units_sold),
        margin: num(p.profit_margin_pct),
      })),
    [topProducts],
  );

  const slowMovers = useMemo(
    () =>
      [...products]
        .filter((p) => num(p.units_sold) < 5 && num(p.current_stock) > 0)
        .sort((a, b) => num(b.stock_value) - num(a.stock_value)),
    [products],
  );

  const categoryChart = useMemo(
    () =>
      [...categories]
        .filter((c) => num(c.revenue) > 0)
        .sort((a, b) => num(b.revenue) - num(a.revenue))
        .map((c) => ({
          name: truncateLabel(c.category || "—", 16),
          fullName: c.category,
          revenue: num(c.revenue),
          cost: num(c.cost),
          gross_profit: num(c.gross_profit),
        })),
    [categories],
  );

  const isLoading = productsLoading || categoriesLoading;
  const error = productsError || categoriesError;

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-destructive" />
        <p className="font-medium text-destructive">Failed to load sales trends</p>
        <p className="mt-1 text-sm text-muted-foreground">{(error as Error).message}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading sales trends…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section A — top products */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <h3 className="text-base font-semibold">Top 10 Products This Period</h3>

          {topProductsChart.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No sales in selected period</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={topProductsChart} layout="vertical" margin={{ left: 4, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 9 }} />
                <Tooltip
                  formatter={(v: number) => [`${v} units`, "Units sold"]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""}
                />
                <Bar dataKey="units_sold" name="Units sold" radius={[0, 4, 4, 0]}>
                  {topProductsChart.map((entry) => (
                    <Cell key={entry.fullName} fill={marginBarColor(entry.margin)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead className="text-right">Units Sold</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                      No product sales in period
                    </TableCell>
                  </TableRow>
                ) : (
                  topProducts.map((row, idx) => {
                    const margin = num(row.profit_margin_pct);
                    return (
                      <TableRow
                        key={row.product_id}
                        className={cn(marginBorderClass(margin))}
                      >
                        <TableCell className="tabular-nums text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="font-medium">{row.product_name}</TableCell>
                        <TableCell>{row.brand || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {num(row.units_sold)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatInsightsINR(num(row.revenue))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{margin.toFixed(1)}%</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Section B — slow movers in period */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <h3 className="text-base font-semibold">Slow Movers This Period</h3>
            <p className="text-sm text-muted-foreground">
              These products have stock but low sales in the selected period (&lt; 5 units sold).
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead className="text-right">Units Sold</TableHead>
                  <TableHead className="text-right">Stock Qty</TableHead>
                  <TableHead className="text-right">Stock Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slowMovers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                      No slow movers matching criteria
                    </TableCell>
                  </TableRow>
                ) : (
                  slowMovers.map((row) => (
                    <TableRow key={row.product_id}>
                      <TableCell className="font-medium">{row.product_name}</TableCell>
                      <TableCell>{row.brand || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{num(row.units_sold)}</TableCell>
                      <TableCell className="text-right tabular-nums">{num(row.current_stock)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInsightsINR(num(row.stock_value))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Section C — category value breakdown */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <h3 className="text-base font-semibold">Category Revenue &amp; Profit</h3>
          <p className="text-sm text-muted-foreground">
            Revenue, cost, and gross profit by category for the selected period.
          </p>
          {categoryChart.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No category sales data</p>
          ) : (
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={categoryChart} margin={{ top: 8, right: 16, left: 8, bottom: 48 }}>
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
                  formatter={(v: number, name: string) => {
                    const labels: Record<string, string> = {
                      revenue: "Revenue",
                      cost: "Cost",
                      gross_profit: "Gross profit",
                    };
                    return [formatInsightsINR(v), labels[name] ?? name];
                  }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""}
                />
                <Legend />
                <Bar dataKey="revenue" name="Revenue" fill="hsl(210, 70%, 50%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cost" name="Cost" fill="hsl(0, 65%, 55%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="gross_profit" name="Gross profit" fill="hsl(150, 60%, 45%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
