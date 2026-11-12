import { memo, useCallback } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QtyInput } from "@/components/ui/qty-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PosSchemeAppliedTag } from "@/components/pos/PosSchemeAppliedTag";
import { getUOMLabel } from "@/constants/uom";
import { cn } from "@/lib/utils";
import { getPosCartStockIndicator, posLineNetUnitPrice, type CartItem } from "@/lib/posBilling";
import type { GstTaxType } from "@/utils/gstRegisterUtils";
import { posLineDisplayTotal } from "@/utils/posGstTotals";
import { minQtyForUom } from "@/utils/qtyInput";
import { POS_PLAIN_NUMBER_CLASS, posPlainNumberProps } from "./posPlainNumber";
import { posDiscPctLabel, posHiddenMrpGap, posLineDiscountFigures, posLineDiscRsBoxValue } from "./posCartRow";

function formatINR2(value: number): string {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : 0;
  return safe.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const barcodeText = (barcode: string | null | undefined) => (barcode || "").trim();

/** Line actions, by cart index. One stable object for every row (latest functions behind it). */
export type PosCartRowActions = {
  registerRow: (id: string, el: HTMLDivElement | null) => void;
  updateQuantity: (index: number, qty: number) => unknown;
  updateMrp: (index: number, mrp: number) => void;
  updateGstPer: (index: number, gstPer: number) => void;
  updateDiscountPercent: (index: number, pct: number) => void;
  updateDiscountAmount: (index: number, amount: number) => void;
  updateLineSalesman: (index: number, name: string) => void;
  removeItem: (index: number) => void;
  setUnitPriceDraft: (draft: { index: number; value: string } | null) => void;
  requestUnitPriceCommit: (index: number, value: number) => void;
};

export type PosCartRowProps = {
  item: CartItem;
  index: number;
  isHighlighted: boolean;
  gridCols: string;
  showPurchaseCode: boolean;
  /** Encoded purchase code of this line ("" while loading / none). */
  purchaseCode: string;
  perLineSalesman: boolean;
  /** Line salesman, falling back to the header salesman. */
  lineSalesman: string;
  employees: { id: string; employee_name: string }[];
  enableMrp: boolean;
  taxType: GstTaxType;
  canEditUnitPrice: boolean;
  /** Text being typed in this line's unit price box; null when not editing it. */
  unitPriceDraft: string | null;
  actions: PosCartRowActions;
};

/**
 * One POS cart line: Sr, barcode, product (stock dot, notes, scheme / DC tags), purchase code,
 * size, colour, line salesman, qty, MRP, GST %, Disc %, Disc Rs, unit price and net with delete.
 * Moved out of POSSales.tsx unchanged (Plan Phase 4, S4). memo: typing in one line no longer
 * redraws every other line.
 */
export const PosCartRow = memo(function PosCartRow({
  item,
  index,
  isHighlighted,
  gridCols,
  showPurchaseCode,
  purchaseCode,
  perLineSalesman,
  lineSalesman,
  employees,
  enableMrp,
  taxType,
  canEditUnitPrice,
  unitPriceDraft,
  actions,
}: PosCartRowProps) {
  // Informational only — checkStock / validateCartStock remain enforcement.
  // Edit mode: stockQty ignores freedQty (may look slightly pessimistic).
  const stockIndicator = getPosCartStockIndicator(item.stockQty, item.quantity);
  const barcode = barcodeText(item.barcode);
  const rowRef = useCallback((el: HTMLDivElement | null) => actions.registerRow(item.id, el), [actions, item.id]);

  const { listUnit, lineDiscRs, discPct, hasLineDisc } = posLineDiscountFigures(item);
  const hiddenMrpNote = posHiddenMrpGap(item, enableMrp, hasLineDisc) ? (
    <span
      className="text-[10px] font-semibold text-muted-foreground line-through tabular-nums"
      title={`MRP ₹${formatINR2(Number(item.mrp))} − rate counts in bill Discount`}
    >
      MRP ₹{formatINR2(Number(item.mrp))}
    </span>
  ) : null;

  let unitPriceCell: React.ReactNode;
  if (hasLineDisc && !canEditUnitPrice) {
    // Match bill print: show list rate + -% when line discount is on
    unitPriceCell = (
      <div
        className="flex flex-col items-end justify-center min-h-8 leading-tight text-right"
        title={`List ₹${formatINR2(listUnit)} · Disc ${discPct > 0 ? `${discPct}%` : ""} ₹${formatINR2(lineDiscRs)} · Net unit ₹${formatINR2(posLineNetUnitPrice(item))}`}
      >
        <span className="text-base font-semibold tabular-nums text-foreground">₹{formatINR2(listUnit)}</span>
        {discPct > 0.005 && (
          <span className="text-[11px] font-semibold text-muted-foreground">{posDiscPctLabel(discPct)}</span>
        )}
      </div>
    );
  } else if (canEditUnitPrice) {
    unitPriceCell = (
      <div className="flex flex-col items-end gap-0.5">
        <Input
          type="number"
          inputMode="decimal"
          value={unitPriceDraft !== null ? unitPriceDraft : item.unitCost || ""}
          onFocus={(e) => {
            actions.setUnitPriceDraft({
              index,
              value: item.unitCost != null && item.unitCost !== 0 ? String(item.unitCost) : "",
            });
            e.currentTarget.select();
          }}
          onChange={(e) => actions.setUnitPriceDraft({ index, value: e.target.value })}
          onBlur={() => {
            if (unitPriceDraft === null) return;
            const parsed = parseFloat(unitPriceDraft);
            if (!Number.isFinite(parsed)) {
              actions.setUnitPriceDraft(null);
              return;
            }
            actions.requestUnitPriceCommit(index, parsed);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="0"
          className="h-8 text-sm w-full text-right bg-muted/30 border-border/60"
          min="0"
          step="0.01"
          title="Selling unit price (typed rate clears Disc% / Disc Rs)"
        />
        {hasLineDisc && (
          <span className="text-[10px] font-semibold text-muted-foreground">
            List ₹{formatINR2(listUnit)}
            {discPct > 0.005 ? ` · ${posDiscPctLabel(discPct)}` : ""}
          </span>
        )}
        {hiddenMrpNote}
      </div>
    );
  } else {
    unitPriceCell = (
      <div
        className={`flex ${hiddenMrpNote ? "flex-col items-end justify-center leading-tight min-h-8" : "items-center justify-end h-8"} text-base font-medium text-muted-foreground`}
        title={
          taxType === "exclusive"
            ? "Taxable unit (GST added in line total)"
            : taxType === "no_gst"
              ? "Sale price (no GST applied)"
              : "Unit price"
        }
      >
        {/* Selling price, not MRP: MRP 569 / sale 549 must read ₹549 here (MRP has its own column). */}
        <span>₹{formatINR2(Number(item.unitCost) > 0 ? Number(item.unitCost) : posLineNetUnitPrice(item))}</span>
        {hiddenMrpNote}
      </div>
    );
  }

  return (
    <div
      ref={rowRef}
      data-pos-cart-row={item.id}
      className={cn(
        "pos-sales-cart-row grid gap-1.5 px-3 py-2.5 border-b border-border/40 hover:bg-accent/30 text-base transition-colors duration-500",
        stockIndicator?.status === "red" ? "bg-red-50/80" : index % 2 === 1 ? "bg-muted/20" : "",
        isHighlighted &&
          "ring-2 ring-inset ring-primary/70 bg-primary/10 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.35)] z-[1] relative",
      )}
      style={{ gridTemplateColumns: gridCols }}
    >
      <div className="flex items-center justify-center font-semibold text-foreground/80">{index + 1}</div>
      <div
        className={cn(
          "flex items-center font-mono text-foreground/80 min-w-0 overflow-hidden",
          barcode.length > 12 ? "text-xs leading-tight" : "text-sm",
        )}
        title={barcode || undefined}
      >
        <span className="truncate tabular-nums">{barcode}</span>
      </div>
      <div className="flex items-center font-semibold text-base min-w-0 gap-1">
        {stockIndicator && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-block h-2.5 w-2.5 shrink-0 rounded-full",
                  stockIndicator.status === "green" && "bg-green-500",
                  stockIndicator.status === "yellow" && "bg-amber-400",
                  stockIndicator.status === "red" && "bg-red-500",
                )}
                aria-label={`Stock ${stockIndicator.stockQty}, after this bill ${stockIndicator.remaining}`}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Stock: {stockIndicator.stockQty} · After this bill: {stockIndicator.remaining}
            </TooltipContent>
          </Tooltip>
        )}
        <span className="flex flex-col min-w-0">
          <span className="truncate">{item.productName}</span>
          {item.itemNotes?.trim() ? (
            <span className="truncate text-xs font-normal leading-tight text-muted-foreground" title={item.itemNotes}>
              {item.itemNotes}
            </span>
          ) : null}
        </span>
        <PosSchemeAppliedTag applied={item.categoryTierApplied} />
        {item.isDcProduct && (
          <span className="px-1 py-0.5 text-[9px] font-bold bg-orange-100 text-orange-700 border border-orange-300 rounded flex-shrink-0">DC</span>
        )}
      </div>
      {showPurchaseCode && (
        <div
          className="flex items-center justify-center font-mono text-sm font-semibold tracking-wide text-violet-700 dark:text-violet-300 truncate min-w-0"
          title={purchaseCode ? `Purchase code ${purchaseCode}` : undefined}
        >
          <span className="truncate">{purchaseCode || "-"}</span>
        </div>
      )}
      <div className="flex items-center justify-center text-sm font-medium truncate min-w-0" title={item.size}>
        {item.size}
      </div>
      <div className="flex items-center justify-center text-sm text-muted-foreground truncate min-w-0" title={item.color || undefined}>
        {item.color || "-"}
      </div>
      {perLineSalesman && (
        <div className="flex min-w-0 items-center">
          <select
            value={lineSalesman || ""}
            onChange={(e) => actions.updateLineSalesman(index, e.target.value)}
            className="pos-sales-line-salesman-select h-9 w-full min-w-0 max-w-full rounded-md border border-border/60 bg-background px-2 text-xs font-medium leading-tight text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            title="Line salesperson"
          >
            <option value="">—</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.employee_name}>
                {emp.employee_name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <QtyInput
          uom={item.uom}
          productType={item.productType}
          value={item.quantity || minQtyForUom(item)}
          onChange={(val) => actions.updateQuantity(index, val)}
          className="h-8 text-sm w-full text-center bg-muted/30 border-border/60 px-1"
          selectOnFocus={false}
        />
        {item.uom && item.uom !== "NOS" && item.uom !== "PCS" && (
          <span className="text-[10px] text-muted-foreground text-center block">{getUOMLabel(item.uom)}</span>
        )}
      </div>
      {enableMrp && (
        <div>
          <Input
            type="number"
            value={item.mrp || ""}
            onChange={(e) => actions.updateMrp(index, parseFloat(e.target.value) || 0)}
            placeholder="0"
            className="h-8 text-sm w-full text-right bg-muted/30 border-border/60"
            min="0"
            step="0.01"
          />
        </div>
      )}
      <div>
        <select
          value={taxType === "no_gst" ? "0" : String(item.gstPer ?? 0)}
          onChange={(e) => actions.updateGstPer(index, parseInt(e.target.value, 10))}
          disabled={taxType === "no_gst"}
          title={taxType === "no_gst" ? "Without GST — tax rate not applied" : undefined}
          className="h-8 w-full rounded-md text-sm border border-border/60 bg-muted/30 px-1.5 text-center focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <option value="0">0%</option>
          <option value="5">5%</option>
          <option value="12">12%</option>
          <option value="18">18%</option>
          <option value="28">28%</option>
        </select>
      </div>
      <div>
        <Input
          type="number"
          {...posPlainNumberProps}
          value={item.discountPercent || ""}
          onChange={(e) => actions.updateDiscountPercent(index, parseFloat(e.target.value) || 0)}
          placeholder="0"
          className={`h-8 text-sm w-full text-center bg-muted/30 border-border/60 px-1.5 ${POS_PLAIN_NUMBER_CLASS}`}
          min="0"
          max="100"
          step="0.01"
        />
      </div>
      <div>
        <Input
          type="number"
          value={posLineDiscRsBoxValue(item)}
          onChange={(e) => actions.updateDiscountAmount(index, parseFloat(e.target.value) || 0)}
          placeholder="0"
          {...posPlainNumberProps}
          className={`h-8 text-sm w-full text-right bg-muted/30 border-border/60 ${POS_PLAIN_NUMBER_CLASS}`}
          min="0"
          step="0.01"
        />
      </div>
      <div>{unitPriceCell}</div>
      <div className="flex items-center justify-between gap-1 min-w-0">
        <span className="font-extrabold text-base md:text-lg tabular-nums">
          ₹{formatINR2(posLineDisplayTotal(item.netAmount, item.gstPer, taxType))}
        </span>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Remove line"
          onClick={() => actions.removeItem(index)}
          className="h-7 w-7 shrink-0 text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
});
