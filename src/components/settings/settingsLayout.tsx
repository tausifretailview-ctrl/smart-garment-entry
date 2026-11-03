import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Insights-style pill tabs (navy active). Visual only — does not change tab panel overflow. */
export const SETTINGS_TAB_LIST_CLASS =
  "settings-tablist no-print flex h-auto w-full flex-nowrap justify-start gap-0.5 overflow-x-auto bg-transparent p-0 shrink-0";

export const SETTINGS_TAB_TRIGGER_CLASS = cn(
  "h-10 px-3.5 text-sm font-semibold rounded-none border-0 border-b-2 border-transparent bg-transparent text-slate-500 shadow-none gap-1.5 whitespace-nowrap",
  "transition-colors duration-150 hover:text-slate-900",
  "data-[state=active]:text-blue-700 data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none",
);

/** Premium card header: white, slate title, coloured left accent (Nov 2026 redesign). */
export const SETTINGS_SECTION_HEAD =
  "settings-section-head min-h-11 shrink-0 flex items-center gap-2.5 px-4 py-2.5 bg-white border-b border-slate-100";

export const SETTINGS_BODY_ROW = cn(
  "min-h-11 flex items-center justify-between gap-4 px-3 py-2.5 border-b border-slate-100 last:border-b-0",
  "bg-white even:bg-slate-50/80 hover:bg-sky-50/70 transition-colors duration-200",
);

export type SettingsTone = "blue" | "violet" | "amber" | "emerald" | "rose" | "sky" | "slate";

const TONE_CHIP: Record<SettingsTone, string> = {
  blue: "bg-blue-50 text-blue-600",
  violet: "bg-violet-50 text-violet-600",
  amber: "bg-amber-50 text-amber-600",
  emerald: "bg-emerald-50 text-emerald-600",
  rose: "bg-rose-50 text-rose-600",
  sky: "bg-sky-50 text-sky-600",
  slate: "bg-slate-100 text-slate-600",
};

export function SettingsSection({
  title,
  subtitle,
  icon: Icon,
  tone = "slate",
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  tone?: SettingsTone;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("settings-section rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm", className)}>
      <div className={SETTINGS_SECTION_HEAD}>
        {Icon ? (
          <span className={cn("h-8 w-8 rounded-lg grid place-items-center shrink-0", TONE_CHIP[tone])}>
            <Icon className="h-4 w-4" />
          </span>
        ) : (
          <span className="h-5 w-1 rounded-full bg-blue-500 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-900 leading-tight">{title}</h3>
          {subtitle ? <p className="text-xs text-slate-500 mt-0.5 leading-snug">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="settings-row-group">{children}</div>
    </div>
  );
}

/** Responsive field grid: fields sized to their content instead of full width. */
export function SettingsGrid({
  cols = 3,
  children,
  className,
}: {
  cols?: 2 | 3 | 4;
  children: ReactNode;
  className?: string;
}) {
  const colClass =
    cols === 4
      ? "sm:grid-cols-2 xl:grid-cols-4"
      : cols === 3
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : "sm:grid-cols-2";
  return <div className={cn("settings-grid grid grid-cols-1 gap-x-4 gap-y-3 p-4", colClass, className)}>{children}</div>;
}

/** One labelled field. `important` gives the amber highlight, `required` adds a red star. */
export function SettingsField({
  label,
  htmlFor,
  required,
  important,
  badge,
  help,
  span,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  important?: boolean;
  badge?: string;
  help?: ReactNode;
  span?: 2 | 3 | 4 | "full";
  children: ReactNode;
  className?: string;
}) {
  const spanClass =
    span === "full"
      ? "col-span-full"
      : span === 4
        ? "sm:col-span-2 xl:col-span-4"
        : span === 3
          ? "sm:col-span-2 lg:col-span-3"
          : span === 2
            ? "sm:col-span-2"
            : "";
  return (
    <div className={cn("settings-field min-w-0 space-y-1.5", important && "settings-key-field", spanClass, className)}>
      <label htmlFor={htmlFor} className="settings-field-label flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
        {label}
        {required ? <span className="text-red-600" aria-hidden>*</span> : null}
        {badge ? (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-800">{badge}</span>
        ) : null}
      </label>
      {children}
      {help ? <div className="text-xs text-slate-500 leading-snug">{help}</div> : null}
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
