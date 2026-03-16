import * as React from "react";
import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

interface CalculatorInputProps {
  value: number | string;
  onChange: (value: number) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

const hasOperator = (val: string) => /[+\-*/%(]/.test(val.replace(/^-/, ""));

const evaluateChained = (expr: string): number | null => {
  const tokens = expr.match(/[\d.]+%?|[+\-*/]/g);
  if (!tokens) return null;
  let result = parseFloat(tokens[0]);
  if (isNaN(result)) return null;
  let i = 1;
  while (i < tokens.length) {
    const op = tokens[i];
    const operand = tokens[i + 1];
    if (!operand) break;
    if (operand.endsWith("%")) {
      const pct = parseFloat(operand) / 100;
      if (isNaN(pct)) return null;
      if (op === "+") result *= 1 + pct;
      else if (op === "-") result *= 1 - pct;
      else if (op === "*") result *= pct;
      else if (op === "/") result /= pct;
    } else {
      const num = parseFloat(operand);
      if (isNaN(num)) return null;
      if (op === "+") result += num;
      else if (op === "-") result -= num;
      else if (op === "*") result *= num;
      else if (op === "/") result /= num;
    }
    i += 2;
  }
  return isFinite(result) ? result : null;
};

export const calculateExpression = (expr: string): number | null => {
  try {
    const s = expr.trim();
    if (!s) return null;
    if (!hasOperator(s)) {
      const n = parseFloat(s);
      return isFinite(n) ? n : null;
    }
    return evaluateChained(s);
  } catch {
    return null;
  }
};

const CalculatorInput = React.forwardRef<HTMLInputElement, CalculatorInputProps>(
  ({ value, onChange, placeholder, className, disabled, id, onKeyDown }, ref) => {
    const [displayValue, setDisplayValue] = useState(String(value ?? ""));
    const [isExpr, setIsExpr] = useState(false);
    const lastCommitted = useRef(String(value ?? ""));

    useEffect(() => {
      const incoming = String(value ?? "");
      if (!isExpr && incoming !== displayValue) {
        setDisplayValue(incoming);
        lastCommitted.current = incoming;
      }
    }, [value]);

    const resolve = useCallback(() => {
      if (!isExpr) return;
      const result = calculateExpression(displayValue);
      if (result !== null) {
        const rounded = Math.round(result * 100) / 100;
        setDisplayValue(String(rounded));
        setIsExpr(false);
        lastCommitted.current = String(rounded);
        onChange(rounded);
      }
    }, [displayValue, isExpr, onChange]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setDisplayValue(raw);
      setIsExpr(hasOperator(raw));
      if (!hasOperator(raw)) {
        const n = parseFloat(raw);
        if (raw === "") onChange(0);
        else if (!isNaN(n)) onChange(n);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if ((e.key === "Enter" || e.key === "Tab") && isExpr) {
        resolve();
      }
      if (e.key === "Escape" && isExpr) {
        setDisplayValue(lastCommitted.current);
        setIsExpr(false);
      }
      onKeyDown?.(e);
    };

    const preview = isExpr ? calculateExpression(displayValue) : null;

    return (
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          onBlur={resolve}
          onKeyDown={handleKeyDown}
          onWheel={(e) => (e.target as HTMLInputElement).blur()}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "flex h-11 w-full rounded-md border border-input bg-card px-4 py-2 text-[15px] font-medium text-card-foreground ring-offset-background placeholder:text-muted-foreground placeholder:font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
            isExpr && "border-l-4 border-l-primary",
            className,
          )}
        />
        {isExpr && (
          <div className="absolute -bottom-6 left-0 text-xs text-primary bg-primary/10 px-2 py-0.5 rounded shadow-sm border border-primary/20 z-50 whitespace-nowrap">
            = {preview !== null ? preview.toFixed(2) : "Error"}
          </div>
        )}
      </div>
    );
  }
);

CalculatorInput.displayName = "CalculatorInput";

export { CalculatorInput };
