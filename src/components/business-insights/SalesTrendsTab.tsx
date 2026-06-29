import { useMemo } from "react";
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
import { AlertTriangle, Loader2 } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  formatInsightsINR,
  useCategoryPerformance,
  useProductPerformance,
} from "@/hooks/useBusinessInsights";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { marginBorderClass } from "@/components/business-insights/insightsMarginUtils";
import {
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
    <div className={INSIGHTS_TAB_SHELL}>
      <InsightsKpiStrip>
        <InsightsKpiCard
          label="Top Product (Units)"
          value={topProducts[0]?.product_name ?? "—"}
          sub={
            topProducts[0]
              ? `${num(topProducts[0].units_sold)} units · ${formatInsightsINR(num(topProducts[0].revenue))}`
              : "No sales in period"
          }
          gradient="bg-gradient-to-br from-blue-500 to-blue-600"
        />
        <InsightsKpiCard
          label="Slow Movers"
          value={slowMovers.length}
          sub="Stock on hand, &lt; 5 units sold"
          gradient="bg-gradient-to-br from-amber-500 to-amber-600"
        />
        <InsightsKpiCard
          label="Categories with Sales"
          value={categoryChart.length}
          sub={
            categoryChart[0]
              ? `Top: ${categoryChart[0].fullName}`
              : "No category data"
          }
          gradient="bg-gradient-to-br from-emerald-500 to-emerald-600"
        />
      </InsightsKpiStrip>

      <InsightsPanel className="flex-1" title="Top 10 Products This Period">
        <Table>
          <InsightsTableHeader>
            <InsightsStaticTh label="#" className="w-10" />
            <InsightsStaticTh label="Product" />
            <InsightsStaticTh label="Brand" />
            <InsightsStaticTh label="Units Sold" className="text-right" />
            <InsightsStaticTh label="Revenue" className="text-right" />
            <InsightsStaticTh label="Margin %" className="text-right" />
          </InsightsTableHeader>
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
                    <TableCell className="tabular-nums text-muted-foreground px-3">{idx + 1}</TableCell>
                    <TableCell className="font-medium px-3">{row.product_name}</TableCell>
                    <TableCell className="px-3">{row.brand || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold px-3">
                      {num(row.units_sold)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums px-3">
                      {formatInsightsINR(num(row.revenue))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums px-3">{margin.toFixed(1)}%</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </InsightsPanel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 shrink-0 min-h-[180px] max-h-[min(36vh,320px)]">
        <InsightsPanel
          title="Slow Movers This Period"
          subtitle="In stock but &lt; 5 units sold in date range"
          className="min-h-0"
        >
          <Table>
            <InsightsTableHeader>
              <InsightsStaticTh label="Product" />
              <InsightsStaticTh label="Brand" />
              <InsightsStaticTh label="Units Sold" className="text-right" />
              <InsightsStaticTh label="Stock Qty" className="text-right" />
              <InsightsStaticTh label="Stock Value" className="text-right" />
            </InsightsTableHeader>
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
                    <TableCell className="font-medium px-3">{row.product_name}</TableCell>
                    <TableCell className="px-3">{row.brand || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums px-3">{num(row.units_sold)}</TableCell>
                    <TableCell className="text-right tabular-nums px-3">{num(row.current_stock)}</TableCell>
                    <TableCell className="text-right tabular-nums px-3">
                      {formatInsightsINR(num(row.stock_value))}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </InsightsPanel>

        <InsightsPanel
          title="Category Revenue & Profit"
          subtitle="By category for selected period"
          className="min-h-0"
        >
          {categoryChart.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No category sales data</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
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
        </InsightsPanel>
      </div>
    </div>
  );
}
