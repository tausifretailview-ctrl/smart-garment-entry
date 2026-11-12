import { memo, useMemo } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { filterPosSalesmen } from "./posSalesmen";

export type PosSalesmanOption = { id: string; employee_name: string; designation?: string | null };

export type PosSalesmanPickerProps = {
  open: boolean;
  /** Stable setter. Alt+M opens the picker from POSSales, so the open state lives there. */
  setOpen: (open: boolean) => void;
  search: string;
  /** Stable setter. */
  setSearch: (value: string) => void;
  selectedSalesman: string;
  /** Stable setter. */
  setSelectedSalesman: (name: string) => void;
  employees: PosSalesmanOption[];
  /**
   * Stable: after the picker closes (Esc / click outside). Must not pull the cursor from a field
   * the cashier clicked into (see refocusBarcodeAfterSalesmanPicker / posFocusMovedToOtherField).
   */
  onClosed: () => void;
  /** Stable: after a name is picked (back to the barcode box). */
  onPicked: () => void;
};

/**
 * POS header Salesperson box with its employee search. Moved out of POSSales.tsx unchanged
 * (Plan Phase 4, S4). `data-pos-salesman-picker` marks the popup (Alt+M focuses its search box).
 */
export const PosSalesmanPicker = memo(function PosSalesmanPicker({
  open,
  setOpen,
  search,
  setSearch,
  selectedSalesman,
  setSelectedSalesman,
  employees,
  onClosed,
  onPicked,
}: PosSalesmanPickerProps) {
  const filtered = useMemo(() => filterPosSalesmen(employees, search), [employees, search]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSearch("");
          // Return cursor to barcode — Esc or select (scanner must not type into filter).
          onClosed();
        }
      }}
    >
      <PopoverTrigger asChild>
        <div className="relative w-36 shrink-0">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Salesperson</Label>
          <Input
            value={selectedSalesman}
            onChange={(e) => {
              setSelectedSalesman(e.target.value);
              setOpen(true);
            }}
            className="h-10 text-sm pr-8 border-border/80 focus:border-primary"
            placeholder="Select..."
          />
          {selectedSalesman && (
            <Button
              size="icon"
              variant="ghost"
              className="absolute right-1 top-1/2 translate-y-0.5 h-7 w-7"
              aria-label="Clear salesperson"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedSalesman("");
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-[250px] p-0 z-50"
        align="start"
        data-pos-salesman-picker
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onClosed();
        }}
      >
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search employee..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No employees found.</CommandEmpty>
            <CommandGroup heading="Employees">
              {filtered.map((emp) => (
                <CommandItem
                  key={emp.id}
                  value={emp.employee_name}
                  onSelect={() => {
                    setSelectedSalesman(emp.employee_name);
                    setOpen(false);
                    setSearch("");
                    onPicked();
                  }}
                  className="cursor-pointer"
                >
                  <Check className={`mr-2 h-4 w-4 ${selectedSalesman === emp.employee_name ? "opacity-100" : "opacity-0"}`} />
                  <div className="flex flex-col">
                    <span className="font-medium">{emp.employee_name}</span>
                    {emp.designation && <span className="text-xs text-muted-foreground">{emp.designation}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
});
