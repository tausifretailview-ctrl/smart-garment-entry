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
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** "disc" = line discount %, "discAmt" = line discount ₹ (POS only). */
export type KeypadMode = "qty" | "price" | "disc" | "discAmt";

const KEYS = ["1", "2", "3", "back", "4", "5", "6", "clear", "7", "8", "9", "00", ".", "0", "plus1", "ok"] as const;

export function PosKeypad({
  title,
  qty,
  price,
  discPercent,
  discAmount,
  mode,
  onModeChange,
  onCommit,
  onClose,
  onRemove,
  showDiscount = true,
  formatMoney,
}: {
  /** product name — shown truncated with the active field */
  title: string;
  qty: number;
  price: number;
  discPercent?: number;
  /** current line discount in ₹ — when set (with showDiscount) a "Disc ₹" field is shown */
  discAmount?: number;
  mode: KeypadMode;
  onModeChange: (m: KeypadMode) => void;
  /** value is a number; commit on every keystroke so the total tracks live */
  onCommit: (mode: KeypadMode, value: number) => void;
  onClose: () => void;
  /** removes the selected line from the bill */
  onRemove?: () => void;
  showDiscount?: boolean;
  formatMoney: (n: number) => string;
}) {
  const [buffer, setBuffer] = useState("");

  const fieldLabel =
    mode === "qty"
      ? "quantity"
      : mode === "price"
        ? "unit price"
        : mode === "discAmt"
          ? "line discount ₹"
          : "line discount %";

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
    else if (mode === "discAmt") onCommit("discAmt", value);
    else onCommit("disc", Math.min(value, 90));
  };

  const modes: Array<{ key: KeypadMode; label: string; value: string }> = [
    { key: "qty", label: "Qty", value: String(qty) },
    { key: "price", label: "Price", value: formatMoney(price) },
    ...(showDiscount ? [{ key: "disc" as KeypadMode, label: "Disc %", value: `${discPercent ?? 0}%` }] : []),
    ...(showDiscount && discAmount !== undefined
      ? [{ key: "discAmt" as KeypadMode, label: "Disc ₹", value: formatMoney(discAmount) }]
      : []),
  ];

  return (
    <div className="ez ez-sheet-up shrink-0 rounded-t-[22px] border-t border-[var(--ez-rule)] bg-[var(--ez-surface)] shadow-[var(--ez-sheet-shadow)]">
      <div className="flex items-center justify-between gap-3 px-4 pb-1.5 pt-3">
        <p className="min-w-0 truncate text-[13px] font-semibold leading-[1.2]">
          {title} <span className="font-medium text-[var(--ez-muted)]">· {fieldLabel}</span>
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="ez-press flex h-9 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold text-[var(--ez-debit)] active:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete line
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="ez-press flex h-9 items-center rounded-full bg-[var(--ez-ground)] px-3.5 text-[12.5px] font-semibold text-[var(--ez-muted-2)]"
          >
            Done
          </button>
        </div>
      </div>

      <div
        className={cn(
          "grid gap-1.5 px-3 pb-2",
          modes.length === 4 ? "grid-cols-4" : modes.length === 3 ? "grid-cols-3" : "grid-cols-2",
        )}
      >
        {modes.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => pick(m.key)}
            aria-pressed={mode === m.key}
            className={cn(
              "ez-press min-w-0 rounded-xl py-2 text-center",
              modes.length === 4 ? "px-1.5" : "px-3",
              mode === m.key
                ? "bg-[var(--ez-accent)] text-white shadow-[0_6px_14px_-6px_rgba(37,99,235,0.7)]"
                : "bg-[var(--ez-ground)] text-[var(--ez-ink)]",
            )}
          >
            <p className={cn("text-[11px] font-medium leading-none", mode === m.key ? "text-white/85" : "text-[var(--ez-muted)]")}>
              {m.label}
            </p>
            <p className={cn("num mt-1 truncate font-bold leading-none", modes.length === 4 ? "text-[14px]" : "text-[16px]")}>
              {m.value}
            </p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-1.5 px-3 pb-3">
        {KEYS.map((key) => {
          const label = key === "back" ? "⌫" : key === "clear" ? "C" : key === "plus1" ? "+1" : key === "ok" ? "OK" : key;
          const isOk = key === "ok";
          const isEdit = key === "back" || key === "clear";
          return (
            <button
              key={key}
              type="button"
              onClick={() => press(key)}
              aria-label={key === "back" ? "Backspace" : key === "clear" ? "Clear" : undefined}
              className={cn(
                "ez-press flex h-12 items-center justify-center rounded-xl text-[19px] font-semibold leading-none",
                isOk
                  ? "bg-[var(--ez-accent)] text-white active:bg-[var(--ez-accent-600)]"
                  : isEdit
                    ? "bg-[var(--ez-rule)] text-[var(--ez-muted-2)] active:bg-[var(--ez-tint-2)]"
                    : key === "plus1"
                      ? "bg-[var(--ez-tint)] text-[var(--ez-accent-700)] active:bg-[var(--ez-tint-2)]"
                      : "bg-[var(--ez-ground)] active:bg-[var(--ez-tint-2)]",
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
