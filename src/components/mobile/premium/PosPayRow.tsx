/**
 * PosPayRow — total + one-tap payment. Replaces the Pay button *and* the
 * payment Drawer for the four common methods (the Mix split stays a sheet).
 * Path: src/components/mobile/premium/PosPayRow.tsx
 *
 * Wire onPay straight to the page's existing runSave(method) — the sheet is
 * only needed for "multiple".
 */
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type PayMethod = "cash" | "upi" | "card" | "pay_later";

export function PosPayRow({
  itemsLabel,
  gstLabel,
  totalLabel,
  savingsLabel,
  disabled,
  saving,
  onPay,
  onMix,
}: {
  /** "3 items" */
  itemsLabel: string;
  /** already formatted GST amount */
  gstLabel: string;
  /** already formatted net total */
  totalLabel: string;
  savingsLabel?: string;
  disabled?: boolean;
  saving?: boolean;
  onPay: (m: PayMethod) => void;
  onMix?: () => void;
}) {
  const buttons: Array<{ m: PayMethod | "mix"; label: string; solid?: boolean; ghost?: boolean }> = [
    { m: "cash", label: "Cash", solid: true },
    { m: "upi", label: "UPI" },
    { m: "card", label: "Card" },
    { m: "pay_later", label: "Later", ghost: true },
  ];

  return (
    <div
      className="ez shrink-0 border-t-2 border-[var(--ez-ink)] bg-[var(--ez-ground)]"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="flex items-end justify-between gap-3 px-3.5 pb-2 pt-2.5">
        <div className="min-w-0">
          <p className="ez-label">
            {itemsLabel} · GST {gstLabel}
          </p>
          <p className="ez-money mt-1">{totalLabel}</p>
        </div>
        {savingsLabel ? (
          <p className="shrink-0 text-right text-[10px] font-medium leading-[1.3] text-[var(--ez-muted)]">
            saved
            <br />
            {savingsLabel}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-4 border-t-2 border-[var(--ez-ink)]">
        {buttons.map((b) => (
          <button
            key={b.m}
            type="button"
            disabled={disabled || saving}
            onClick={() => (b.m === "mix" ? onMix?.() : onPay(b.m as PayMethod))}
            className={cn(
              "ez-btn-label min-h-[48px] border-r border-white/25 py-3.5 pl-3 last:border-r-0",
              b.solid
                ? "bg-[var(--ez-accent)] text-white active:bg-[var(--ez-accent-600)]"
                : b.ghost
                  ? "bg-[var(--ez-surface)] text-[var(--ez-ink)]"
                  : "bg-[var(--ez-shell)] text-white active:bg-[#1c1f25]",
              (disabled || saving) && "bg-[var(--ez-disabled)] text-[var(--ez-muted)]",
            )}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : b.label}
          </button>
        ))}
      </div>

      {onMix ? (
        <button
          type="button"
          disabled={disabled || saving}
          onClick={onMix}
          className="ez-btn-label w-full border-t border-[var(--ez-rule-thin)] bg-[var(--ez-ground)] py-3 pl-3.5 text-[var(--ez-accent-700)]"
        >
          Mix — cash / upi / card split
        </button>
      ) : null}
    </div>
  );
}
