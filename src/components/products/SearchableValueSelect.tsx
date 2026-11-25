import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

/**
 * Pick one value from a long list (brands, categories, product names) with a search box.
 * A plain Select has no search, so a brand like JULIET among hundreds could not be found.
 * `allLabel` adds an "All …" first row that clears the value.
 */
export function SearchableValueSelect({
  value,
  options,
  onChange,
  placeholder,
  searchPlaceholder,
  allLabel,
  className,
  testId,
}: {
  value: string | undefined;
  options: string[];
  onChange: (value: string | undefined) => void;
  placeholder: string;
  searchPlaceholder: string;
  allLabel?: string;
  className?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const pick = (v: string | undefined) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          data-testid={testId}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="truncate">{value || allLabel || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-60">
            <CommandEmpty>Nothing found.</CommandEmpty>
            <CommandGroup>
              {allLabel ? (
                <CommandItem value={`__all__ ${allLabel}`} onSelect={() => pick(undefined)}>
                  <Check className={cn("mr-2 h-4 w-4", value ? "opacity-0" : "opacity-100")} />
                  {allLabel}
                </CommandItem>
              ) : null}
              {options.map((option) => (
                <CommandItem key={option} value={option} onSelect={() => pick(option)}>
                  <Check className={cn("mr-2 h-4 w-4", value === option ? "opacity-100" : "opacity-0")} />
                  {option}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
