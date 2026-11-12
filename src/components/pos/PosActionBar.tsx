import { memo } from "react";
import {
  Banknote,
  BookmarkPlus,
  Clock,
  CreditCard,
  FileText,
  Pause,
  Printer,
  RotateCcw,
  Smartphone,
  Wallet,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PosPayMethod = "cash" | "upi" | "card" | "pay_later";

export type PosActionBarProps = {
  hasItems: boolean;
  isSaving: boolean;
  heldCount: number;
  hasTodaysSales: boolean;
  /** Showing the newest of today's bills (the "Last" button is highlighted). */
  onLatestInvoice: boolean;
  hasSavedInvoice: boolean;
  onPay: (method: PosPayMethod) => void;
  onSaleReturn: () => void;
  onMix: () => void;
  onHold: () => void;
  onEstimate: () => void;
  onNew: () => void;
  onLast: () => void;
  onReprint: () => void;
  onAdvance: () => void;
  onClear: () => void;
};

/**
 * POS left action column (Cash F1 … Clear Esc). Moved out of POSSales.tsx unchanged
 * (Plan Phase 4, S4: split the largest screens); POSSales passes the flags and handlers.
 */
export const PosActionBar = memo(function PosActionBar({
  hasItems,
  isSaving,
  heldCount,
  hasTodaysSales,
  onLatestInvoice,
  hasSavedInvoice,
  onPay,
  onSaleReturn,
  onMix,
  onHold,
  onEstimate,
  onNew,
  onLast,
  onReprint,
  onAdvance,
  onClear,
}: PosActionBarProps) {
  return (
      <div className="w-[clamp(76px,6.4vw,96px)] self-stretch min-h-0 bg-slate-50 dark:bg-slate-900 border-r border-border/60 flex flex-col gap-1.5 p-1.5 z-30 relative overflow-y-auto shrink-0">
        {/* Buttons in sequence: Cash, UPI, Card, Credit, Mix, Hold, New, Last, Print, Clear, WhatsApp */}
        {/* flex-fill: the 13 buttons divide the column height so they always fit
            (no scroll, no manual browser zoom) on any screen — 1366×768 included.
            min-h floors + the column's overflow-y-auto guard very short screens. */}
        <div className="flex-1 min-h-0 flex flex-col gap-1.5">
          {/* 1. Cash F1 */}
          <Button
            onClick={() => onPay('cash')}
            disabled={!hasItems || isSaving}
            className="flex-[1.15] min-h-[38px] flex flex-col items-center justify-center gap-1 text-[clamp(10px,0.85vw,13px)] font-semibold relative w-full rounded-lg bg-green-500 hover:bg-green-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40"
            title="Cash Payment - Save & Print (F1)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[clamp(12px,1.4vh,16px)] px-1 text-[clamp(7px,0.6vw,9px)] leading-[clamp(12px,1.4vh,16px)] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">F1</Badge>
            <Banknote className="h-4 w-4" />
            <span>Cash</span>
          </Button>
        
          {/* 2. UPI F2 */}
          <Button
            onClick={() => onPay('upi')}
            disabled={!hasItems || isSaving}
            className="flex-[1.15] min-h-[38px] flex flex-col items-center justify-center gap-1 text-[clamp(10px,0.85vw,13px)] font-semibold relative w-full rounded-lg bg-purple-500 hover:bg-purple-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40"
            title="UPI Payment - Save & Print (F2)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[clamp(12px,1.4vh,16px)] px-1 text-[clamp(7px,0.6vw,9px)] leading-[clamp(12px,1.4vh,16px)] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">F2</Badge>
            <Smartphone className="h-4 w-4" />
            <span>UPI</span>
          </Button>
        
          {/* 3. Card F3 */}
          <Button
            onClick={() => onPay('card')}
            disabled={!hasItems || isSaving}
            className="flex-[1.15] min-h-[38px] flex flex-col items-center justify-center gap-1 text-[clamp(10px,0.85vw,13px)] font-semibold relative w-full rounded-lg bg-cyan-500 hover:bg-cyan-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40"
            title="Card Payment - Save & Print (F3)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[clamp(12px,1.4vh,16px)] px-1 text-[clamp(7px,0.6vw,9px)] leading-[clamp(12px,1.4vh,16px)] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">F3</Badge>
            <CreditCard className="h-4 w-4" />
            <span>Card</span>
          </Button>
        
          {/* 4. Credit F4 */}
          <Button
            onClick={() => onPay('pay_later')}
            disabled={!hasItems || isSaving}
            className="flex-[1.15] min-h-[38px] flex flex-col items-center justify-center gap-1 text-[clamp(10px,0.85vw,13px)] font-semibold relative w-full rounded-lg bg-orange-500 hover:bg-orange-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40"
            title="Credit - Pay Later (F4)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[clamp(12px,1.4vh,16px)] px-1 text-[clamp(7px,0.6vw,9px)] leading-[clamp(12px,1.4vh,16px)] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">F4</Badge>
            <Clock className="h-4 w-4" />
            <span>Credit</span>
          </Button>
        
          {/* 5. Sale Return F5 */}
          <Button
            onClick={onSaleReturn}
            className="flex-1 min-h-[34px] flex flex-col items-center justify-center gap-0.5 text-[clamp(9px,0.78vw,12px)] font-semibold relative w-full rounded-lg bg-red-500 hover:bg-red-600 active:scale-95 text-white shadow-sm transition-all duration-150"
            title="Sale Return (F5)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[clamp(12px,1.4vh,16px)] px-1 text-[clamp(7px,0.6vw,9px)] leading-[clamp(12px,1.4vh,16px)] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">F5</Badge>
            <RotateCcw className="h-4 w-4" />
            <span>S/R</span>
          </Button>
        
          {/* 6. Mix F6 */}
          <Button
            onClick={onMix}
            disabled={!hasItems || isSaving}
            className="flex-[1.15] min-h-[38px] flex flex-col items-center justify-center gap-1 text-[clamp(10px,0.85vw,13px)] font-semibold relative w-full rounded-lg bg-violet-500 hover:bg-violet-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40"
            title="Mix Payment - Save & Print (F6)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[clamp(12px,1.4vh,16px)] px-1 text-[clamp(7px,0.6vw,9px)] leading-[clamp(12px,1.4vh,16px)] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">F6</Badge>
            <Wallet className="h-4 w-4" />
            <span>Mix</span>
          </Button>
        
          {/* 7. Hold F7 */}
          <Button
            onClick={onHold}
            disabled={isSaving}
            className="flex-1 min-h-[34px] flex flex-col items-center justify-center gap-0.5 text-[clamp(9px,0.78vw,12px)] font-semibold relative w-full rounded-lg bg-amber-500 hover:bg-amber-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40"
            title="Hold Bill (F7)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[clamp(12px,1.4vh,16px)] px-1 text-[clamp(7px,0.6vw,9px)] leading-[clamp(12px,1.4vh,16px)] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">F7</Badge>
            {heldCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center z-10">
                {heldCount > 9 ? '9+' : heldCount}
              </span>
            )}
            <Pause className="h-4 w-4" />
            <span>Hold</span>
          </Button>
        
          {/* 9. Estimate F9 */}
          <Button
            onClick={onEstimate}
            disabled={!hasItems}
            className="flex-1 min-h-[34px] flex flex-col items-center justify-center gap-0.5 text-[clamp(9px,0.78vw,12px)] font-semibold relative w-full rounded-lg bg-sky-500 hover:bg-sky-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40"
            title="Print Estimate - No Save (F9)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[clamp(12px,1.4vh,16px)] px-1 text-[clamp(7px,0.6vw,9px)] leading-[clamp(12px,1.4vh,16px)] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">F9</Badge>
            <FileText className="h-4 w-4" />
            <span>Estimate</span>
          </Button>
        
          <Button
            onClick={onNew}
            className="flex-1 min-h-[34px] flex flex-col items-center justify-center gap-0.5 text-[clamp(9px,0.78vw,12px)] font-semibold w-full rounded-lg bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white shadow-sm transition-all duration-150"
            title="New Invoice"
          >
            <FileText className="h-4 w-4" />
            <span>New</span>
          </Button>
        
          {/* 8. Last - matches Dashboard "Total Bills" blue-500 */}
          <Button
            onClick={onLast}
            disabled={!hasTodaysSales}
            className={cn(
              "flex-1 min-h-[34px] flex flex-col items-center justify-center gap-0.5 text-[clamp(9px,0.78vw,12px)] font-semibold w-full rounded-lg bg-blue-500 hover:bg-blue-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40",
              hasTodaysSales && onLatestInvoice && "ring-2 ring-white/80 bg-blue-700 hover:bg-blue-700"
            )}
            title="Last Invoice"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Last</span>
          </Button>
        
          {/* 9. Print last saved invoice - never prints unsaved cart */}
          <Button
            onClick={onReprint}
            disabled={!hasSavedInvoice}
            className="flex-[1.15] min-h-[38px] flex flex-col items-center justify-center gap-1 text-[clamp(10px,0.85vw,13px)] font-semibold w-full rounded-lg bg-indigo-500 hover:bg-indigo-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40"
            title="Reprint Last Saved Invoice"
          >
            <Printer className="h-4 w-4" />
            <span>Reprint</span>
          </Button>
        
          {/* Advance Booking */}
          <Button
            onClick={onAdvance}
            className="flex-1 min-h-[34px] flex flex-col items-center justify-center gap-0.5 text-[clamp(9px,0.78vw,12px)] font-semibold w-full rounded-lg bg-purple-500 hover:bg-purple-600 active:scale-95 text-white shadow-sm transition-all duration-150"
            title="Advance Booking Dashboard"
          >
            <BookmarkPlus className="h-4 w-4" />
            <span>Advance</span>
          </Button>

          {/* 10. Clear - matches Dashboard "With Refunds" rose-500 */}
          <Button
            onClick={onClear}
            className="flex-1 min-h-[34px] flex flex-col items-center justify-center gap-0.5 text-[clamp(9px,0.78vw,12px)] font-semibold relative w-full rounded-lg bg-rose-500 hover:bg-rose-600 active:scale-95 text-white shadow-sm transition-all duration-150"
            title="Clear (Esc)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[clamp(12px,1.4vh,16px)] px-1 text-[clamp(7px,0.6vw,9px)] leading-[clamp(12px,1.4vh,16px)] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">ESC</Badge>
            <X className="h-4 w-4" />
            <span>Clear</span>
          </Button>
        
        </div>
      </div>
  );
});
