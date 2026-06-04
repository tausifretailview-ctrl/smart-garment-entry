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
  MobileCustomerPickerSheet,
  type CustomerPickerOption,
} from "./MobileCustomerPickerSheet";

interface AdaptiveCustomerPickerProps {
  label?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedId: string | null;
  selectedLabel: string;
  placeholder?: string;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  options: CustomerPickerOption[];
  onSelect: (customer: CustomerPickerOption) => void;
  emptyMessage?: string;
  showOutstanding?: boolean;
  triggerClassName?: string;
  sheetTitle?: string;
  walkInLabel?: string;
  onWalkIn?: () => void;
  /** Desktop popover width */
  popoverWidth?: string;
  isLoading?: boolean;
  loadingMessage?: string;
}

export function AdaptiveCustomerPicker({
  label,
  open,
  onOpenChange,
  selectedId,
  selectedLabel,
  placeholder = "Select customer",
  searchTerm,
  onSearchTermChange,
  options,
  onSelect,
  emptyMessage,
  showOutstanding = false,
  triggerClassName,
  sheetTitle,
  walkInLabel,
  onWalkIn,
  popoverWidth = "w-[400px]",
  isLoading = false,
  loadingMessage = "Loading customers...",
}: AdaptiveCustomerPickerProps) {
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

  const desktopList = (
    <Command shouldFilter={false}>
      <CommandInput
        placeholder="Search by name or phone..."
        value={searchTerm}
        onValueChange={onSearchTermChange}
      />
      <CommandList>
        {!isLoading && (
          <CommandEmpty>{emptyMessage ?? "No customer found"}</CommandEmpty>
        )}
        <CommandGroup>
          {isLoading ? (
            <CommandItem disabled className="text-muted-foreground">
              {loadingMessage}
            </CommandItem>
          ) : null}
          {!isLoading &&
            options
            .filter((c) => {
              if (!searchTerm.trim()) return true;
              const t = searchTerm.toLowerCase();
              return (
                c.customer_name.toLowerCase().includes(t) ||
                (c.phone?.toLowerCase().includes(t) ?? false)
              );
            })
            .slice(0, 50)
            .map((customer) => (
              <CommandItem
                key={customer.id}
                value={customer.id}
                onSelect={() => {
                  onSelect(customer);
                  onOpenChange(false);
                  onSearchTermChange("");
                }}
                className="flex items-center justify-between"
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">{customer.customer_name}</span>
                  {customer.phone ? (
                    <span className="text-xs text-muted-foreground">{customer.phone}</span>
                  ) : null}
                </div>
                {showOutstanding &&
                customer.outstandingBalance != null &&
                customer.outstandingBalance > 0 ? (
                  <Badge variant="destructive" className="ml-2 shrink-0 tabular-nums">
                    ₹{Math.round(customer.outstandingBalance).toLocaleString("en-IN")}
                  </Badge>
                ) : null}
                {selectedId === customer.id ? (
                  <Check className="ml-2 h-4 w-4 text-primary shrink-0" />
                ) : null}
              </CommandItem>
            ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );

  return (
    <div className="space-y-2">
      {label ? <Label>{label}</Label> : null}
      {isMobile ? (
        <>
          {trigger}
          <MobileCustomerPickerSheet
            open={open}
            onOpenChange={onOpenChange}
            title={sheetTitle ?? "Select customer"}
            searchTerm={searchTerm}
            onSearchTermChange={onSearchTermChange}
            options={options}
            selectedId={selectedId}
            onSelect={onSelect}
            emptyMessage={isLoading ? loadingMessage : emptyMessage}
            showOutstanding={showOutstanding}
            walkInLabel={walkInLabel}
            onWalkIn={onWalkIn}
          />
        </>
      ) : (
        <Popover open={open} onOpenChange={onOpenChange}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent className={cn(popoverWidth, "p-0")} align="start">
            {desktopList}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

export type { CustomerPickerOption };
