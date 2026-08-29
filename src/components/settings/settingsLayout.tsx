import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Insights-style pill tabs (navy active). Visual only — does not change tab panel overflow. */
export const SETTINGS_TAB_LIST_CLASS =
  "settings-tablist no-print flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0 shrink-0";

export const SETTINGS_TAB_TRIGGER_CLASS = cn(
  "h-9 px-3.5 text-sm font-semibold rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm gap-1.5",
  "transition-colors duration-200",
  "data-[state=active]:bg-slate-700 data-[state=active]:text-white data-[state=active]:border-slate-700",
);

export const SETTINGS_SECTION_HEAD =
  "h-10 shrink-0 flex items-center text-xs font-bold uppercase tracking-wide text-white bg-slate-800 px-3";

export const SETTINGS_BODY_ROW = cn(
  "min-h-11 flex items-center justify-between gap-4 px-3 py-2.5 border-b border-slate-100 last:border-b-0",
  "bg-white even:bg-slate-50/80 hover:bg-sky-50/70 transition-colors duration-200",
);

export function SettingsSection({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-slate-200 overflow-hidden bg-white", className)}>
      <div className={SETTINGS_SECTION_HEAD}>
        <div className="min-w-0">
          <h3 className="text-xs font-bold uppercase tracking-wide text-white leading-none">{title}</h3>
          {subtitle ? <p className="text-[11px] font-medium text-slate-300 mt-1 leading-none">{subtitle}</p> : null}
        </div>
      </div>
      <div className="settings-row-group">{children}</div>
    </div>
  );
}

export function SettingsRow({
  label,
  htmlFor,
  description,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  description?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(SETTINGS_BODY_ROW, className)}>
      <div className="space-y-0.5 min-w-0 pr-2">
        <label htmlFor={htmlFor} className="text-sm font-semibold text-slate-800 cursor-pointer">
          {label}
        </label>
        {description ? <div className="text-xs text-muted-foreground">{description}</div> : null}
        {hint}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsFieldBlock({
  label,
  htmlFor,
  description,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-3 py-2.5 border-b border-slate-100 last:border-b-0 space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-semibold text-slate-800">
        {label}
      </label>
      {children}
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}
