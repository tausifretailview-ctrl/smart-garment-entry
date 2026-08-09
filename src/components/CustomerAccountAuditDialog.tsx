import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { runCustomerAccountAudit } from "@/utils/customerAccountAudit";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  customerId: string;
  customerName?: string | null;
};

/**
 * Read-only self-service account check. Reports only — never repairs.
 */
export function CustomerAccountAuditDialog({
  open,
  onOpenChange,
  organizationId,
  customerId,
  customerName,
}: Props) {
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["customer-account-audit", organizationId, customerId],
    queryFn: () =>
      runCustomerAccountAudit(supabase, {
        organizationId,
        customerId,
        customerName: customerName || undefined,
      }),
    enabled: open && Boolean(organizationId && customerId),
    staleTime: 30_000,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Check this account
          </DialogTitle>
          <DialogDescription>
            Read-only review for{" "}
            <span className="font-medium text-foreground">
              {(customerName || data?.customerName || "Customer").toUpperCase()}
            </span>
            . This never changes payments or invoices. If something looks wrong, contact support.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isFetching}
              onClick={() => refetch()}
            >
              {isFetching ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
              Re-check
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking invoices and receipts…
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">
              Could not run the check: {(error as Error).message}
            </p>
          ) : data?.clean ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 font-medium">
                <CheckCircle2 className="h-5 w-5" />
                Looks clean
              </div>
              <p className="text-sm text-emerald-900/90 dark:text-emerald-100/90">
                No duplicate receipts, over-payments, or paid-amount mismatches showed up for this
                customer. Legitimate split payments are fine.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {(data?.findings || []).map((f, i) => (
                <li
                  key={`${f.checkName}-${f.entityRef || i}`}
                  className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 space-y-1.5"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
                        {f.headline}
                      </p>
                      <p className="text-xs text-amber-900/90 dark:text-amber-100/80 leading-relaxed">
                        {f.detail}
                      </p>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {f.checkName}
                      </Badge>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className="text-[11px] text-muted-foreground border-t pt-2">
            Contact support to repair anything above. Do not delete receipts from the app to “fix”
            totals — the right receipt to keep often needs judgement.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
