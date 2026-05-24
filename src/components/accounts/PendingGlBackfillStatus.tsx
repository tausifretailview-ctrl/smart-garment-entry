import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import type { PendingGlBackfillCounts } from "@/utils/accounting/historicalMigration";
import { cn } from "@/lib/utils";

type PendingGlBackfillStatusProps = {
  counts?: PendingGlBackfillCounts | null;
  loading?: boolean;
  onFailedClick?: () => void;
};

function CountChip({
  label,
  value,
  tone = "default",
  onClick,
}: {
  label: string;
  value: number;
  tone?: "default" | "warn" | "muted" | "ok";
  onClick?: () => void;
}) {
  const toneClass =
    tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "ok"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : tone === "muted"
          ? "border-slate-200 bg-slate-50 text-slate-600"
          : "border-slate-200 bg-white text-slate-800";

  const inner = (
    <>
      <span className="text-[10px] uppercase tracking-wide opacity-80">{label}</span>
      <span className="text-sm font-bold tabular-nums leading-none">{value}</span>
    </>
  );

  if (onClick && value > 0) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex flex-col items-start gap-0.5 rounded-lg border px-2 py-1 min-w-[4.5rem] hover:opacity-90 transition-opacity",
          toneClass,
        )}
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex flex-col items-start gap-0.5 rounded-lg border px-2 py-1 min-w-[4.5rem]",
        toneClass,
      )}
    >
      {inner}
    </div>
  );
}

export function PendingGlBackfillStatus({
  counts,
  loading,
  onFailedClick,
}: PendingGlBackfillStatusProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading pending GL counts…
      </div>
    );
  }

  if (!counts) return null;

  const allClear = counts.totalPending === 0 && counts.totalFailed === 0;

  return (
    <div className="space-y-2 border-t border-slate-100 pt-2 mt-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-600">Pending GL post:</span>
        {counts.accountingEngineEnabled ? (
          <Badge variant="outline" className="text-[10px] h-5 border-blue-200 text-blue-700 bg-blue-50">
            Engine on
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] h-5 border-slate-300 text-slate-600">
            Engine off — vouchers skipped
          </Badge>
        )}
        {allClear && (
          <Badge className="text-[10px] h-5 bg-emerald-600 hover:bg-emerald-600">GL up to date</Badge>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <CountChip label="Sales" value={counts.pendingSales} tone={counts.pendingSales ? "warn" : "muted"} />
        <CountChip label="Purchases" value={counts.pendingPurchases} tone={counts.pendingPurchases ? "warn" : "muted"} />
        <CountChip label="Sale ret." value={counts.pendingSaleReturns} tone={counts.pendingSaleReturns ? "warn" : "muted"} />
        <CountChip
          label="Purch. ret."
          value={counts.pendingPurchaseReturns}
          tone={counts.pendingPurchaseReturns ? "warn" : "muted"}
        />
        <CountChip
          label="Vouchers"
          value={counts.vouchersWithoutJournal}
          tone={counts.vouchersWithoutJournal ? "warn" : "muted"}
        />
        <CountChip
          label="Failed"
          value={counts.totalFailed}
          tone={counts.totalFailed ? "warn" : "muted"}
          onClick={onFailedClick}
        />
        <CountChip
          label="Total"
          value={counts.totalPending}
          tone={counts.totalPending === 0 ? "ok" : "warn"}
        />
      </div>
    </div>
  );
}
