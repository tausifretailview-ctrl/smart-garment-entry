import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InvoiceWrapper } from "@/components/InvoiceWrapper";
import { QuickServiceProductDialog } from "@/components/QuickServiceProductDialog";
import { PosDcFooter } from "@/components/pos-dc/PosDcFooter";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon, Minus, Plus, Search, Trash2, Truck } from "lucide-react";
import type { usePosDeliveryChallan } from "@/hooks/usePosDeliveryChallan";

type PosDCState = ReturnType<typeof usePosDeliveryChallan>;

type PosDeliveryChallanWorkspaceProps = {
  dc: PosDCState;
  variant?: "page" | "dialog";
};

function SearchDropdown({
  dc,
  className,
}: {
  dc: PosDCState;
  className?: string;
}) {
  if (!dc.showDropdown || dc.searchResults.length === 0) return null;

  return (
    <div
      className={cn(
        "absolute top-full left-0 right-0 z-[200] mt-1 bg-popover border border-border rounded-md shadow-xl overflow-auto max-h-[320px]",
        className,
      )}
    >
      {dc.searchResults.map((r, idx) => (
        <div
          key={`${r.variant.id}-${idx}`}
          className={cn(
            "px-3 py-2.5 cursor-pointer border-b border-border last:border-b-0",
            dc.selectedIndex === idx ? "bg-orange-600 text-white" : "hover:bg-accent",
          )}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => dc.addVariantToItems(r.variant, r.product)}
          onMouseEnter={() => dc.setSelectedIndex(idx)}
        >
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-bold text-base truncate">{r.product.product_name}</div>
              <div
                className={cn(
                  "text-sm flex flex-wrap gap-x-2 gap-y-0.5 mt-1",
                  dc.selectedIndex === idx ? "text-white/80" : "text-muted-foreground",
                )}
              >
                {r.brand && <span>{r.brand}</span>}
                {r.variant.size && <span>Size: {r.variant.size}</span>}
                {r.variant.color && <span>{r.variant.color}</span>}
                {r.barcode && <span className="font-mono">{r.barcode}</span>}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <div className="text-sm font-bold tabular-nums">
                MRP ₹{r.mrp} · Rate ₹{r.salePrice}
              </div>
              <span
                className={cn(
                  "text-xs font-semibold px-2 py-0.5 rounded",
                  dc.selectedIndex === idx
                    ? "bg-white/20 text-white"
                    : r.stock > 0
                      ? "bg-green-100 text-green-700"
                      : "bg-destructive/10 text-destructive",
                )}
              >
                Stk: {r.stock}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PosDeliveryChallanWorkspace({ dc, variant = "page" }: PosDeliveryChallanWorkspaceProps) {
  const isPage = variant === "page";

  return (
    <>
      <div style={{ display: "none" }}>
        <div ref={dc.printRef}>
          {dc.savedInvoiceData && <InvoiceWrapper {...dc.savedInvoiceData} />}
        </div>
      </div>

      <div className={cn("flex flex-col min-h-0 h-full", isPage ? "p-2 md:p-3 gap-2" : "p-4 gap-3")}>
        {!isPage && (
          <div className="bg-orange-600 text-white px-4 py-3 flex items-center justify-between rounded-t-md -mx-4 -mt-4 mb-1">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              <span className="text-lg font-bold">Delivery Challan</span>
              <Badge variant="secondary" className="bg-orange-800/50 text-orange-100 border-0 text-xs">
                {dc.dcNumber || "Generating..."}
              </Badge>
            </div>
            <div className="text-xs text-orange-200">{dc.currentDateLabel}</div>
          </div>
        )}

        {isPage && (
          <div className="flex flex-wrap items-end gap-2 md:gap-3 border-b border-border/60 pb-2 shrink-0">
            <div className="w-40 sm:w-44 shrink-0">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
                Customer
              </label>
              <Input
                placeholder="Customer Name"
                value={dc.customerName}
                onChange={(e) => dc.setCustomerName(e.target.value)}
                className="h-10 text-sm uppercase"
              />
            </div>
            <div className="w-32 sm:w-36 shrink-0">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
                Phone
              </label>
              <Input
                placeholder="Phone"
                value={dc.customerPhone}
                onChange={(e) => dc.setCustomerPhone(e.target.value)}
                className="h-10 text-sm"
              />
            </div>
            <div className="w-full max-w-[16rem] sm:max-w-[18rem] min-w-[11rem] shrink">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
                Barcode / Search
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
                <Input
                  ref={dc.barcodeRef}
                  placeholder="Scan barcode or search..."
                  value={dc.barcodeInput}
                  onChange={(e) => dc.setBarcodeInput(e.target.value)}
                  onKeyDown={dc.handleBarcodeEnter}
                  onFocus={() => {
                    if (dc.searchResults.length > 0) dc.setShowDropdown(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => dc.setShowDropdown(false), 150);
                  }}
                  className="h-10 text-base pl-9"
                />
                <SearchDropdown dc={dc} />
              </div>
            </div>
            {dc.posAllowDateChange && (
              <div className="shrink-0">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
                  DC Date
                </label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 px-2.5 flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap"
                      title="Delivery challan date"
                    >
                      <CalendarIcon className="h-3.5 w-3.5" />
                      <span>{format(dc.dcInvoiceDate, "dd MMM yyyy")}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-[80]" align="start">
                    <Calendar
                      mode="single"
                      selected={dc.dcInvoiceDate}
                      onSelect={(d) => d && dc.setDcInvoiceDate(d)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
            <div className="shrink-0 text-right pb-0.5 ml-auto">
              <div className="text-xs text-muted-foreground uppercase">DC No</div>
              <div className="font-mono font-bold text-lg text-orange-700">{dc.dcNumber || "…"}</div>
            </div>
          </div>
        )}

        {!isPage && (
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <Input
              placeholder="Customer Name"
              value={dc.customerName}
              onChange={(e) => dc.setCustomerName(e.target.value)}
              className="w-48 h-9 text-sm"
            />
            <Input
              placeholder="Phone"
              value={dc.customerPhone}
              onChange={(e) => dc.setCustomerPhone(e.target.value)}
              className="w-36 h-9 text-sm"
            />
            <div className="relative w-full max-w-[16rem] min-w-[11rem]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none z-10" />
              <Input
                ref={dc.barcodeRef}
                placeholder="Scan barcode or search..."
                value={dc.barcodeInput}
                onChange={(e) => dc.setBarcodeInput(e.target.value)}
                onKeyDown={dc.handleBarcodeEnter}
                onFocus={() => {
                  if (dc.searchResults.length > 0) dc.setShowDropdown(true);
                }}
                onBlur={() => setTimeout(() => dc.setShowDropdown(false), 150)}
                className="h-9 text-sm pl-8"
              />
              <SearchDropdown dc={dc} />
            </div>
            {dc.posAllowDateChange && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 px-2 flex items-center gap-1 text-xs font-semibold whitespace-nowrap"
                    title="Delivery challan date"
                  >
                    <CalendarIcon className="h-3.5 w-3.5" />
                    <span>{format(dc.dcInvoiceDate, "dd MMM yyyy")}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[80]" align="start">
                  <Calendar
                    mode="single"
                    selected={dc.dcInvoiceDate}
                    onSelect={(d) => d && dc.setDcInvoiceDate(d)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}

        <div
          className={cn(
            "flex-1 min-h-0 overflow-auto border rounded-md pos-dc-readable",
            isPage && "bg-background shadow-sm",
          )}
        >
          <table className="w-full text-base">
            <thead className="bg-muted/60 sticky top-0 z-10">
              <tr className="text-left text-sm uppercase tracking-wide">
                <th className="px-3 py-2.5 w-10">#</th>
                <th className="px-3 py-2.5">Product</th>
                <th className="px-3 py-2.5 w-20">Size</th>
                <th className="px-3 py-2.5 w-16 text-center">Stk</th>
                <th className="px-3 py-2.5 w-24 text-right">MRP</th>
                <th className="px-3 py-2.5 w-24 text-right">Rate</th>
                <th className="px-3 py-2.5 w-32 text-center">Qty</th>
                <th className="px-3 py-2.5 w-28 text-right">Amount</th>
                <th className="px-3 py-2.5 w-12" />
              </tr>
            </thead>
            <tbody>
              {dc.items.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-20 text-muted-foreground text-lg">
                    Scan barcode or search to add items
                  </td>
                </tr>
              )}
              {dc.items.map((item, idx) => (
                <tr key={item.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 text-muted-foreground text-lg">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <p className="font-bold text-lg md:text-xl leading-tight truncate max-w-[320px]">{item.productName}</p>
                    <p className="text-sm md:text-base text-muted-foreground font-mono mt-0.5">{item.barcode}</p>
                    {item.color && (
                      <p className="text-sm text-muted-foreground">{item.color}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-lg font-semibold">{item.size}</td>
                  <td
                    className={cn(
                      "px-3 py-2 text-center font-bold text-base tabular-nums",
                      item.stockQty > 0 ? "text-green-700" : "text-red-600",
                    )}
                  >
                    {item.stockQty}
                  </td>
                  <td className="px-3 py-2 text-right text-lg tabular-nums font-mono">₹{item.mrp}</td>
                  <td className="px-3 py-2 text-right text-lg tabular-nums font-mono">₹{item.unitCost}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => dc.changeQty(item.id, -1)}
                        className="w-8 h-8 rounded border flex items-center justify-center hover:bg-muted"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-10 text-center font-bold text-lg tabular-nums">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => dc.changeQty(item.id, 1)}
                        className="w-8 h-8 rounded border flex items-center justify-center hover:bg-muted"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-lg tabular-nums font-mono">
                    ₹{Math.round(item.netAmount).toLocaleString("en-IN")}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => dc.removeItem(item.id)}
                      className="text-destructive hover:text-destructive/80 p-1"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isPage ? (
          <PosDcFooter
            totalQty={dc.totalQty}
            grossAmount={dc.grossAmount}
            subTotal={dc.subTotal}
            flatDiscountAmount={dc.flatDiscountAmount}
            srAdjust={dc.srAdjust}
            roundOff={dc.roundOff}
            netAmount={dc.netAmount}
            currentDateTime={dc.currentDateTime}
            paymentMethod={dc.paymentMethod}
            flatDiscountMode={dc.flatDiscountMode}
            flatDiscountValue={dc.flatDiscountValue}
            onFlatDiscountModeToggle={() =>
              dc.setFlatDiscountMode(dc.flatDiscountMode === "percent" ? "amount" : "percent")
            }
            onFlatDiscountValueChange={dc.setFlatDiscountValue}
            onSrAdjustChange={dc.setSrAdjust}
            onRoundOffChange={dc.setRoundOff}
            notes={dc.notes}
            onNotesChange={dc.setNotes}
            lastBillHint={dc.lastBillHint}
          />
        ) : (
          <div className="flex items-center justify-between gap-4 flex-wrap pt-1 border-t shrink-0 text-sm">
            <div className="flex items-center gap-4">
              <span>
                Items <strong>{dc.items.length}</strong>
              </span>
              <span>
                Qty <strong>{dc.totalQty}</strong>
              </span>
              <span className="font-bold text-lg text-orange-600">
                ₹{Math.round(dc.netAmount).toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        )}
      </div>

      <QuickServiceProductDialog
        open={dc.showQuickServiceDialog}
        onOpenChange={(open) => {
          if (!open) dc.closeQuickServiceDialog();
        }}
        serviceCode={dc.quickServiceCode}
        productName={dc.quickServiceProductName}
        defaultMrp={dc.quickServiceDialogDefaultMrp}
        onAdd={dc.handleQuickServiceAdd}
      />
    </>
  );
}
