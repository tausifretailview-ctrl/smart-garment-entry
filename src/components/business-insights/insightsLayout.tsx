import { useEffect, useRef, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

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

export function InsightsKpiCard({
  label,
  value,
  sub,
  gradient,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  gradient: string;
}) {
  return (
    <div className={cn("rounded-lg px-3 py-2 min-w-0 shadow-sm", gradient)}>
      <p className="text-xs font-medium text-white/85 leading-none">{label}</p>
      <p className="text-base sm:text-lg font-black text-white tabular-nums leading-tight mt-1 truncate">
        {value}
      </p>
      {sub && <p className="text-xs text-white/80 mt-0.5 truncate">{sub}</p>}
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
