import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InvoiceWrapper } from "@/components/InvoiceWrapper";
import { cn } from "@/lib/utils";
import { IndianRupee, Minus, Percent, Plus, Search, Trash2, Truck } from "lucide-react";
import type { usePosDeliveryChallan } from "@/hooks/usePosDeliveryChallan";

type PosDCState = ReturnType<typeof usePosDeliveryChallan>;

type PosDeliveryChallanWorkspaceProps = {
  dc: PosDCState;
  variant?: "page" | "dialog";
};

export function PosDeliveryChallanWorkspace({ dc, variant = "page" }: PosDeliveryChallanWorkspaceProps) {
  const isPage = variant === "page";

  return (
    <>
      <div style={{ display: "none" }}>
        <div ref={dc.printRef}>
          {dc.savedInvoiceData && <InvoiceWrapper {...dc.savedInvoiceData} />}
        </div>
      </div>

      <div className={cn("flex flex-col min-h-0 h-full gap-3", isPage ? "p-2 md:p-3" : "p-4")}>
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
          <div className="flex flex-wrap items-end gap-2 md:gap-3 border-b border-border/60 pb-2">
            <div className="w-44 shrink-0">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
                Customer
              </label>
              <Input
                placeholder="Customer Name"
                value={dc.customerName}
                onChange={(e) => dc.setCustomerName(e.target.value)}
                className="h-10 text-sm"
              />
            </div>
            <div className="w-36 shrink-0">
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
            <div className="flex-1 min-w-[220px]">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
                Barcode / Search
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  ref={dc.barcodeRef}
                  placeholder="Scan barcode or search product..."
                  value={dc.barcodeInput}
                  onChange={(e) => dc.setBarcodeInput(e.target.value)}
                  onKeyDown={dc.handleBarcodeEnter}
                  onFocus={() => {
                    if (dc.searchResults.length > 0) {
                      dc.setShowDropdown(true);
                    }
                  }}
                  className="h-10 text-sm pl-9"
                />
              </div>
            </div>
            {isPage && (
              <div className="shrink-0 text-right pb-0.5">
                <div className="text-xs text-muted-foreground">DC No</div>
                <div className="font-mono font-bold text-orange-700">{dc.dcNumber || "…"}</div>
              </div>
            )}
          </div>
        )}

        {!isPage && (
          <div className="flex items-center gap-2 flex-wrap">
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
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                ref={dc.barcodeRef}
                placeholder="Scan barcode or search product..."
                value={dc.barcodeInput}
                onChange={(e) => dc.setBarcodeInput(e.target.value)}
                onKeyDown={dc.handleBarcodeEnter}
                onFocus={() => {
                  if (dc.searchResults.length > 0) dc.setShowDropdown(true);
                }}
                className="flex-1 h-9 text-sm pl-8"
              />
            </div>
          </div>
        )}

        <div className={cn("flex-1 min-h-0 overflow-auto border rounded-md", isPage && "bg-background shadow-sm")}>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr className="text-left">
                <th className="px-2 py-2 w-8">#</th>
                <th className="px-2 py-2">Product</th>
                <th className="px-2 py-2 w-16">Size</th>
                <th className="px-2 py-2 w-14 text-center">Stk</th>
                <th className="px-2 py-2 w-20 text-right">MRP</th>
                <th className="px-2 py-2 w-20 text-right">Rate</th>
                <th className="px-2 py-2 w-28 text-center">Qty</th>
                <th className="px-2 py-2 w-24 text-right">Amount</th>
                <th className="px-2 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {dc.items.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-muted-foreground">
                    Scan barcode to add items
                  </td>
                </tr>
              )}
              {dc.items.map((item, idx) => (
                <tr key={item.id} className="border-t hover:bg-muted/30">
                  <td className="px-2 py-1.5 text-muted-foreground">{idx + 1}</td>
                  <td className="px-2 py-1.5">
                    <p className="font-medium truncate max-w-[240px]">{item.productName}</p>
                    <p className="text-xs text-muted-foreground font-mono">{item.barcode}</p>
                  </td>
                  <td className="px-2 py-1.5">{item.size}</td>
                  <td
                    className={cn(
                      "px-2 py-1.5 text-center font-semibold text-xs",
                      item.stockQty > 0 ? "text-green-700" : "text-red-600",
                    )}
                  >
                    {item.stockQty}
                  </td>
                  <td className="px-2 py-1.5 text-right">₹{item.mrp}</td>
                  <td className="px-2 py-1.5 text-right">₹{item.unitCost}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => dc.changeQty(item.id, -1)}
                        className="w-6 h-6 rounded border flex items-center justify-center hover:bg-muted"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-8 text-center font-medium">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => dc.changeQty(item.id, 1)}
                        className="w-6 h-6 rounded border flex items-center justify-center hover:bg-muted"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold">
                    ₹{Math.round(item.netAmount).toLocaleString("en-IN")}
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => dc.removeItem(item.id)}
                      className="text-destructive hover:text-destructive/80"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-2 pt-1 border-t shrink-0">
          <div className="flex items-center justify-end gap-3 flex-wrap">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground font-medium">FLAT DISC</span>
              <div className="flex items-center border rounded-md overflow-hidden">
                <button
                  type="button"
                  onClick={() => dc.setFlatDiscountMode("percent")}
                  className={cn(
                    "px-2 h-8 flex items-center justify-center text-xs",
                    dc.flatDiscountMode === "percent"
                      ? "bg-orange-600 text-white"
                      : "bg-muted hover:bg-muted/70",
                  )}
                >
                  <Percent className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => dc.setFlatDiscountMode("amount")}
                  className={cn(
                    "px-2 h-8 flex items-center justify-center text-xs border-l",
                    dc.flatDiscountMode === "amount"
                      ? "bg-orange-600 text-white"
                      : "bg-muted hover:bg-muted/70",
                  )}
                >
                  <IndianRupee className="h-3 w-3" />
                </button>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={dc.flatDiscountValue || ""}
                  onChange={(e) => dc.setFlatDiscountValue(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="w-20 h-8 text-sm text-right border-0 rounded-none focus-visible:ring-0"
                />
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground font-medium">S/R ADJ</span>
              <Input
                type="number"
                inputMode="decimal"
                value={dc.srAdjust || ""}
                onChange={(e) => dc.setSrAdjust(Number(e.target.value) || 0)}
                placeholder="0"
                className="w-24 h-8 text-sm text-right"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Items </span>
                <span className="font-semibold">{dc.items.length}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Qty </span>
                <span className="font-semibold">{dc.totalQty}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Amount </span>
                <span className="font-bold text-lg text-orange-600">
                  ₹{Math.round(dc.netAmount).toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {dc.showDropdown &&
        dc.searchResults.length > 0 &&
        createPortal(
          <div
            className="fixed bg-popover border border-border rounded-md shadow-lg overflow-auto"
            style={{
              top: dc.dropdownPos.top,
              left: dc.dropdownPos.left,
              width: Math.max(dc.dropdownPos.width, 400),
              zIndex: 99999,
              maxHeight: 280,
            }}
          >
            {dc.searchResults.map((r, idx) => (
              <div
                key={`${r.variant.id}-${idx}`}
                className={cn(
                  "px-3 py-2 cursor-pointer border-b border-border last:border-b-0 text-sm",
                  dc.selectedIndex === idx ? "bg-orange-600 text-white" : "hover:bg-accent",
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => dc.addVariantToItems(r.variant, r.product)}
                onMouseEnter={() => dc.setSelectedIndex(idx)}
              >
                <div className="flex justify-between items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.product.product_name}</div>
                    <div
                      className={cn(
                        "text-xs flex flex-wrap gap-1 mt-0.5",
                        dc.selectedIndex === idx ? "text-white/70" : "text-muted-foreground",
                      )}
                    >
                      {r.brand && <span>{r.brand}</span>}
                      {r.variant.size && <span>• Size: {r.variant.size}</span>}
                      {r.variant.color && <span>• {r.variant.color}</span>}
                      {r.barcode && <span>• {r.barcode}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-medium">₹{r.salePrice}</span>
                    <span
                      className={cn(
                        "text-[11px] font-semibold px-1.5 py-0.5 rounded",
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
          </div>,
          document.body,
        )}
    </>
  );
}
