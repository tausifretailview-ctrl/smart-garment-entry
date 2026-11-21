/**
 * PosPayRow — total + one-tap payment. Replaces the Pay button *and* the
 * payment Drawer for the four common methods (the Mix split stays a sheet).
 * Path: src/components/mobile/premium/PosPayRow.tsx
 *
 * Wire onPay straight to the page's existing runSave(method) — the sheet is
 * only needed for "multiple".
 */
import { Banknote, Clock, CreditCard, Loader2, Smartphone, Split } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOBILE_BOTTOM_NAV_HEIGHT } from "@/lib/mobileShell";

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
  aboveBottomNav = false,
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
  /** True when the app's bottom bar is on screen under this panel. */
  aboveBottomNav?: boolean;
}) {
  const buttons: Array<{ m: PayMethod; label: string; Icon: React.ElementType; kind: "solid" | "soft" | "ghost" }> = [
    { m: "cash", label: "Cash", Icon: Banknote, kind: "solid" },
    { m: "upi", label: "UPI", Icon: Smartphone, kind: "soft" },
    { m: "card", label: "Card", Icon: CreditCard, kind: "soft" },
    { m: "pay_later", label: "Later", Icon: Clock, kind: "ghost" },
  ];
  const off = disabled || saving;

  return (
    <div
      className="ez shrink-0 rounded-t-[22px] border-t border-[var(--ez-rule)] bg-[var(--ez-surface)] shadow-[var(--ez-sheet-shadow)]"
      // With the bottom bar on screen, stay above it; entry screens hide the bar.
      style={{
        paddingBottom: aboveBottomNav
          ? `calc(${MOBILE_BOTTOM_NAV_HEIGHT} + env(safe-area-inset-bottom, 0px))`
          : "calc(env(safe-area-inset-bottom, 0px) + 0.625rem)",
      }}
    >
      <div className="flex items-end justify-between gap-3 px-4 pb-2.5 pt-3">
        <div className="min-w-0">
          <p className="ez-label">
            {itemsLabel} · GST {gstLabel}
          </p>
          <p className="ez-money mt-1.5" data-testid="pos-total">{totalLabel}</p>
        </div>
        {savingsLabel ? (
          <p className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold leading-none text-[var(--ez-credit)]">
            Saved {savingsLabel}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-4 gap-2 px-3">
        {buttons.map((b) => (
          <button
            key={b.m}
            type="button"
            disabled={off}
            onClick={() => onPay(b.m)}
            className={cn(
              "ez-press flex h-[54px] flex-col items-center justify-center gap-1 rounded-2xl text-[13px] font-semibold leading-none",
              off
                ? "bg-[var(--ez-disabled)] text-[var(--ez-muted)]"
                : b.kind === "solid"
                  ? "bg-[var(--ez-accent)] text-white shadow-[0_8px_16px_-8px_rgba(37,99,235,0.8)] active:bg-[var(--ez-accent-600)]"
                  : b.kind === "soft"
                    ? "bg-[var(--ez-tint)] text-[var(--ez-accent-700)] active:bg-[var(--ez-tint-2)]"
                    : "bg-[var(--ez-ground)] text-[var(--ez-muted-2)] active:bg-[var(--ez-rule)]",
            )}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <b.Icon className="h-[18px] w-[18px]" aria-hidden />}
            {b.label}
          </button>
        ))}
      </div>

      {onMix ? (
        <button
          type="button"
          disabled={off}
          onClick={onMix}
          className="ez-press mt-1 flex h-11 w-full items-center justify-center gap-1.5 text-[13px] font-semibold text-[var(--ez-accent-700)] disabled:text-[var(--ez-muted)]"
        >
          <Split className="h-4 w-4" aria-hidden />
          Split payment — cash / UPI / card
        </button>
      ) : null}
    </div>
  );
}
