import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Full-height tab body inside business-insights-workspace */
export const INSIGHTS_TAB_SHELL =
  "flex flex-col flex-1 min-h-0 gap-2 h-full overflow-hidden w-full";

export const INSIGHTS_TABLE_HEAD =
  "sticky top-0 z-10 [&_tr]:border-none";

export const INSIGHTS_NEUTRAL_TH =
  "h-10 text-xs font-bold uppercase tracking-wide text-white bg-slate-800 px-3 py-2.5 border-none shadow-none";

export function InsightsPanel({
  title,
  subtitle,
  toolbar,
  footer,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
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
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto bg-white tab-scroll-stable">
        {children}
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
