import { memo, useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { resolveSrAdjustOnBlur, srAdjustTyped } from "./posSrAdjust";

function formatINR2(value: number): string {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : 0;
  return safe.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type PosPendingSrCredit = { id: string; return_number: string; net_amount: number };
export type PosAdjustedSrCredit = {
  id: string;
  return_number: string;
  net_amount: number;
  linked_sale_id: string | null;
  linked_sale_number?: string;
};

export type PosSrAdjustFieldProps = {
  hasCustomer: boolean;
  saleReturnAdjust: number;
  /** Return saved from this bill's S/R dialog (exchange); 0 when none. */
  sameBillReturnGross: number;
  /** Customer's pending credit notes, summed. */
  availableSrCredit: number;
  maxSrAllowed: number;
  maxSrFromBill: number;
  isSameBillExchangeSr: boolean;
  exchangeRefundDue: number;
  exchangeSrApplied: number;
  pendingCredits: PosPendingSrCredit[];
  recentAdjustedCredits: PosAdjustedSrCredit[];
  /** Stable state setters. */
  setSaleReturnAdjust: (value: number) => void;
  setSameBillReturnGross: Dispatch<SetStateAction<number>>;
  setManualSrPrompt: (prompt: { requested: number; shortfall: number } | null) => void;
  /** Stable: cap to maxSrAllowed (warns unless silent) and set S/R. */
  onClampSaleReturnAdjust: (requested: number, opts?: { silent?: boolean }) => unknown;
  /** Stable: open the bill a credit note was adjusted in. */
  onOpenAdjustedBill: (saleId: string) => unknown;
};

/**
 * POS footer S/R Adj box: manual sale return / old credit-note adjust, the pending credit-note
 * list, "Use CN ₹…", the exchange refund line and the cap note. Moved out of POSSales.tsx
 * unchanged (Plan Phase 4, S4); the leave-the-box rules are resolveSrAdjustOnBlur.
 */
export const PosSrAdjustField = memo(function PosSrAdjustField({
  hasCustomer,
  saleReturnAdjust,
  sameBillReturnGross,
  availableSrCredit,
  maxSrAllowed,
  maxSrFromBill,
  isSameBillExchangeSr,
  exchangeRefundDue,
  exchangeSrApplied,
  pendingCredits,
  recentAdjustedCredits,
  setSaleReturnAdjust,
  setSameBillReturnGross,
  setManualSrPrompt,
  onClampSaleReturnAdjust,
  onOpenAdjustedBill,
}: PosSrAdjustFieldProps) {
  const [showCredits, setShowCredits] = useState(false);
  const cnLabel = hasCustomer && availableSrCredit > 0.005;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const typed = srAdjustTyped(e.target.value, hasCustomer, maxSrFromBill);
      if (!typed) return;
      if (typed.kind === "clear") {
        setSaleReturnAdjust(0);
        setSameBillReturnGross(0);
        return;
      }
      // Allow typing above bill; clamp on blur to maxSrAllowed (exchange vs pre-existing).
      setSaleReturnAdjust(typed.adjust);
      const raiseTo = typed.raiseGrossTo;
      if (raiseTo !== null) setSameBillReturnGross((prev) => Math.max(prev, raiseTo));
    },
    [hasCustomer, maxSrFromBill, setSaleReturnAdjust, setSameBillReturnGross],
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      const action = resolveSrAdjustOnBlur({
        requested: parseFloat(e.target.value) || 0,
        hasCustomer,
        sameBillReturnGross,
        maxSrFromBill,
        availableSrCredit,
      });
      if (action.kind === "clear") {
        setSaleReturnAdjust(0);
        setSameBillReturnGross(0);
        return;
      }
      if (action.kind === "exchange") {
        setSameBillReturnGross((prev) => Math.max(prev, action.amount));
        setSaleReturnAdjust(action.amount);
        return;
      }
      if (action.capWarning) {
        toast.warning(action.capWarning);
        setSaleReturnAdjust(action.forBill);
      }
      // Customer's old return that was never entered (old CN balance / other shop):
      // record it now (amount-only sale return + credit note), then it is used here.
      if (action.prompt) {
        setManualSrPrompt(action.prompt);
        return;
      }
      onClampSaleReturnAdjust(action.forBill);
    },
    [
      hasCustomer,
      sameBillReturnGross,
      maxSrFromBill,
      availableSrCredit,
      setSaleReturnAdjust,
      setSameBillReturnGross,
      setManualSrPrompt,
      onClampSaleReturnAdjust,
    ],
  );

  return (
    <div className="text-center flex flex-col items-center min-h-[4.5rem]">
      <div
        className="text-sm text-white/90 uppercase font-bold mb-1 tracking-wide"
        title={
          cnLabel
            ? `S/R adjust: type an amount, or use this customer's pending credit note (₹${Math.round(availableSrCredit).toLocaleString("en-IN")})`
            : "S/R adjust: type the sale return / old credit note amount to adjust on this bill"
        }
      >
        S/R Adj{cnLabel ? ` · CN ₹${Math.round(availableSrCredit).toLocaleString("en-IN")}` : ""}
      </div>
      <div className="flex items-center h-10">
        <Input
          type="number"
          className="w-24 h-10 bg-white text-foreground text-center text-lg font-semibold border-0 rounded-md"
          value={saleReturnAdjust || ""}
          placeholder="0"
          // No HTML max on exchange — over-bill S/R is intentional (Mix refund).
          max={isSameBillExchangeSr ? undefined : maxSrAllowed > 0 ? maxSrAllowed : undefined}
          min={0}
          onChange={handleChange}
          step="0.01"
          onBlur={handleBlur}
        />
        {hasCustomer && pendingCredits.length > 0 && (
          <Popover open={showCredits} onOpenChange={setShowCredits}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-white/20 p-0 ml-1" aria-label="Pending credit notes">
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="center" side="top">
              <div className="text-xs font-semibold text-muted-foreground mb-1.5">Pending Credit Notes</div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {pendingCredits.map((sr) => (
                  <button
                    key={sr.id}
                    className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-accent text-sm text-left"
                    onClick={() => {
                      onClampSaleReturnAdjust(Number(sr.net_amount) || 0);
                      setShowCredits(false);
                    }}
                  >
                    <span className="font-medium truncate">{sr.return_number || "S/R"}</span>
                    <Badge variant="secondary" className="ml-2 shrink-0">₹{formatINR2(sr.net_amount)}</Badge>
                  </button>
                ))}
                {pendingCredits.length === 0 && (
                  <div className="text-xs text-muted-foreground px-2 py-1">No pending credit notes</div>
                )}
              </div>
              {recentAdjustedCredits.length > 0 && (
                <>
                  <div className="h-px bg-border my-2" />
                  <div className="text-xs font-semibold text-muted-foreground mb-1.5">Recently Adjusted</div>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {recentAdjustedCredits.map((sr) => (
                      <div
                        key={`adj-${sr.id}`}
                        className="w-full flex items-center justify-between px-2 py-1.5 rounded text-sm text-left bg-muted/40 hover:bg-accent cursor-pointer transition-colors"
                        title={`Adjusted in invoice: ${sr.linked_sale_number || sr.linked_sale_id || "N/A"}`}
                        onClick={async () => {
                          if (!sr.linked_sale_id) return;
                          setShowCredits(false);
                          await onOpenAdjustedBill(sr.linked_sale_id);
                        }}
                      >
                        <span className="font-medium truncate">
                          {sr.return_number || "S/R"}{" "}
                          <span className="text-xs text-muted-foreground">
                            ({sr.linked_sale_number || "Invoice"})
                          </span>
                        </span>
                        <Badge variant="outline" className="ml-2 shrink-0">
                          ₹{formatINR2(sr.net_amount)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>
      {hasCustomer && availableSrCredit > 0.005 && saleReturnAdjust <= 0.005 && maxSrFromBill > 0.005 ? (
        <button
          type="button"
          className="mt-0.5 text-[11px] font-semibold px-2 py-0.5 rounded bg-white text-emerald-700 hover:bg-emerald-50"
          title="Use this customer's pending credit on this bill (type a smaller amount for part use)"
          onClick={() => onClampSaleReturnAdjust(availableSrCredit, { silent: true })}
        >
          Use CN ₹{Math.round(Math.min(availableSrCredit, maxSrFromBill)).toLocaleString("en-IN")}
        </button>
      ) : exchangeRefundDue > 0.01 ? (
        <div className="text-[10px] text-orange-200 mt-0.5 max-w-[11rem] leading-tight">
          Return ₹{Math.round(saleReturnAdjust)} · Applied ₹{Math.round(exchangeSrApplied)} · Refund due ₹{Math.round(exchangeRefundDue)}
        </div>
      ) : (
        !isSameBillExchangeSr &&
        (saleReturnAdjust > maxSrAllowed + 0.01 ||
          (maxSrAllowed > 0 && availableSrCredit > maxSrFromBill + 0.01)) && (
          <div className="text-[10px] text-amber-200 mt-0.5 max-w-[9rem] leading-tight">
            Only ₹{maxSrAllowed.toLocaleString("en-IN", { maximumFractionDigits: 0 })} of credit can be applied to this bill
          </div>
        )
      )}
    </div>
  );
});
