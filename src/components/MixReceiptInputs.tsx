import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  MIX_RECEIPT_MODES,
  mixReceiptTotal,
  type MixReceiptAmounts,
  type MixReceiptMethod,
} from "@/utils/mixReceiptSplit";

type MixReceiptInputsProps = {
  amounts: MixReceiptAmounts;
  onEdit: (method: MixReceiptMethod, raw: string) => void;
  /** Amount the split must add up to. */
  target: number;
  className?: string;
  inputClassName?: string;
};

/** One compact row (Cash / UPI / Card / Bank) so the dialog keeps its size. */
export function MixReceiptInputs({ amounts, onEdit, target, className, inputClassName }: MixReceiptInputsProps) {
  const total = mixReceiptTotal(amounts);
  const diff = Math.round((target - total) * 100) / 100;
  return (
    <div className={cn("space-y-1", className)}>
      <div className="grid grid-cols-4 gap-2">
        {MIX_RECEIPT_MODES.map(({ method, label }) => (
          <div key={method} className="space-y-0.5">
            <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              placeholder="0"
              value={amounts[method]}
              onChange={(e) => onEdit(method, e.target.value)}
              className={cn("h-8 px-2 text-sm no-uppercase", inputClassName)}
            />
          </div>
        ))}
      </div>
      <p
        className={cn(
          "text-[11px] tabular-nums",
          Math.abs(diff) <= 0.5 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
        )}
      >
        Mix total ₹{total.toLocaleString("en-IN")}
        {Math.abs(diff) > 0.5 &&
          (diff > 0
            ? ` · ₹${diff.toLocaleString("en-IN")} still to split`
            : ` · ₹${Math.abs(diff).toLocaleString("en-IN")} more than amount`)}
      </p>
    </div>
  );
}
