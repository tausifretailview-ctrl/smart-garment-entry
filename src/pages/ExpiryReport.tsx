import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarX2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  dmy,
  fetchExpiryReport,
  writeOffExpiredLot,
  type BatchExpiryDb,
  type ExpiryReportRow,
} from "@/lib/data/batchExpiry";
import { invalidateStockReportQueries } from "@/utils/invalidateDashboardQueries";

/**
 * Inventory → Expiry (supermarket phase 2, Nov 2026): stock still on hand from purchase lots that
 * have expired or expire soon (expiry dates typed on the purchase bill), with quantity, cost and
 * supplier. "Write off" takes an expired lot out as wastage (reason Expired).
 */
const db = supabase as unknown as BatchExpiryDb;
const WINDOWS = [
  { value: "expired", label: "Expired only", days: 0 },
  { value: "7", label: "Within 7 days", days: 7 },
  { value: "30", label: "Within 30 days", days: 30 },
  { value: "60", label: "Within 60 days", days: 60 },
  { value: "90", label: "Within 90 days", days: 90 },
] as const;

const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function daysLabel(d: number): string {
  if (d < 0) return `Expired ${-d} day${d === -1 ? "" : "s"} ago`;
  if (d === 0) return "Expires today";
  return `${d} day${d === 1 ? "" : "s"} left`;
}

const ExpiryReport = () => {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const queryClient = useQueryClient();
  const [win, setWin] = useState<(typeof WINDOWS)[number]["value"]>("30");
  const [busy, setBusy] = useState<string | null>(null);
  const days = WINDOWS.find((w) => w.value === win)?.days ?? 30;

  const { data, isLoading, error } = useQuery({
    queryKey: ["expiry-report", orgId, days],
    enabled: !!orgId,
    queryFn: () => fetchExpiryReport(db, orgId!, days),
  });
  const missingSql = data === null;
  const rows = useMemo(() => {
    const all = data ?? [];
    return win === "expired" ? all.filter((r) => r.days_left < 0) : all;
  }, [data, win]);
  const expired = rows.filter((r) => r.days_left < 0);
  const totals = {
    expiredValue: expired.reduce((s, r) => s + r.cost_value, 0),
    soonValue: rows.filter((r) => r.days_left >= 0).reduce((s, r) => s + r.cost_value, 0),
  };

  const writeOff = async (r: ExpiryReportRow) => {
    if (!orgId) return;
    const name = `${r.product_name}${r.size && r.size !== "None" ? ` ${r.size}` : ""}`;
    if (!window.confirm(`Write off ${r.lot_qty} of ${name} (bill ${r.bill_number}) as expired? Stock goes down by ${r.lot_qty}.`)) return;
    const key = `${r.purchase_bill_id}:${r.variant_id}`;
    setBusy(key);
    try {
      const res = await writeOffExpiredLot(db, orgId, r);
      toast.success(`Written off ${res.totalQty} · ${money(res.totalCost)}`, { description: res.docNumber });
      void queryClient.invalidateQueries({ queryKey: ["expiry-report", orgId] });
      void queryClient.invalidateQueries({ queryKey: ["stock-wastage", orgId] });
      invalidateStockReportQueries(queryClient, orgId);
    } catch (e) {
      toast.error("Not written off", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 overflow-y-auto">
      <div className="flex flex-wrap items-center gap-2">
        <BackToDashboard />
        <CalendarX2 className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold mr-auto">Expiry</h1>
        <Select value={win} onValueChange={(v) => setWin(v as typeof win)}>
          <SelectTrigger className="w-40 h-9" aria-label="Expiry window">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WINDOWS.map((w) => (
              <SelectItem key={w.value} value={w.value}>
                {w.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-sm text-muted-foreground">
        Stock still on hand from purchase lots with an expiry date (typed on the purchase bill; Settings → Purchase →
        Batch &amp; expiry). Oldest purchases sell first.
      </p>
      {missingSql ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
          Run SQL 74 (batch &amp; expiry) in the database first.
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!isLoading && !missingSql ? (
        <div className="grid grid-cols-2 gap-2 sm:max-w-md">
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Expired stock</div>
            <div className="text-lg font-bold text-destructive" data-testid="expired-value">{money(totals.expiredValue)}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Expiring in window</div>
            <div className="text-lg font-bold text-amber-700">{money(totals.soonValue)}</div>
          </Card>
        </div>
      ) : null}
      {!isLoading && !missingSql && rows.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">Nothing expiring in this window.</Card>
      ) : null}
      {rows.length > 0 ? (
        <Card className="p-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="text-left">
                <th className="py-1 px-2">Item</th>
                <th className="py-1 px-2">Batch</th>
                <th className="py-1 px-2">Expiry</th>
                <th className="py-1 px-2">Bill / supplier</th>
                <th className="py-1 px-2 text-right">Qty</th>
                <th className="py-1 px-2 text-right">Cost</th>
                <th className="py-1 px-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const key = `${r.purchase_bill_id}:${r.variant_id}`;
                return (
                  <tr key={key} className="border-t" data-testid="expiry-row">
                    <td className="py-1 px-2">
                      <div className="font-medium">
                        {r.product_name}
                        {r.size && r.size !== "None" ? ` (${r.size})` : ""}
                        {r.brand ? <span className="text-muted-foreground"> · {r.brand}</span> : null}
                      </div>
                      <div className="text-xs text-muted-foreground">{r.barcode || "—"}</div>
                    </td>
                    <td className="py-1 px-2">{r.batch_no || "—"}</td>
                    <td className="py-1 px-2">
                      <div>{dmy(r.expiry_date)}</div>
                      <div
                        className={cn(
                          "text-xs font-semibold",
                          r.days_left < 0 ? "text-destructive" : r.days_left <= 7 ? "text-amber-700" : "text-muted-foreground",
                        )}
                      >
                        {daysLabel(r.days_left)}
                      </div>
                    </td>
                    <td className="py-1 px-2">
                      <div>{r.bill_number}</div>
                      <div className="text-xs text-muted-foreground">{r.supplier_name || "—"}</div>
                    </td>
                    <td className="py-1 px-2 text-right tabular-nums">{r.lot_qty}</td>
                    <td className="py-1 px-2 text-right tabular-nums">{money(r.cost_value)}</td>
                    <td className="py-1 px-2 text-right">
                      {r.days_left < 0 ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy === key}
                          onClick={() => void writeOff(r)}
                          aria-label={`Write off ${r.product_name} ${r.bill_number}`}
                        >
                          <Trash2 className="h-4 w-4 mr-1" /> Write off
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
};

export default ExpiryReport;
