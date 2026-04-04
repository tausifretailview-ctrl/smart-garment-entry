import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  allLabel?: string;
  allValue?: string;
  className?: string;
  triggerClassName?: string;
}

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

  const filtered = React.useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  const displayValue = value === allValue ? allLabel : value;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between h-10 font-normal !bg-white !text-gray-900",
            triggerClassName
          )}
        >
          <span className="truncate">{displayValue}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-[220px] p-0", className)} align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-sm"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-[240px] overflow-y-auto p-1">
          <button
            className={cn(
              "flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent",
              value === allValue && "bg-accent"
            )}
            onClick={() => { onValueChange(allValue); setOpen(false); setSearch(""); }}
          >
            <Check className={cn("h-3.5 w-3.5", value === allValue ? "opacity-100" : "opacity-0")} />
            {allLabel}
          </button>
          {filtered.map((option) => (
            <button
              key={option}
              className={cn(
                "flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent text-left",
                value === option && "bg-accent"
              )}
              onClick={() => { onValueChange(option); setOpen(false); setSearch(""); }}
            >
              <Check className={cn("h-3.5 w-3.5", value === option ? "opacity-100" : "opacity-0")} />
              {option}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-3">No results</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
