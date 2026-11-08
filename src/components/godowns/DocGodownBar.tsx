import { Loader2, Warehouse } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { godownTypeInfo, type Godown } from "@/utils/godowns";

/**
 * "Dispatch from" godown row on a document that sends goods out (Sale Invoice first).
 * Shown only in Industrial mode when the shop has a godown besides Main.
 */
export function DocGodownBar(props: {
  label: string;
  choices: Godown[];
  value: string | null;
  mainId: string | null;
  onChange: (id: string) => void;
  mainHint: string;
  godownHint: (name: string) => string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const { label, choices, value, mainId, onChange, mainHint, godownHint, disabled, loading, className } = props;
  const picked = choices.find((g) => g.id === value) ?? null;
  const isMain = !value || value === mainId;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-1.5",
        isMain
          ? "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40"
          : "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30",
        className,
      )}
    >
      <Warehouse className={cn("h-4 w-4 shrink-0", isMain ? "text-slate-500" : "text-emerald-600")} />
      <span className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">{label}</span>
      <Select value={value ?? ""} onValueChange={onChange} disabled={disabled || loading}>
        <SelectTrigger
          data-field="doc-godown"
          aria-label={`${label} godown`}
          className="h-8 w-56 max-w-full bg-white text-sm font-semibold dark:bg-background"
        >
          <SelectValue placeholder="Main" />
        </SelectTrigger>
        <SelectContent className="z-50 bg-background">
          {choices.map((g) => (
            <SelectItem key={g.id} value={g.id}>
              {g.name}
              {g.godown_type === "job_work" || g.godown_type === "damaged" ? ` (${godownTypeInfo(g.godown_type).label})` : ""}
              {!g.is_active ? " (closed)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /> : null}
      <span className="text-xs text-slate-500 dark:text-slate-400">
        {isMain ? mainHint : godownHint(picked?.name ?? "this godown")}
      </span>
    </div>
  );
}

/** The same pick as a header field (label above, as on the Sale Invoice top row). */
export function DocGodownField(props: {
  label: string;
  choices: Godown[];
  value: string | null;
  mainId: string | null;
  onChange: (id: string) => void;
  mainHint: string;
  godownHint: (name: string) => string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  /** Match the page's own labels and boxes (Sale Return uses bold black labels). */
  labelClassName?: string;
  triggerClassName?: string;
}) {
  const { label, choices, value, mainId, onChange, mainHint, godownHint, disabled, loading, className } = props;
  const picked = choices.find((g) => g.id === value) ?? null;
  const isMain = !value || value === mainId;
  const hint = isMain ? mainHint : godownHint(picked?.name ?? "this godown");

  return (
    <div className={className}>
      <label className={cn("mb-1 flex items-center gap-1 text-[13px] font-medium text-muted-foreground", props.labelClassName)}>
        <Warehouse className={cn("h-3.5 w-3.5 shrink-0", isMain ? "text-slate-400" : "text-emerald-600")} />
        <span className="truncate">{label}</span>
        {loading ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-slate-400" /> : null}
      </label>
      <Select value={value ?? ""} onValueChange={onChange} disabled={disabled || loading}>
        <SelectTrigger
          data-field="doc-godown"
          aria-label={`${label} godown`}
          title={hint}
          className={cn(
            "h-10 text-sm",
            props.triggerClassName,
            isMain ? "" : "border-emerald-400 bg-emerald-50 font-semibold text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200",
          )}
        >
          <SelectValue placeholder="Main" />
        </SelectTrigger>
        <SelectContent className="z-50 bg-background">
          {choices.map((g) => (
            <SelectItem key={g.id} value={g.id}>
              {g.name}
              {g.godown_type === "job_work" || g.godown_type === "damaged" ? ` (${godownTypeInfo(g.godown_type).label})` : ""}
              {!g.is_active ? " (closed)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** The same pick inline, for a band that already has its own frame (Delivery Challan). */
export function DocGodownInline(props: {
  id: string;
  label: string;
  choices: Godown[];
  value: string | null;
  mainId: string | null;
  onChange: (id: string) => void;
  mainHint: string;
  godownHint: (name: string) => string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const { id, label, choices, value, mainId, onChange, mainHint, godownHint, disabled, loading, className } = props;
  const picked = choices.find((g) => g.id === value) ?? null;
  const isMain = !value || value === mainId;
  const hint = isMain ? mainHint : godownHint(picked?.name ?? "this godown");

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <label htmlFor={id} className="flex items-center gap-1.5 whitespace-nowrap text-[13px] font-bold text-sky-900">
        <Warehouse className={cn("h-4 w-4 shrink-0", isMain ? "text-sky-700" : "text-emerald-600")} />
        {label}
      </label>
      <Select value={value ?? ""} onValueChange={onChange} disabled={disabled || loading}>
        <SelectTrigger
          id={id}
          data-field="doc-godown"
          title={hint}
          className={cn(
            "h-9 w-52 bg-white text-sm",
            isMain ? "" : "border-emerald-400 bg-emerald-50 font-semibold text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200",
          )}
        >
          <SelectValue placeholder="Main" />
        </SelectTrigger>
        <SelectContent className="z-50 bg-background">
          {choices.map((g) => (
            <SelectItem key={g.id} value={g.id}>
              {g.name}
              {g.godown_type === "job_work" || g.godown_type === "damaged" ? ` (${godownTypeInfo(g.godown_type).label})` : ""}
              {!g.is_active ? " (closed)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /> : null}
    </div>
  );
}
