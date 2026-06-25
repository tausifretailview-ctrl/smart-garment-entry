import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Search,
  RefreshCw,
  Download,
  Package,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import * as XLSX from "xlsx";

import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportSkeleton } from "@/components/ui/skeletons";
import { cn } from "@/lib/utils";
import { fetchAllStockReconciliation, type StockReconciliationRow } from "@/utils/fetchAllRows";

function fmtQty(n: number) {
  return Number(n).toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

function matchesSearch(row: StockReconciliationRow, q: string) {
  const lower = q.toLowerCase();
  return (
    row.product_name?.toLowerCase().includes(lower) ||
    row.barcode?.toLowerCase().includes(lower) ||
    row.size?.toLowerCase().includes(lower) ||
    row.color?.toLowerCase().includes(lower)
  );
}

function BreakdownPanel({ row }: { row: StockReconciliationRow }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-3">
      <p className="font-medium text-muted-foreground">
        Formula: Opening + Purchases − Sales − Pur. Returns + Sale Returns − Pending DC = Recomputed
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 font-mono tabular-nums">
        <div>
          <span className="text-xs text-muted-foreground block">Opening</span>
          {fmtQty(row.opening_qty)}
        </div>
        <div>
          <span className="text-xs text-muted-foreground block">Purchases</span>
          <span className="text-green-600 dark:text-green-400">+{fmtQty(row.purchases)}</span>
        </div>
        <div>
          <span className="text-xs text-muted-foreground block">Sales</span>
          <span className="text-red-600 dark:text-red-400">−{fmtQty(row.sales)}</span>
        </div>
        <div>
          <span className="text-xs text-muted-foreground block">Pur. Returns</span>
          <span className="text-red-600 dark:text-red-400">−{fmtQty(row.purchase_returns)}</span>
        </div>
        <div>
          <span className="text-xs text-muted-foreground block">Sale Returns</span>
          <span className="text-green-600 dark:text-green-400">+{fmtQty(row.sale_returns)}</span>
        </div>
        <div>
          <span className="text-xs text-muted-foreground block">Pending DC</span>
          <span className="text-red-600 dark:text-red-400">−{fmtQty(row.pending_dc)}</span>
        </div>
        <div>
          <span className="text-xs text-muted-foreground block">Recomputed</span>
          <span className="font-semibold">{fmtQty(row.recomputed_stock_qty)}</span>
        </div>
        <div>
          <span className="text-xs text-muted-foreground block">Stored</span>
          <span className="font-semibold">{fmtQty(row.stored_stock_qty)}</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Investigate <code className="text-xs">stock_movements</code> and line-item history when drift ≠ 0
        (e.g. deleted purchase bill without reversal, sale-return edit double-credit).
      </p>
    </div>
  );
}

export default function StockReconciliationReport() {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const [search, setSearch] = useState("");
  const [driftOnly, setDriftOnly] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const orgId = currentOrganization?.id;

  const { data: rows = [], isLoading, isFetching, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["stock-reconciliation", orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: () => fetchAllStockReconciliation(orgId!),
  });

  const filtered = useMemo(() => {
    let list = rows;
    if (driftOnly) list = list.filter((r) => r.drift !== 0);
    if (search.trim()) list = list.filter((r) => matchesSearch(r, search.trim()));
    return list;
  }, [rows, driftOnly, search]);

  const stats = useMemo(() => {
    const withDrift = rows.filter((r) => r.drift !== 0);
    return {
      total: rows.length,
      driftCount: withDrift.length,
      maxAbsDrift: withDrift.reduce((m, r) => Math.max(m, Math.abs(r.drift)), 0),
      totalAbsDrift: withDrift.reduce((s, r) => s + Math.abs(r.drift), 0),
    };
  }, [rows]);

  const exportExcel = () => {
    const headers = [
      "Barcode",
      "Product",
      "Size",
      "Color",
      "Stored",
      "Recomputed",
      "Drift",
      "Opening",
      "Purchases",
      "Sales",
      "Pur Returns",
      "Sale Returns",
      "Pending DC",
    ];
    const data = filtered.map((r) => [
      r.barcode ?? "",
      r.product_name ?? "",
      r.size ?? "",
      r.color ?? "",
      r.stored_stock_qty,
      r.recomputed_stock_qty,
      r.drift,
      r.opening_qty,
      r.purchases,
      r.sales,
      r.purchase_returns,
      r.sale_returns,
      r.pending_dc,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock Reconciliation");
    XLSX.writeFile(
      wb,
      `stock-reconciliation-${format(new Date(), "yyyy-MM-dd")}.xlsx`,
    );
  };

  if (error) {
    return (
      <div className="p-6">
        <BackToDashboard />
        <Card className="mt-4 border-destructive/30">
          <CardContent className="pt-6 text-destructive">
            Failed to load stock reconciliation: {(error as Error).message}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <BackToDashboard />
          <h1 className="text-2xl font-bold mt-2 flex items-center gap-2">
            <Package className="h-7 w-7" />
            Stock Reconciliation
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Read-only parity check: stored <code className="text-xs">stock_qty</code> vs transaction history.
            Service and combo products are excluded.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => orgNavigate("/stock-report")}>
            Stock Report
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Variants checked</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{isLoading ? "…" : stats.total.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card className={stats.driftCount > 0 ? "border-destructive/30 bg-destructive/5" : "border-green-500/30 bg-green-500/5"}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              {stats.driftCount > 0 ? (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              )}
              With drift
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">{isLoading ? "…" : stats.driftCount.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Max |drift|</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{isLoading ? "…" : fmtQty(stats.maxAbsDrift)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search product, barcode, size, color…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="drift-only" checked={driftOnly} onCheckedChange={setDriftOnly} />
              <Label htmlFor="drift-only">Drift only (|drift| &gt; 0)</Label>
            </div>
          </div>
          {dataUpdatedAt > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              Last loaded: {format(dataUpdatedAt, "dd MMM yyyy, HH:mm")}
            </p>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ReportSkeleton rows={8} cols={8} />
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-3" />
              <p className="font-medium">
                {driftOnly ? "No stock drift detected" : "No variants match your filters"}
              </p>
              {driftOnly && stats.total > 0 && (
                <p className="text-sm mt-1">All {stats.total.toLocaleString()} tracked variants match transaction history.</p>
              )}
            </div>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Product</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead className="text-right">Stored</TableHead>
                    <TableHead className="text-right">Recomputed</TableHead>
                    <TableHead className="text-right">Drift</TableHead>
                    <TableHead className="text-right hidden lg:table-cell">Opening</TableHead>
                    <TableHead className="text-right hidden lg:table-cell">Purch</TableHead>
                    <TableHead className="text-right hidden lg:table-cell">Sales</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => {
                    const expanded = expandedId === row.variant_id;
                    return (
                      <Fragment key={row.variant_id}>
                        <TableRow
                          className={cn(row.drift !== 0 && "bg-destructive/5")}
                        >
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() =>
                                setExpandedId(expanded ? null : row.variant_id)
                              }
                              aria-label={expanded ? "Collapse breakdown" : "Expand breakdown"}
                            >
                              {expanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                          <TableCell className="font-medium max-w-[180px] truncate" title={row.product_name ?? ""}>
                            {row.product_name}
                          </TableCell>
                          <TableCell>{row.size}</TableCell>
                          <TableCell className="font-mono text-xs">{row.barcode}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {fmtQty(row.stored_stock_qty)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {fmtQty(row.recomputed_stock_qty)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant={row.drift === 0 ? "secondary" : row.drift > 0 ? "destructive" : "outline"}
                              className="font-mono tabular-nums"
                            >
                              {row.drift > 0 ? "+" : ""}
                              {fmtQty(row.drift)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums hidden lg:table-cell">
                            {fmtQty(row.opening_qty)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums hidden lg:table-cell text-green-600">
                            {fmtQty(row.purchases)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums hidden lg:table-cell text-red-600">
                            {fmtQty(row.sales)}
                          </TableCell>
                        </TableRow>
                        {expanded && (
                          <TableRow>
                            <TableCell colSpan={10} className="bg-muted/20 p-4">
                              <BreakdownPanel row={row} />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
