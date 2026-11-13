import type { ReactNode } from "react";
import { AlertCircle, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type SalesInvoicePickerCustomer = {
  id: string;
  customer_name: string;
  phone?: string | null;
  email?: string | null;
};

/**
 * Sales Invoice customer search: a popover list with Due / Cr and advance badges, "Create
 * <search>" when nothing matches, and retry on a load error. The trigger is passed in, so the
 * desktop combobox and the phone's "Tap to select customer…" button open the same list —
 * the phone layout used to set the open flag with no list rendered, so a customer could not be
 * picked on a phone. Moved out of SalesInvoice.tsx (Plan Phase 4, S4).
 */
export function SalesInvoiceCustomerPicker<C extends SalesInvoicePickerCustomer>({
  open,
  onOpenChange,
  trigger,
  search,
  onSearchChange,
  customers,
  hasMore,
  loading,
  error,
  onRetry,
  getBalance,
  getAdvance,
  onPick,
  onCreateFromSearch,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button that opens the list (rendered as the popover trigger). */
  trigger: ReactNode;
  search: string;
  onSearchChange: (value: string) => void;
  customers: C[];
  hasMore: boolean;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** Positive = customer owes (Due), negative = credit (Cr). */
  getBalance: (customer: C) => number;
  getAdvance: (customerId: string) => number;
  onPick: (customer: C) => void;
  /** "Create <search>" when nothing matches: opens Add New Customer pre-filled. */
  onCreateFromSearch: (search: string) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-[min(400px,calc(100vw-2rem))] p-0 z-50" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search by name, phone, email..." value={search} onValueChange={onSearchChange} />
          <CommandList className="max-h-[300px]">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <CommandEmpty className="py-4 text-center">
                <div className="text-destructive flex items-center justify-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  <span>Error loading customers</span>
                </div>
                <Button variant="link" size="sm" onClick={onRetry} className="mt-2">
                  Try again
                </Button>
              </CommandEmpty>
            ) : customers.length === 0 && search.length >= 1 ? (
              <CommandEmpty className="py-3">
                <div className="text-center text-sm text-muted-foreground mb-2">No customers found</div>
                <Button variant="outline" size="sm" onClick={() => onCreateFromSearch(search)} className="gap-1">
                  <Plus className="h-4 w-4" />
                  Create "{search}"
                </Button>
              </CommandEmpty>
            ) : customers.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Start typing to search customers...</div>
            ) : (
              <CommandGroup heading={`Found ${customers.length} customers${hasMore ? " - refine search for more" : ""}`}>
                {customers.map((customer) => {
                  const balance = getBalance(customer);
                  const advanceAmt = getAdvance(customer.id);
                  return (
                    <CommandItem key={customer.id} value={customer.id} onSelect={() => onPick(customer)} className="cursor-pointer">
                      <div className="flex flex-col gap-1 w-full">
                        <div className="flex items-center justify-between">
                          <span className="font-medium uppercase">{customer.customer_name}</span>
                          <div className="flex items-center gap-1.5">
                            {advanceAmt > 0 && (
                              <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600">
                                ₹{advanceAmt.toLocaleString("en-IN")} Adv
                              </span>
                            )}
                            {balance !== 0 && (
                              <span
                                className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                  balance > 0 ? "bg-destructive/10 text-destructive" : "bg-green-500/10 text-green-600"
                                }`}
                              >
                                ₹{Math.abs(balance).toLocaleString("en-IN")} {balance > 0 ? "Due" : "Cr"}
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
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
