import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, RefreshCcw, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface DupRow {
  group_key: string;
  bill_id: string;
  software_bill_no: string;
  supplier_id: string;
  supplier_name: string;
  supplier_invoice_no: string | null;
  bill_date: string;
  total_qty: number | null;
  net_amount: number | null;
  created_at: string;
  group_size: number;
  is_earliest: boolean;
}

export const DuplicatePurchaseBillsReconciler = () => {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [groups, setGroups] = useState<Record<string, DupRow[]>>({});
  const [cancelling, setCancelling] = useState<string | null>(null);

  const scan = async () => {
    if (!currentOrganization?.id) return;
    setScanning(true);
    try {
      const { data, error } = await (supabase.rpc as any)("find_duplicate_purchase_bills", { p_org_id: currentOrganization.id });
      if (error) throw error;
      const rows = (data || []) as DupRow[];
      const grouped: Record<string, DupRow[]> = {};
      rows.forEach((r) => {
        if (!grouped[r.group_key]) grouped[r.group_key] = [];
        grouped[r.group_key].push(r);
      });
      setGroups(grouped);
      toast({ title: "Scan complete", description: `${Object.keys(grouped).length} duplicate group(s) found.` });
    } catch (e: any) {
      toast({ title: "Scan failed", description: e.message, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const cancelDuplicates = async (groupKey: string) => {
    const rows = groups[groupKey];
    if (!rows) return;
    const toCancel = rows.filter((r) => !r.is_earliest);
    if (toCancel.length === 0) return;
    if (!confirm(`Cancel ${toCancel.length} duplicate bill(s)? Stock will be reversed. The earliest bill (${rows.find(r => r.is_earliest)?.software_bill_no}) will be kept.`)) return;
    setCancelling(groupKey);
    let okCount = 0; const errors: string[] = [];
    for (const r of toCancel) {
      const { data, error } = await supabase.rpc("cancel_purchase_bill", { p_bill_id: r.bill_id, p_reason: "Duplicate bill — auto-cancelled via Reconciler" });
      const result: any = data;
      if (error || result?.success === false) {
        errors.push(`${r.software_bill_no}: ${error?.message || result?.error || "failed"}`);
      } else {
        okCount++;
      }
    }
    if (okCount > 0) toast({ title: "Cancelled", description: `${okCount} bill(s) cancelled.` });
    if (errors.length > 0) toast({ title: "Some failures", description: errors.join("; "), variant: "destructive" });
    await scan();
    setCancelling(null);
  };

  const groupKeys = Object.keys(groups);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> Reconcile Duplicate Purchase Bills</CardTitle>
        <CardDescription>
          Detects purchase bills with the same supplier, date, total quantity, and net amount — typically caused by accidental double-saves.
          Cancel duplicates to reverse the inflated stock. The earliest bill in each group is preserved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={scan} disabled={scanning} className="gap-2">
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          {scanning ? "Scanning…" : "Scan for Duplicates"}
        </Button>
        {groupKeys.length === 0 && !scanning && (
          <p className="text-sm text-muted-foreground">No duplicate groups detected. Click scan to check.</p>
        )}
        {groupKeys.map((gk) => {
          const rows = groups[gk];
          const first = rows[0];
          return (
            <div key={gk} className="rounded-md border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm">
                  <span className="font-semibold">{first.supplier_name}</span>
                  <span className="text-muted-foreground"> · {format(new Date(first.bill_date), "dd-MMM-yyyy")} · ₹{Math.round(Number(first.net_amount || 0)).toLocaleString("en-IN")} · qty {first.total_qty || 0}</span>
                  <Badge variant="destructive" className="ml-2">{rows.length} duplicates</Badge>
                </div>
                <Button size="sm" variant="destructive" disabled={cancelling === gk} onClick={() => cancelDuplicates(gk)} className="gap-1.5">
                  {cancelling === gk ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Cancel Duplicates
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {rows.map((r) => (
                  <div key={r.bill_id} className={`text-xs rounded border px-2 py-1.5 ${r.is_earliest ? "border-success/50 bg-success/5" : "border-destructive/40 bg-destructive/5"}`}>
                    <div className="flex justify-between">
                      <span className="font-semibold">{r.software_bill_no}</span>
                      {r.is_earliest ? <Badge variant="outline" className="text-[10px]">KEEP</Badge> : <Badge variant="destructive" className="text-[10px]">CANCEL</Badge>}
                    </div>
                    <div className="text-muted-foreground">Inv: {r.supplier_invoice_no || "—"} · Saved: {format(new Date(r.created_at), "dd-MMM HH:mm")}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
