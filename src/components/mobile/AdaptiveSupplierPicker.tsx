import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  MobileSupplierPickerSheet,
  type SupplierPickerOption,
} from "./MobileSupplierPickerSheet";

interface AdaptiveSupplierPickerProps {
  label?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedId: string | null;
  selectedLabel: string;
  placeholder?: string;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  options: SupplierPickerOption[];
  onSelect: (supplier: SupplierPickerOption) => void;
  emptyMessage?: string;
  triggerClassName?: string;
  popoverWidth?: string;
}

export function AdaptiveSupplierPicker({
  label,
  open,
  onOpenChange,
  selectedId,
  selectedLabel,
  placeholder = "Select supplier",
  searchTerm,
  onSearchTermChange,
  options,
  onSelect,
  emptyMessage,
  triggerClassName,
  popoverWidth = "w-[350px]",
}: AdaptiveSupplierPickerProps) {
  const isMobile = useIsMobile();

  const trigger = (
    <Button
      type="button"
      variant="outline"
      role="combobox"
      aria-expanded={open}
      className={cn("w-full justify-between font-normal", triggerClassName)}
      onClick={() => isMobile && onOpenChange(true)}
    >
      <span className="truncate">{selectedId ? selectedLabel : placeholder}</span>
      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  );

  return (
    <div className="space-y-2">
      {label ? <Label>{label}</Label> : null}
      {isMobile ? (
        <>
          {trigger}
          <MobileSupplierPickerSheet
            open={open}
            onOpenChange={onOpenChange}
            searchTerm={searchTerm}
            onSearchTermChange={onSearchTermChange}
            options={options}
            selectedId={selectedId}
            onSelect={onSelect}
            emptyMessage={emptyMessage}
          />
        </>
      ) : (
        <Popover open={open} onOpenChange={onOpenChange}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent className={cn(popoverWidth, "p-0")} align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search supplier..."
                value={searchTerm}
                onValueChange={onSearchTermChange}
              />
              <CommandList>
                <CommandEmpty>{emptyMessage ?? "No supplier found"}</CommandEmpty>
                <CommandGroup>
                  {options
                    .filter((s) => {
                      if (!searchTerm.trim()) return true;
                      const t = searchTerm.toLowerCase();
                      return (
                        s.supplier_name.toLowerCase().includes(t) ||
                        (s.phone?.toLowerCase().includes(t) ?? false)
                      );
                    })
                    .slice(0, 30)
                    .map((supplier) => (
                      <CommandItem
                        key={supplier.id}
                        value={supplier.id}
                        onSelect={() => {
                          onSelect(supplier);
                          onOpenChange(false);
                          onSearchTermChange("");
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="text-sm">{supplier.supplier_name}</span>
                          {supplier.phone ? (
                            <span className="text-xs text-muted-foreground ml-2">{supplier.phone}</span>
                          ) : null}
                        </div>
                        {supplier.outstandingBalance != null && supplier.outstandingBalance > 0 ? (
                          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 ml-2">
                            ₹{Math.round(supplier.outstandingBalance).toLocaleString("en-IN")}
                          </Badge>
                        ) : null}
                        {selectedId === supplier.id ? (
                          <Check className="ml-1 h-3 w-3 text-primary" />
                        ) : null}
                      </CommandItem>
                    ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

export type { SupplierPickerOption };
