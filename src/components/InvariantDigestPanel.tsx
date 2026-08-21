import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Minus, RefreshCw } from "lucide-react";

type DigestRow = {
  check_name: string;
  organization_id: string | null;
  organization_name: string | null;
  violation_count: number;
  total_detail: number;
  prev_count: number;
  delta: number;
};

const CHECK_LABEL: Record<string, string> = {
  receipts_exceed_invoice: "Receipts exceed invoice value",
  duplicate_voucher_number: "Duplicate voucher numbers",
  rapid_duplicate_receipt: "Rapid duplicate receipts",
  advance_refund_exceeds_available: "Advance refund exceeds available",
  advance_refund_exceeds_booking: "Advance refund exceeds booking",
  advance_applied_exceeds_invoice: "Advance applied exceeds invoice",
  paid_exceeds_net: "Paid amount exceeds invoice value",
  paid_diverges_from_receipts: "Paid amount ≠ compute_sale_settlement",
  advance_draw_exceeds_booking: "Advance drawn beyond booking amount",
  customer_advance_pool_negative: "Customer advance pool negative (unbacked adjustments)",
};

const inr = (v: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(v || 0));

function DeltaBadge({ delta }: { delta: number }) {
  if (delta > 0)
    return (
      <Badge variant="destructive" className="tabular-nums font-mono">
        <ArrowUp className="mr-1 h-3 w-3" />+{delta}
      </Badge>
    );
  if (delta < 0)
    return (
      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 tabular-nums font-mono">
        <ArrowDown className="mr-1 h-3 w-3" />
        {delta}
      </Badge>
    );
  return (
    <Badge variant="secondary" className="tabular-nums font-mono">
      <Minus className="mr-1 h-3 w-3" />0
    </Badge>
  );
}

export function InvariantDigestPanel() {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [checkFilter, setCheckFilter] = useState("all");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["invariant_digest"],
    queryFn: async (): Promise<DigestRow[]> => {
      const { data, error } = await supabase.rpc("get_invariant_digest" as any, {});
      if (error) throw error;
      return ((data as unknown) || []) as DigestRow[];
    },
  });

  const { data: lastSnapshot } = useQuery({
    queryKey: ["invariant_last_snapshot"],
    queryFn: async () => {
      const { data } = await supabase
        .from("invariant_daily_snapshot" as any)
        .select("snapshot_date, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as unknown) as { snapshot_date: string; created_at: string } | null;
    },
  });

  const paidMismatchOpen = useMemo(
    () =>
      rows
        .filter((r) => r.check_name === "paid_diverges_from_receipts")
        .reduce((s, r) => s + Number(r.violation_count || 0), 0),
    [rows],
  );

  const { data: paidMismatchDigest } = useQuery({
    queryKey: ["paid_settlement_mismatch_digest"],
    enabled: paidMismatchOpen > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_paid_settlement_mismatch_digest" as any, {});
      if (error) throw error;
      return data as {
        total_failing?: number;
        organizations?: Array<{
          organization_id: string;
          organization_name: string | null;
          failing_count: number;
          total_abs_discrepancy: number;
          worst_rows?: Array<{
            sale_number: string | null;
            recorded_paid: number;
            expected_paid: number;
            discrepancy: number;
          }>;
        }>;
      };
    },
  });

  const byCheck = useMemo(() => {
    const m = new Map<string, { count: number; prev: number; delta: number; orgs: number }>();
    for (const r of rows) {
      const e = m.get(r.check_name) || { count: 0, prev: 0, delta: 0, orgs: 0 };
      e.count += Number(r.violation_count || 0);
      e.prev += Number(r.prev_count || 0);
      e.delta += Number(r.delta || 0);
      if (Number(r.violation_count || 0) > 0) e.orgs += 1;
      m.set(r.check_name, e);
    }
    return [...m.entries()].sort((a, b) => b[1].delta - a[1].delta || b[1].count - a[1].count);
  }, [rows]);

  const totals = useMemo(
    () => ({
      violations: byCheck.reduce((s, [, e]) => s + e.count, 0),
      delta: byCheck.reduce((s, [, e]) => s + e.delta, 0),
      regressions: rows.filter((r) => Number(r.delta || 0) > 0).length,
    }),
    [byCheck, rows],
  );

  const filtered = useMemo(
    () =>
      rows
        .filter((r) => (checkFilter === "all" ? true : r.check_name === checkFilter))
        .filter((r) => Number(r.violation_count || 0) > 0 || Number(r.delta || 0) !== 0)
        .sort((a, b) => b.delta - a.delta || b.violation_count - a.violation_count),
    [rows, checkFilter],
  );

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("run-invariant-digest", { body: {} });
      if (error) throw error;
      toast.success(`Snapshot taken — ${(data as any)?.totals?.violations ?? 0} violations`);
      qc.invalidateQueries({ queryKey: ["invariant_digest"] });
      qc.invalidateQueries({ queryKey: ["invariant_last_snapshot"] });
      qc.invalidateQueries({ queryKey: ["paid_settlement_mismatch_digest"] });
    } catch (e: any) {
      toast.error(e?.message || "Failed to run digest");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Every accounting invariant, snapshotted daily. Change since the previous snapshot is what matters —
          a flat total is noise, a jump is a live regression.
        </p>
        <Button onClick={runNow} disabled={running} variant="outline">
          {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Snapshot now
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total violations</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold tabular-nums font-mono">{totals.violations}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Change vs previous</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold tabular-nums font-mono"><DeltaBadge delta={totals.delta} /></div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Org/check regressions</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold tabular-nums font-mono">{totals.regressions}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Last snapshot</CardTitle></CardHeader>
          <CardContent>
            <div className="text-sm tabular-nums font-mono">{lastSnapshot?.snapshot_date || "—"}</div>
            <div className="text-xs text-muted-foreground">
              {lastSnapshot?.created_at ? new Date(lastSnapshot.created_at).toLocaleString() : "no snapshot recorded"}
            </div>
          </CardContent>
        </Card>
      </div>

      {paidMismatchOpen > 0 && (
        <Card className="border-destructive/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-destructive">
              Paid ≠ compute_sale_settlement ({paidMismatchDigest?.total_failing ?? paidMismatchOpen} invoices)
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Same definition as the receipt sync writer. Platform admin is WhatsApped when this count is
              non-zero after the daily digest.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            {(paidMismatchDigest?.organizations || []).map((org) => (
              <div key={org.organization_id} className="space-y-1">
                <div className="text-sm font-medium">
                  {org.organization_name || "—"}{" "}
                  <span className="tabular-nums font-mono text-muted-foreground">
                    {org.failing_count} · ₹{inr(org.total_abs_discrepancy)}
                  </span>
                </div>
                <ul className="text-xs text-muted-foreground space-y-0.5 pl-3">
                  {(org.worst_rows || []).map((w) => (
                    <li key={`${w.sale_number}-${w.discrepancy}`} className="tabular-nums font-mono">
                      {w.sale_number}: recorded {inr(w.recorded_paid)} → expected {inr(w.expected_paid)} (Δ{" "}
                      {inr(w.discrepancy)})
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">By check</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Check</TableHead>
                <TableHead className="text-right">Today</TableHead>
                <TableHead className="text-right">Previous</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">Orgs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">Loading…</TableCell></TableRow>
              ) : byCheck.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">No snapshot yet — run one.</TableCell></TableRow>
              ) : (
                byCheck.map(([name, e]) => (
                  <TableRow key={name}>
                    <TableCell className="font-medium">{CHECK_LABEL[name] || name}</TableCell>
                    <TableCell className="text-right tabular-nums font-mono">{e.count}</TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-muted-foreground">{e.prev}</TableCell>
                    <TableCell className="text-right"><DeltaBadge delta={e.delta} /></TableCell>
                    <TableCell className="text-right tabular-nums font-mono">{e.orgs}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-sm">Per organisation</CardTitle>
            <Select value={checkFilter} onValueChange={setCheckFilter}>
              <SelectTrigger className="w-72"><SelectValue placeholder="All checks" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All checks</SelectItem>
                {byCheck.map(([name]) => (
                  <SelectItem key={name} value={name}>{CHECK_LABEL[name] || name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto text-xs text-muted-foreground">Showing {filtered.length} rows</div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[55vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Organisation</TableHead>
                  <TableHead>Check</TableHead>
                  <TableHead className="text-right">Today</TableHead>
                  <TableHead className="text-right">Previous</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="text-right">Amount involved</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">Nothing to show.</TableCell></TableRow>
                ) : (
                  filtered.map((r, i) => (
                    <TableRow key={`${r.check_name}-${r.organization_id || "none"}-${i}`}>
                      <TableCell>{r.organization_name || "—"}</TableCell>
                      <TableCell className="text-xs">{CHECK_LABEL[r.check_name] || r.check_name}</TableCell>
                      <TableCell className="text-right tabular-nums font-mono">{r.violation_count}</TableCell>
                      <TableCell className="text-right tabular-nums font-mono text-muted-foreground">{r.prev_count}</TableCell>
                      <TableCell className="text-right"><DeltaBadge delta={r.delta} /></TableCell>
                      <TableCell className="text-right tabular-nums font-mono">₹{inr(r.total_detail)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
