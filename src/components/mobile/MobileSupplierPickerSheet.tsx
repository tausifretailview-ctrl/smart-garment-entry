import { Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MobilePickerSheet } from "./MobilePickerSheet";

export interface SupplierPickerOption {
  id: string;
  supplier_name: string;
  phone?: string | null;
  outstandingBalance?: number;
}

interface MobileSupplierPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  options: SupplierPickerOption[];
  selectedId?: string | null;
  onSelect: (supplier: SupplierPickerOption) => void;
  emptyMessage?: string;
}

export function MobileSupplierPickerSheet({
  open,
  onOpenChange,
  title = "Select supplier",
  searchTerm,
  onSearchTermChange,
  options,
  selectedId,
  onSelect,
  emptyMessage = "No supplier found",
}: MobileSupplierPickerSheetProps) {
  const filtered = options.filter((s) => {
    if (!searchTerm.trim()) return true;
    const t = searchTerm.toLowerCase();
    return (
      s.supplier_name.toLowerCase().includes(t) ||
      (s.phone?.toLowerCase().includes(t) ?? false)
    );
  });

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
          placeholder="Search supplier..."
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          className="pl-9 h-11 rounded-xl bg-muted/40 border-0"
          autoFocus
        />
      </div>
      <ScrollArea className="flex-1 min-h-0 max-h-[min(60dvh,480px)] -mx-1 px-1">
        <div className="space-y-1 pb-2">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">{emptyMessage}</p>
          ) : (
            filtered.map((supplier) => {
              const selected = selectedId === supplier.id;
              return (
                <button
                  key={supplier.id}
                  type="button"
                  onClick={() => {
                    onSelect(supplier);
                    onOpenChange(false);
                    onSearchTermChange("");
                  }}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 rounded-xl px-3.5 py-3 text-left active:bg-muted/60 touch-manipulation",
                    selected && "bg-primary/10 ring-1 ring-primary/30"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{supplier.supplier_name}</p>
                    {supplier.phone ? (
                      <p className="text-xs text-muted-foreground">{supplier.phone}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {supplier.outstandingBalance != null && supplier.outstandingBalance > 0 ? (
                      <Badge variant="outline" className="tabular-nums text-[10px] text-amber-700 border-amber-300">
                        ₹{Math.round(supplier.outstandingBalance).toLocaleString("en-IN")}
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
