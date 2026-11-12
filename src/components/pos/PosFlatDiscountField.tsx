import { memo, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PosFlatDiscountMode } from "@/lib/posBilling/types";
import { maxCombinedDiscountForGross } from "@/utils/saleSettlement";
import { POS_PLAIN_NUMBER_CLASS, posPlainNumberProps } from "./posPlainNumber";
import { flatDiscountCapMessage, parseFlatDiscountTyped, resolveFlatDiscountOnBlur } from "./posFlatDiscount";

export type PosFlatDiscountFieldProps = {
  mode: PosFlatDiscountMode;
  value: number;
  maxFlatDiscountForGross: number;
  /** Line + flat discount hit the bill cap. */
  flatDiscountCapped: boolean;
  /** Pre-discount MRP total of the cart. */
  mrp: number;
  saleReturnAdjust: number;
  /** Stable setter (useState / usePosBilling). */
  onModeChange: (mode: PosFlatDiscountMode) => void;
  /** While typing. Stable (usePosBilling.setFlatDiscountValue). */
  onValueChange: (value: number) => void;
  /** On leaving the box, after the cap. Stable (usePosBilling.handleFlatDiscountValueChange). */
  onValueCommit: (value: number) => void;
};

/**
 * POS footer Flat Disc box with its %/₹ toggle and the "Only ₹… discount" note. Moved out of
 * POSSales.tsx unchanged (Plan Phase 4, S4). memo: redrawn only when these figures change.
 */
export const PosFlatDiscountField = memo(function PosFlatDiscountField({
  mode,
  value,
  maxFlatDiscountForGross,
  flatDiscountCapped,
  mrp,
  saleReturnAdjust,
  onModeChange,
  onValueChange,
  onValueCommit,
}: PosFlatDiscountFieldProps) {
  const handleBlur = useCallback(() => {
    const { next, warning } = resolveFlatDiscountOnBlur({
      value,
      mode,
      maxFlatDiscountForGross,
      flatDiscountCapped,
      mrp,
      saleReturnAdjust,
    });
    if (warning) toast.warning(warning);
    onValueCommit(next);
  }, [value, mode, maxFlatDiscountForGross, flatDiscountCapped, mrp, saleReturnAdjust, onValueCommit]);

  return (
    <div className="text-center flex flex-col items-center min-h-[4.5rem]">
      <div className="text-sm text-white/90 uppercase font-bold mb-1 tracking-wide">Flat Disc</div>
      <div className="flex items-center h-10">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="bg-white/20 text-white px-2 py-1 text-base rounded-l-md h-10 hover:bg-white/30 border-0 font-bold min-w-[30px]"
          onClick={(e) => {
            e.preventDefault();
            onModeChange(mode === "percent" ? "amount" : "percent");
          }}
        >
          {mode === "percent" ? "%" : "₹"}
        </Button>
        <Input
          type="number"
          {...posPlainNumberProps}
          className={`w-24 h-10 bg-white text-foreground text-center text-lg font-semibold rounded-l-none border-0 ${POS_PLAIN_NUMBER_CLASS}`}
          value={value === 0 ? "" : String(value)}
          placeholder=""
          step="1"
          min={0}
          max={mode === "amount" ? maxFlatDiscountForGross : undefined}
          onChange={(e) => {
            const next = parseFlatDiscountTyped(e.target.value);
            if (next !== null) onValueChange(next);
          }}
          onBlur={handleBlur}
        />
      </div>
      {flatDiscountCapped && (
        <div className="text-[10px] text-amber-200 mt-0.5 max-w-[9rem] leading-tight">
          {flatDiscountCapMessage(maxCombinedDiscountForGross(mrp))}
        </div>
      )}
    </div>
  );
});
