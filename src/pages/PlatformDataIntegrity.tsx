import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw, ShieldCheck, Loader2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AdjustmentDriftPanel } from "@/components/AdjustmentDriftPanel";

type DriftRow = {
  id: string;
  detected_at: string;
  organization_id: string;
  sale_id: string;
  customer_id: string | null;
  sale_number: string | null;
  net_amount: number | null;
  recorded_paid: number | null;
  voucher_paid: number | null;
  drift_amount: number | null;
  recorded_status: string | null;
  drift_type: string;
  severity: string;
};

const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };
const inr = (v: number | null | undefined) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(v || 0));

function severityBadge(s: string) {
  if (s === "critical") return <Badge variant="destructive">Critical</Badge>;
  if (s === "warning") return <Badge className="bg-amber-500 text-white hover:bg-amber-500">Warning</Badge>;
  return <Badge variant="secondary">Info</Badge>;
}

export default function PlatformDataIntegrity() {
  const qc = useQueryClient();
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sevFilter, setSevFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [investigate, setInvestigate] = useState<DriftRow | null>(null);
  const [resolveRow, setResolveRow] = useState<DriftRow | null>(null);
  const [resolveNote, setResolveNote] = useState("");
  const [running, setRunning] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["settlement_drift_log", "open"],
    queryFn: async (): Promise<DriftRow[]> => {
      const { data, error } = await supabase
        .from("settlement_drift_log" as any)
        .select("*")
        .is("resolved_at", null)
        .order("detected_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return ((data as unknown) || []) as DriftRow[];
    },
  });

  const { data: orgs = [] } = useQuery({
    queryKey: ["orgs-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("id, name").order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });
  const orgMap = useMemo(() => new Map(orgs.map((o) => [o.id, o.name])), [orgs]);

  const { data: lastRun } = useQuery({
    queryKey: ["drift_last_run"],
    queryFn: async () => {
      const { data } = await supabase
        .from("drift_detection_runs" as any)
        .select("*")
        .order("run_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => orgFilter === "all" || r.organization_id === orgFilter)
      .filter((r) => typeFilter === "all" || r.drift_type === typeFilter)
      .filter((r) => sevFilter === "all" || r.severity === sevFilter)
      .filter((r) => !q || (r.sale_number || "").toLowerCase().includes(q))
      .sort((a, b) => {
        const s = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
        if (s !== 0) return s;
        return Math.abs(Number(b.drift_amount || 0)) - Math.abs(Number(a.drift_amount || 0));
      });
  }, [rows, orgFilter, typeFilter, sevFilter, search]);

  const summary = useMemo(() => {
    const crit = rows.filter((r) => r.severity === "critical");
    return {
      total: rows.length,
      critical: crit.length,
      warning: rows.filter((r) => r.severity === "warning").length,
      orgs: new Set(rows.map((r) => r.organization_id)).size,
      rupees: crit.reduce((s, r) => s + Math.abs(Number(r.drift_amount || 0)), 0),
    };
  }, [rows]);

  const runNow = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.rpc("detect_settlement_drift" as any, {
        p_organization_id: null,
      });
      if (error) throw error;
      toast.success("Detection completed");
      qc.invalidateQueries({ queryKey: ["settlement_drift_log"] });
      qc.invalidateQueries({ queryKey: ["drift_last_run"] });
    } catch (e: any) {
      toast.error(e?.message || "Detection failed");
    } finally {
      setRunning(false);
    }
  };

  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (!resolveRow) return;
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("settlement_drift_log" as any)
        .update({
          resolved_at: new Date().toISOString(),
          resolved_by: userRes.user?.id,
          resolution_note: resolveNote.trim() || "resolved by platform admin",
        })
        .eq("id", resolveRow.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked resolved");
      setResolveRow(null);
      setResolveNote("");
      qc.invalidateQueries({ queryKey: ["settlement_drift_log"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to resolve"),
  });

  const driftTypes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.drift_type))).sort(),
    [rows],
  );

  return (
    <Layout>
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-6 w-6" /> Data Integrity
            </h1>
            <p className="text-sm text-muted-foreground">
              Detects invoices where the payment cache disagrees with live receipt vouchers. Read-only —
              no automatic repair.
            </p>
          </div>
          <Button onClick={runNow} disabled={running}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Run detection now
          </Button>
        </div>

        <Tabs defaultValue="settlement" className="space-y-4">
          <TabsList>
            <TabsTrigger value="settlement">Settlement drift</TabsTrigger>
            <TabsTrigger value="adjustment">Adjustment drift</TabsTrigger>
          </TabsList>
          <TabsContent value="settlement" className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Open drifts</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold tabular-nums">{summary.total}</div>
              <div className="text-xs text-muted-foreground">{summary.critical} critical · {summary.warning} warning</div>
            </CardContent></Card>
          <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Organisations affected</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold tabular-nums">{summary.orgs}</div></CardContent></Card>
          <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Rupees at risk (critical)</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold tabular-nums text-destructive">₹{inr(summary.rupees)}</div></CardContent></Card>
          <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Last run</CardTitle></CardHeader>
            <CardContent>
              <div className="text-sm tabular-nums">{lastRun?.run_at ? new Date(lastRun.run_at).toLocaleString() : "—"}</div>
              <div className="text-xs text-muted-foreground">
                {lastRun ? `${lastRun.drifts_found} drifts · ${lastRun.duration_ms}ms` : "no run recorded"}
              </div>
            </CardContent></Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Search invoice #"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-48"
              />
              <Select value={orgFilter} onValueChange={setOrgFilter}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Organisation" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All organisations</SelectItem>
                  {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-52"><SelectValue placeholder="Drift type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {driftTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sevFilter} onValueChange={setSevFilter}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Severity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
              <div className="ml-auto text-xs text-muted-foreground">
                Showing {filtered.length} of {rows.length}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[65vh] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Org</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-right">Recorded</TableHead>
                    <TableHead className="text-right">Vouchers</TableHead>
                    <TableHead className="text-right">Drift</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Sev</TableHead>
                    <TableHead>Detected</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-8">Loading…</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      No open drift. All caches match vouchers.
                    </TableCell></TableRow>
                  ) : filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{orgMap.get(r.organization_id) || r.organization_id.slice(0, 8)}</TableCell>
                      <TableCell className="font-mono text-xs">{r.sale_number || r.sale_id.slice(0, 8)}</TableCell>
                      <TableCell className="text-right tabular-nums">₹{inr(r.net_amount)}</TableCell>
                      <TableCell className="text-right tabular-nums">₹{inr(r.recorded_paid)}</TableCell>
                      <TableCell className="text-right tabular-nums">₹{inr(r.voucher_paid)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${Number(r.drift_amount) > 0 ? "text-destructive" : "text-amber-600"}`}>
                        ₹{inr(r.drift_amount)}
                      </TableCell>
                      <TableCell className="text-xs">{r.drift_type}</TableCell>
                      <TableCell>{severityBadge(r.severity)}</TableCell>
                      <TableCell className="text-xs">{new Date(r.detected_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setInvestigate(r)}>Investigate</Button>
                        <Button variant="ghost" size="sm" onClick={() => setResolveRow(r)}>Resolve</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <InvestigateDialog row={investigate} onClose={() => setInvestigate(null)} orgName={investigate ? orgMap.get(investigate.organization_id) : undefined} />

        <Dialog open={!!resolveRow} onOpenChange={(o) => !o && setResolveRow(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mark drift resolved</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Invoice {resolveRow?.sale_number} · {resolveRow?.drift_type} · drift ₹{inr(resolveRow?.drift_amount)}
            </p>
            <Textarea
              placeholder="Resolution note (required) — describe the repair or why this is acceptable"
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              rows={4}
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setResolveRow(null)}>Cancel</Button>
              <Button
                onClick={() => resolveMutation.mutate()}
                disabled={!resolveNote.trim() || resolveMutation.isPending}
              >
                Mark resolved
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
          </TabsContent>
          <TabsContent value="adjustment">
            <AdjustmentDriftPanel organizations={orgs} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function InvestigateDialog({
  row, onClose, orgName,
}: { row: DriftRow | null; onClose: () => void; orgName?: string }) {
  const { data: vouchers = [] } = useQuery({
    enabled: !!row,
    queryKey: ["drift-investigate-vouchers", row?.sale_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("voucher_entries")
        .select("id, voucher_number, voucher_type, payment_method, total_amount, discount_amount, description, deleted_at, created_at")
        .eq("reference_id", row!.sale_id)
        .order("created_at", { ascending: true });
      return (data || []) as any[];
    },
  });

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            {row?.drift_type} · {row?.sale_number}
          </DialogTitle>
        </DialogHeader>
        {row && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <div><div className="text-xs text-muted-foreground">Org</div>{orgName}</div>
              <div><div className="text-xs text-muted-foreground">Net</div>₹{inr(row.net_amount)}</div>
              <div><div className="text-xs text-muted-foreground">Recorded paid</div>₹{inr(row.recorded_paid)}</div>
              <div><div className="text-xs text-muted-foreground">Voucher paid</div>₹{inr(row.voucher_paid)}</div>
              <div><div className="text-xs text-muted-foreground">Drift</div>
                <span className={Number(row.drift_amount) > 0 ? "text-destructive" : "text-amber-600"}>₹{inr(row.drift_amount)}</span>
              </div>
              <div><div className="text-xs text-muted-foreground">Status</div>{row.recorded_status}</div>
              <div><div className="text-xs text-muted-foreground">Severity</div>{severityBadge(row.severity)}</div>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Live receipt vouchers on this invoice</div>
              <div className="max-h-[45vh] overflow-auto rounded border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Voucher #</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Discount</TableHead>
                      <TableHead>Deleted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vouchers.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground">No vouchers linked to this invoice.</TableCell></TableRow>
                    ) : vouchers.map((v) => (
                      <TableRow key={v.id} className={v.deleted_at ? "opacity-50" : ""}>
                        <TableCell className="font-mono text-xs">{v.voucher_number}</TableCell>
                        <TableCell>{v.voucher_type}</TableCell>
                        <TableCell>{v.payment_method}</TableCell>
                        <TableCell className="text-right tabular-nums">₹{inr(v.total_amount)}</TableCell>
                        <TableCell className="text-right tabular-nums">₹{inr(v.discount_amount)}</TableCell>
                        <TableCell className="text-xs">{v.deleted_at ? new Date(v.deleted_at).toLocaleDateString() : ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}