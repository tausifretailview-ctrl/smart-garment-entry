import { ChevronLeft, ChevronRight, Loader2, Plus, SkipBack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { purchaseBillNavDisabled } from "@/utils/purchaseBillNav";

export type PurchaseEntryHeaderProps = {
  /** Horizontal padding class shared by the page's sections. */
  sectionX: string;
  isEditMode: boolean;
  softwareBillNo: string;
  /** Position of the open bill in the list (0 = newest), or null. */
  navIndex: number | null;
  /** Bills in the list; null while not loaded. */
  billCount: number | null;
  isLoadingNavBill: boolean;
  onBack: () => void;
  onNew: () => void;
  onLast: () => void;
  onPrevious: () => void;
  onNext: () => void;
  /** "Last:" strip (new bill with lines): the previous saved bill, or null to hide. */
  lastBill: { software_bill_no: string; supplier_invoice_no?: string | null } | null;
  /** "Restoring your bill…" strip. */
  showRestoring: boolean;
};

/**
 * Purchase Entry desktop header: Dashboard, title, bill badge, "n of m", New and the Last /
 * Previous / Next bill buttons, plus the "Last:" and "Restoring your bill…" strips. Moved out
 * of PurchaseEntry.tsx unchanged (Plan Phase 4, S4).
 */
export function PurchaseEntryHeader({
  sectionX,
  isEditMode,
  softwareBillNo,
  navIndex,
  billCount,
  isLoadingNavBill,
  onBack,
  onNew,
  onLast,
  onPrevious,
  onNext,
  lastBill,
  showRestoring,
}: PurchaseEntryHeaderProps) {
  const off = purchaseBillNavDisabled(isLoadingNavBill, navIndex, billCount);
  const navButton = "h-8 text-white hover:text-white hover:bg-white/20 border border-white/30 text-xs gap-1.5 w-8 p-0";
  return (
    <header className="bg-gradient-to-r from-slate-900 to-slate-800 shrink-0 flex flex-col shadow-[0_2px_12px_rgba(0,0,0,.35)] relative z-50 border-b-2 border-green-500/50">
      <div className={cn("entry-page-header-row h-[52px] flex items-center gap-2", sectionX)}>
        <div className="entry-page-header-leading flex items-center gap-2 sm:gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-8 shrink-0 text-white/70 hover:text-white hover:bg-white/10 border border-white/15 text-xs gap-1.5"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Button>
          <div className="w-px h-6 bg-white/15 shrink-0" />

          <span className="text-white font-bold text-[15px] whitespace-nowrap hidden md:inline">
            {isEditMode ? "Edit Purchase Bill" : "Purchase Entry"}
          </span>

          {(softwareBillNo || !isEditMode) && (
            <span
              className={cn(
                "text-white font-mono text-[11px] font-bold px-3 py-1 rounded-md whitespace-nowrap shrink-0",
                isEditMode ? "bg-amber-600" : "bg-green-600",
              )}
              title={isEditMode ? "Editing a saved bill. Click New for the next supplier bill." : undefined}
            >
              {isEditMode ? `EDITING ${softwareBillNo}` : softwareBillNo || "NEW"}
            </span>
          )}
          {navIndex !== null && billCount !== null && (
            <span className="text-white/50 text-xs hidden lg:inline shrink-0">
              {navIndex + 1} of {billCount}
            </span>
          )}
          {isLoadingNavBill && <Loader2 className="h-4 w-4 animate-spin text-white/60 shrink-0" />}
        </div>

        <div className="entry-page-header-actions flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onNew}
            className="h-8 text-white hover:text-white hover:bg-white/20 border border-white/30 text-xs gap-1 px-2 sm:px-2.5"
            title="New Bill"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">New</span>
          </Button>
          <div className="w-px h-6 bg-white/15 mx-0.5" />
          <Button variant="ghost" size="sm" onClick={onLast} disabled={off.last} className={navButton} title="Last Record">
            <SkipBack className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onPrevious} disabled={off.previous} className={navButton} title="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onNext} disabled={off.next} className={navButton} title="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {lastBill && (
        <div className={cn("h-[34px] bg-slate-800/80 border-t border-white/10 flex items-center gap-2 text-[12px] overflow-x-auto", sectionX)}>
          <span className="text-white/50 shrink-0">Last:</span>
          <span className="text-green-300 font-mono font-bold text-[11px] shrink-0">{lastBill.software_bill_no}</span>
          {lastBill.supplier_invoice_no && (
            <>
              <span className="text-white/25">|</span>
              <span className="text-white/50 shrink-0">Sup Inv:</span>
              <span className="text-green-300 font-mono font-bold text-[11px] shrink-0">{lastBill.supplier_invoice_no}</span>
            </>
          )}
        </div>
      )}
      {showRestoring && (
        <div className={cn("h-[34px] bg-amber-500/20 border-t border-amber-400/40 flex items-center gap-2 text-[12px]", sectionX)}>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-200 shrink-0" />
          <span className="text-amber-100 font-medium">Restoring your bill…</span>
        </div>
      )}
    </header>
  );
}
