import { useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type CustomerLocationFilterProps = {
  value: string;
  options: string[];
  onChange: (location: string) => void;
  className?: string;
};

export function CustomerLocationFilter({
  value,
  options,
  onChange,
  className,
}: CustomerLocationFilterProps) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const apply = (next: string) => {
    onChange(next.trim());
    setTyped("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-10 min-w-[10.5rem] max-w-full justify-between border-slate-200 bg-slate-50 px-3 text-sm font-normal hover:bg-white",
            value && "border-primary/40 bg-primary/5",
            className,
          )}
          title="Filter customers by city / location in address"
        >
          <span className="flex min-w-0 items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className={cn("truncate", !value && "text-muted-foreground")}>
              {value || "All locations"}
            </span>
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[16rem] p-0" align="start">
        <Command shouldFilter>
          <CommandInput
            placeholder="City e.g. Bangalore…"
            value={typed}
            onValueChange={setTyped}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                apply(typed || value);
              }
            }}
          />
          <CommandList>
            <CommandEmpty>
              {typed.trim()
                ? `No saved city. Press Enter to filter “${typed.trim()}”.`
                : "No locations in customer addresses yet."}
            </CommandEmpty>
            <CommandGroup>
              <CommandItem value="all-locations" onSelect={() => apply("")}>
                All locations
              </CommandItem>
              {options.map((city) => (
                <CommandItem key={city} value={city} onSelect={() => apply(city)}>
                  {city}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
