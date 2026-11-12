import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTimeDMY } from "@/lib/dateDisplay";
import { stockDriftChange } from "@/lib/stockDrift";

type TopDrift = {
  variant_id: string;
  barcode: string | null;
  product_name: string | null;
  size: string | null;
  stored: number;
  recomputed: number;
  drift: number;
};

export type StockDriftRow = {
  organization_id: string;
  organization_name: string;
  run_at: string;
  variants_checked: number;
  drift_variants: number;
  drift_units: number;
  previous_drift_variants: number | null;
  top_drift: TopDrift[] | null;
  duration_ms: number | null;
  error: string | null;
};

const num = (v: number | null | undefined) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(v || 0));

/**
 * Nightly stock check (run_nightly_stock_drift_check, 03:00 IST): per shop, how many
 * product sizes have a stored stock that differs from the recompute from bills.
 * Read-only. Fixing a difference stays in the shop's own Stock Reconciliation screen.
 */
export function StockDriftPanel() {
  const [open, setOpen] = useState<string | null>(null);
  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ["stock_drift", "latest"],
    queryFn: async (): Promise<StockDriftRow[]> => {
      const { data, error } = await supabase.rpc("get_latest_stock_drift" as never);
      if (error) throw error;
      return ((data as unknown) || []) as StockDriftRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const affected = rows.filter((r) => r.drift_variants > 0);
  const failed = rows.filter((r) => r.error);
  const sizes = affected.reduce((s, r) => s + r.drift_variants, 0);
  const lastRun = rows.reduce<string | null>((m, r) => (!m || r.run_at > m ? r.run_at : m), null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Shops with a stock difference</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold tabular-nums">{affected.length} / {rows.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Product sizes off</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold tabular-nums">{num(sizes)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Shops the check could not finish</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold tabular-nums ${failed.length ? "text-destructive" : ""}`}>{failed.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Last run</CardTitle></CardHeader>
          <CardContent>
            <div className="text-sm tabular-nums">{lastRun ? formatDateTimeDMY(lastRun) : "—"}</div>
            <div className="text-xs text-muted-foreground">Runs every night at 03:00 IST</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {error ? (
            <p className="p-4 text-sm text-destructive">
              Could not load the stock check. If this is new, the database update for the nightly stock check may not be
              applied yet.
            </p>
          ) : isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No run recorded yet. The first run is tonight at 03:00 IST.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shop</TableHead>
                  <TableHead className="text-right">Sizes checked</TableHead>
                  <TableHead className="text-right">Sizes off</TableHead>
                  <TableHead className="text-right">Units off (total)</TableHead>
                  <TableHead className="text-right">Since last night</TableHead>
                  <TableHead>Checked at</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const change = stockDriftChange(r);
                  const top = r.top_drift || [];
                  return (
                    <Fragment key={r.organization_id}>
                      <TableRow>
                        <TableCell className="font-medium">{r.organization_name}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(r.variants_checked)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.error ? (
                            <Badge variant="destructive">Not finished</Badge>
                          ) : r.drift_variants > 0 ? (
                            <Badge variant="destructive">{num(r.drift_variants)}</Badge>
                          ) : (
                            <span className="text-emerald-700">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.error ? "—" : num(r.drift_units)}</TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${change.startsWith("+") ? "font-semibold text-destructive" : "text-muted-foreground"}`}
                        >
                          {change || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDateTimeDMY(r.run_at)}</TableCell>
                        <TableCell>
                          {r.error || top.length > 0 ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setOpen(open === r.organization_id ? null : r.organization_id)}
                            >
                              {open === r.organization_id ? "Hide" : "Details"}
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                      {open === r.organization_id ? (
                        <TableRow>
                          <TableCell colSpan={7} className="bg-muted/40">
                            {r.error ? (
                              <p className="text-sm text-destructive">The check stopped for this shop: {r.error}</p>
                            ) : (
                              <>
                                <p className="mb-2 text-xs text-muted-foreground">
                                  Largest {top.length} differences. Positive = more stock stored than the bills add up to.
                                  Fix from the shop's Stock Reconciliation screen after checking the cause.
                                </p>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Product</TableHead>
                                      <TableHead>Size</TableHead>
                                      <TableHead>Barcode</TableHead>
                                      <TableHead className="text-right">Stored</TableHead>
                                      <TableHead className="text-right">From bills</TableHead>
                                      <TableHead className="text-right">Difference</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {top.map((t) => (
                                      <TableRow key={t.variant_id}>
                                        <TableCell>{t.product_name || "—"}</TableCell>
                                        <TableCell>{t.size || "—"}</TableCell>
                                        <TableCell className="font-mono text-xs">{t.barcode || "—"}</TableCell>
                                        <TableCell className="text-right tabular-nums">{num(t.stored)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{num(t.recomputed)}</TableCell>
                                        <TableCell className="text-right tabular-nums font-semibold">
                                          {t.drift > 0 ? `+${num(t.drift)}` : num(t.drift)}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </>
                            )}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
