import { List, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ReportViewToggle({
  view,
  onChange,
}: {
  view: "list" | "table";
  onChange: (v: "list" | "table") => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border/40 p-0.5 shrink-0">
      {(["list", "table"] as const).map((v) => {
        const Icon = v === "list" ? List : Table2;
        const active = view === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-label={v === "list" ? "List view" : "Table view"}
            className={cn(
              "flex items-center justify-center h-7 w-7 rounded-md touch-manipulation transition-colors",
              active ? "bg-primary/10 text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}
