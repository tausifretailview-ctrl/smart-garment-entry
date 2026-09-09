import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { onWheelScrollContainer } from "@/lib/scrollWheel";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

export type SearchableSelectOption = string | { value: string; label: string };

interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  allLabel?: string;
  allValue?: string;
  className?: string;
  triggerClassName?: string;
}

function normalizeOptions(options: SearchableSelectOption[]): { value: string; label: string }[] {
  return options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
}

/** Keep the chevron inside the clickable box in CSS grid filter rows. */
export const SEARCHABLE_SELECT_TRIGGER_CLASS =
  "w-full min-w-0 justify-between h-8 px-3 font-normal !bg-white !text-gray-900 active:scale-100";

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select...",
  allLabel = "All",
  allValue = "all",
  className,
  triggerClassName,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const searchRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  const normalized = React.useMemo(() => normalizeOptions(options), [options]);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return normalized;
    const q = search.toLowerCase();
    return normalized.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [normalized, search]);

  const displayValue =
    value === allValue
      ? allLabel
      : normalized.find((o) => o.value === value)?.label ?? value;

  const pick = (next: string) => {
    onValueChange(next);
    setOpen(false);
    setSearch("");
  };

  return (
    <div className="w-full min-w-0">
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            className={cn(SEARCHABLE_SELECT_TRIGGER_CLASS, triggerClassName)}
          >
            <span className="min-w-0 flex-1 truncate text-left">{displayValue || placeholder}</span>
            <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-50 pointer-events-none" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className={cn("w-[var(--radix-popover-trigger-width)] min-w-[220px] p-0", className)}
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                ref={searchRef}
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-sm"
              />
            </div>
          </div>
          <div
            className="max-h-[240px] overflow-y-auto overscroll-contain p-1"
            onWheel={onWheelScrollContainer}
          >
            <button
              type="button"
              className={cn(
                "flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent",
                value === allValue && "bg-accent",
              )}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(allValue)}
            >
              <Check className={cn("h-3.5 w-3.5", value === allValue ? "opacity-100" : "opacity-0")} />
              {allLabel}
            </button>
            {filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent text-left",
                  value === option.value && "bg-accent",
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(option.value)}
              >
                <Check className={cn("h-3.5 w-3.5", value === option.value ? "opacity-100" : "opacity-0")} />
                {option.label}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-3">No results</p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
