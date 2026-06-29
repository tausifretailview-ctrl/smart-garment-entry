import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  formatInsightsINR,
  useLowStockAlerts,
  useSlowMovingStock,
  type LowStockAlertRow,
} from "@/hooks/useBusinessInsights";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  INSIGHTS_TAB_SHELL,
  InsightsKpiCard,
  InsightsKpiStrip,
  InsightsPanel,
  InsightsStaticTh,
  InsightsTableHeader,
} from "@/components/business-insights/insightsLayout";

const IDLE_DAY_OPTIONS = [30, 60, 90, 180] as const;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatDateLabel(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso.length >= 10 ? iso.slice(0, 10) : iso), "dd MMM yyyy");
  } catch {
    return iso;
  }
}

function lowStockRowClass(daysLeft: number | null, avgDaily: number): string {
  if (avgDaily === 0 || daysLeft === null) return "";
  if (daysLeft < 3) return "bg-red-50 dark:bg-red-950/25";
  if (daysLeft <= 7) return "bg-amber-50 dark:bg-amber-950/25";
  return "";
}

function slowStockBorderClass(
  lastSold: string | null,
  daysIdle: number | null,
): string {
  if (!lastSold || daysIdle === null) return "border-l-4 border-l-red-500";
  if (daysIdle > 90) return "border-l-4 border-l-red-500";
  if (daysIdle > 60) return "border-l-4 border-l-amber-500";
  if (daysIdle > 30) return "border-l-4 border-l-yellow-500";
  return "";
}

function productLabel(row: { product_name: string; brand?: string | null }): string {
  const brand = row.brand?.trim();
  return brand ? `${row.product_name} (${brand})` : row.product_name;
}

export function StockHealthTab() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  const [stockThreshold, setStockThreshold] = useState(5);
  const [idleDays, setIdleDays] = useState<number>(60);

  const {
    data: lowStock = [],
    isLoading: lowLoading,
    error: lowError,
  } = useLowStockAlerts(orgId, stockThreshold, true);

  const {
    data: slowStock = [],
    isLoading: slowLoading,
    error: slowError,
  } = useSlowMovingStock(orgId, idleDays, true);

  const lowStockStats = useMemo(() => {
    let critical = 0;
    let warning = 0;
    let underThreeDays = 0;

    for (const row of lowStock) {
      const days = row.days_of_stock_left === null ? null : num(row.days_of_stock_left);
      const avg = num(row.avg_daily_sales);
      if (avg > 0 && days !== null) {
        if (days < 3) {
          critical += 1;
          underThreeDays += 1;
        } else if (days <= 7) warning += 1;
      }
    }

    return { critical, warning, underThreeDays, total: lowStock.length };
  }, [lowStock]);

  const slowStockValue = useMemo(
    () => slowStock.reduce((s, r) => s + num(r.stock_value), 0),
    [slowStock],
  );

  const sortedLowStock = useMemo(() => {
    return [...lowStock].sort((a, b) => {
      const sortKey = (row: LowStockAlertRow) => {
        const avg = num(row.avg_daily_sales);
        if (avg === 0) return 9999;
        const days = row.days_of_stock_left === null ? 9999 : num(row.days_of_stock_left);
        return days;
      };
      return sortKey(a) - sortKey(b);
    });
  }, [lowStock]);

  const isLoading = lowLoading || slowLoading;
  const error = lowError || slowError;

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-destructive" />
        <p className="font-medium text-destructive">Failed to load stock health data</p>
        <p className="mt-1 text-sm text-muted-foreground">{(error as Error).message}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading stock health insights…
      </div>
    );
  }

  return (
    <div className={INSIGHTS_TAB_SHELL}>
      {lowStock.length > 0 && (
        <Alert
          variant="destructive"
          className="shrink-0 border-red-300 bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-100"
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm font-medium">
            {lowStockStats.total} variant{lowStockStats.total !== 1 ? "s" : ""} need reorder
            {lowStockStats.underThreeDays > 0
              ? ` — ${lowStockStats.underThreeDays} with less than 3 days of stock`
              : ""}
          </AlertDescription>
        </Alert>
      )}

      <InsightsKpiStrip>
        <InsightsKpiCard
          label="Low Stock Variants"
          value={lowStockStats.total}
          sub={`Threshold: ${stockThreshold} units`}
          gradient="bg-gradient-to-br from-red-500 to-red-600"
        />
        <InsightsKpiCard
          label="Critically Low"
          value={lowStockStats.critical}
          sub={`${lowStockStats.warning} warning (3–7 days)`}
          gradient="bg-gradient-to-br from-amber-500 to-amber-600"
        />
        <InsightsKpiCard
          label="Capital Tied Up (Idle)"
          value={formatInsightsINR(slowStockValue)}
          sub={`${slowStock.length} variants idle > ${idleDays} days`}
          gradient="bg-gradient-to-br from-violet-500 to-violet-600"
        />
      </InsightsKpiStrip>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 flex-1 min-h-0">
        <InsightsPanel
          className="min-h-0"
          title="Low Stock Alerts"
          subtitle="Variants at or below threshold (30-day velocity)"
          toolbar={
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Label htmlFor="stock-threshold" className="text-xs text-muted-foreground whitespace-nowrap">
                Threshold
              </Label>
              <Input
                id="stock-threshold"
                type="number"
                min={0}
                max={50}
                value={stockThreshold}
                onChange={(e) => {
                  const v = Math.min(50, Math.max(0, parseInt(e.target.value, 10) || 0));
                  setStockThreshold(v);
                }}
                className="h-8 w-16 text-right tabular-nums"
              />
              <Slider
                value={[stockThreshold]}
                min={0}
                max={50}
                step={1}
                onValueChange={([v]) => setStockThreshold(v)}
                className="w-24 hidden sm:flex"
                aria-label="Low stock threshold"
              />
            </div>
          }
        >
          <Table>
            <InsightsTableHeader>
              <InsightsStaticTh label="Product" />
              <InsightsStaticTh label="Size" />
              <InsightsStaticTh label="Color" />
              <InsightsStaticTh label="Stock Left" className="text-right" />
              <InsightsStaticTh label="Daily Sales" className="text-right" />
              <InsightsStaticTh label="Days Left" className="text-right" />
              <InsightsStaticTh label="Last Supplier" />
            </InsightsTableHeader>
            <TableBody>
              {sortedLowStock.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No variants at or below {stockThreshold} units
                  </TableCell>
                </TableRow>
              ) : (
                sortedLowStock.map((row) => {
                  const avg = num(row.avg_daily_sales);
                  const days = row.days_of_stock_left === null ? null : num(row.days_of_stock_left);
                  return (
                    <TableRow
                      key={row.variant_id}
                      className={cn(lowStockRowClass(days, avg))}
                    >
                      <TableCell className="font-medium min-w-[140px] px-3">
                        {productLabel(row)}
                      </TableCell>
                      <TableCell className="px-3">{row.size || "—"}</TableCell>
                      <TableCell className="px-3">{row.color || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold px-3">
                        {num(row.current_stock)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums px-3">
                        {avg > 0 ? avg.toFixed(2) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums px-3">
                        {avg === 0 ? (
                          <span className="text-muted-foreground">No sales</span>
                        ) : days !== null ? (
                          days.toFixed(1)
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-sm px-3">
                        {row.primary_supplier || "—"}
                        {row.last_purchase_date && (
                          <span className="block text-xs text-muted-foreground">
                            {formatDateLabel(row.last_purchase_date)}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </InsightsPanel>

        <InsightsPanel
          className="min-h-0"
          title="Dead / Slow Moving Stock"
          subtitle={`In-stock variants with no sale within ${idleDays} days`}
          toolbar={
            <div className="flex flex-wrap gap-1">
              {IDLE_DAY_OPTIONS.map((d) => (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  variant={idleDays === d ? "default" : "outline"}
                  onClick={() => setIdleDays(d)}
                  className="h-7 text-xs px-2"
                >
                  {d}d
                </Button>
              ))}
            </div>
          }
        >
          <Table>
            <InsightsTableHeader>
              <InsightsStaticTh label="Product" />
              <InsightsStaticTh label="Brand" />
              <InsightsStaticTh label="Size" />
              <InsightsStaticTh label="Color" />
              <InsightsStaticTh label="Stock Qty" className="text-right" />
              <InsightsStaticTh label="Stock Value" className="text-right" />
              <InsightsStaticTh label="Last Sold" />
              <InsightsStaticTh label="Days Idle" className="text-right" />
            </InsightsTableHeader>
            <TableBody>
              {slowStock.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    No slow-moving stock for idle &gt; {idleDays} days
                  </TableCell>
                </TableRow>
              ) : (
                slowStock.map((row) => {
                  const daysIdle = row.days_since_sold === null ? null : num(row.days_since_sold);
                  const neverSold = !row.last_sold_date;
                  return (
                    <TableRow
                      key={row.variant_id}
                      className={cn(slowStockBorderClass(row.last_sold_date, daysIdle))}
                    >
                      <TableCell className="min-w-[140px] font-medium px-3">
                        {row.product_name}
                        {neverSold && (
                          <span className="ml-2 text-xs font-normal text-red-600">Never sold</span>
                        )}
                      </TableCell>
                      <TableCell className="px-3">{row.brand || "—"}</TableCell>
                      <TableCell className="px-3">{row.size || "—"}</TableCell>
                      <TableCell className="px-3">{row.color || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold px-3">
                        {num(row.current_stock)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums px-3">
                        {formatInsightsINR(num(row.stock_value))}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap px-3">
                        {neverSold ? "—" : formatDateLabel(row.last_sold_date)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums px-3">
                        {neverSold ? (
                          <span className="text-red-600 font-medium">∞</span>
                        ) : (
                          daysIdle
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </InsightsPanel>
      </div>
    </div>
  );
}
