import { memo } from "react";
import { AlertCircle, Check, Loader2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { posCustomerDueChip } from "./posCustomerChips";

export type PosCustomerOption = {
  id: string;
  customer_name: string;
  phone?: string | null;
  email?: string | null;
};

export type PosCustomerPickerProps = {
  open: boolean;
  /** Stable setter. Other screens / dialogs open the search from POSSales, so it lives there. */
  setOpen: (open: boolean) => void;
  customerName: string;
  /** Stable setter. The typed text is also the search term. */
  setCustomerName: (name: string) => void;
  /** Stable: clear the customer (name, id, phone, linked phone). */
  onClear: () => void;
  /** Stable: open Add Customer (phone pre-filled when the text is a phone number). */
  onAddCustomer: () => void;
  /** Stable: put this customer on the bill and close the search. */
  onPick: (customer: PosCustomerOption) => void;
  isLoading: boolean;
  balancesLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** Customers loaded (heading count). */
  totalCount: number;
  hasMore: boolean;
  customers: PosCustomerOption[];
  /** Stable getters from useCustomerBalances. */
  getCustomerSnapshot: (id: string) => { grossOutstandingDr?: number | null } | null | undefined;
  getCustomerAdvance: (id: string) => number;
  getCustomerCreditNote: (id: string) => number;
};

/**
 * POS header Customer Name box with its search popup (name / phone / email), the clear and
 * Add Customer buttons, and per-customer Adv / CN / Due chips. Moved out of POSSales.tsx
 * unchanged (Plan Phase 4, S4).
 */
export const PosCustomerPicker = memo(function PosCustomerPicker({
  open,
  setOpen,
  customerName,
  setCustomerName,
  onClear,
  onAddCustomer,
  onPick,
  isLoading,
  balancesLoading,
  isError,
  onRetry,
  totalCount,
  hasMore,
  customers,
  getCustomerSnapshot,
  getCustomerAdvance,
  getCustomerCreditNote,
}: PosCustomerPickerProps) {
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative w-72 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer Name</Label>
          </div>
          <Input
            value={customerName}
            onChange={(e) => {
              setCustomerName(e.target.value);
              setOpen(true);
            }}
            className="h-10 text-base pr-20 border-border/80 focus:border-primary"
            placeholder="Enter customer name or phone"
          />
          {customerName && (
            <Button
              size="icon"
              variant="ghost"
              className="absolute right-8 top-1/2 translate-y-0.5 h-8 w-8"
              aria-label="Clear customer"
              onClick={onClear}
            >
              <X className="h-5 w-5" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="absolute right-1 top-1/2 translate-y-0.5 h-8 w-8"
            onClick={onAddCustomer}
            title="Add New Customer"
          >
            <UserPlus className="h-5 w-5" />
          </Button>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0 z-50" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search by name, phone, or email..." value={customerName} onValueChange={setCustomerName} />
          <CommandList>
            {isLoading || balancesLoading ? (
              <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {isLoading ? "Loading customers..." : "Loading balances..."}
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center p-4 text-sm">
                <div className="flex items-center text-destructive mb-2">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Error loading customers
                </div>
                <Button variant="outline" size="sm" onClick={onRetry} className="text-xs">
                  Retry
                </Button>
              </div>
            ) : (
              <>
                <CommandEmpty>No customers found.</CommandEmpty>
                <CommandGroup heading={`Customers (${totalCount})${hasMore ? " - refine search for more" : ""}`}>
                  {customers.map((customer) => {
                    // Bills still unpaid; the advance is shown beside it (shop rule, Nov 2026).
                    const due = posCustomerDueChip(getCustomerSnapshot(customer.id)?.grossOutstandingDr);
                    const advanceAmt = getCustomerAdvance(customer.id);
                    const creditNoteAmt = getCustomerCreditNote(customer.id);
                    return (
                      <CommandItem
                        key={customer.id}
                        value={`${customer.customer_name} ${customer.phone || ""} ${customer.email || ""}`}
                        onSelect={() => onPick(customer)}
                        className="cursor-pointer"
                      >
                        <Check className="mr-2 h-4 w-4 opacity-0" />
                        <div className="flex flex-col flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{customer.customer_name}</span>
                            <div className="flex items-center gap-1.5">
                              {advanceAmt > 0 && (
                                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600">
                                  ₹{advanceAmt.toLocaleString("en-IN")} Adv
                                </span>
                              )}
                              {creditNoteAmt > 0 && (
                                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600">
                                  ₹{creditNoteAmt.toLocaleString("en-IN")} CN
                                </span>
                              )}
                              {due && (
                                <span
                                  className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                    due.kind === "due" ? "bg-destructive/10 text-destructive" : "bg-green-500/10 text-green-600"
                                  }`}
                                >
                                  {due.label}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {customer.phone && `Phone: ${customer.phone}`}
                            {customer.email && ` | Email: ${customer.email}`}
                          </span>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
});
