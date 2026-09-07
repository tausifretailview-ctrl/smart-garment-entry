/**
 * Premium mobile primitives — the whole redesign is built from these five.
 * Path: src/components/mobile/premium/index.tsx
 * No new dependencies; lucide-react + cn only.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ── ShellHeader ── the one dark band per screen (identity + totals) ── */
export function ShellHeader({
  title,
  kicker,
  action,
  children,
}: {
  title: string;
  kicker?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="ez-shell shrink-0 px-3.5 pb-3.5 pt-[max(0.625rem,env(safe-area-inset-top,0px))] text-[var(--ez-shell-text)]">
      <div className="flex items-end justify-between gap-3 pb-2.5">
        <div className="min-w-0">
          <p className="ez-title truncate">{title}</p>
          {kicker ? (
            <p className="mt-[3px] text-[11px] font-medium uppercase leading-none tracking-[0.08em] text-[var(--ez-shell-muted)]">
              {kicker}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/* ── ShellButton ── outlined action on the dark band ── */
export function ShellButton({
  children,
  onClick,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="ez-btn-label shrink-0 border-2 border-[var(--ez-shell-line)] px-3 py-2 text-[10px] text-[var(--ez-shell-text)] active:bg-[#1c1f25]"
    >
      {children}
    </button>
  );
}

/* ── StatCell ── the KPI grid cell (3-up on Home) ── */
export function StatCell({
  label,
  value,
  sub,
  tone = "ink",
  onClick,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ink" | "credit" | "debit" | "accent";
  onClick?: () => void;
  loading?: boolean;
}) {
  const toneClass = {
    ink: "text-[var(--ez-ink)]",
    credit: "text-[var(--ez-credit)]",
    debit: "text-[var(--ez-debit)]",
    accent: "text-[var(--ez-accent-700)]",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-b border-r border-[var(--ez-rule-thin)] bg-[var(--ez-ground)] px-2.5 pb-2.5 pt-2.5 text-left last:border-r-0 active:bg-[var(--ez-tint)]"
    >
      <p className="text-[8.5px] font-semibold uppercase leading-[1.2] tracking-[0.10em] text-[var(--ez-muted)]">
        {label}
      </p>
      <p className={cn("ez-cell-value mt-[5px]", toneClass, loading && "opacity-40")}>
        {loading ? "—" : value}
      </p>
      {sub ? <p className="mt-[3px] text-[9px] font-medium leading-[1.2] text-[var(--ez-muted)]">{sub}</p> : null}
    </button>
  );
}

/* ── SectionHead ── uppercase section label + optional right slot ── */
export function SectionHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3.5 pb-1.5 pt-3">
      <p className="ez-section">{title}</p>
      {right}
    </div>
  );
}

/* ── ListRow ── every list line in the app (activity, alerts, reports, menu) ── */
export function ListRow({
  label,
  sub,
  value,
  meta,
  tone = "ink",
  selected,
  onClick,
}: {
  label: string;
  sub?: string;
  value?: string;
  meta?: string;
  tone?: "ink" | "credit" | "debit";
  selected?: boolean;
  onClick?: () => void;
}) {
  const toneClass = {
    ink: "text-[var(--ez-ink)]",
    credit: "text-[var(--ez-credit)]",
    debit: "text-[var(--ez-debit)]",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "block w-full border-t border-[var(--ez-rule-thin)] px-3.5 py-2.5 text-left active:bg-[var(--ez-tint)]",
        selected ? "bg-[var(--ez-tint)]" : "bg-[var(--ez-ground)]",
      )}
    >
      <div className="flex items-baseline justify-between gap-2.5">
        <p className="ez-row min-w-0 truncate">{label}</p>
        {value ? <p className={cn("num shrink-0 text-[13px] font-extrabold leading-[1.3]", toneClass)}>{value}</p> : null}
        {meta ? (
          <p className="shrink-0 text-[10px] font-semibold uppercase leading-none tracking-[0.08em] text-[var(--ez-muted)]">
            {meta}
          </p>
        ) : null}
      </div>
      {sub ? <p className="num mt-[3px] text-[10.5px] font-medium leading-none text-[var(--ez-muted-2)]">{sub}</p> : null}
    </button>
  );
}

/* ── Rule ── the 2px section divider ── */
export function Rule() {
  return <div className="h-0.5 w-full bg-[var(--ez-rule)]" />;
}

/* ── SearchBar ── flat search + accent SCAN action (POS & Purchase) ── */
export function SearchBar({
  value,
  onChange,
  onScan,
  placeholder = "Search name or barcode",
  disabled,
  inputRef,
  scanLabel = "Scan",
}: {
  value: string;
  onChange: (v: string) => void;
  onScan: () => void;
  placeholder?: string;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
  scanLabel?: string;
}) {
  return (
    <div className="ez flex shrink-0 border-b-2 border-[var(--ez-rule)]">
      <div className="flex min-w-0 flex-1 items-center gap-2 border-r-2 border-[var(--ez-rule)] bg-[var(--ez-surface)] px-3">
        <SearchGlyph />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          inputMode="search"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          style={{ fontSize: 16 }}
          className="w-full border-0 bg-transparent py-3.5 text-[13px] font-medium text-[var(--ez-ink)] outline-none placeholder:text-[var(--ez-muted)]"
        />
      </div>
      <button
        type="button"
        onClick={onScan}
        disabled={disabled}
        className="ez-btn-label shrink-0 bg-[var(--ez-accent)] px-4 text-white active:bg-[var(--ez-accent-600)] disabled:bg-[var(--ez-disabled)] disabled:text-[var(--ez-muted)]"
      >
        {scanLabel}
      </button>
    </div>
  );
}

function SearchGlyph() {
  // lucide Search at 15px, muted
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--ez-muted)]" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
