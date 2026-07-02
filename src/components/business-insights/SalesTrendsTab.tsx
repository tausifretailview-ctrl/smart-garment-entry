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
  INSIGHTS_BODY_CELL,
  INSIGHTS_BODY_CELL_NUM,
  INSIGHTS_BODY_ROW,
  INSIGHTS_TAB_SHELL,
  InsightsKpiCard,
  InsightsKpiStrip,
  InsightsPanel,
  InsightsStaticTh,
  InsightsSubTabPanel,
  InsightsSubTabs,
  InsightsTableHeader,
} from "@/components/business-insights/insightsLayout";

type SalesSubTab = "top-products" | "slow-movers" | "category-chart";

const SALES_SUB_TABS = [
  { id: "top-products" as const, label: "Top Products" },
  { id: "slow-movers" as const, label: "Slow Movers" },
  { id: "category-chart" as const, label: "Category Revenue" },
];

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

  const [subTab, setSubTab] = useState<SalesSubTab>("top-products");

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
        .slice(0, 50),
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

      <InsightsSubTabs value={subTab} onValueChange={(v) => setSubTab(v as SalesSubTab)} items={SALES_SUB_TABS}>
        <InsightsSubTabPanel value="top-products">
          <InsightsPanel
            className="flex-1 min-h-0"
            title="Top Products This Period"
            subtitle="Ranked by units sold"
            footer={
              <p className="text-xs text-muted-foreground tabular-nums">
                Showing top {topProducts.length.toLocaleString("en-IN")} products by units sold
              </p>
            }
          >
            <Table className="w-full min-w-max">
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
                    <TableCell colSpan={6} className="py-10 text-center text-base text-muted-foreground">
                      No product sales in period
                    </TableCell>
                  </TableRow>
                ) : (
                  topProducts.map((row, idx) => {
                    const margin = num(row.profit_margin_pct);
                    return (
                      <TableRow
                        key={row.product_id}
                        className={cn(INSIGHTS_BODY_ROW, marginBorderClass(margin))}
                      >
                        <TableCell className={cn(INSIGHTS_BODY_CELL, "tabular-nums text-muted-foreground")}>
                          {idx + 1}
                        </TableCell>
                        <TableCell className={cn(INSIGHTS_BODY_CELL, "font-medium")}>{row.product_name}</TableCell>
                        <TableCell className={INSIGHTS_BODY_CELL}>{row.brand || "—"}</TableCell>
                        <TableCell className={cn(INSIGHTS_BODY_CELL_NUM, "font-semibold")}>
                          {num(row.units_sold)}
                        </TableCell>
                        <TableCell className={INSIGHTS_BODY_CELL_NUM}>
                          {formatInsightsINR(num(row.revenue))}
                        </TableCell>
                        <TableCell className={INSIGHTS_BODY_CELL_NUM}>{margin.toFixed(1)}%</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </InsightsPanel>
        </InsightsSubTabPanel>

        <InsightsSubTabPanel value="slow-movers">
          <InsightsPanel
            className="flex-1 min-h-0"
            title="Slow Movers This Period"
            subtitle="In stock but &lt; 5 units sold in date range"
            footer={
              <p className="text-xs text-muted-foreground tabular-nums">
                {slowMovers.length.toLocaleString("en-IN")} slow mover
                {slowMovers.length !== 1 ? "s" : ""}
              </p>
            }
          >
            <Table className="w-full min-w-max">
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
                    <TableCell colSpan={5} className="py-10 text-center text-base text-muted-foreground">
                      No slow movers matching criteria
                    </TableCell>
                  </TableRow>
                ) : (
                  slowMovers.map((row) => (
                    <TableRow key={row.product_id} className={INSIGHTS_BODY_ROW}>
                      <TableCell className={cn(INSIGHTS_BODY_CELL, "font-medium")}>{row.product_name}</TableCell>
                      <TableCell className={INSIGHTS_BODY_CELL}>{row.brand || "—"}</TableCell>
                      <TableCell className={INSIGHTS_BODY_CELL_NUM}>{num(row.units_sold)}</TableCell>
                      <TableCell className={INSIGHTS_BODY_CELL_NUM}>{num(row.current_stock)}</TableCell>
                      <TableCell className={INSIGHTS_BODY_CELL_NUM}>
                        {formatInsightsINR(num(row.stock_value))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </InsightsPanel>
        </InsightsSubTabPanel>

        <InsightsSubTabPanel value="category-chart">
          <InsightsPanel
            className="flex-1 min-h-0"
            title="Category Revenue & Profit"
            subtitle="By category for selected period"
          >
            {categoryChart.length === 0 ? (
              <p className="py-16 text-center text-base text-muted-foreground">No category sales data</p>
            ) : (
              <div className="flex h-full min-h-[360px] flex-col p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryChart} margin={{ top: 12, right: 24, left: 12, bottom: 56 }}>
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
              </div>
            )}
          </InsightsPanel>
        </InsightsSubTabPanel>
      </InsightsSubTabs>
    </div>
  );
}
