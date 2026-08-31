import { useEffect, useMemo, useState } from "react";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobilePickerSheet } from "@/components/mobile/MobilePickerSheet";
import { cn } from "@/lib/utils";

export type FilterValue = {
  brand: string;
  category: string;
  stockStatus: "all" | "in_stock" | "zero_stock";
};

const ALL = "__all__";

export const DEFAULT_STOCK_FILTERS: FilterValue = {
  brand: ALL,
  category: ALL,
  stockStatus: "all",
};

export function countActiveReportFilters(
  values: FilterValue,
  opts?: { includeStockStatus?: boolean },
): number {
  return [
    values.brand !== ALL && values.brand !== "all",
    values.category !== ALL && values.category !== "all",
    opts?.includeStockStatus !== false && values.stockStatus !== "all",
  ].filter(Boolean).length;
}

export function MobileReportFilterButton({
  activeCount,
  onClick,
}: {
  activeCount: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground touch-manipulation"
      aria-label="Filters"
    >
      <Filter className="h-3.5 w-3.5" />
      {activeCount > 0 ? (
        <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
      ) : null}
    </button>
  );
}

function SearchablePickList({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.toLowerCase().includes(needle));
  }, [options, q]);

  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">{label}</p>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Search ${label.toLowerCase()}…`}
        className="h-9 mb-2 rounded-lg text-sm"
      />
      <div className="max-h-36 overflow-y-auto rounded-lg border border-border/50 divide-y divide-border/40">
        <button
          type="button"
          onClick={() => onChange(ALL)}
          className={cn(
            "w-full text-left px-3 py-2 text-sm touch-manipulation",
            value === ALL ? "bg-primary/10 text-primary font-semibold" : "active:bg-muted/40",
          )}
        >
          All
        </button>
        {filtered.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={cn(
              "w-full text-left px-3 py-2 text-sm touch-manipulation truncate",
              value === opt ? "bg-primary/10 text-primary font-semibold" : "active:bg-muted/40",
            )}
          >
            {opt}
          </button>
        ))}
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">No matches</p>
        ) : null}
      </div>
    </div>
  );
}

const STATUS_OPTIONS: { value: FilterValue["stockStatus"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in_stock", label: "In Stock" },
  { value: "zero_stock", label: "Zero Stock" },
];

export function MobileReportFilterSheet({
  open,
  onOpenChange,
  brands,
  categories,
  value,
  onApply,
  showStockStatus = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brands: string[];
  categories: string[];
  value: FilterValue;
  onApply: (v: FilterValue) => void;
  showStockStatus?: boolean;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  return (
    <MobilePickerSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Filters"
      description={showStockStatus ? "Brand, category and stock status" : "Brand and category"}
    >
      <div className="space-y-4">
        <SearchablePickList
          label="Brand"
          options={brands}
          value={draft.brand}
          onChange={(brand) => setDraft((d) => ({ ...d, brand }))}
        />
        <SearchablePickList
          label="Category"
          options={categories}
          value={draft.category}
          onChange={(category) => setDraft((d) => ({ ...d, category }))}
        />
        {showStockStatus ? (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">Stock status</p>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, stockStatus: opt.value }))}
                  className={cn(
                    "rounded-lg py-2 text-[11px] font-semibold touch-manipulation",
                    draft.stockStatus === opt.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => setDraft(DEFAULT_STOCK_FILTERS)}
          >
            Clear
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={() => {
              onApply(draft);
              onOpenChange(false);
            }}
          >
            Apply
          </Button>
        </div>
      </div>
    </MobilePickerSheet>
  );
}
