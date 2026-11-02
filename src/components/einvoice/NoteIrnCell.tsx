import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, XCircle, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getEdgeFunctionErrorMessage } from "@/utils/edgeFunctionError";
import {
  IRN_CANCEL_REASONS,
  irnCancelHoursLeft,
  irnReportingWindow,
} from "../../../supabase/functions/_shared/einvoiceNote";

export type NoteIrnState = {
  id: string;
  number: string;
  date: string;
  irn: string | null;
  ackNo: string | null;
  ackDate: string | null;
  status: string | null;
  error: string | null;
  testMode: boolean | null;
  buyerGstin: string;
};

type Props = {
  kind: "debit";
  note: NoteIrnState;
  organizationId: string;
  /** Sandbox or live, from Settings > Sale > E-Invoice Settings. */
  testMode: boolean;
  /** First problem found on this device before calling the IRP, or null. */
  precheck: () => string | null;
  onChanged: () => void;
};

function ddmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** IRN state of one note in a list: get, see or cancel its IRN, with the 30-day reminder. */
export function NoteIrnCell({ kind, note, organizationId, testMode, precheck, onChanged }: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState("2");
  const [remarks, setRemarks] = useState("");
  const word = kind === "debit" ? "debit note" : "credit note";

  if (!note.buyerGstin) {
    return (
      <span className="text-xs text-slate-400" title="Buyer has no GSTIN: no IRN needed">
        Not needed
      </span>
    );
  }

  const active = !!note.irn && note.status === "generated";
  const cancelled = !!note.irn && note.status === "cancelled";

  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("einvoice-note", {
      body: { kind, noteId: note.id, organizationId, testMode, ...body },
    });
    if (error) {
      const raw = await getEdgeFunctionErrorMessage(error, data, "The e-invoice service did not answer");
      const msg = /requested function was not found|failed to send a request/i.test(raw)
        ? "The e-invoice service for notes isn't live yet. Deploy the einvoice-note function, then try again."
        : raw;
      return { success: false, error: msg } as { success: boolean; error?: string; irn?: string; duplicate?: boolean };
    }
    return (data ?? { success: false, error: "No reply from the e-invoice service" }) as {
      success: boolean;
      error?: string;
      irn?: string;
      duplicate?: boolean;
    };
  };

  const generate = async () => {
    if (busy) return;
    const problem = precheck();
    if (problem) {
      toast({ variant: "destructive", title: "Fix this before the IRN", description: problem });
      return;
    }
    setBusy(true);
    try {
      const res = await call({ action: "generate" });
      if (res.success) {
        toast({
          title: res.duplicate ? "IRN found at the IRP" : "IRN generated",
          description: res.duplicate
            ? `${note.number} already had an IRN; it is saved now (the IRP did not resend its QR code).`
            : `${note.number}: ${String(res.irn ?? "").slice(0, 24)}…`,
        });
      } else {
        toast({ variant: "destructive", title: "IRN not generated", description: res.error || "The IRP did not accept it" });
      }
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await call({ action: "cancel", reasonCode, remarks: remarks.trim() });
      if (res.success) {
        setCancelOpen(false);
        toast({
          title: "IRN cancelled",
          description: `${note.number} can't get a new IRN. Delete it and raise a new ${word} if it is still needed.`,
        });
      } else {
        toast({ variant: "destructive", title: "IRN not cancelled", description: res.error || "Cancellation failed" });
      }
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  if (active) {
    const hoursLeft = irnCancelHoursLeft(note.ackDate);
    return (
      <div className="flex flex-col items-start gap-0.5">
        <span
          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700"
          title={`IRN ${note.irn}${note.ackNo ? `\nAck No ${note.ackNo}` : ""}`}
        >
          <CheckCircle2 className="h-3 w-3" />
          IRN
          {note.testMode ? <span className="font-medium text-amber-600">· sandbox</span> : null}
        </span>
        {note.ackNo ? <span className="text-[11px] tabular-nums text-slate-400">Ack {note.ackNo}</span> : null}
        {hoursLeft > 0 ? (
          <button
            type="button"
            className="text-[11px] font-medium text-slate-500 hover:text-red-600 hover:underline"
            onClick={() => setCancelOpen(true)}
            disabled={busy}
          >
            Cancel IRN ({hoursLeft < 1 ? "<1" : Math.floor(hoursLeft)}h left)
          </button>
        ) : null}

        <Dialog open={cancelOpen} onOpenChange={(v) => !busy && setCancelOpen(v)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Cancel IRN of {note.number}?</DialogTitle>
              <DialogDescription>
                The IRP allows this only within 24 hours. After cancelling, this number can never get a new IRN: delete
                the {word} and raise a new one if it is still needed.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-1">
              <div className="grid gap-1.5">
                <Label className="text-xs text-slate-600">Reason</Label>
                <Select value={reasonCode} onValueChange={setReasonCode}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IRN_CANCEL_REASONS.map((r) => (
                      <SelectItem key={r.code} value={r.code}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-slate-600">Remarks</Label>
                <Input
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value.slice(0, 100))}
                  placeholder="e.g. Wrong rate entered"
                  className="no-uppercase h-9"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={busy}>
                Keep IRN
              </Button>
              <Button className="bg-red-600 text-white hover:bg-red-700" onClick={() => void cancel()} disabled={busy}>
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Cancel IRN
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (cancelled) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-500"
        title={`Cancelled IRN ${note.irn}`}
      >
        <XCircle className="h-3 w-3" />
        IRN cancelled
      </span>
    );
  }

  const irnWindow = irnReportingWindow(note.date);
  const failed = note.status === "failed" && !!note.error;
  return (
    <div className="flex flex-col items-start gap-0.5">
      <Button
        variant="outline"
        size="sm"
        className={cn(
          "h-7 gap-1 px-2 text-xs font-semibold",
          failed ? "border-red-200 text-red-700 hover:bg-red-50" : "border-sky-200 text-sky-800 hover:bg-sky-50",
        )}
        onClick={() => void generate()}
        disabled={busy}
        title={failed ? `Last try failed: ${note.error}` : `Get the IRN for this ${word}`}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : failed ? <AlertTriangle className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
        {failed ? "Retry IRN" : "Get IRN"}
      </Button>
      {irnWindow ? (
        <span
          className={cn(
            "text-[11px] tabular-nums",
            irnWindow.late ? "font-semibold text-red-600" : irnWindow.daysLeft <= 7 ? "font-medium text-amber-700" : "text-slate-400",
          )}
          title="Shops with turnover of ₹10 crore or more must report a note to the IRP within 30 days of its date."
        >
          {irnWindow.late
            ? "Over 30 days"
            : irnWindow.daysLeft === 0
              ? "Last day today"
              : `${irnWindow.daysLeft} day${irnWindow.daysLeft === 1 ? "" : "s"} left · by ${ddmm(irnWindow.lastDay)}`}
        </span>
      ) : null}
    </div>
  );
}
