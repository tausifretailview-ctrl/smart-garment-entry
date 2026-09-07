/**
 * PosKeypad — the numeric keypad that replaces the line-edit drawer.
 * Path: src/components/mobile/premium/PosKeypad.tsx
 *
 * Pure UI: it owns only the typed buffer. Every committed value goes out
 * through onCommit(mode, value) so the caller keeps using the existing
 * billing hook (updateQty / updatePrice / updateDiscountPercent for POS,
 * setItems patch for purchase) — no billing math moves into this file.
 *
 * Mount it directly above the total/pay footer when a line is selected.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";

export type KeypadMode = "qty" | "price" | "disc";

const KEYS = ["1", "2", "3", "back", "4", "5", "6", "clear", "7", "8", "9", "00", ".", "0", "plus1", "ok"] as const;

export function PosKeypad({
  title,
  qty,
  price,
  discPercent,
  mode,
  onModeChange,
  onCommit,
  onClose,
  showDiscount = true,
  formatMoney,
}: {
  /** product name — shown truncated with the active field */
  title: string;
  qty: number;
  price: number;
  discPercent?: number;
  mode: KeypadMode;
  onModeChange: (m: KeypadMode) => void;
  /** value is a number; commit on every keystroke so the total tracks live */
  onCommit: (mode: KeypadMode, value: number) => void;
  onClose: () => void;
  showDiscount?: boolean;
  formatMoney: (n: number) => string;
}) {
  const [buffer, setBuffer] = useState("");

  const fieldLabel = mode === "qty" ? "quantity" : mode === "price" ? "unit price" : "line discount";

  const pick = (m: KeypadMode) => {
    setBuffer("");
    onModeChange(m);
  };

  const press = (key: string) => {
    if (key === "ok") {
      setBuffer("");
      onClose();
      return;
    }
    if (key === "plus1") {
      setBuffer("");
      onCommit("qty", qty + 1);
      return;
    }
    let next = buffer;
    if (key === "back") next = next.slice(0, -1);
    else if (key === "clear") next = "";
    else next = (next + key).slice(0, 7);
    setBuffer(next);
    const value = Number(next || 0);
    if (!Number.isFinite(value)) return;
    if (mode === "qty") onCommit("qty", next === "" ? 1 : Math.max(value, 0));
    else if (mode === "price") onCommit("price", value);
    else onCommit("disc", Math.min(value, 90));
  };

  const modes: Array<{ key: KeypadMode; label: string; value: string }> = [
    { key: "qty", label: "Qty", value: String(qty) },
    { key: "price", label: "Price", value: formatMoney(price) },
    ...(showDiscount ? [{ key: "disc" as KeypadMode, label: "Disc %", value: `${discPercent ?? 0}%` }] : []),
  ];

  return (
    <div className="ez shrink-0 border-t-2 border-[var(--ez-ink)] bg-[var(--ez-surface)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--ez-rule-thin)] px-3.5 py-2">
        <p className="min-w-0 truncate text-[11px] font-bold leading-[1.2]">
          {title} · {fieldLabel}
        </p>
        <button type="button" onClick={onClose} className="ez-btn-label text-[10px] text-[var(--ez-muted-2)]">
          Done
        </button>
      </div>

      <div className={cn("grid border-b border-[var(--ez-rule-thin)]", showDiscount ? "grid-cols-3" : "grid-cols-2")}>
        {modes.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => pick(m.key)}
            className={cn(
              "border-r border-[var(--ez-rule-thin)] px-3 py-2.5 text-left last:border-r-0",
              mode === m.key ? "bg-[var(--ez-accent)] text-white" : "bg-[var(--ez-surface)] text-[var(--ez-ink)]",
            )}
          >
            <p className="text-[9px] font-bold uppercase leading-none tracking-[0.12em]">{m.label}</p>
            <p className="num mt-1 text-[15px] font-extrabold leading-none">{m.value}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4">
        {KEYS.map((key) => {
          const label = key === "back" ? "⌫" : key === "clear" ? "C" : key === "plus1" ? "+1" : key === "ok" ? "OK" : key;
          const isOk = key === "ok";
          const isEdit = key === "back" || key === "clear";
          return (
            <button
              key={key}
              type="button"
              onClick={() => press(key)}
              className={cn(
                "min-h-[44px] border-b border-r border-[var(--ez-rule-thin)] py-2.5 pl-3.5 text-left text-[17px] font-extrabold leading-none active:bg-[var(--ez-tint-2)]",
                isOk
                  ? "bg-[var(--ez-accent)] text-white active:bg-[var(--ez-accent-600)]"
                  : isEdit
                    ? "bg-[var(--ez-surface)]"
                    : "bg-[var(--ez-ground)]",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
