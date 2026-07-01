import { format } from "date-fns";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { PosDCPaymentMethod, PosDcLastBillHint } from "@/hooks/usePosDeliveryChallan";

type PosDcFooterProps = {
  totalQty: number;
  grossAmount: number;
  subTotal: number;
  flatDiscountAmount: number;
  srAdjust: number;
  roundOff: number;
  netAmount: number;
  currentDateTime: Date;
  paymentMethod: PosDCPaymentMethod;
  flatDiscountMode: "percent" | "amount";
  flatDiscountValue: number;
  onFlatDiscountModeToggle: () => void;
  onFlatDiscountValueChange: (value: number) => void;
  onSrAdjustChange: (value: number) => void;
  onRoundOffChange: (value: number) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  lastBillHint: PosDcLastBillHint;
};

export function PosDcFooter({
  totalQty,
  grossAmount,
  subTotal,
  flatDiscountAmount,
  srAdjust,
  roundOff,
  netAmount,
  currentDateTime,
  paymentMethod,
  flatDiscountMode,
  flatDiscountValue,
  onFlatDiscountModeToggle,
  onFlatDiscountValueChange,
  onSrAdjustChange,
  onRoundOffChange,
  notes,
  onNotesChange,
  lastBillHint,
}: PosDcFooterProps) {
  const lineDiscount = Math.max(0, grossAmount - subTotal);
  const totalDiscountDisplay = lineDiscount + flatDiscountAmount + (srAdjust || 0);
  const savingsVisible = grossAmount > subTotal || totalDiscountDisplay > 0;

  return (
    <div className="pos-dc-footer w-full flex flex-col shrink-0">
      <div className="pos-dc-notes shrink-0 border-t border-border/60 bg-card">
        <div className="p-2 bg-muted/30">
          <div className="flex items-center gap-3">
            <Label className="text-sm font-medium whitespace-nowrap">
              <FileText className="h-4 w-4 inline mr-1" />
              Note:
            </Label>
            <Input
              placeholder="Add note (e.g., Pico Fall Details, Alterations, etc.)"
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              className="flex-1 h-9 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="w-full bg-gradient-to-r from-cyan-600 to-teal-600 text-white border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <div className="flex min-h-[52px] flex-nowrap items-center px-4 md:px-6 py-3 gap-0 border-b border-white/10 overflow-x-auto">
          <div className="text-center px-3">
            <div className="text-xl font-bold leading-tight tabular-nums">{totalQty}</div>
            <div className="text-[11px] text-white/70 uppercase tracking-wider font-semibold">Qty</div>
          </div>

          <div className="w-px h-8 bg-white/20 shrink-0" />

          <div className="text-center px-3">
            <div className="text-lg font-bold leading-tight tabular-nums">₹{formatINR2(grossAmount)}</div>
            <div className="text-[11px] text-white/70 uppercase font-semibold">MRP Total</div>
          </div>

          {savingsVisible && (
            <>
              <div className="w-px h-8 bg-white/20 shrink-0" />
              <div className="text-center bg-green-500/90 rounded-md py-1.5 px-3 mx-2 shrink-0">
                <div className="text-lg font-bold leading-tight tabular-nums">
                  ₹{formatINR2(totalDiscountDisplay)}
                  {grossAmount > 0 ? ` · Saves ${((totalDiscountDisplay / grossAmount) * 100).toFixed(0)}%` : ""}
                </div>
                <div className="text-[11px] font-semibold uppercase">Savings</div>
              </div>
            </>
          )}

          <div className="w-px h-8 bg-white/20 shrink-0" />

          <div className="text-center px-3">
            <div className="text-lg font-bold leading-tight tabular-nums">₹0</div>
            <div className="text-[11px] text-white/70 uppercase font-semibold">Charges</div>
          </div>

          <div className="w-px h-8 bg-white/20 shrink-0" />

          <div className="text-center px-3">
            <div className="text-xl font-extrabold leading-tight tabular-nums">₹{formatINR2(totalDiscountDisplay)}</div>
            <div className="text-xs text-white/90 uppercase font-bold tracking-wide">Discount</div>
          </div>

          <div className="w-px h-8 bg-white/20 shrink-0" />

          <div className="text-center px-2 shrink-0 min-w-[7.5rem]">
            <div className="text-[11px] text-white/70 uppercase tracking-wider font-semibold">Time</div>
            <div className="text-sm font-extrabold text-white tabular-nums leading-tight mt-0.5 whitespace-nowrap">
              {format(currentDateTime, "HH:mm:ss")}
            </div>
          </div>

          <div className="flex-1 hidden lg:flex items-center justify-center">
            <div className="text-center px-3">
              <div className="text-[11px] text-white/70 uppercase tracking-wider font-semibold">Payment Mode</div>
              <div className="text-base font-extrabold text-white mt-0.5">{PAYMENT_LABELS[paymentMethod]}</div>
            </div>
          </div>

          <div className="flex items-end gap-3 flex-nowrap justify-end shrink-0 min-w-0 ml-auto">
            <div className="text-center">
              <div className="text-sm text-white/90 uppercase font-bold mb-1 tracking-wide">Flat Disc</div>
              <div className="flex items-center">
                <Button
                  size="sm"
                  variant="ghost"
                  className="bg-white/20 text-white px-2 py-1 text-base rounded-l-md h-10 hover:bg-white/30 border-0 font-bold min-w-[30px]"
                  onClick={onFlatDiscountModeToggle}
                  type="button"
                >
                  {flatDiscountMode === "percent" ? "%" : "₹"}
                </Button>
                <Input
                  type="number"
                  className="w-24 h-10 bg-white text-foreground text-center text-lg font-semibold rounded-l-none border-0"
                  value={flatDiscountValue === 0 ? "" : String(flatDiscountValue)}
                  placeholder="0"
                  step="1"
                  min={0}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "" || raw === "-") {
                      onFlatDiscountValueChange(0);
                      return;
                    }
                    const n = parseFloat(raw);
                    if (Number.isFinite(n)) onFlatDiscountValueChange(Math.round(n));
                  }}
                />
              </div>
            </div>

            <div className="text-center">
              <div className="text-sm text-white/90 uppercase font-bold mb-1 tracking-wide">S/R Adj</div>
              <Input
                type="number"
                className="w-24 h-10 bg-white text-foreground text-center text-lg font-semibold border-0 rounded-md"
                value={srAdjust || ""}
                placeholder="0"
                onChange={(e) => onSrAdjustChange(parseFloat(e.target.value) || 0)}
                step="0.01"
              />
            </div>

            <div className="text-center">
              <div className="text-sm text-white/90 uppercase font-bold mb-1 tracking-wide">Round</div>
              <Input
                type="number"
                className={cn(
                  "w-24 h-10 text-center text-lg font-semibold border-0 rounded-md",
                  roundOff >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700",
                )}
                value={roundOff || ""}
                placeholder="0"
                onChange={(e) => onRoundOffChange(parseFloat(e.target.value) || 0)}
                step="1"
              />
            </div>

            <div className="w-px h-8 bg-white/20 mx-1 shrink-0" />

            <div className="text-center shrink-0 min-w-[160px]">
              <div className="text-sm text-white/90 uppercase font-bold mb-1 tracking-wide">Net Amount</div>
              <div className="w-40 h-10 text-center text-xl font-extrabold border-0 rounded-md bg-white text-emerald-700 tabular-nums flex items-center justify-center mx-auto">
                ₹{formatINR2(netAmount)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="pos-dc-shortcuts hidden md:flex h-[52px] shrink-0 w-full flex-nowrap bg-slate-800 dark:bg-slate-950 text-white items-center gap-2 border-t border-slate-700/50 select-none px-2">
        <div
          className="flex shrink-0 items-center gap-3 px-3 py-1.5 rounded-md bg-slate-900/90 border border-slate-600/50 min-w-[min(100%,22rem)]"
          title="Last saved DC today"
        >
          <span className="text-xs uppercase tracking-wide text-slate-300 font-bold whitespace-nowrap">Last Bill</span>
          {lastBillHint ? (
            <>
              <span className="text-[15px] font-bold text-emerald-400 tabular-nums whitespace-nowrap">
                {lastBillHint.invoiceNumber}
              </span>
              <span className="text-sm text-slate-200 whitespace-nowrap">
                Qty <span className="text-[15px] font-bold text-white tabular-nums">{lastBillHint.qty}</span>
              </span>
              <span className="text-base font-extrabold text-amber-300 tabular-nums whitespace-nowrap">
                ₹{formatINR2(lastBillHint.amount)}
              </span>
            </>
          ) : (
            <span className="text-sm text-slate-500 whitespace-nowrap">No bill saved today</span>
          )}
        </div>

        <div className="w-px h-8 bg-slate-600 shrink-0" aria-hidden />

        <div className="flex flex-1 min-w-0 items-center justify-center gap-1 overflow-x-auto whitespace-nowrap">
          {[
            { key: "F1", label: "Cash" },
            { key: "F2", label: "UPI" },
            { key: "F3", label: "Card" },
            { key: "F4", label: "Credit" },
          ].map(({ key, label }) => (
            <div
              key={key}
              className="flex flex-col items-center justify-center px-3 py-1 rounded-md hover:bg-amber-600/20 cursor-default transition-colors min-w-[60px]"
            >
              <kbd className="text-[10px] font-mono text-amber-400/80 font-bold leading-tight">{key}</kbd>
              <span className="text-[13px] font-extrabold text-amber-400 leading-tight">{label}</span>
            </div>
          ))}

          <div className="w-px h-7 bg-slate-600 mx-1 shrink-0" />

          {[
            { key: "F5", label: "Return" },
            { key: "F8", label: "Report" },
            { key: "F11", label: "Stock" },
          ].map(({ key, label }) => (
            <div
              key={key}
              className="flex flex-col items-center justify-center px-3 py-1 rounded-md hover:bg-blue-600/20 cursor-default transition-colors min-w-[60px]"
            >
              <kbd className="text-[10px] font-mono text-blue-400/80 font-bold leading-tight">{key}</kbd>
              <span className="text-[13px] font-extrabold text-blue-400 leading-tight">{label}</span>
            </div>
          ))}

          <div className="w-px h-7 bg-slate-600 mx-1 shrink-0" />

          <div className="flex flex-col items-center justify-center px-3 py-1 rounded-md hover:bg-rose-600/20 cursor-default transition-colors min-w-[60px]">
            <kbd className="text-[10px] font-mono text-rose-400/80 font-bold leading-tight">ESC</kbd>
            <span className="text-[13px] font-extrabold text-rose-400 leading-tight">Clear</span>
          </div>
        </div>
      </div>
    </div>
  );
}
