import { useEffect, useState } from "react";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobilePickerSheet } from "@/components/mobile/MobilePickerSheet";
import { cn } from "@/lib/utils";

export type MobileReportFilterOption = { value: string; label: string };

export type MobileReportFilterValues = {
  brand: string;
  category: string;
  stockStatus: string;
};

const ALL = "__all__";

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "max-w-full truncate px-2.5 py-1.5 rounded-full text-[11px] font-medium border touch-manipulation",
        selected
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card border-border text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ChipGroup({
  label,
  options,
  value,
  onChange,
  includeAll = true,
}: {
  label: string;
  options: MobileReportFilterOption[];
  value: string;
  onChange: (value: string) => void;
  includeAll?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
        {includeAll ? (
          <Chip selected={value === ALL} onClick={() => onChange(ALL)}>
            All
          </Chip>
        ) : null}
        {options.map((opt) => (
          <Chip key={opt.value} selected={value === opt.value} onClick={() => onChange(opt.value)}>
            {opt.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

export function countActiveReportFilters(values: MobileReportFilterValues): number {
  return [values.brand, values.category, values.stockStatus].filter((v) => v && v !== ALL && v !== "all").length;
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
      className="relative mb-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-card touch-manipulation"
      aria-label="Filters"
    >
      <Filter className="h-4 w-4" />
      {activeCount > 0 ? (
        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-4 text-center">
          {activeCount}
        </span>
      ) : null}
    </button>
  );
}

export function MobileReportFilterSheet({
  open,
  onOpenChange,
  values,
  onApply,
  brands,
  categories,
  stockStatusOptions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  values: MobileReportFilterValues;
  onApply: (next: MobileReportFilterValues) => void;
  brands: string[];
  categories: string[];
  stockStatusOptions: MobileReportFilterOption[];
}) {
  const [draft, setDraft] = useState(values);

  useEffect(() => {
    if (open) setDraft(values);
  }, [open, values]);

  const brandOptions = brands.map((b) => ({ value: b, label: b }));
  const categoryOptions = categories.map((c) => ({ value: c, label: c }));

  return (
    <MobilePickerSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Filters"
      description="Brand, category and stock status"
    >
      <div className="space-y-4">
        <ChipGroup
          label="Brand"
          options={brandOptions}
          value={draft.brand}
          onChange={(brand) => setDraft((d) => ({ ...d, brand }))}
        />
        <ChipGroup
          label="Category"
          options={categoryOptions}
          value={draft.category}
          onChange={(category) => setDraft((d) => ({ ...d, category }))}
        />
        <ChipGroup
          label="Stock status"
          options={stockStatusOptions}
          value={draft.stockStatus}
          onChange={(stockStatus) => setDraft((d) => ({ ...d, stockStatus }))}
          includeAll={false}
        />
        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => {
              const cleared = { brand: ALL, category: ALL, stockStatus: stockStatusOptions[0]?.value || "all" };
              setDraft(cleared);
              onApply(cleared);
              onOpenChange(false);
            }}
          >
            <X className="h-4 w-4 mr-1" />
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
