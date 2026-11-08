import { Loader2, Warehouse } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { godownTypeInfo, type Godown } from "@/utils/godowns";

/** "Receive into" godown row on Purchase Entry. Shown only in Industrial mode with godowns. */
export function PurchaseGodownBar(props: {
  choices: Godown[];
  value: string | null;
  mainId: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const { choices, value, mainId, onChange, disabled, loading } = props;
  const picked = choices.find((g) => g.id === value) ?? null;
  const isMain = !value || value === mainId;

  return (
    <div
      className={cn(
        "mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-1.5",
        isMain
          ? "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40"
          : "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30",
      )}
    >
      <Warehouse className={cn("h-4 w-4 shrink-0", isMain ? "text-slate-500" : "text-emerald-600")} />
      <span className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">Receive into</span>
      <Select value={value ?? ""} onValueChange={onChange} disabled={disabled || loading}>
        <SelectTrigger
          data-field="purchase-godown"
          aria-label="Receive into godown"
          className="h-8 w-56 max-w-full bg-white dark:bg-background text-sm font-semibold"
        >
          <SelectValue placeholder="Main" />
        </SelectTrigger>
        <SelectContent className="bg-background z-50">
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
        {isMain
          ? "Goods go into the shop stock (Main), as before."
          : `When you save, the goods on this bill move from Main into ${picked?.name ?? "this godown"}.`}
      </span>
    </div>
  );
}
