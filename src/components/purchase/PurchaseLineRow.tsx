import { memo, type Ref } from "react";
import { AlertTriangle, Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalculatorInput } from "@/components/ui/calculator-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { QtyInput } from "@/components/ui/qty-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getUOMLabel } from "@/constants/uom";
import { cn } from "@/lib/utils";
import { computePurchaseLineSubTotal } from "@/utils/excelImportUtils";
import { formatProductDescription } from "@/utils/purchaseProductDescription";
import { minQtyForUom } from "@/utils/qtyInput";
import { formatMobileErpSizeCell } from "@/utils/retailErpWhatsAppProductLabel";

/** The Purchase Entry line fields the row shows and edits. */
export type PurchaseLineRowItem = {
  temp_id: string;
  product_name: string;
  size: string;
  qty: number;
  pur_price: number;
  sale_price: number;
  mrp?: number;
  gst_per: number;
  barcode: string;
  discount_percent: number;
  line_total: number;
  brand?: string;
  category?: string;
  color?: string;
  style?: string;
  uom?: string;
};

export type PurchaseLineEditableField = "qty" | "pur_price" | "sale_price" | "mrp" | "gst_per" | "discount_percent";

/** Which optional columns the table shows (user column permissions + Settings → Purchase MRP). */
export type PurchaseLineColumns = {
  showSize: boolean;
  showMrp: boolean;
  showGst: boolean;
  showDiscPercent: boolean;
};

export type PurchaseLineRowProps<T extends PurchaseLineRowItem> = PurchaseLineColumns & {
  item: T;
  index: number;
  /** Set on the last line only: Alt+↓ / scan flows focus its QTY box. */
  qtyInputRef?: Ref<HTMLInputElement>;
  selected: boolean;
  /** Duplicate-barcode warning for this line, if any. */
  barcodeWarning?: string;
  /** Green tick after the Edit panel saved this line. */
  updated: boolean;
  isMobileERPMode: boolean;
  /** Mobile ERP "allow IMEI edit after save" and the bill is not locked. */
  imeiEditable: boolean;
  /** Same barcode series on: select the QTY text on focus. */
  selectQtyOnFocus: boolean;
  /** Handlers must be stable (useCallback) for memo to skip unchanged lines. */
  onToggleSelect: (tempId: string) => void;
  onUpdate: (tempId: string, field: PurchaseLineEditableField, value: number) => void;
  onRemove: (tempId: string) => void;
  onOpenEdit: (index: number, focusField?: string) => void;
  onImeiCorrection: (item: T, rawBarcode: string) => void;
};

function PurchaseLineRowInner<T extends PurchaseLineRowItem>({
  item,
  index,
  qtyInputRef,
  selected,
  barcodeWarning,
  updated,
  isMobileERPMode,
  imeiEditable,
  selectQtyOnFocus,
  showSize,
  showMrp,
  showGst,
  showDiscPercent,
  onToggleSelect,
  onUpdate,
  onRemove,
  onOpenEdit,
  onImeiCorrection,
}: PurchaseLineRowProps<T>) {
  const subTotal = computePurchaseLineSubTotal(item);
  const description = formatProductDescription(item);
  const warningInBill = !!barcodeWarning && barcodeWarning.includes("Duplicate barcode in this bill");

  return (
    <TableRow
      className={`purchase-bill-line-row hover:bg-green-50/40 transition-colors ${index % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}
    >
      <TableCell className="w-[40px]">
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(item.temp_id)}
          aria-label={`Select ${item.product_name} for printing`}
        />
      </TableCell>
      <TableCell className="w-[60px] text-center font-medium">{index + 1}</TableCell>
      <TableCell
        className="col-product w-[20rem] max-w-[20rem] font-medium cursor-pointer"
        title={description}
        onDoubleClick={() => onOpenEdit(index, "product_name")}
      >
        <div className="entry-line-product-desc text-[15px] leading-snug font-semibold">{description}</div>
      </TableCell>
      {showSize && (
        <TableCell className="pur-col-size w-[4.5rem] text-center text-[15px] font-bold">
          {(isMobileERPMode ? formatMobileErpSizeCell(item.size) : item.size) || "—"}
        </TableCell>
      )}
      <TableCell className="pur-col-barcode w-[9rem]">
        {isMobileERPMode && imeiEditable ? (
          <Input
            key={`imei-${item.temp_id}-${item.barcode}`}
            defaultValue={item.barcode || ""}
            onBlur={(e) => onImeiCorrection(item, e.target.value)}
            className="font-mono text-[13px] h-9 tracking-wider"
            placeholder="IMEI..."
            title="Edit IMEI — tab out to save"
          />
        ) : (
          <Badge variant="outline" className={cn("text-[14px] font-mono px-2 py-1", isMobileERPMode && "tracking-wider")}>
            {item.barcode || "—"}
          </Badge>
        )}
        {barcodeWarning && (
          <div
            className={cn(
              "flex items-start gap-1.5 mt-1 text-xs rounded px-2 py-1.5",
              warningInBill
                ? "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
                : "text-destructive bg-destructive/10 border border-destructive/30",
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{barcodeWarning}</span>
          </div>
        )}
      </TableCell>
      <TableCell className="pur-col-num w-[5.5rem]">
        <div className="flex items-center gap-0.5">
          <QtyInput
            ref={qtyInputRef}
            uom={item.uom}
            value={item.qty || minQtyForUom(item.uom)}
            onFocus={(e) => {
              if (selectQtyOnFocus) e.target.select();
            }}
            onChange={(val) => onUpdate(item.temp_id, "qty", val)}
            className="w-full text-right px-2 bg-amber-50 border-amber-200 text-center text-[16px] font-bold h-10"
          />
          {item.uom && item.uom !== "NOS" && item.uom !== "PCS" && (
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">{getUOMLabel(item.uom)}</span>
          )}
        </div>
      </TableCell>
      <TableCell className="pur-col-num w-[6.5rem]">
        <CalculatorInput
          value={item.pur_price}
          onChange={(val) => onUpdate(item.temp_id, "pur_price", val)}
          className="w-full text-right text-[16px] bg-green-50 border-green-200 text-green-800 font-bold h-10"
        />
      </TableCell>
      <TableCell className="pur-col-num w-[6.5rem]">
        <CalculatorInput
          value={item.sale_price}
          onChange={(val) => onUpdate(item.temp_id, "sale_price", val)}
          className="w-full text-right text-[16px] bg-blue-50 border-blue-200 text-blue-800 font-bold h-10"
        />
      </TableCell>
      {showMrp && (
        <TableCell className="pur-col-num w-[6.5rem]">
          <CalculatorInput
            value={item.mrp || 0}
            onChange={(val) => onUpdate(item.temp_id, "mrp", val)}
            className="w-full text-right text-[15px] font-semibold"
          />
        </TableCell>
      )}
      {showGst && (
        <TableCell className="pur-col-num w-[5.5rem]">
          <Select value={String(item.gst_per)} onValueChange={(value) => onUpdate(item.temp_id, "gst_per", Number(value))}>
            <SelectTrigger className="w-full h-10 text-[15px] font-semibold">
              <SelectValue placeholder="GST" />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value="0">0%</SelectItem>
              <SelectItem value="5">5%</SelectItem>
              <SelectItem value="12">12%</SelectItem>
              <SelectItem value="18">18%</SelectItem>
              <SelectItem value="28">28%</SelectItem>
            </SelectContent>
          </Select>
        </TableCell>
      )}
      <TableCell className="pur-col-num w-[6rem] text-right text-[15px] font-semibold tabular-nums">
        ₹{subTotal.toFixed(2)}
      </TableCell>
      {showDiscPercent && (
        <TableCell className="pur-col-num w-[5.5rem]">
          <Input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={item.discount_percent}
            onChange={(e) => onUpdate(item.temp_id, "discount_percent", parseFloat(e.target.value) || 0)}
            onWheel={(e) => (e.target as HTMLInputElement).blur()}
            className="w-full text-right text-[14px] font-semibold"
          />
        </TableCell>
      )}
      <TableCell className="pur-col-num w-[6rem] text-right text-[15px] font-bold tabular-nums text-green-700 bg-green-50/40 font-mono">
        ₹{item.line_total.toFixed(2)}
      </TableCell>
      <TableCell className="w-[40px]">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onRemove(item.temp_id)} title="Remove line">
          <X className="h-4 w-4 text-destructive" />
        </Button>
      </TableCell>
      <TableCell className="w-[40px]">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-primary/10 group"
            onClick={() => onOpenEdit(index)}
            title="Edit Product Details"
          >
            <Pencil className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </Button>
          {updated && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 text-green-600 border-green-300 bg-green-50 animate-in fade-in">
              ✓
            </Badge>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * One Purchase Entry desktop line: print tick, SR no, item, size, barcode/IMEI, QTY, rates, MRP,
 * GST, sub total, disc %, total, remove and edit. Moved out of PurchaseEntry.tsx (Plan Phase 4,
 * S4). Memoised: typing in one line no longer redraws every other line of a large bill.
 */
export const PurchaseLineRow = memo(PurchaseLineRowInner) as typeof PurchaseLineRowInner;

/** Header row of the Purchase Entry lines table; the tick selects every line for printing. */
export const PurchaseLinesTableHeader = memo(function PurchaseLinesTableHeader({
  allSelected,
  onToggleAll,
  isMobileERPMode,
  showSize,
  showMrp,
  showGst,
  showDiscPercent,
}: PurchaseLineColumns & {
  allSelected: boolean;
  onToggleAll: () => void;
  isMobileERPMode: boolean;
}) {
  return (
    <TableHeader className="sticky top-0 z-10 erp-invoice-table-header">
      <TableRow>
        <TableHead className="w-[40px]">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onToggleAll}
            className="rounded cursor-pointer"
            aria-label="Select all lines for printing"
            title="Select all lines for printing"
          />
        </TableHead>
        <TableHead className="w-[60px]">SR.NO</TableHead>
        <TableHead className="col-product w-[20rem] max-w-[20rem]">ITEM NAME</TableHead>
        {showSize && <TableHead className="pur-col-size w-[4.5rem] text-center">SIZE</TableHead>}
        <TableHead className="pur-col-barcode w-[9rem]">{isMobileERPMode ? "IMEI / BARCODE" : "BARCODE"}</TableHead>
        <TableHead className="pur-col-num w-[5.5rem] text-right pur-qty-col">QTY</TableHead>
        <TableHead className="pur-col-num w-[6.5rem] text-right pur-rate-col">PUR.RATE</TableHead>
        <TableHead className="pur-col-num w-[6.5rem] text-right sale-rate-col">SALE.RATE</TableHead>
        {showMrp && <TableHead className="pur-col-num w-[6.5rem] text-right">MRP</TableHead>}
        {showGst && <TableHead className="pur-col-num w-[5.5rem] text-right">GST %</TableHead>}
        <TableHead className="pur-col-num w-[6rem] text-right">SUB TOTAL</TableHead>
        {showDiscPercent && <TableHead className="pur-col-num w-[5.5rem] text-right">DISC %</TableHead>}
        <TableHead className="pur-col-num w-[6rem] text-right total-col">TOTAL</TableHead>
        <TableHead className="w-[40px]"></TableHead>
        <TableHead className="w-[40px]">Action</TableHead>
      </TableRow>
    </TableHeader>
  );
});
