import { memo, useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type PosRoundOffFieldProps = {
  roundOff: number;
  /** Set by hand: shows "(M)" and the reset button. */
  isManualRoundOff: boolean;
  /** Stable (usePosBilling.handleRoundOffChange); snaps to a whole-rupee bill. */
  onRoundOffChange: (value: number) => void;
  /** Stable (usePosBilling.handleResetRoundOff): back to auto round-off. */
  onReset: () => void;
};

/**
 * POS footer Round box with "(M)" and the reset-to-auto button. Moved out of POSSales.tsx
 * unchanged (Plan Phase 4, S4), together with the text kept while the cashier types (the stored
 * round-off is snapped to a whole-rupee bill, so "-0." must not be replaced mid-typing).
 */
export const PosRoundOffField = memo(function PosRoundOffField({
  roundOff,
  isManualRoundOff,
  onRoundOffChange,
  onReset,
}: PosRoundOffFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => {
    if (!isManualRoundOff) setDraft(null);
  }, [isManualRoundOff]);

  return (
    <div className="text-center flex flex-col items-center min-h-[4.5rem]">
      <div className="text-sm text-white/90 uppercase font-bold mb-1 tracking-wide">
        Round{isManualRoundOff && <span className="text-yellow-300 normal-case"> (M)</span>}
      </div>
      <div className="flex items-center gap-0.5 h-10">
        {isManualRoundOff && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="bg-white/20 text-white px-1.5 py-1 text-xs rounded h-7 hover:bg-white/30"
                  onClick={onReset}
                >
                  <RotateCcw className="h-2.5 w-2.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Reset to auto round-off</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <Input
          type="number"
          className={`w-24 h-10 text-center text-lg font-semibold border-0 rounded-md ${roundOff >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
          value={draft ?? (roundOff || "")}
          placeholder="0"
          onChange={(e) => {
            setDraft(e.target.value);
            onRoundOffChange(parseFloat(e.target.value) || 0);
          }}
          onBlur={() => setDraft(null)}
          step="1"
        />
      </div>
    </div>
  );
});
