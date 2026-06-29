import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  IndianRupee,
  Loader2,
  Search,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  formatInsightsINR,
  useBrandPerformance,
  useCategoryPerformance,
  useProductPerformance,
  type BrandPerformanceRow,
  type CategoryPerformanceRow,
  type ProductPerformanceRow,
} from "@/hooks/useBusinessInsights";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  INSIGHTS_CHART_COLORS,
  marginBarColor,
  marginBorderClass,
} from "@/components/business-insights/insightsMarginUtils";

type SortDir = "asc" | "desc";

type ProductSortKey = keyof Pick<
  ProductPerformanceRow,
  "product_name" | "brand" | "units_sold" | "revenue" | "cost" | "gross_profit" | "profit_margin_pct"
>;

type BrandSortKey = keyof Pick<
  BrandPerformanceRow,
  "brand" | "product_count" | "revenue" | "gross_profit" | "profit_margin_pct" | "return_rate_pct"
>;

type CategorySortKey = keyof Pick<
  CategoryPerformanceRow,
  "category" | "product_count" | "units_sold" | "revenue" | "gross_profit" | "profit_margin_pct" | "sell_through_rate"
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

interface ProfitabilityTabProps {
  startDate: string;
  endDate: string;
}

export function ProfitabilityTab({ startDate, endDate }: ProfitabilityTabProps) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  const range = { startDate, endDate, enabled: true };

  const {
    data: products = [],
    isLoading: productsLoading,
    error: productsError,
  } = useProductPerformance(orgId, range);
  const {
    data: brands = [],
    isLoading: brandsLoading,
    error: brandsError,
  } = useBrandPerformance(orgId, range);
  const {
    data: categories = [],
    isLoading: categoriesLoading,
    error: categoriesError,
  } = useCategoryPerformance(orgId, range);

  const [productSearch, setProductSearch] = useState("");
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [productSortKey, setProductSortKey] = useState<ProductSortKey>("gross_profit");
  const [productSortDir, setProductSortDir] = useState<SortDir>("desc");

  const [brandSortKey, setBrandSortKey] = useState<BrandSortKey>("gross_profit");
  const [brandSortDir, setBrandSortDir] = useState<SortDir>("desc");

  const [categorySortKey, setCategorySortKey] = useState<CategorySortKey>("gross_profit");
  const [categorySortDir, setCategorySortDir] = useState<SortDir>("desc");

  const toggleProductSort = (key: ProductSortKey) => {
    if (productSortKey === key) setProductSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setProductSortKey(key);
      setProductSortDir(key === "product_name" || key === "brand" ? "asc" : "desc");
    }
  };

  const toggleBrandSort = (key: BrandSortKey) => {
    if (brandSortKey === key) setBrandSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setBrandSortKey(key);
      setBrandSortDir(key === "brand" ? "asc" : "desc");
    }
  };

  const toggleCategorySort = (key: CategorySortKey) => {
    if (categorySortKey === key) setCategorySortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setCategorySortKey(key);
      setCategorySortDir(key === "category" ? "asc" : "desc");
    }
  };

  const kpis = useMemo(() => {
    const totalGrossProfit = products.reduce((s, p) => s + num(p.gross_profit), 0);
    const totalRevenue = products.reduce((s, p) => s + num(p.revenue), 0);
    const overallMargin = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;

    const bestBrand = brands.length
      ? brands.reduce((best, b) => (num(b.gross_profit) > num(best.gross_profit) ? b : best))
      : null;

    const categoriesWithSales = categories.filter((c) => num(c.revenue) > 0);
    const lowestCategory = categoriesWithSales.length
      ? categoriesWithSales.reduce((low, c) =>
          num(c.profit_margin_pct) < num(low.profit_margin_pct) ? c : low,
        )
      : null;

    return { totalGrossProfit, overallMargin, bestBrand, lowestCategory };
  }, [products, brands, categories]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    let rows = products.filter((p) => num(p.gross_profit) > 0 || num(p.units_sold) > 0);
    if (q) {
      rows = rows.filter(
        (p) =>
          p.product_name?.toLowerCase().includes(q) ||
          p.brand?.toLowerCase().includes(q),
      );
    }
    rows = sortRows(rows, productSortKey, productSortDir);
    return rows;
  }, [products, productSearch, productSortKey, productSortDir]);

  const displayedProducts = showAllProducts
    ? filteredProducts
    : filteredProducts.slice(0, 10);

  const sortedBrands = useMemo(
    () => sortRows(brands, brandSortKey, brandSortDir),
    [brands, brandSortKey, brandSortDir],
  );

  const topBrandChart = useMemo(
    () =>
      [...brands]
        .sort((a, b) => num(b.gross_profit) - num(a.gross_profit))
        .slice(0, 10)
        .map((b) => ({
          name: b.brand || "—",
          gross_profit: num(b.gross_profit),
          margin: num(b.profit_margin_pct),
        })),
    [brands],
  );

  const sortedCategories = useMemo(
    () => sortRows(categories, categorySortKey, categorySortDir),
    [categories, categorySortKey, categorySortDir],
  );

  const categoryPie = useMemo(() => {
    const withRevenue = categories.filter((c) => num(c.revenue) > 0);
    const total = withRevenue.reduce((s, c) => s + num(c.revenue), 0);
    return {
      total,
      slices: withRevenue.map((c) => ({
        name: c.category || "—",
        value: num(c.revenue),
      })),
    };
  }, [categories]);

  const isLoading = productsLoading || brandsLoading || categoriesLoading;
  const error = productsError || brandsError || categoriesError;

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-destructive" />
        <p className="font-medium text-destructive">Failed to load profitability data</p>
        <p className="mt-1 text-sm text-muted-foreground">{(error as Error).message}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading profitability insights…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section A — KPI cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Total Gross Profit
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {formatInsightsINR(kpis.totalGrossProfit)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Margin: {kpis.overallMargin.toFixed(1)}%
                </p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-2 dark:bg-emerald-950/40">
                <IndianRupee className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Best Performing Brand
                </p>
                <p className="mt-1 text-xl font-bold truncate max-w-[200px]">
                  {kpis.bestBrand?.brand ?? "—"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {kpis.bestBrand
                    ? `${formatInsightsINR(num(kpis.bestBrand.gross_profit))} gross profit`
                    : "No brand sales in period"}
                </p>
              </div>
              <div className="rounded-lg bg-blue-50 p-2 dark:bg-blue-950/40">
                <Trophy className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Lowest Margin Category
                </p>
                <p className="mt-1 text-xl font-bold truncate max-w-[200px]">
                  {kpis.lowestCategory?.category ?? "—"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {kpis.lowestCategory
                    ? `${num(kpis.lowestCategory.profit_margin_pct).toFixed(1)}% margin — needs attention`
                    : "No category sales in period"}
                </p>
              </div>
              <div className="rounded-lg bg-amber-50 p-2 dark:bg-amber-950/40">
                <TrendingUp className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section B — Top products */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="font-semibold text-base">Top Products by Profit</h3>
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search product or brand…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="h-9 pl-9 text-sm no-uppercase"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <SortableHead
                    label="Product Name"
                    active={productSortKey === "product_name"}
                    dir={productSortDir}
                    onClick={() => toggleProductSort("product_name")}
                  />
                  <SortableHead
                    label="Brand"
                    active={productSortKey === "brand"}
                    dir={productSortDir}
                    onClick={() => toggleProductSort("brand")}
                  />
                  <SortableHead
                    label="Units Sold"
                    active={productSortKey === "units_sold"}
                    dir={productSortDir}
                    onClick={() => toggleProductSort("units_sold")}
                    className="text-right"
                  />
                  <SortableHead
                    label="Revenue"
                    active={productSortKey === "revenue"}
                    dir={productSortDir}
                    onClick={() => toggleProductSort("revenue")}
                    className="text-right"
                  />
                  <SortableHead
                    label="Cost"
                    active={productSortKey === "cost"}
                    dir={productSortDir}
                    onClick={() => toggleProductSort("cost")}
                    className="text-right"
                  />
                  <SortableHead
                    label="Gross Profit"
                    active={productSortKey === "gross_profit"}
                    dir={productSortDir}
                    onClick={() => toggleProductSort("gross_profit")}
                    className="text-right"
                  />
                  <SortableHead
                    label="Margin %"
                    active={productSortKey === "profit_margin_pct"}
                    dir={productSortDir}
                    onClick={() => toggleProductSort("profit_margin_pct")}
                    className="text-right"
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      No product sales in the selected period
                    </TableCell>
                  </TableRow>
                ) : (
                  displayedProducts.map((row, idx) => {
                    const margin = num(row.profit_margin_pct);
                    return (
                      <TableRow
                        key={row.product_id}
                        className={cn(marginBorderClass(margin))}
                      >
                        <TableCell className="tabular-nums text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="font-medium">{row.product_name}</TableCell>
                        <TableCell>{row.brand || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(row.units_sold)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatInsightsINR(num(row.revenue))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatInsightsINR(num(row.cost))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {formatInsightsINR(num(row.gross_profit))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{margin.toFixed(1)}%</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {filteredProducts.length > 10 && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllProducts((v) => !v)}
              >
                {showAllProducts
                  ? "Show top 10"
                  : `Show all (${filteredProducts.length})`}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section C — Brand performance */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 font-semibold text-base">Brand Profit (Top 10)</h3>
            {topBrandChart.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No brand data</p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={topBrandChart} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => formatInsightsINR(v)}
                  />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [formatInsightsINR(v), "Gross profit"]} />
                  <Bar dataKey="gross_profit" radius={[0, 4, 4, 0]}>
                    {topBrandChart.map((entry) => (
                      <Cell key={entry.name} fill={marginBarColor(entry.margin)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 font-semibold text-base">Brand Details</h3>
            <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead
                      label="Brand"
                      active={brandSortKey === "brand"}
                      dir={brandSortDir}
                      onClick={() => toggleBrandSort("brand")}
                    />
                    <SortableHead
                      label="Products"
                      active={brandSortKey === "product_count"}
                      dir={brandSortDir}
                      onClick={() => toggleBrandSort("product_count")}
                      className="text-right"
                    />
                    <SortableHead
                      label="Revenue"
                      active={brandSortKey === "revenue"}
                      dir={brandSortDir}
                      onClick={() => toggleBrandSort("revenue")}
                      className="text-right"
                    />
                    <SortableHead
                      label="Gross Profit"
                      active={brandSortKey === "gross_profit"}
                      dir={brandSortDir}
                      onClick={() => toggleBrandSort("gross_profit")}
                      className="text-right"
                    />
                    <SortableHead
                      label="Margin %"
                      active={brandSortKey === "profit_margin_pct"}
                      dir={brandSortDir}
                      onClick={() => toggleBrandSort("profit_margin_pct")}
                      className="text-right"
                    />
                    <SortableHead
                      label="Return Rate %"
                      active={brandSortKey === "return_rate_pct"}
                      dir={brandSortDir}
                      onClick={() => toggleBrandSort("return_rate_pct")}
                      className="text-right"
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedBrands.map((row) => {
                    const margin = num(row.profit_margin_pct);
                    return (
                      <TableRow key={row.brand} className={cn(marginBorderClass(margin))}>
                        <TableCell className="font-medium">{row.brand}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(row.product_count)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatInsightsINR(num(row.revenue))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {formatInsightsINR(num(row.gross_profit))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{margin.toFixed(1)}%</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {num(row.return_rate_pct).toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section D — Category breakdown */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <h3 className="font-semibold text-base">Category Breakdown</h3>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="relative mx-auto w-full max-w-sm">
              {categoryPie.slices.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">No category revenue</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={categoryPie.slices}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={100}
                        dataKey="value"
                        paddingAngle={2}
                      >
                        {categoryPie.slices.map((_, i) => (
                          <Cell
                            key={i}
                            fill={INSIGHTS_CHART_COLORS[i % INSIGHTS_CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatInsightsINR(v)} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-8">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Total Revenue</p>
                      <p className="text-sm font-bold tabular-nums">
                        {formatInsightsINR(categoryPie.total)}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead
                      label="Category"
                      active={categorySortKey === "category"}
                      dir={categorySortDir}
                      onClick={() => toggleCategorySort("category")}
                    />
                    <SortableHead
                      label="Products"
                      active={categorySortKey === "product_count"}
                      dir={categorySortDir}
                      onClick={() => toggleCategorySort("product_count")}
                      className="text-right"
                    />
                    <SortableHead
                      label="Units Sold"
                      active={categorySortKey === "units_sold"}
                      dir={categorySortDir}
                      onClick={() => toggleCategorySort("units_sold")}
                      className="text-right"
                    />
                    <SortableHead
                      label="Revenue"
                      active={categorySortKey === "revenue"}
                      dir={categorySortDir}
                      onClick={() => toggleCategorySort("revenue")}
                      className="text-right"
                    />
                    <SortableHead
                      label="Profit"
                      active={categorySortKey === "gross_profit"}
                      dir={categorySortDir}
                      onClick={() => toggleCategorySort("gross_profit")}
                      className="text-right"
                    />
                    <SortableHead
                      label="Margin %"
                      active={categorySortKey === "profit_margin_pct"}
                      dir={categorySortDir}
                      onClick={() => toggleCategorySort("profit_margin_pct")}
                      className="text-right"
                    />
                    <SortableHead
                      label="Sell-through %"
                      active={categorySortKey === "sell_through_rate"}
                      dir={categorySortDir}
                      onClick={() => toggleCategorySort("sell_through_rate")}
                      className="text-right"
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCategories.map((row) => {
                    const margin = num(row.profit_margin_pct);
                    return (
                      <TableRow key={row.category} className={cn(marginBorderClass(margin))}>
                        <TableCell className="font-medium">{row.category}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(row.product_count)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(row.units_sold)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatInsightsINR(num(row.revenue))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {formatInsightsINR(num(row.gross_profit))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{margin.toFixed(1)}%</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {num(row.sell_through_rate).toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
