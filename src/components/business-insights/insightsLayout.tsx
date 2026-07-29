import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatInsightsINR } from "@/hooks/useBusinessInsights";
import { useCountUp } from "@/hooks/useCountUp";
import { marginBarColor } from "@/components/business-insights/insightsMarginUtils";

/** Full-height tab body inside business-insights-workspace */
export const INSIGHTS_TAB_SHELL =
  "flex flex-col flex-1 min-h-0 gap-2 h-full overflow-hidden w-full";

export const INSIGHTS_TABLE_HEAD =
  "sticky top-0 z-10 [&_tr]:border-none";

/** Vasy-style dark header row */
export const INSIGHTS_NEUTRAL_TH =
  "h-10 text-xs font-bold uppercase tracking-wide text-white bg-slate-800 px-3 py-2.5 border-none shadow-none whitespace-nowrap";

/** Vasy-style body rows — taller touch targets, zebra + hover */
export const INSIGHTS_BODY_ROW =
  "h-11 border-b border-slate-100 hover:bg-sky-50/70 even:bg-slate-50/80";

export const INSIGHTS_BODY_CELL = "px-3 py-2.5 text-base align-middle";

export const INSIGHTS_BODY_CELL_NUM = cn(INSIGHTS_BODY_CELL, "text-right tabular-nums");

export const INSIGHTS_SUB_TABS_CLASS = "flex flex-col flex-1 min-h-0 gap-2";

export const INSIGHTS_SUB_TAB_LIST =
  "h-9 shrink-0 w-fit rounded-md bg-slate-100 p-1";

export const INSIGHTS_SUB_TAB_TRIGGER =
  "rounded px-3 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm";

export type InsightsSubTabItem<T extends string> = { id: T; label: string };

export function InsightsSubTabs<T extends string>({
  value,
  onValueChange,
  items,
  children,
}: {
  value: T;
  onValueChange: (value: T) => void;
  items: InsightsSubTabItem<T>[];
  children: ReactNode;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      className={INSIGHTS_SUB_TABS_CLASS}
    >
      <TabsList className={INSIGHTS_SUB_TAB_LIST}>
        {items.map(({ id, label }) => (
          <TabsTrigger key={id} value={id} className={INSIGHTS_SUB_TAB_TRIGGER}>
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </Tabs>
  );
}

export function InsightsSubTabPanel({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  return (
    <TabsContent
      value={value}
      className="mt-0 flex flex-1 min-h-0 flex-col focus-visible:outline-none data-[state=inactive]:hidden"
    >
      {children}
    </TabsContent>
  );
}

function syncInsightsHScrollFade(scrollEl: HTMLElement, fadeEl: HTMLElement) {
  const overflow = scrollEl.scrollWidth - scrollEl.clientWidth > 2;
  const atEnd = scrollEl.scrollLeft + scrollEl.clientWidth >= scrollEl.scrollWidth - 2;
  fadeEl.classList.toggle("insights-hscroll-fade--hidden", !overflow || atEnd);
}

export function InsightsPanel({
  title,
  subtitle,
  toolbar,
  footer,
  children,
  className,
  stickyFirstColumn = false,
  stickyColumnCount = 1,
}: {
  title?: string;
  subtitle?: string;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Pin the first table column while scrolling horizontally (opt-in). */
  stickyFirstColumn?: boolean;
  /**
   * How many leading columns to pin when stickyFirstColumn is on.
   * Use 2 for tables that start with "#" then a label (e.g. Product Name).
   */
  stickyColumnCount?: 1 | 2;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    const fadeEl = fadeRef.current;
    if (!scrollEl || !fadeEl) return;

    const update = () => syncInsightsHScrollFade(scrollEl, fadeEl);

    update();
    scrollEl.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(update);
      ro.observe(scrollEl);
      if (scrollEl.firstElementChild) ro.observe(scrollEl.firstElementChild);
    }

    return () => {
      scrollEl.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      ro?.disconnect();
    };
  }, [children, stickyFirstColumn, stickyColumnCount]);

  return (
    <Card
      className={cn(
        "rounded-lg border border-slate-200 shadow-sm overflow-hidden p-0 flex flex-col min-h-0",
        className,
      )}
    >
      {(title || toolbar) && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-100 bg-white shrink-0">
          {(title || subtitle) && (
            <div className="min-w-0 mr-auto">
              {title && <h3 className="text-sm font-bold text-slate-800 leading-tight">{title}</h3>}
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
              )}
            </div>
          )}
          {toolbar}
        </div>
      )}
      <div className="relative flex-1 min-h-0 min-w-0">
        <div
          ref={scrollRef}
          className={cn(
            "h-full max-h-full overflow-y-auto overflow-x-auto bg-white tab-scroll-stable",
            stickyFirstColumn && "insights-hscroll-sticky",
            stickyFirstColumn && stickyColumnCount === 2 && "insights-hscroll-sticky--2",
          )}
        >
          {children}
        </div>
        <div
          ref={fadeRef}
          className="insights-hscroll-fade pointer-events-none absolute inset-y-0 right-0 z-[5] flex w-[34px] items-center justify-end pr-1"
          aria-hidden
        >
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2.5} />
        </div>
      </div>
      {footer && (
        <div className="shrink-0 border-t border-slate-100 bg-white px-3 py-2">{footer}</div>
      )}
    </Card>
  );
}

export function InsightsKpiStrip({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full shrink-0">{children}</div>;
}

/** Loading placeholder that matches KPI strip + table chrome (h-10 header / h-11 rows). */
export function InsightsTableSkeleton({
  columns,
  rows = 8,
  title = "Loading…",
}: {
  columns: number;
  rows?: number;
  title?: string;
}) {
  const colCount = Math.max(1, columns);
  return (
    <div className={INSIGHTS_TAB_SHELL} aria-busy="true" aria-label={title}>
      <InsightsKpiStrip>
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="rounded-lg border border-slate-200 border-l-[3px] border-l-slate-300 bg-white px-3 py-2 min-w-0 shadow-sm"
          >
            <Skeleton className="h-3 w-24 motion-reduce:animate-none" />
            <Skeleton className="mt-2 h-6 w-32 motion-reduce:animate-none" />
            <Skeleton className="mt-1.5 h-3 w-28 motion-reduce:animate-none" />
          </div>
        ))}
      </InsightsKpiStrip>

      <InsightsPanel className="flex-1 min-h-0" title={title}>
        <Table className="w-full min-w-max">
          <InsightsTableHeader>
            {Array.from({ length: colCount }, (_, i) => (
              <TableHead key={i} className={INSIGHTS_NEUTRAL_TH}>
                <Skeleton className="h-3 w-16 bg-white/25 motion-reduce:animate-none" />
              </TableHead>
            ))}
          </InsightsTableHeader>
          <TableBody>
            {Array.from({ length: rows }, (_, r) => (
              <TableRow key={r} className={INSIGHTS_BODY_ROW}>
                {Array.from({ length: colCount }, (_, c) => (
                  <TableCell key={c} className={INSIGHTS_BODY_CELL}>
                    <Skeleton
                      className={cn(
                        "h-4 motion-reduce:animate-none",
                        c === 0 ? "w-28" : c === colCount - 1 ? "ml-auto w-14" : "w-16",
                      )}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </InsightsPanel>
    </div>
  );
}

export type InsightsKpiTone = "neutral" | "attention" | "positive" | "critical";

/** How to format a numeric KPI value during / after count-up. */
export type InsightsKpiValueFormat = "inr" | "pct" | "int";

const KPI_TONE_CLASS: Record<
  InsightsKpiTone,
  { card: string; label: string; value: string; sub: string }
> = {
  neutral: {
    card: "border border-slate-200 border-l-[3px] border-l-slate-300 bg-white",
    label: "text-slate-500",
    value: "text-slate-900",
    sub: "text-slate-500",
  },
  attention: {
    card: "border border-slate-200 border-l-[3px] border-l-amber-500 bg-amber-50",
    label: "text-slate-500",
    value: "text-slate-900",
    sub: "text-amber-900 font-semibold",
  },
  critical: {
    card: "border border-slate-200 border-l-[3px] border-l-red-500 bg-red-50",
    label: "text-slate-500",
    value: "text-slate-900",
    sub: "text-red-800",
  },
  positive: {
    card: "border border-slate-200 border-l-[3px] border-l-emerald-500 bg-white",
    label: "text-slate-500",
    value: "text-slate-900",
    sub: "text-emerald-800",
  },
};

function formatKpiNumeric(value: number, format: InsightsKpiValueFormat): string {
  if (format === "inr") return formatInsightsINR(value);
  if (format === "pct") return `${value.toFixed(1)}%`;
  return Math.round(value).toLocaleString("en-IN");
}

/** Inline SVG sparkline — no chart-library instance. Colours from marginBarColor tiers. */
export function InsightsSparkline({
  series,
  invertTrend = false,
  className,
}: {
  series: number[];
  /** When true, down is good (green) and up is bad (red). */
  invertTrend?: boolean;
  className?: string;
}) {
  const path = useMemo(() => {
    if (!series || series.length < 2) return null;
    const w = 100;
    const h = 26;
    const padY = 2;
    const min = Math.min(...series);
    const max = Math.max(...series);
    const span = max - min || 1;
    const pts = series.map((v, i) => {
      const x = (i / (series.length - 1)) * w;
      const y = padY + (1 - (v - min) / span) * (h - padY * 2);
      return { x, y };
    });
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
    const area = `${line} L${w},${h} L0,${h} Z`;
    const first = series[0];
    const last = series[series.length - 1];
    const up = last >= first;
    const positive = invertTrend ? !up : up;
    const stroke = positive ? marginBarColor(35) : marginBarColor(0);
    return { line, area, stroke };
  }, [series, invertTrend]);

  if (!path) return null;

  return (
    <svg
      className={cn("mt-1.5 block h-[26px] w-full", className)}
      viewBox="0 0 100 26"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={path.area} fill={path.stroke} opacity={0.13} stroke="none" />
      <path
        d={path.line}
        fill="none"
        stroke={path.stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function InsightsKpiAnimatedValue({
  value,
  format,
}: {
  value: number;
  format: InsightsKpiValueFormat;
}) {
  const animated = useCountUp(value);
  return <>{formatKpiNumeric(animated, format)}</>;
}

export function InsightsKpiCard({
  label,
  value,
  sub,
  tone = "neutral",
  valueFormat = "int",
  sparkline,
  invertTrend = false,
}: {
  label: string;
  /**
   * Number → count-up (formatted via valueFormat).
   * String / ReactNode → render immediately (e.g. brand names).
   */
  value: number | string | ReactNode;
  sub?: ReactNode;
  /** Semantic status — default neutral. Colour means status, not decoration. */
  tone?: InsightsKpiTone;
  /** Used only when `value` is a number. */
  valueFormat?: InsightsKpiValueFormat;
  /** Optional trend series; omitted entirely when absent. */
  sparkline?: number[];
  /** Invert sparkline colours when down is good (e.g. return rate). */
  invertTrend?: boolean;
}) {
  const styles = KPI_TONE_CLASS[tone];
  const isNumeric = typeof value === "number" && Number.isFinite(value);

  return (
    <div className={cn("rounded-lg px-3 py-2 min-w-0 shadow-sm", styles.card)}>
      <p className={cn("text-xs font-semibold uppercase tracking-wide leading-none", styles.label)}>
        {label}
      </p>
      <p
        className={cn(
          "text-base sm:text-lg font-black tabular-nums leading-tight mt-1 truncate",
          styles.value,
        )}
      >
        {isNumeric ? (
          <InsightsKpiAnimatedValue value={value} format={valueFormat} />
        ) : (
          value
        )}
      </p>
      {sub && <p className={cn("text-xs mt-0.5 truncate", styles.sub)}>{sub}</p>}
      {sparkline && sparkline.length >= 2 && (
        <InsightsSparkline series={sparkline} invertTrend={invertTrend} />
      )}
    </div>
  );
}

export function InsightsTableHeader({ children }: { children: ReactNode }) {
  return (
    <TableHeader className={INSIGHTS_TABLE_HEAD}>
      <TableRow className="bg-slate-800 hover:bg-slate-800 border-none">{children}</TableRow>
    </TableHeader>
  );
}

export function InsightsSortableTh({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  className?: string;
}) {
  return (
    <TableHead
      className={cn(INSIGHTS_NEUTRAL_TH, "cursor-pointer select-none whitespace-nowrap", className)}
      onClick={onClick}
    >
      {label}
      {active ? (dir === "asc" ? " ↑" : " ↓") : ""}
    </TableHead>
  );
}

export function InsightsStaticTh({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "whitespace-nowrap", className)}>{label}</TableHead>
  );
}
