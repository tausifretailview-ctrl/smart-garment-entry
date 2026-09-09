import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { ProductPickerResult } from "@/utils/productMergeUtils";

export function ProductMergeCombobox({
  label,
  products,
  selected,
  onSelect,
  excludeId,
  placeholder = "Select product…",
  disabled,
}: {
  label: string;
  products: ProductPickerResult[];
  selected: ProductPickerResult | null;
  onSelect: (p: ProductPickerResult | null) => void;
  excludeId?: string | null;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const options = products.filter((p) => p.id !== excludeId);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between h-11 font-medium text-[15px]"
          >
            <span className="truncate text-left">
              {selected
                ? `${selected.productName} (${selected.variantCount} variant${selected.variantCount === 1 ? "" : "s"})`
                : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search product…" />
            <CommandList className="max-h-60">
              <CommandEmpty>No product found.</CommandEmpty>
              <CommandGroup>
                {options.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`${p.productName} ${p.id}`}
                    onSelect={() => {
                      onSelect(p);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn("mr-2 h-4 w-4", selected?.id === p.id ? "opacity-100" : "opacity-0")}
                    />
                    <span className="truncate">{p.productName}</span>
                    <span className="ml-auto pl-2 text-xs text-muted-foreground shrink-0">
                      {p.variantCount}v
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
