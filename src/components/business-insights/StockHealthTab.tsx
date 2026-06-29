import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertTriangle, Loader2, Package } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  formatInsightsINR,
  useLowStockAlerts,
  useSlowMovingStock,
  type LowStockAlertRow,
} from "@/hooks/useBusinessInsights";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

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
    <div className="space-y-6">
      {/* Section A — alert banner */}
      {lowStock.length > 0 && (
        <Alert variant="destructive" className="border-red-300 bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-100">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm font-medium">
            ⚠️ {lowStockStats.total} variant{lowStockStats.total !== 1 ? "s" : ""} need reorder
            {lowStockStats.underThreeDays > 0
              ? ` — ${lowStockStats.underThreeDays} item${lowStockStats.underThreeDays !== 1 ? "s" : ""} have less than 3 days of stock remaining`
              : ""}
          </AlertDescription>
        </Alert>
      )}

      {/* Section B — low stock */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-base font-semibold">Low Stock Alerts</h3>
              <p className="text-sm text-muted-foreground">
                Variants at or below the stock threshold (30-day sales velocity)
              </p>
            </div>
            <div className="w-full max-w-sm space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="stock-threshold" className="text-xs text-muted-foreground whitespace-nowrap">
                  Threshold (units)
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
              </div>
              <Slider
                value={[stockThreshold]}
                min={0}
                max={50}
                step={1}
                onValueChange={([v]) => setStockThreshold(v)}
                aria-label="Low stock threshold"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead className="text-right">Stock Left</TableHead>
                  <TableHead className="text-right">Daily Sales</TableHead>
                  <TableHead className="text-right">Days Remaining</TableHead>
                  <TableHead>Last Supplier</TableHead>
                </TableRow>
              </TableHeader>
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
                        <TableCell className="font-medium min-w-[160px]">
                          {productLabel(row)}
                        </TableCell>
                        <TableCell>{row.size || "—"}</TableCell>
                        <TableCell>{row.color || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {num(row.current_stock)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {avg > 0 ? avg.toFixed(2) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {avg === 0 ? (
                            <span className="text-muted-foreground">No recent sales</span>
                          ) : days !== null ? (
                            days.toFixed(1)
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
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
          </div>

          {sortedLowStock.length > 0 && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-red-700 dark:text-red-400">
                {lowStockStats.critical} variant{lowStockStats.critical !== 1 ? "s" : ""} critically low (&lt; 3 days)
              </span>
              {" · "}
              <span className="font-medium text-amber-700 dark:text-amber-400">
                {lowStockStats.warning} variant{lowStockStats.warning !== 1 ? "s" : ""} low (3–7 days)
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Section C — slow / dead stock */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold">Dead / Slow Moving Stock</h3>
              <p className="text-sm text-muted-foreground">
                In-stock variants with no sale within the selected idle period
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {IDLE_DAY_OPTIONS.map((d) => (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  variant={idleDays === d ? "default" : "outline"}
                  onClick={() => setIdleDays(d)}
                  className="h-8 text-xs"
                >
                  {d} days
                </Button>
              ))}
            </div>
          </div>

          <Card className="border-l-4 border-l-violet-500 bg-violet-50/50 dark:bg-violet-950/20">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-violet-100 p-2 dark:bg-violet-900/40">
                <Package className="h-5 w-5 text-violet-700 dark:text-violet-300" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Capital tied up</p>
                <p className="text-xl font-bold tabular-nums">
                  {formatInsightsINR(slowStockValue)} tied up in stock idle &gt; {idleDays} days
                </p>
                <p className="text-xs text-muted-foreground">
                  {slowStock.length} variant{slowStock.length !== 1 ? "s" : ""} · sorted by stock value
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead className="text-right">Stock Qty</TableHead>
                  <TableHead className="text-right">Stock Value</TableHead>
                  <TableHead>Last Sold</TableHead>
                  <TableHead className="text-right">Days Idle</TableHead>
                </TableRow>
              </TableHeader>
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
                        <TableCell className="min-w-[140px] font-medium">
                          {row.product_name}
                          {neverSold && (
                            <span className="ml-2 text-xs font-normal text-red-600">Never sold</span>
                          )}
                        </TableCell>
                        <TableCell>{row.brand || "—"}</TableCell>
                        <TableCell>{row.size || "—"}</TableCell>
                        <TableCell>{row.color || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {num(row.current_stock)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatInsightsINR(num(row.stock_value))}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {neverSold ? "—" : formatDateLabel(row.last_sold_date)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
