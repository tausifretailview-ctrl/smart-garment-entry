import { memo, useCallback, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPurchaseBillEntryAt } from "@/lib/purchaseBillEntryAt";
import { cn } from "@/lib/utils";

export type PurchaseBillDetailsFieldsProps = {
  /** Saved bill number in edit mode, else the preview of the next number. */
  softwareBillNo: string;
  supplierId: string;
  suppliers: Array<{ id: string; supplier_name: string }>;
  /** The supplier list loads when it is first opened. */
  onSupplierListOpen: () => void;
  onSupplierChange: (supplierId: string) => void;
  onAddSupplier: () => void;
  supplierInvoiceNo: string;
  onSupplierInvoiceNoChange: (value: string) => void;
  /** Next auto serial, shown as the invoice box placeholder. */
  nextSerial: string | null | undefined;
  billDate: Date;
  onBillDateChange: (date: Date) => void;
  /** When the bill was saved in EzzyERP (null for a new bill). */
  billEntryAt: string | null;
  isDcPurchase: boolean;
  /** DC-only users cannot untick DC Purchase. */
  dcLocked: boolean;
  onDcPurchaseChange: (checked: boolean) => void;
};

/**
 * Desktop Purchase Entry bill fields: Software Bill No, Supplier (+ add), Supplier Invoice No,
 * supplier bill date, bill entry date & time and the DC Purchase tick. Moved out of
 * PurchaseEntry.tsx (Plan Phase 4, S4). Handlers must be stable for memo to skip redraws while
 * the cashier types in the item lines.
 */
export const PurchaseBillDetailsFields = memo(function PurchaseBillDetailsFields({
  softwareBillNo,
  supplierId,
  suppliers,
  onSupplierListOpen,
  onSupplierChange,
  onAddSupplier,
  supplierInvoiceNo,
  onSupplierInvoiceNoChange,
  nextSerial,
  billDate,
  onBillDateChange,
  billEntryAt,
  isDcPurchase,
  dcLocked,
  onDcPurchaseChange,
}: PurchaseBillDetailsFieldsProps) {
  const [billDateOpen, setBillDateOpen] = useState(false);
  const handleDateSelect = useCallback(
    (date: Date | undefined) => {
      if (!date) return;
      onBillDateChange(date);
      setBillDateOpen(false);
    },
    [onBillDateChange],
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-x-3 gap-y-2 items-start purchase-entry-meta-grid entry-vasy-key-fields">
      <div className="space-y-1.5 min-w-0 entry-key-field entry-key-field--doc-no">
        <Label htmlFor="software_bill_no" className="entry-key-label text-[13px] font-semibold text-slate-500 leading-none">
          Software Bill No
        </Label>
        <Input
          id="software_bill_no"
          value={softwareBillNo}
          readOnly
          className="h-11 bg-muted font-mono font-bold text-base"
          placeholder="Auto-generated"
        />
      </div>

      <div className="col-span-2 space-y-1.5 min-w-0 entry-key-field entry-key-field--party">
        <Label htmlFor="supplier_name" className="entry-key-label text-[13px] font-semibold text-slate-500 leading-none">
          Supplier <span className="text-red-500">*</span>
        </Label>
        <div className="flex gap-1.5 min-w-0">
          <Select
            value={supplierId}
            onOpenChange={(open) => {
              if (open) onSupplierListOpen();
            }}
            onValueChange={onSupplierChange}
          >
            <SelectTrigger id="supplier_name" className="h-11 flex-1 min-w-0 text-base font-semibold">
              <SelectValue placeholder="Select supplier" />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              {suppliers.map((supplier) => (
                <SelectItem key={supplier.id} value={supplier.id}>
                  {supplier.supplier_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onAddSupplier}
            title="Add New Supplier"
            className="h-11 w-11 shrink-0"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-1.5 min-w-0 entry-key-field entry-key-field--doc-no">
        <Label htmlFor="supplier_invoice_no" className="entry-key-label text-[13px] font-semibold text-slate-500 leading-none">
          Supplier Invoice No <span className="text-red-500">*</span>
        </Label>
        <Input
          id="supplier_invoice_no"
          data-field="supplier-invoice-no"
          value={supplierInvoiceNo}
          onChange={(e) => onSupplierInvoiceNoChange(e.target.value)}
          placeholder={nextSerial ? `Serial on save: ${nextSerial}` : "Invoice number"}
          className="h-11 text-base font-semibold"
        />
      </div>

      <div className="space-y-1.5 min-w-0 entry-key-field entry-key-field--date">
        <Label htmlFor="bill_date" className="entry-key-label text-[13px] font-semibold text-slate-500 leading-none">
          Supplier bill date
        </Label>
        <Popover open={billDateOpen} onOpenChange={setBillDateOpen}>
          <PopoverTrigger asChild>
            <Button
              id="bill_date"
              variant="outline"
              className={cn(
                "h-11 w-full justify-start text-left font-semibold text-base px-3",
                !billDate && "text-muted-foreground",
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
              <span className="truncate">{billDate ? format(billDate, "dd MMM yyyy") : "Pick a date"}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={billDate}
              onSelect={handleDateSelect}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-1.5 min-w-0 entry-key-field entry-key-field--date">
        <Label className="entry-key-label text-[13px] font-semibold text-slate-500 leading-none">
          Bill entry date &amp; time
        </Label>
        <div
          className="h-11 px-3 flex items-center rounded-md border border-input bg-muted/40 text-base tabular-nums min-w-0 font-semibold"
          title="When this purchase bill was saved in EzzyERP"
        >
          {billEntryAt ? (
            <span className="text-foreground font-medium truncate">
              {formatPurchaseBillEntryAt({ bill_entry_at: billEntryAt })}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs truncate">Recorded automatically when you save</span>
          )}
        </div>
      </div>

      <div className="space-y-1.5 min-w-0 self-start">
        <span className="text-[13px] font-semibold text-slate-500 leading-none invisible select-none block" aria-hidden>
          Options
        </span>
        <label
          title="DC Purchase (No GST)"
          className="flex items-center gap-2 cursor-pointer h-10 px-3 border border-orange-300 bg-orange-50 dark:bg-orange-950/20 rounded-md w-full xl:w-auto max-w-full"
        >
          <Checkbox
            checked={isDcPurchase}
            disabled={dcLocked}
            onCheckedChange={(checked) => onDcPurchaseChange(checked === true)}
          />
          <span className="text-xs font-medium text-orange-700 dark:text-orange-400 whitespace-nowrap truncate">
            DC Purchase<span className="hidden xl:inline"> (No GST)</span>
          </span>
        </label>
      </div>
    </div>
  );
});
