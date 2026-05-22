import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ReconLogRow = {
  id: string;
  customer_id: string;
  customer_name: string | null;
  check_date: string;
  rpc_outstanding: number;
  drift_rpc_vs_invoices: number;
  severity: string;
  notes: string | null;
  has_phantom_advance: boolean;
  has_mistagged_receipts: boolean;
  has_overpaid_invoices: boolean;
  has_sr_invoice_drift: boolean;
};

type SeveritySummary = {
  severity: string;
  count: number;
  total_drift: number;
};

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

function issueTags(row: ReconLogRow): string[] {
  const tags: string[] = [];
  if (row.has_phantom_advance) tags.push("Phantom advance");
  if (row.has_mistagged_receipts) tags.push("Mistagged receipts");
  if (row.has_overpaid_invoices) tags.push("Overpaid");
  if (row.has_sr_invoice_drift) tags.push("SR drift");
  if (row.notes?.trim()) tags.push(row.notes.trim());
  return tags.length ? tags : ["Balance drift"];
}

/**
 * Dashboard banner — latest nightly balance reconciliation (admin only).
 */
export function BalanceReconciliationAlert() {
  const { currentOrganization, organizationRole } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const [expanded, setExpanded] = useState(false);

  const sinceYmd = format(subDays(new Date(), 1), "yyyy-MM-dd");

  const { data: summary = [] } = useQuery({
    queryKey: ["balance-recon-summary", currentOrganization?.id, sinceYmd],
    enabled: !!currentOrganization?.id && organizationRole === "admin",
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("balance_reconciliation_log")
        .select("severity, drift_rpc_vs_invoices")
        .eq("organization_id", currentOrganization!.id)
        .gte("check_date", sinceYmd);
      if (error) throw error;

      const map = new Map<string, SeveritySummary>();
      for (const row of data || []) {
        const sev = String(row.severity || "ok");
        const cur = map.get(sev) || { severity: sev, count: 0, total_drift: 0 };
        cur.count += 1;
        cur.total_drift += Math.abs(Number(row.drift_rpc_vs_invoices || 0));
        map.set(sev, cur);
      }
      return Array.from(map.values());
    },
  });

  const { data: detailRows = [] } = useQuery({
    queryKey: ["balance-recon-detail", currentOrganization?.id, sinceYmd, expanded],
    enabled: !!currentOrganization?.id && organizationRole === "admin" && expanded,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("balance_reconciliation_log")
        .select(
          "id, customer_id, customer_name, check_date, rpc_outstanding, drift_rpc_vs_invoices, severity, notes, has_phantom_advance, has_mistagged_receipts, has_overpaid_invoices, has_sr_invoice_drift",
        )
        .eq("organization_id", currentOrganization!.id)
        .gte("check_date", sinceYmd)
        .in("severity", ["warning", "critical"])
        .order("severity", { ascending: true })
        .order("drift_rpc_vs_invoices", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as ReconLogRow[];
    },
  });

  const criticalCount = summary.find((s) => s.severity === "critical")?.count ?? 0;
  const warningCount = summary.find((s) => s.severity === "warning")?.count ?? 0;
  const totalDrift = summary.reduce((s, r) => s + r.total_drift, 0);

  const variant = useMemo(() => {
    if (criticalCount > 0) return "destructive" as const;
    if (warningCount > 0) return "default" as const;
    return "default" as const;
  }, [criticalCount, warningCount]);

  if (!currentOrganization?.id || organizationRole !== "admin") return null;

  if (criticalCount === 0 && warningCount === 0) {
    return (
      <Alert className="border-emerald-200 bg-emerald-50/80 dark:bg-emerald-950/20">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        <AlertTitle className="text-emerald-800 dark:text-emerald-200">Customer balances verified</AlertTitle>
        <AlertDescription className="text-emerald-700/90 dark:text-emerald-300/90 text-sm">
          Nightly reconciliation found no warnings or critical issues in the last 24 hours.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert
      variant={variant}
      className={cn(
        criticalCount > 0 && "border-red-300 bg-red-50/90 dark:bg-red-950/25",
        criticalCount === 0 && warningCount > 0 && "border-amber-300 bg-amber-50/90 dark:bg-amber-950/25",
      )}
    >
      {criticalCount > 0 ? (
        <ShieldAlert className="h-4 w-4" />
      ) : (
        <AlertTriangle className="h-4 w-4" />
      )}
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <AlertTitle>
            {criticalCount > 0
              ? `${criticalCount} critical balance issue${criticalCount === 1 ? "" : "s"} from last night`
              : `${warningCount} customer balance warning${warningCount === 1 ? "" : "s"} from last night`}
          </AlertTitle>
          <AlertDescription className="text-sm mt-1">
            Automated reconciliation detected drift or data issues (total drift ₹
            {inr.format(Math.round(totalDrift))}). Review affected customers in Customer Audit Report.
          </AlertDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 h-8"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5 mr-1" />
              Hide
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5 mr-1" />
              Details
            </>
          )}
        </Button>
      </div>

      {expanded && detailRows.length > 0 && (
        <div className="mt-3 w-full overflow-x-auto rounded-md border bg-background/60">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-2 font-medium">Customer</th>
                <th className="p-2 font-medium text-right">Outstanding</th>
                <th className="p-2 font-medium text-right">Drift</th>
                <th className="p-2 font-medium">Issues</th>
                <th className="p-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {detailRows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="p-2 font-medium">{row.customer_name || "—"}</td>
                  <td className="p-2 text-right font-mono tabular-nums">
                    ₹{inr.format(Math.round(Math.abs(Number(row.rpc_outstanding || 0))))}
                    {Number(row.rpc_outstanding) >= 0 ? " Dr" : " Cr"}
                  </td>
                  <td className="p-2 text-right font-mono tabular-nums">
                    ₹{inr.format(Math.round(Number(row.drift_rpc_vs_invoices || 0)))}
                  </td>
                  <td className="p-2 text-muted-foreground max-w-[240px] truncate">
                    {issueTags(row).join(" · ")}
                  </td>
                  <td className="p-2 text-right">
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 text-xs"
                      onClick={() =>
                        orgNavigate(`/customer-audit-report?customer=${row.customer_id}`)
                      }
                    >
                      Audit →
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Alert>
  );
}
