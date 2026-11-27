import { memo, type RefObject } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SaleLineStockBadge } from "@/components/sales/SaleLineStockBadge";
import { SaleLineCostPopover } from "@/components/sales-invoice/SaleLineCostPopover";
import type { LiveStockView } from "@/lib/saleLineLiveStock";
import type { SaleLineGridColKey, SaleLineGridShowCol } from "@/hooks/useSalesInvoiceLineGridKeyboard";
import { GST_SLABS } from "@/utils/gstRegisterUtils";
import { allowsDecimalQty } from "@/utils/qtyInput";
import { saleOrderQtyHint } from "@/lib/saleOrderInvoiceLink";

/** What a Sale Bill line row reads from the line. */
export type SaleBillLine = {
  id: string;
  productId: string;
  /** Product size row; the cost pop-up reads its latest purchase. */
  variantId?: string;
  productName: string;
  size: string;
  barcode: string;
  color: string;
  quantity: number;
  box: string;
  mrp: number;
  salePrice: number;
  discountPercent: number;
  discountAmount: number;
  markdownPercent?: number;
  gstPercent: number;
  lineTotal: number;
  hsnCode: string;
  uom?: string;
  productType?: string;
};

type CellOptions = { baseClassName?: string; onActivateEdit?: () => void };

/**
 * The page's handlers behind one object that never changes, so a row is not redrawn just
 * because the page made new functions. Each call goes to the page's latest handler.
 */
export type SaleBillRowActions = {
  showHistory: (product: { id: string; name: string }) => void;
  updateHsnCode: (id: string, hsnCode: string) => void;
  handleQtyInputChange: (id: string, raw: string) => void;
  handleQtyInputBlur: (id: string) => void;
  updateBox: (id: string, box: string) => void;
  updateMRP: (id: string, mrp: number) => void;
  updateSalePrice: (id: string, salePrice: number) => void;
  updateMarkdownPercent: (id: string, markdownPercent: number) => void;
  updateDiscountPercent: (id: string, discountPercent: number) => void;
  updateDiscountAmount: (id: string, discountAmount: number) => void;
  updateGSTPercent: (id: string, gstPercent: number) => void;
  removeItem: (id: string) => void;
  beginEditWithSnapshot: (value: string | number) => void;
};

export type SaleBillLineRowProps = {
  item: SaleBillLine;
  /** Row position on screen (newest line first). */
  displayIndex: number;
  /** The line's number on the bill. */
  srNo: number;
  /** Column the grid cursor is on in this row; null when the cursor is on another row. */
  focusCol: SaleLineGridColKey | null;
  /** That cell is open for typing. */
  editing: boolean;
  showCol: SaleLineGridShowCol;
  showMarkdownCol: boolean;
  /** Live stock badge under the barcode; null for lines that keep no stock. */
  stockTone: LiveStockView["tone"] | null;
  stockLabel: string | null;
  stockTitle: string | null;
  /**
   * Editing a saved bill: the customer's current brand rate for this line. The row shows a hint
   * when the saved Disc % differs. Null when no hint applies.
   */
  historicalRate: number | null;
  /** Organisation id when this user may see purchase rate / landing cost; null hides the ▲. */
  costOrganizationId?: string | null;
  /** A sale order is linked: the ORDER QTY column after QTY is shown. */
  showOrderQtyCol?: boolean;
  /** The linked order's quantity still to deliver for this item; null when the order does not have it. */
  orderRequired?: number | null;
  /** This bill's total quantity of the same item (all its lines), for "short" / "extra". */
  orderBilled?: number;
  /** Ordered and already delivered, for the tooltip. */
  orderOrdered?: number;
  orderDelivered?: number;
  /** Cell props of the line grid, from the row's own focus state (see the keyboard hook). */
  buildCellProps: (
    rowIndex: number,
    colKey: SaleLineGridColKey,
    focused: boolean,
    editing: boolean,
    opts?: CellOptions,
  ) => Record<string, unknown>;
  editInputRef: RefObject<HTMLInputElement | null>;
  actions: SaleBillRowActions;
};

function gstSelectOptionsFor(current: number): number[] {
  const rate = Number(current) || 0;
  if ((GST_SLABS as readonly number[]).includes(rate)) return [...GST_SLABS];
  return [...GST_SLABS, rate].sort((a, b) => a - b);
}

/**
 * One line of the Sale Bill grid.
 *
 * The rows were drawn inline by the page, so typing one character in any line redrew every
 * line, each with its inputs and GST list: typing lagged on wholesale bills of 100 or more
 * lines (speed review item S5). A row is now redrawn only when its own line, its place, the
 * grid cursor on it or a column setting changes.
 */
export const SaleBillLineRow = memo(function SaleBillLineRow({
  item,
  displayIndex,
  srNo,
  focusCol,
  editing,
  showCol,
  showMarkdownCol,
  stockTone,
  stockLabel,
  stockTitle,
  historicalRate,
  costOrganizationId = null,
  showOrderQtyCol = false,
  orderRequired = null,
  orderBilled = 0,
  orderOrdered = 0,
  orderDelivered = 0,
  buildCellProps,
  editInputRef,
  actions,
}: SaleBillLineRowProps) {
  const cellProps = (colKey: SaleLineGridColKey, opts?: CellOptions) =>
    buildCellProps(displayIndex, colKey, focusCol === colKey, editing && focusCol === colKey, opts);
  const cellEditing = (colKey: SaleLineGridColKey) => editing && focusCol === colKey;
  const qtyEditing = cellEditing("qty");
  const priceEditing = cellEditing("price");
  const boxEditing = cellEditing("box");
  const hsnEditing = cellEditing("hsn");
  const mrpEditing = cellEditing("mrp");
  const discPctEditing = cellEditing("disc_percent");
  const discAmtEditing = cellEditing("disc_amount");
  const stockView: LiveStockView | null =
    stockTone && stockLabel !== null
      ? { available: 0, left: 0, tone: stockTone, label: stockLabel, title: stockTitle ?? "" }
      : null;
  const gstOptions = gstSelectOptionsFor(item.gstPercent);

  return (
    <tr
      key={item.id}
      role="row"
      className={cn(
        `group border-b border-border/40 transition-colors ${displayIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} hover:bg-blue-50/50`,
        focusCol !== null && "bg-primary/5",
      )}
    >
      <td {...cellProps("index", { baseClassName: "text-center text-[15px] text-muted-foreground px-3 py-2.5" })}>
        {srNo}
      </td>
      <td {...cellProps("product", { baseClassName: "col-product px-3 py-2" })}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            actions.showHistory({ id: item.productId, name: item.productName });
          }}
          className="text-primary hover:underline text-left font-semibold break-words whitespace-normal leading-tight text-[14px]"
        >
          {item.productName}
        </button>
        {/* Colour has its own column when enabled; only repeat it here when that column is hidden. */}
        {item.color && !showCol.color && (
          <div className="text-xs text-muted-foreground mt-0.5">{item.color}</div>
        )}
      </td>
      <td {...cellProps("size", { baseClassName: "text-center px-3 py-2" })}>
        {item.size ? (
          <span className={`inline-block text-[15px] font-bold px-2 py-0.5 rounded ${
            ['XS','S','M','L','XL','XXL','XXXL'].includes(item.size?.toUpperCase())
              ? 'bg-blue-100 text-blue-700'
              : /^\d+$/.test(item.size)
                ? 'bg-green-100 text-green-700'
                : 'bg-slate-100 text-slate-600'
          }`}>
            {item.size}
          </span>
        ) : <span className="text-slate-300">—</span>}
      </td>
      {showCol.color && (
        <td {...cellProps("color", { baseClassName: "text-center text-[15px] font-semibold text-slate-900 dark:text-slate-100 px-2 py-2.5" })}>
          {item.color ? (
            <span className="block line-clamp-2 break-words leading-tight text-[13px]" title={item.color}>
              {item.color}
            </span>
          ) : <span className="text-slate-300">—</span>}
        </td>
      )}
      <td {...cellProps("barcode", { baseClassName: "text-center px-3 py-2" })}>
        <span className="font-mono text-[15px] font-semibold text-blue-600">{item.barcode || <span className="text-slate-300 font-normal">—</span>}</span>
        {item.productId ? (
          <span className="block">
            <SaleLineStockBadge view={stockView} />
          </span>
        ) : null}
      </td>
      {showCol.hsn && (
        <td
          {...cellProps("hsn", {
            baseClassName: "text-center text-[15px] font-semibold text-slate-900 dark:text-slate-100 px-1.5 py-1",
            onActivateEdit: () => actions.beginEditWithSnapshot(item.hsnCode || ""),
          })}
          title="Click to change the HSN on this bill"
        >
          {hsnEditing ? (
            <Input
              ref={editInputRef}
              type="text"
              inputMode="numeric"
              maxLength={8}
              value={item.hsnCode || ""}
              onChange={(e) => actions.updateHsnCode(item.id, e.target.value)}
              className="w-full h-9 text-center text-[15px] bg-white border-0 shadow-none focus-visible:ring-0 mx-auto rounded-none"
            />
          ) : (
            <span className="block h-10 leading-10">
              {item.hsnCode || <span className="text-slate-300">—</span>}
            </span>
          )}
        </td>
      )}
      <td
        {...cellProps("qty", {
          baseClassName: "sale-col-qty text-center px-1.5 py-1 align-middle overflow-hidden",
          onActivateEdit: () => actions.beginEditWithSnapshot(item.quantity),
        })}
      >
        <div className="flex flex-col items-center justify-center w-full min-w-0 mx-auto">
          <Input
            ref={qtyEditing ? editInputRef : undefined}
            type="number"
            min={allowsDecimalQty(item) ? "0.001" : "1"}
            step={allowsDecimalQty(item) ? "0.001" : "1"}
            value={item.quantity || ""}
            placeholder="1"
            onChange={(e) => actions.handleQtyInputChange(item.id, e.target.value)}
            onFocus={() => {
              if (!qtyEditing) actions.beginEditWithSnapshot(item.quantity);
            }}
            onBlur={() => actions.handleQtyInputBlur(item.id)}
            onWheel={(e) => (e.target as HTMLInputElement).blur()}
            className="sale-qty-box w-full max-w-full h-9 text-center font-bold text-[17px] bg-white border border-amber-200 shadow-none focus-visible:ring-1 focus-visible:ring-amber-400 tabular-nums rounded-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          {item.uom && item.uom !== 'NOS' && item.uom !== 'PCS' && (
            <span className="text-[10px] text-muted-foreground text-center w-full truncate leading-tight mt-0.5">{item.uom}</span>
          )}
        </div>
      </td>
      {showOrderQtyCol && (
        <td
          className="sale-col-orderqty text-center px-1.5 py-1 align-middle overflow-hidden"
          data-testid="sale-line-order-qty"
          title={
            orderRequired == null
              ? "Not in the selected sale order"
              : orderDelivered > 0
                ? `Ordered ${orderOrdered}, already delivered ${orderDelivered}, still to deliver ${orderRequired}`
                : `Ordered ${orderOrdered} in the selected sale order`
          }
        >
          {orderRequired == null ? (
            <span className="block h-10 leading-10 text-slate-300">—</span>
          ) : (
            (() => {
              const hint = saleOrderQtyHint(orderRequired, orderBilled);
              return (
                <div className="flex flex-col items-center justify-center leading-tight">
                  <span className="text-[17px] font-bold tabular-nums text-slate-800">{orderRequired}</span>
                  <span
                    className={cn(
                      "text-[11px] font-semibold",
                      hint.tone === "short" && "text-amber-600",
                      hint.tone === "extra" && "text-red-600",
                      hint.tone === "match" && "text-emerald-600",
                    )}
                  >
                    {hint.text}
                  </span>
                </div>
              );
            })()
          )}
        </td>
      )}
      {showCol.box && (
        <td
          {...cellProps("box", {
            baseClassName: "text-center px-1.5 py-1",
            onActivateEdit: () => actions.beginEditWithSnapshot(item.box || ""),
          })}
        >
          {boxEditing ? (
            <Input
              ref={editInputRef}
              type="text"
              value={item.box || ''}
              onChange={(e) => actions.updateBox(item.id, e.target.value)}
              className="w-full h-9 text-center text-[15px] bg-white border-0 shadow-none focus-visible:ring-0 mx-auto rounded-none"
            />
          ) : (
            <span className="block w-14 mx-auto h-10 leading-10 text-center text-[15px]">
              {item.box || "—"}
            </span>
          )}
        </td>
      )}
      {showCol.mrp && (
        <td
          {...cellProps("mrp", {
            baseClassName: "sale-col-mrp text-right px-1.5 py-1 align-middle overflow-hidden",
            onActivateEdit: () => actions.beginEditWithSnapshot(item.mrp),
          })}
        >
          {mrpEditing ? (
            <Input
              ref={editInputRef}
              type="number"
              min="0"
              value={item.mrp || ""}
              placeholder="0"
              onChange={(e) => actions.updateMRP(item.id, parseFloat(e.target.value) || 0)}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              className="sale-num-box w-full max-w-full h-9 text-right text-[17px] bg-white border border-slate-200 shadow-none focus-visible:ring-1 tabular-nums rounded-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          ) : (
            <span className="sale-num-box block w-full max-w-full h-9 leading-9 text-right text-[17px] tabular-nums">
              {item.mrp || "—"}
            </span>
          )}
        </td>
      )}
      <td
        {...cellProps("price", {
          baseClassName: "sale-col-price relative text-right px-1.5 py-1 align-middle overflow-hidden",
          onActivateEdit: () => actions.beginEditWithSnapshot(item.salePrice),
        })}
      >
        {costOrganizationId && item.variantId ? (
          <SaleLineCostPopover
            organizationId={costOrganizationId}
            variantId={item.variantId}
            productName={item.productName}
            className="absolute right-0.5 top-0.5 z-10"
          />
        ) : null}
        <Input
          ref={priceEditing ? editInputRef : undefined}
          type="number"
          min="0"
          value={item.salePrice || ""}
          placeholder="0"
          onChange={(e) => actions.updateSalePrice(item.id, parseFloat(e.target.value) || 0)}
          onFocus={() => {
            if (!priceEditing) actions.beginEditWithSnapshot(item.salePrice);
          }}
          onWheel={(e) => (e.target as HTMLInputElement).blur()}
          className="sale-num-box w-full max-w-full h-9 text-right text-[15px] font-semibold bg-white border border-slate-200 shadow-none focus-visible:ring-1 tabular-nums rounded-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </td>
      {showMarkdownCol && (
        <td className="text-right px-1.5 py-1" data-testid="sale-line-markdown">
          <div className="flex flex-col items-end gap-0.5">
            <Input
              type="number"
              min="0"
              max="99.99"
              aria-label={`Markdown % for ${item.productName}`}
              value={item.markdownPercent || ""}
              placeholder="0"
              onChange={(e) => actions.updateMarkdownPercent(item.id, parseFloat(e.target.value) || 0)}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              className="w-16 h-8 text-right text-[15px] bg-amber-50 border border-amber-200 shadow-none focus-visible:ring-1 ml-auto tabular-nums rounded-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            {(item.markdownPercent || 0) > 0 && (
              <span
                className="text-[11px] font-semibold text-emerald-700 tabular-nums whitespace-nowrap"
                data-testid="sale-line-after-markdown"
                title="Price after markdown (before Disc %)"
              >
                → ₹{(Math.round(item.salePrice * (1 - (item.markdownPercent || 0) / 100) * 100) / 100).toLocaleString("en-IN")}
              </span>
            )}
          </div>
        </td>
      )}
      {showCol.disc_percent && (
        <td
          {...cellProps("disc_percent", {
            baseClassName: "text-right px-1.5 py-1",
            onActivateEdit: () => actions.beginEditWithSnapshot(item.discountPercent),
          })}
        >
          <div className="flex items-center justify-end gap-0.5">
            <Input
              ref={discPctEditing ? editInputRef : undefined}
              type="number"
              min="0"
              max="100"
              value={item.discountPercent || ""}
              placeholder="0"
              onChange={(e) => actions.updateDiscountPercent(item.id, parseFloat(e.target.value) || 0)}
              onFocus={() => {
                if (!discPctEditing) actions.beginEditWithSnapshot(item.discountPercent);
              }}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              className="w-16 h-9 text-right text-[15px] bg-white border border-slate-200 shadow-none focus-visible:ring-1 ml-auto tabular-nums rounded-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            {historicalRate !== null && Math.abs((item.discountPercent || 0) - historicalRate) > 0.009 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="text-muted-foreground cursor-help text-xs leading-none select-none shrink-0"
                    aria-label="Historical discount rate"
                  >
                    ⓘ
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  Saved at {item.discountPercent}% (current rate: {historicalRate}%)
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </td>
      )}
      {showCol.disc_amount && (
        <td
          {...cellProps("disc_amount", {
            baseClassName: "text-right px-1.5 py-1",
            onActivateEdit: () => actions.beginEditWithSnapshot(item.discountAmount),
          })}
        >
          <Input
            ref={discAmtEditing ? editInputRef : undefined}
            type="number"
            min="0"
            value={item.discountAmount || ""}
            placeholder="0"
            onChange={(e) => actions.updateDiscountAmount(item.id, parseFloat(e.target.value) || 0)}
            onFocus={() => {
              if (!discAmtEditing) actions.beginEditWithSnapshot(item.discountAmount);
            }}
            onWheel={(e) => (e.target as HTMLInputElement).blur()}
            className="w-full h-9 text-right text-[15px] bg-white border border-slate-200 shadow-none focus-visible:ring-1 ml-auto tabular-nums text-destructive rounded-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </td>
      )}
      {showCol.gst && (
        <td {...cellProps("gst", { baseClassName: "text-center px-1 py-1 align-middle" })}>
          <Select
            value={String(Number(item.gstPercent) || 0)}
            onValueChange={(v) => actions.updateGSTPercent(item.id, parseFloat(v) || 0)}
          >
            <SelectTrigger
              className="h-9 w-full min-w-[4.5rem] mx-auto px-2 gap-1 text-[13px] font-semibold tabular-nums bg-white border border-slate-200 shadow-none focus:ring-1"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background z-[9999]">
              {gstOptions.map((rate) => (
                <SelectItem key={rate} value={String(rate)}>
                  {rate}%
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>
      )}
      <td {...cellProps("total", { baseClassName: "sale-col-total text-right px-2 py-2 bg-blue-50/40 align-middle overflow-hidden" })}>
        <span className="block w-full max-w-full text-[17px] font-bold text-blue-700 font-mono tabular-nums truncate">
          ₹{item.lineTotal.toFixed(2)}
        </span>
      </td>
      <td className="col-action px-0 py-1.5 text-center">
        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => actions.removeItem(item.id)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );
});
