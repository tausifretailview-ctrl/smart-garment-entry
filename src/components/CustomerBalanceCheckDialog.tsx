import { useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOpenCustomerAccount } from "@/hooks/useOpenCustomerAccount";
import {
  BALANCE_CHECK_SCAN_MAX,
  findBalanceCheckCandidates,
  scanCustomersForBalanceCheck,
  type BalanceCheckFinding,
  type BalanceCheckScanProgress,
} from "@/utils/customerBalanceCheckScan";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | null | undefined;
};

const inr = (n: number) =>
  `₹${Math.abs(Math.round(n)).toLocaleString("en-IN")} ${n > 0.5 ? "Dr" : n < -0.5 ? "Cr" : ""}`.trim();

/**
 * Lists customers whose ledger shows "Balance needs checking". Read-only; the scan only
 * runs when the user presses Start, two customers at a time, so billing is not slowed.
 */
export function CustomerBalanceCheckDialog({ open, onOpenChange, organizationId }: Props) {
  const openCustomerAccount = useOpenCustomerAccount();
  const [status, setStatus] = useState<"idle" | "finding" | "scanning" | "done">("idle");
  const [progress, setProgress] = useState<BalanceCheckScanProgress>({ done: 0, total: 0, found: 0 });
  const [findings, setFindings] = useState<BalanceCheckFinding[]>([]);
  const [summary, setSummary] = useState<{ candidates: number; skipped: number; failed: number } | null>(null);
  const cancelRef = useRef({ cancelled: false });

  const start = async () => {
    if (!organizationId) return;
    cancelRef.current = { cancelled: false };
    setFindings([]);
    setSummary(null);
    setStatus("finding");
    const candidates = await findBalanceCheckCandidates(supabase, organizationId);
    if (cancelRef.current.cancelled) {
      setStatus("done");
      return;
    }
    setStatus("scanning");
    setProgress({ done: 0, total: Math.min(candidates.length, BALANCE_CHECK_SCAN_MAX), found: 0 });
    const result = await scanCustomersForBalanceCheck(supabase, organizationId, candidates, {
      signal: cancelRef.current,
      onProgress: setProgress,
    });
    setFindings(result.findings);
    setSummary({ candidates: candidates.length, skipped: result.skipped, failed: result.failed });
    setStatus("done");
  };

  const stop = () => {
    cancelRef.current.cancelled = true;
  };

  const busy = status === "finding" || status === "scanning";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) stop();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Accounts that need checking
          </DialogTitle>
          <DialogDescription>
            Finds customers whose ledger balance does not match the system check, usually because of a
            duplicate return or refund, a deleted bill, an advance refund or a Balance Adjustment. It only looks
            at customers with returns, credit notes, exchange refunds, advance refunds or Balance Adjustments
            (up to {BALANCE_CHECK_SCAN_MAX} per run) and changes nothing.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          {busy ? (
            <Button variant="outline" onClick={stop}>
              Stop
            </Button>
          ) : (
            <Button onClick={start} disabled={!organizationId}>
              {status === "done" ? "Check again" : "Start check"}
            </Button>
          )}
          {status === "finding" && (
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-4 w-4 animate-spin" /> Finding customers to check…
            </span>
          )}
          {status === "scanning" && (
            <span className="text-sm text-muted-foreground">
              Checked {progress.done} of {progress.total} · found {progress.found}
            </span>
          )}
        </div>
        {status === "scanning" && progress.total > 0 && (
          <Progress value={(progress.done / progress.total) * 100} className="h-2" />
        )}

        {status === "done" && summary && (
          <p className="text-sm text-muted-foreground" data-testid="balance-check-summary">
            {findings.length === 0
              ? "No accounts need checking."
              : `${findings.length} account${findings.length === 1 ? "" : "s"} need checking.`}{" "}
            Checked {summary.candidates - summary.skipped} of {summary.candidates} customers with returns or
            refunds
            {summary.skipped > 0 ? ` (run again later for the rest)` : ""}
            {summary.failed > 0 ? `; ${summary.failed} could not be read` : ""}.
          </p>
        )}

        {findings.length > 0 && (
          <div className="border rounded-md divide-y">
            {findings.map((f) => (
              <div key={f.customerId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{f.customerName || "Customer"}</div>
                  <div className="text-xs text-muted-foreground">
                    Ledger {inr(f.tableBalance)} · system check {inr(f.checkBalance)} · difference{" "}
                    ₹{Math.abs(Math.round(f.difference)).toLocaleString("en-IN")}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    stop();
                    onOpenChange(false);
                    openCustomerAccount(f.customerId, f.customerName);
                  }}
                >
                  Open ledger
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
