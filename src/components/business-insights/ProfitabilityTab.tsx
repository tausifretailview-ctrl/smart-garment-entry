import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, Search } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { marginBorderClass } from "@/components/business-insights/insightsMarginUtils";
import {
  INSIGHTS_TAB_SHELL,
  InsightsKpiCard,
  InsightsKpiStrip,
  InsightsPanel,
  InsightsSortableTh,
  InsightsStaticTh,
  InsightsTableHeader,
} from "@/components/business-insights/insightsLayout";

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

  const sortedBrands = useMemo(
    () => sortRows(brands, brandSortKey, brandSortDir),
    [brands, brandSortKey, brandSortDir],
  );

  const sortedCategories = useMemo(
    () => sortRows(categories, categorySortKey, categorySortDir),
    [categories, categorySortKey, categorySortDir],
  );

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
    <div className={INSIGHTS_TAB_SHELL}>
      <InsightsKpiStrip>
        <InsightsKpiCard
          label="Total Gross Profit"
          value={formatInsightsINR(kpis.totalGrossProfit)}
          sub={`Margin: ${kpis.overallMargin.toFixed(1)}%`}
          gradient="bg-gradient-to-br from-emerald-500 to-emerald-600"
        />
        <InsightsKpiCard
          label="Best Performing Brand"
          value={kpis.bestBrand?.brand ?? "—"}
          sub={
            kpis.bestBrand
              ? `${formatInsightsINR(num(kpis.bestBrand.gross_profit))} gross profit`
              : "No brand sales in period"
          }
          gradient="bg-gradient-to-br from-blue-500 to-blue-600"
        />
        <InsightsKpiCard
          label="Lowest Margin Category"
          value={kpis.lowestCategory?.category ?? "—"}
          sub={
            kpis.lowestCategory
              ? `${num(kpis.lowestCategory.profit_margin_pct).toFixed(1)}% margin — needs attention`
              : "No category sales in period"
          }
          gradient="bg-gradient-to-br from-amber-500 to-amber-600"
        />
      </InsightsKpiStrip>

      <InsightsPanel
        className="flex-1"
        title="Top Products by Profit"
        toolbar={
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search product or brand…"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="h-8 pl-9 text-sm no-uppercase"
            />
          </div>
        }
        footer={
          <p className="text-xs text-muted-foreground tabular-nums">
            {filteredProducts.length.toLocaleString("en-IN")} product
            {filteredProducts.length !== 1 ? "s" : ""} in period
          </p>
        }
      >
        <Table>
          <InsightsTableHeader>
            <InsightsStaticTh label="#" className="w-10" />
            <InsightsSortableTh
              label="Product Name"
              active={productSortKey === "product_name"}
              dir={productSortDir}
              onClick={() => toggleProductSort("product_name")}
            />
            <InsightsSortableTh
              label="Brand"
              active={productSortKey === "brand"}
              dir={productSortDir}
              onClick={() => toggleProductSort("brand")}
            />
            <InsightsSortableTh
              label="Units Sold"
              active={productSortKey === "units_sold"}
              dir={productSortDir}
              onClick={() => toggleProductSort("units_sold")}
              className="text-right"
            />
            <InsightsSortableTh
              label="Revenue"
              active={productSortKey === "revenue"}
              dir={productSortDir}
              onClick={() => toggleProductSort("revenue")}
              className="text-right"
            />
            <InsightsSortableTh
              label="Cost"
              active={productSortKey === "cost"}
              dir={productSortDir}
              onClick={() => toggleProductSort("cost")}
              className="text-right"
            />
            <InsightsSortableTh
              label="Gross Profit"
              active={productSortKey === "gross_profit"}
              dir={productSortDir}
              onClick={() => toggleProductSort("gross_profit")}
              className="text-right"
            />
            <InsightsSortableTh
              label="Margin %"
              active={productSortKey === "profit_margin_pct"}
              dir={productSortDir}
              onClick={() => toggleProductSort("profit_margin_pct")}
              className="text-right"
            />
          </InsightsTableHeader>
          <TableBody>
            {filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  No product sales in the selected period
                </TableCell>
              </TableRow>
            ) : (
              filteredProducts.map((row, idx) => {
                const margin = num(row.profit_margin_pct);
                return (
                  <TableRow
                    key={row.product_id}
                    className={cn(marginBorderClass(margin))}
                  >
                    <TableCell className="tabular-nums text-muted-foreground px-3">{idx + 1}</TableCell>
                    <TableCell className="font-medium px-3">{row.product_name}</TableCell>
                    <TableCell className="px-3">{row.brand || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums px-3">{num(row.units_sold)}</TableCell>
                    <TableCell className="text-right tabular-nums px-3">
                      {formatInsightsINR(num(row.revenue))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums px-3">
                      {formatInsightsINR(num(row.cost))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold px-3">
                      {formatInsightsINR(num(row.gross_profit))}
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
        <InsightsPanel title="Brand Performance" subtitle="By gross profit in period">
          <Table>
            <InsightsTableHeader>
              <InsightsSortableTh
                label="Brand"
                active={brandSortKey === "brand"}
                dir={brandSortDir}
                onClick={() => toggleBrandSort("brand")}
              />
              <InsightsSortableTh
                label="Products"
                active={brandSortKey === "product_count"}
                dir={brandSortDir}
                onClick={() => toggleBrandSort("product_count")}
                className="text-right"
              />
              <InsightsSortableTh
                label="Revenue"
                active={brandSortKey === "revenue"}
                dir={brandSortDir}
                onClick={() => toggleBrandSort("revenue")}
                className="text-right"
              />
              <InsightsSortableTh
                label="Gross Profit"
                active={brandSortKey === "gross_profit"}
                dir={brandSortDir}
                onClick={() => toggleBrandSort("gross_profit")}
                className="text-right"
              />
              <InsightsSortableTh
                label="Margin %"
                active={brandSortKey === "profit_margin_pct"}
                dir={brandSortDir}
                onClick={() => toggleBrandSort("profit_margin_pct")}
                className="text-right"
              />
              <InsightsSortableTh
                label="Return %"
                active={brandSortKey === "return_rate_pct"}
                dir={brandSortDir}
                onClick={() => toggleBrandSort("return_rate_pct")}
                className="text-right"
              />
            </InsightsTableHeader>
            <TableBody>
              {sortedBrands.map((row) => {
                const margin = num(row.profit_margin_pct);
                return (
                  <TableRow key={row.brand} className={cn(marginBorderClass(margin))}>
                    <TableCell className="font-medium px-3">{row.brand}</TableCell>
                    <TableCell className="text-right tabular-nums px-3">{num(row.product_count)}</TableCell>
                    <TableCell className="text-right tabular-nums px-3">
                      {formatInsightsINR(num(row.revenue))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold px-3">
                      {formatInsightsINR(num(row.gross_profit))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums px-3">{margin.toFixed(1)}%</TableCell>
                    <TableCell className="text-right tabular-nums px-3">
                      {num(row.return_rate_pct).toFixed(1)}%
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </InsightsPanel>

        <InsightsPanel title="Category Breakdown" subtitle="Revenue and margin by category">
          <Table>
            <InsightsTableHeader>
              <InsightsSortableTh
                label="Category"
                active={categorySortKey === "category"}
                dir={categorySortDir}
                onClick={() => toggleCategorySort("category")}
              />
              <InsightsSortableTh
                label="Products"
                active={categorySortKey === "product_count"}
                dir={categorySortDir}
                onClick={() => toggleCategorySort("product_count")}
                className="text-right"
              />
              <InsightsSortableTh
                label="Units"
                active={categorySortKey === "units_sold"}
                dir={categorySortDir}
                onClick={() => toggleCategorySort("units_sold")}
                className="text-right"
              />
              <InsightsSortableTh
                label="Revenue"
                active={categorySortKey === "revenue"}
                dir={categorySortDir}
                onClick={() => toggleCategorySort("revenue")}
                className="text-right"
              />
              <InsightsSortableTh
                label="Profit"
                active={categorySortKey === "gross_profit"}
                dir={categorySortDir}
                onClick={() => toggleCategorySort("gross_profit")}
                className="text-right"
              />
              <InsightsSortableTh
                label="Margin %"
                active={categorySortKey === "profit_margin_pct"}
                dir={categorySortDir}
                onClick={() => toggleCategorySort("profit_margin_pct")}
                className="text-right"
              />
              <InsightsSortableTh
                label="Sell-through %"
                active={categorySortKey === "sell_through_rate"}
                dir={categorySortDir}
                onClick={() => toggleCategorySort("sell_through_rate")}
                className="text-right"
              />
            </InsightsTableHeader>
            <TableBody>
              {sortedCategories.map((row) => {
                const margin = num(row.profit_margin_pct);
                return (
                  <TableRow key={row.category} className={cn(marginBorderClass(margin))}>
                    <TableCell className="font-medium px-3">{row.category}</TableCell>
                    <TableCell className="text-right tabular-nums px-3">{num(row.product_count)}</TableCell>
                    <TableCell className="text-right tabular-nums px-3">{num(row.units_sold)}</TableCell>
                    <TableCell className="text-right tabular-nums px-3">
                      {formatInsightsINR(num(row.revenue))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold px-3">
                      {formatInsightsINR(num(row.gross_profit))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums px-3">{margin.toFixed(1)}%</TableCell>
                    <TableCell className="text-right tabular-nums px-3">
                      {num(row.sell_through_rate).toFixed(1)}%
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </InsightsPanel>
      </div>
    </div>
  );
}
