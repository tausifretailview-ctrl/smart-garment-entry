import { Check, Search, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MobilePickerSheet } from "./MobilePickerSheet";

export interface CustomerPickerOption {
  id: string;
  customer_name: string;
  phone?: string | null;
  outstandingBalance?: number;
}

interface MobileCustomerPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  options: CustomerPickerOption[];
  selectedId?: string | null;
  onSelect: (customer: CustomerPickerOption) => void;
  emptyMessage?: string;
  showOutstanding?: boolean;
  walkInLabel?: string;
  onWalkIn?: () => void;
}

export function MobileCustomerPickerSheet({
  open,
  onOpenChange,
  title = "Select customer",
  searchTerm,
  onSearchTermChange,
  options,
  selectedId,
  onSelect,
  emptyMessage = "No customer found",
  showOutstanding = false,
  walkInLabel,
  onWalkIn,
}: MobileCustomerPickerSheetProps) {
  const filtered = options.filter((c) => {
    if (!searchTerm.trim()) return true;
    const t = searchTerm.toLowerCase();
    return (
      c.customer_name.toLowerCase().includes(t) ||
      (c.phone?.toLowerCase().includes(t) ?? false)
    );
  });

  const handleSelect = (customer: CustomerPickerOption) => {
    onSelect(customer);
    onOpenChange(false);
    onSearchTermChange("");
  };

  return (
    <MobilePickerSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Search by name or phone"
    >
      <div className="relative mb-3 shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search customer..."
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          className="pl-9 h-11 rounded-xl bg-muted/40 border-0"
          autoFocus
        />
      </div>
      <ScrollArea className="flex-1 min-h-0 max-h-[min(60dvh,480px)] -mx-1 px-1">
        <div className="space-y-1 pb-2">
          {onWalkIn && walkInLabel ? (
            <button
              type="button"
              onClick={() => {
                onWalkIn();
                onOpenChange(false);
                onSearchTermChange("");
              }}
              className="w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-left active:bg-muted/60 touch-manipulation"
            >
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">{walkInLabel}</span>
            </button>
          ) : null}
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">{emptyMessage}</p>
          ) : (
            filtered.map((customer) => {
              const selected = selectedId === customer.id;
              return (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => handleSelect(customer)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 rounded-xl px-3.5 py-3 text-left active:bg-muted/60 touch-manipulation",
                    selected && "bg-primary/10 ring-1 ring-primary/30"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{customer.customer_name}</p>
                    {customer.phone ? (
                      <p className="text-xs text-muted-foreground">{customer.phone}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {showOutstanding &&
                    customer.outstandingBalance != null &&
                    customer.outstandingBalance > 0 ? (
                      <Badge variant="destructive" className="tabular-nums text-[10px]">
                        ₹{Math.round(customer.outstandingBalance).toLocaleString("en-IN")}
                      </Badge>
                    ) : null}
                    {selected ? <Check className="h-4 w-4 text-primary" /> : null}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </MobilePickerSheet>
  );
}
