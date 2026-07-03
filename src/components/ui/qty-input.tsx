import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { isDecimalUOM } from "@/constants/uom";
import {
  clampQty,
  DECIMAL_QTY_PATTERN,
  formatQtyForDisplay,
  INTEGER_QTY_PATTERN,
  isPartialQtyInput,
  minQtyForUom,
  parseQtyValue,
} from "@/utils/qtyInput";

interface QtyInputProps {
  value: number;
  uom?: string | null;
  onChange: (value: number) => void;
  className?: string;
  id?: string;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  selectOnFocus?: boolean;
}

const QtyInput = React.forwardRef<HTMLInputElement, QtyInputProps>(
  ({ value, uom, onChange, className, id, onFocus, selectOnFocus = true }, ref) => {
    const [displayValue, setDisplayValue] = useState(() => formatQtyForDisplay(value, uom));
    const isFocusedRef = useRef(false);

    useEffect(() => {
      if (!isFocusedRef.current) {
        setDisplayValue(formatQtyForDisplay(value, uom));
      }
    }, [value, uom]);

    const commitValue = (raw: string) => {
      const parsed = parseQtyValue(raw, uom);
      const next = clampQty(parsed ?? minQtyForUom(uom), uom);
      setDisplayValue(formatQtyForDisplay(next, uom));
      onChange(next);
    };

    return (
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode={isDecimalUOM(uom) ? "decimal" : "numeric"}
        value={displayValue}
        onFocus={(e) => {
          isFocusedRef.current = true;
          if (selectOnFocus) e.target.select();
          onFocus?.(e);
        }}
        onBlur={() => {
          isFocusedRef.current = false;
          commitValue(displayValue);
        }}
        onChange={(e) => {
          const raw = e.target.value;
          const pattern = isDecimalUOM(uom) ? DECIMAL_QTY_PATTERN : INTEGER_QTY_PATTERN;
          if (!pattern.test(raw)) return;

          setDisplayValue(raw);
          if (!isPartialQtyInput(raw, uom)) {
            const parsed = parseQtyValue(raw, uom);
            if (parsed !== null && parsed >= minQtyForUom(uom)) {
              onChange(parsed);
            }
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        onWheel={(e) => (e.target as HTMLInputElement).blur()}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
          className,
        )}
      />
    );
  },
);

QtyInput.displayName = "QtyInput";

export { QtyInput };
