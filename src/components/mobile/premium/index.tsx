/**
 * Owner mobile app primitives (Home, POS, Purchase): the same look as the Field Sales app.
 * Rounded white cards on a soft grey ground, a blue gradient header, sentence-case labels.
 * Path: src/components/mobile/premium/index.tsx
 * No new dependencies; lucide-react + cn only.
 */
import type { ReactNode } from "react";
import { ArrowLeft, ScanBarcode, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { FIELD_SALES_SAFE_TOP } from "@/hooks/useFieldSalesShell";

/* ── ShellHeader ── the blue gradient band at the top of a screen (title + totals) ── */
export function ShellHeader({
  title,
  kicker,
  action,
  onBack,
  children,
}: {
  title: string;
  kicker?: string;
  action?: ReactNode;
  /** Shows a back arrow before the title (entry screens that hide the bottom bar). */
  onBack?: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      className="ez-shell shrink-0 rounded-b-[22px] px-4 pb-4 text-[var(--ez-shell-text)] shadow-[0_8px_20px_-12px_rgba(30,64,175,0.7)]"
      style={{ paddingTop: `calc(${FIELD_SALES_SAFE_TOP} + 0.75rem)` }}
    >
      <div className={cn("flex items-center justify-between gap-3", children ? "pb-3" : "")}>
        <div className="flex min-w-0 items-center gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="ez-press -ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:bg-white/20"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : null}
          <div className="min-w-0">
            <p className="ez-title truncate">{title}</p>
            {kicker ? (
              <p className="mt-0.5 truncate text-[12px] font-medium leading-tight text-[var(--ez-shell-muted)]">{kicker}</p>
            ) : null}
          </div>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/* ── ShellButton ── pill action on the header band ── */
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
      className="ez-press ez-btn-label flex h-10 shrink-0 items-center justify-center rounded-full bg-[var(--ez-shell-fill)] px-4 text-[var(--ez-shell-text)] ring-1 ring-inset ring-[var(--ez-shell-line)] active:bg-white/25"
    >
      {children}
    </button>
  );
}

/* ── Panel ── white rounded surface; lists and sections sit inside one ── */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("ez-card overflow-hidden", className)}>{children}</div>;
}

/* ── StatCell ── one KPI card (2-up on Home) ── */
export function StatCell({
  label,
  value,
  sub,
  tone = "ink",
  onClick,
  loading,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ink" | "credit" | "debit" | "accent";
  onClick?: () => void;
  loading?: boolean;
  /** Small round icon chip shown beside the label. */
  icon?: ReactNode;
}) {
  const toneClass = {
    ink: "text-[var(--ez-ink)]",
    credit: "text-[var(--ez-credit)]",
    debit: "text-[var(--ez-debit)]",
    accent: "text-[var(--ez-accent-700)]",
  }[tone];
  return (
    <button type="button" onClick={onClick} className="ez-card ez-press min-w-0 px-3.5 py-3 text-left active:bg-[var(--ez-tint)]">
      <div className="flex items-center gap-2">
        {icon}
        <p className="ez-label min-w-0 flex-1 truncate">{label}</p>
      </div>
      <p className={cn("ez-cell-value mt-2 truncate", toneClass, loading && "opacity-40")}>{loading ? "—" : value}</p>
      {sub ? <p className="mt-1 line-clamp-2 text-[11px] font-medium leading-[1.25] text-[var(--ez-muted)]">{sub}</p> : null}
    </button>
  );
}

/* ── SectionHead ── section title + optional right slot ── */
export function SectionHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
      <p className="ez-section min-w-0 truncate">{title}</p>
      {right}
    </div>
  );
}

/* ── ListRow ── one line of a list card (activity, alerts, top sellers) ── */
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
        "block min-h-[52px] w-full border-t border-[var(--ez-rule-thin)] px-3.5 py-2.5 text-left first:border-t-0 active:bg-[var(--ez-tint)]",
        selected ? "bg-[var(--ez-tint)]" : "bg-transparent",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="ez-row min-w-0 truncate">{label}</p>
        {value ? <p className={cn("num shrink-0 text-[14px] font-bold leading-[1.3]", toneClass)}>{value}</p> : null}
        {meta ? <p className="shrink-0 text-[11px] font-medium leading-none text-[var(--ez-muted)]">{meta}</p> : null}
      </div>
      {sub ? <p className="num mt-1 truncate text-[12px] font-medium leading-tight text-[var(--ez-muted)]">{sub}</p> : null}
    </button>
  );
}

/* ── EmptyNote ── the quiet line shown in an empty list card ── */
export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="px-3.5 py-4 text-[13px] font-medium leading-[1.45] text-[var(--ez-muted)]">{children}</p>;
}

/* ── Rule ── hairline divider ── */
export function Rule() {
  return <div className="h-px w-full bg-[var(--ez-rule)]" />;
}

/* ── SearchBar ── rounded search field + blue Scan button (POS & Purchase) ── */
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
    <div className="ez flex shrink-0 gap-2 bg-transparent px-3 pb-1 pt-3">
      <div className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-[var(--ez-rule)] bg-[var(--ez-surface)] px-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.05)] focus-within:border-[var(--ez-accent)] focus-within:ring-2 focus-within:ring-[var(--ez-tint-2)]">
        <Search className="h-[18px] w-[18px] shrink-0 text-[var(--ez-muted)]" aria-hidden />
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
          className="h-full w-full min-w-0 border-0 bg-transparent font-medium text-[var(--ez-ink)] outline-none placeholder:font-normal placeholder:text-[var(--ez-muted)]"
        />
      </div>
      <button
        type="button"
        onClick={onScan}
        disabled={disabled}
        className="ez-press flex h-12 shrink-0 items-center gap-1.5 rounded-2xl bg-[var(--ez-accent)] px-4 text-[14px] font-semibold text-white shadow-[0_6px_14px_-6px_rgba(37,99,235,0.7)] active:bg-[var(--ez-accent-600)] disabled:bg-[var(--ez-disabled)] disabled:text-[var(--ez-muted)] disabled:shadow-none"
      >
        <ScanBarcode className="h-[18px] w-[18px]" aria-hidden />
        {scanLabel}
      </button>
    </div>
  );
}
