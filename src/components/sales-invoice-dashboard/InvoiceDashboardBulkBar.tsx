import { Check, Download, Loader2, MessageCircle, Printer, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface InvoiceDashboardBulkBarProps {
  selectedCount: number;
  selectedTotal: number;
  busyAction: string | null;
  progressLabel?: string | null;
  onSendReminder: () => void;
  onPrint: () => void;
  onExport: () => void;
  onMarkPaid: () => void;
  onClear: () => void;
}

export function InvoiceDashboardBulkBar({
  selectedCount,
  selectedTotal,
  busyAction,
  progressLabel,
  onSendReminder,
  onPrint,
  onExport,
  onMarkPaid,
  onClear,
}: InvoiceDashboardBulkBarProps) {
  if (selectedCount === 0) return null;

  const fmt = (n: number) =>
    `₹${Math.round(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  const actionBtn =
    "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-semibold text-white bg-white/10 border border-white/15 hover:bg-white/16 transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-3"
      role="region"
      aria-label="Bulk invoice actions"
    >
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-[10px] bg-[var(--erp-chrome)] text-white shadow-[0_14px_36px_rgba(16,36,63,0.32)] px-3 py-2 max-w-full overflow-x-auto">
        <span className="text-[13px] font-semibold whitespace-nowrap mr-1">
          <span className="text-[#8ab4ff]">{selectedCount}</span> selected · {fmt(selectedTotal)}
        </span>
        {progressLabel && (
          <span className="text-[11px] text-white/70 whitespace-nowrap mr-1">{progressLabel}</span>
        )}
        <span className="w-px h-6 bg-white/15 mx-0.5 shrink-0" aria-hidden />
        <button
          type="button"
          className={cn(actionBtn, "bg-[#1f9d5522] border-[#2fbf6f55] hover:bg-[#2fbf6f33]")}
          onClick={onSendReminder}
          disabled={!!busyAction}
        >
          {busyAction === "reminder" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MessageCircle className="h-3.5 w-3.5" />
          )}
          Send Reminder
        </button>
        <button type="button" className={actionBtn} onClick={onPrint} disabled={!!busyAction}>
          {busyAction === "print" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Printer className="h-3.5 w-3.5" />
          )}
          Print
        </button>
        <button type="button" className={actionBtn} onClick={onExport} disabled={!!busyAction}>
          {busyAction === "export" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Export
        </button>
        <button type="button" className={actionBtn} onClick={onMarkPaid} disabled={!!busyAction}>
          {busyAction === "markPaid" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Mark Paid
        </button>
        <span className="w-px h-6 bg-white/15 mx-0.5 shrink-0" aria-hidden />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-[var(--erp-chrome-ink)] hover:text-white hover:bg-white/10"
          onClick={onClear}
          disabled={!!busyAction}
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Clear
        </Button>
      </div>
    </div>
  );
}
