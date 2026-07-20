import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Wrench, Loader2, RefreshCw } from "lucide-react";

type DriftCustomer = {
  customer_id: string;
  customer_name: string;
  ledger_closing: number;
  invoice_pending_sum: number;
  opening_pending: number;
  floating_adjustment_pool: number;
  drift: number;
};

type RepairRow = {
  action: string;
  reference_type: string | null;
  reference_id: string | null;
  reference_label: string | null;
  amount: number;
  voucher_id: string | null;
};

const inr = (v: number | null | undefined) =>
  `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(v || 0))}`;

export function AdjustmentDriftPanel({
  organizations,
  defaultOrgId,
}: {
  organizations: { id: string; name: string }[];
  defaultOrgId?: string;
}) {
  const qc = useQueryClient();
  const [orgId, setOrgId] = useState<string>(defaultOrgId || organizations[0]?.id || "");
  const [target, setTarget] = useState<DriftCustomer | null>(null);
  const [dryRun, setDryRun] = useState<RepairRow[] | null>(null);
  const [running, setRunning] = useState(false);

  const { data: rows = [], isLoading, refetch } = useQuery({
    enabled: !!orgId,
    queryKey: ["adjustment-drift", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "detect_balance_adjustment_drift" as any,
        { p_organization_id: orgId, p_min_drift: 1 },
      );
      if (error) throw error;
      return ((data as unknown) || []) as DriftCustomer[];
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (customer: DriftCustomer) => {
      const { data, error } = await supabase.rpc(
        "repair_customer_floating_adjustments" as any,
        { p_organization_id: orgId, p_customer_id: customer.customer_id, p_dry_run: true },
      );
      if (error) throw error;
      return ((data as unknown) || []) as RepairRow[];
    },
    onSuccess: (data, customer) => {
      setTarget(customer);
      setDryRun(data);
    },
    onError: (e: any) => toast.error(e?.message || "Preview failed"),
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!target) return;
      setRunning(true);
      const { error } = await supabase.rpc(
        "repair_customer_floating_adjustments" as any,
        { p_organization_id: orgId, p_customer_id: target.customer_id, p_dry_run: false },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Repair applied — floating adjustment materialized");
      setTarget(null);
      setDryRun(null);
      qc.invalidateQueries({ queryKey: ["adjustment-drift", orgId] });
    },
    onError: (e: any) => toast.error(e?.message || "Repair failed"),
    onSettled: () => setRunning(false),
  });

  const summary = useMemo(() => {
    return {
      customers: rows.length,
      floating: rows.reduce((s, r) => s + Math.abs(Number(r.floating_adjustment_pool || 0)), 0),
      drift: rows.reduce((s, r) => s + Math.abs(Number(r.drift || 0)), 0),
    };
  }, [rows]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="h-4 w-4" /> Adjustment Drift
          </CardTitle>
          <div className="text-xs text-muted-foreground">
            Customers whose floating balance-adjustments don't reconcile with pending invoices/opening balance.
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Organisation" /></SelectTrigger>
              <SelectContent>
                {organizations.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
        </div>
        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
          <span>{summary.customers} customers</span>
          <span>Floating pool: <b className="tabular-nums text-foreground">{inr(summary.floating)}</b></span>
          <span>Total drift: <b className="tabular-nums text-destructive">{inr(summary.drift)}</b></span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[55vh] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Ledger closing</TableHead>
                <TableHead className="text-right">Invoice pending</TableHead>
                <TableHead className="text-right">Opening pending</TableHead>
                <TableHead className="text-right">Floating pool</TableHead>
                <TableHead className="text-right">Drift</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center">Loading…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No adjustment drift detected in this organisation.
                </TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.customer_id}>
                  <TableCell className="font-medium">{r.customer_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.ledger_closing)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.invoice_pending_sum)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.opening_pending)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.floating_adjustment_pool)}</TableCell>
                  <TableCell className="text-right tabular-nums text-destructive">{inr(r.drift)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={previewMutation.isPending || Number(r.floating_adjustment_pool || 0) >= -0.5}
                      onClick={() => previewMutation.mutate(r)}
                    >
                      {previewMutation.isPending && previewMutation.variables?.customer_id === r.customer_id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>Preview repair</>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!target} onOpenChange={(o) => { if (!o) { setTarget(null); setDryRun(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Repair floating adjustments — {target?.customer_name}</DialogTitle>
          </DialogHeader>
          {target && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4 rounded border p-2 text-xs">
                <div><div className="text-muted-foreground">Ledger closing</div><b className="tabular-nums">{inr(target.ledger_closing)}</b></div>
                <div><div className="text-muted-foreground">Floating pool</div><b className="tabular-nums">{inr(target.floating_adjustment_pool)}</b></div>
                <div><div className="text-muted-foreground">Invoice pending</div><b className="tabular-nums">{inr(target.invoice_pending_sum)}</b></div>
                <div><div className="text-muted-foreground">Opening pending</div><b className="tabular-nums">{inr(target.opening_pending)}</b></div>
              </div>
              <div className="rounded border">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(dryRun || []).length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="py-4 text-center text-muted-foreground">
                        Nothing to allocate (pool is not a credit).
                      </TableCell></TableRow>
                    ) : (dryRun || []).map((row, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          {row.action === "residual_unallocated"
                            ? <Badge variant="destructive">Residual</Badge>
                            : <Badge variant="secondary">Allocate</Badge>}
                        </TableCell>
                        <TableCell className="text-xs">{row.reference_label}</TableCell>
                        <TableCell className="text-right tabular-nums">{inr(row.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="text-xs text-muted-foreground">
                Applying creates <code>balance_adjustment</code> receipt vouchers (Opening Balance → oldest
                invoices), zeroes the floating <code>outstanding_difference</code>, and marks adjustments
                materialized. Apply is refused if any residual remains. Closing balance must stay within ₹1.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setTarget(null); setDryRun(null); }}>Cancel</Button>
            <Button
              disabled={
                running ||
                !dryRun ||
                dryRun.length === 0 ||
                dryRun.some((r) => r.action === "residual_unallocated") ||
                !dryRun.some((r) => r.action === "allocate")
              }
              onClick={() => applyMutation.mutate()}
            >
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Apply repair
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}