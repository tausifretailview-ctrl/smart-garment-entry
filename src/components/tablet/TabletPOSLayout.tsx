import { useState, useRef, useCallback, useEffect } from "react";
import { Search, ShoppingCart, Trash2, Camera, User, Pause, RotateCcw, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CameraScanner } from "./CameraScanner";

interface TabletPOSLayoutProps {
  items: any[];
  totals: any;
  finalAmount: number;
  updateQuantity: (idx: number, qty: number) => void;
  removeItem: (idx: number) => void;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customers: any[];
  customerSearchInput: string;
  onCustomerSearchChange: (v: string) => void;
  onCustomerSelect: (customer: any) => void;
  openCustomerSearch: boolean;
  setOpenCustomerSearch: (v: boolean) => void;
  onAddCustomer: () => void;
  searchInput: string;
  onSearchInputChange: (v: string) => void;
  onBarcodeSubmit: () => void;
  barcodeInputRef: React.RefObject<HTMLInputElement>;
  isSaving: boolean;
  onPaymentAndPrint: (method: string) => void;
  onMixPayment: () => void;
  onHoldBill: () => void;
  onClear: () => void;
  onNewBill: () => void;
  onSaleReturn: () => void;
  flatDiscountValue: number;
  flatDiscountMode: "percent" | "amount";
  onFlatDiscountValueChange: (v: number) => void;
  onFlatDiscountModeChange: (v: "percent" | "amount") => void;
  selectedSalesman: string;
  setSelectedSalesman: (v: string) => void;
  salesmen: any[];
  note: string;
  setNote: (v: string) => void;
  roundOff: number;
  setRoundOff: (v: number) => void;
  filteredProducts?: any[];
  onProductSelect?: (product: any, variant: any) => void;
  openProductSearch?: boolean;
  selectedProductType?: string;
  onProductTypeChange?: (v: string) => void;
  hasMoreCustomers?: boolean;
  // Shortcut handlers (optional — wired from POSSales keyboard handler)
  onCashierReport?: () => void;
  onEstimatePrint?: () => void;
  onStockReport?: () => void;
  onAddNewCustomer?: () => void;
}

export function TabletPOSLayout({
  items, totals, finalAmount, updateQuantity, removeItem,
  invoiceNumber, customerName, customerPhone, customers,
  customerSearchInput, onCustomerSearchChange, onCustomerSelect,
  openCustomerSearch, setOpenCustomerSearch, onAddCustomer,
  searchInput, onSearchInputChange, onBarcodeSubmit, barcodeInputRef,
  isSaving, onPaymentAndPrint, onMixPayment, onHoldBill, onClear, onNewBill,
  onSaleReturn, flatDiscountValue, flatDiscountMode, onFlatDiscountValueChange,
  onFlatDiscountModeChange, selectedSalesman, setSelectedSalesman,
  salesmen, note, setNote, roundOff, setRoundOff,
  filteredProducts, onProductSelect, openProductSearch,
  selectedProductType, onProductTypeChange, hasMoreCustomers,
  onCashierReport, onEstimatePrint, onStockReport, onAddNewCustomer,
}: TabletPOSLayoutProps) {
  const [showCamera, setShowCamera] = useState(false);
  const [scanReady, setScanReady] = useState(true);

  const handleCameraResult = useCallback((code: string) => {
    onSearchInputChange(code);
    setShowCamera(false);
    setTimeout(() => onBarcodeSubmit(), 50);
  }, [onSearchInputChange, onBarcodeSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === "Go" || e.keyCode === 13) {
      e.preventDefault();
      onBarcodeSubmit();
    }
  }, [onBarcodeSubmit]);

  const fmtINR = (n: number) => Math.round(n).toLocaleString("en-IN");

  // Scan pulse animation
  useEffect(() => {
    const interval = setInterval(() => {
      setScanReady(prev => !prev);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Bottom bar shortcut definitions
  const shortcuts = [
    { key: "F1", label: "Cash", color: "bg-green-600", action: () => onPaymentAndPrint("cash"), disabled: items.length === 0 },
    { key: "F2", label: "UPI", color: "bg-blue-600", action: () => onPaymentAndPrint("upi"), disabled: items.length === 0 },
    { key: "F3", label: "Card", color: "bg-purple-600", action: () => onPaymentAndPrint("card"), disabled: items.length === 0 },
    { key: "F4", label: "Credit", color: "bg-orange-500", action: () => onPaymentAndPrint("pay_later"), disabled: items.length === 0 },
    { key: "F5", label: "Return", color: "bg-rose-600", action: onSaleReturn },
    { key: "F6", label: "Mix Pay", color: "bg-teal-600", action: onMixPayment, disabled: items.length === 0 },
    { key: "F7", label: "Hold", color: "bg-amber-600", action: onHoldBill },
    { key: "F8", label: "Report", color: "bg-slate-600", action: onCashierReport },
    { key: "F9", label: "Estimate", color: "bg-indigo-600", action: onEstimatePrint, disabled: items.length === 0 },
    { key: "Esc", label: "Clear", color: "bg-red-600", action: onClear },
  ];

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* ─── TOP HEADER ─── */}
      <header className="h-13 flex items-center justify-between px-4 shadow-md z-50 shrink-0"
        style={{ background: "hsl(222, 47%, 11%)", color: "#f8fafc" }}>
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-5 w-5 opacity-80" />
          <span className="font-bold text-[15px] tracking-tight">EzzyPOS</span>
          <Badge className="text-[11px] px-2 py-0.5 bg-white/15 text-white border-0" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {invoiceNumber}
          </Badge>
          {/* Scanner Ready Indicator */}
          <div className="flex items-center gap-1.5 ml-3">
            <div className={`w-2 h-2 rounded-full ${scanReady ? "bg-green-400" : "bg-green-400/40"} transition-colors duration-700`} />
            <span className="text-[11px] text-white/60">Scanner Ready</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={onNewBill}
            className="h-9 px-3 rounded-md text-[12px] font-semibold text-white/90 hover:bg-white/10 active:bg-white/20 transition-colors">
            + New
          </button>
          <button onClick={onHoldBill}
            className="h-9 px-3 rounded-md text-[12px] font-semibold text-white/90 hover:bg-white/10 active:bg-white/20 transition-colors flex items-center gap-1">
            <Pause className="h-3.5 w-3.5" />Hold
          </button>
          <button onClick={onSaleReturn}
            className="h-9 px-3 rounded-md text-[12px] font-semibold text-white/90 hover:bg-white/10 active:bg-white/20 transition-colors flex items-center gap-1">
            <RotateCcw className="h-3.5 w-3.5" />Return
          </button>
          <button onClick={onClear}
            className="h-9 px-3 rounded-md text-[12px] font-semibold text-red-300 hover:bg-red-500/20 active:bg-red-500/30 transition-colors flex items-center gap-1">
            <Trash2 className="h-3.5 w-3.5" />Clear
          </button>
        </div>
      </header>

      {/* ─── MAIN BODY ─── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ─── LEFT PANEL — Scan + Cart (62%) ─── */}
        <div className="flex-1 flex flex-col border-r border-border min-w-0" style={{ flexBasis: "62%" }}>
          {/* Search Bars */}
          <div className="p-3 border-b border-border bg-muted/30 space-y-2 shrink-0">
            {/* Customer */}
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10 h-11 text-[14px] no-uppercase rounded-lg"
                placeholder="Customer name or phone..."
                value={customerSearchInput}
                onChange={(e) => onCustomerSearchChange(e.target.value)}
                inputMode="text"
                autoCorrect="off"
                autoCapitalize="words"
                enterKeyHint="next"
              />
              {openCustomerSearch && customerSearchInput.length >= 2 && (
                <div className="absolute top-full left-0 right-0 z-50 bg-popover border border-border rounded-lg shadow-xl max-h-60 overflow-y-auto mt-1">
                  {customers.map((c: any) => (
                    <button
                      key={c.id}
                      className="w-full text-left px-4 py-3 hover:bg-accent/10 text-[13px] border-b border-border/50 last:border-0 active:bg-accent/20"
                      onTouchStart={(e) => { e.preventDefault(); onCustomerSelect(c); setOpenCustomerSearch(false); }}
                      onClick={() => { onCustomerSelect(c); setOpenCustomerSearch(false); }}
                    >
                      <span className="font-medium">{c.customer_name}</span>
                      {c.phone && <span className="text-muted-foreground ml-2">{c.phone}</span>}
                    </button>
                  ))}
                  <button
                    className="w-full text-left px-4 py-3 text-primary font-medium hover:bg-accent/10"
                    onClick={onAddCustomer}
                  >
                    + Add New Customer
                  </button>
                </div>
              )}
            </div>

            {/* Barcode / Product */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={barcodeInputRef}
                  className="pl-10 h-11 text-[14px] no-uppercase rounded-lg"
                  placeholder="Scan barcode or search product..."
                  value={searchInput}
                  onChange={(e) => onSearchInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  inputMode="text"
                  autoCorrect="off"
                  autoCapitalize="off"
                  autoComplete="off"
                  spellCheck={false}
                  enterKeyHint="search"
                  style={{ fontFamily: "'JetBrains Mono', 'DM Sans', monospace" }}
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0 rounded-lg"
                onTouchStart={(e) => { e.preventDefault(); setShowCamera(true); }}
                onClick={() => setShowCamera(true)}
              >
                <Camera className="h-5 w-5" />
              </Button>
            </div>

            {/* Product search results dropdown */}
            {openProductSearch && searchInput.length >= 2 && filteredProducts && filteredProducts.length > 0 && (
              <div className="bg-popover border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                {filteredProducts.slice(0, 20).map((product: any) =>
                  product.product_variants?.map((variant: any) => (
                    <button
                      key={variant.id}
                      className="w-full text-left px-4 py-3 hover:bg-accent/10 text-[13px] border-b border-border/50 last:border-0 flex justify-between items-center active:bg-accent/20"
                      onTouchStart={(e) => { e.preventDefault(); onProductSelect?.(product, variant); }}
                      onClick={() => onProductSelect?.(product, variant)}
                    >
                      <div>
                        <span className="font-medium">{product.product_name}</span>
                        <span className="text-muted-foreground ml-2">{variant.size}{variant.color ? ` · ${variant.color}` : ""}</span>
                      </div>
                      <div className="text-right" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        <span className="font-semibold text-amber-600">₹{fmtINR(variant.mrp || 0)}</span>
                        <span className="text-muted-foreground text-[11px] ml-2">Stk:{variant.stock_qty || 0}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Cart Items */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Cart Header */}
            <div className="grid grid-cols-[1fr_80px_110px_85px_36px] gap-2 px-4 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border shrink-0">
              <span>Product</span>
              <span className="text-right">MRP</span>
              <span className="text-center">Qty</span>
              <span className="text-right">Total</span>
              <span />
            </div>

            {/* Cart Rows */}
            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-16">
                  <ShoppingCart className="h-14 w-14 mb-4 opacity-20" />
                  <p className="text-[15px] font-medium">Scan a barcode to add items</p>
                  <p className="text-[12px] mt-1 opacity-60">Or tap 📷 to use camera</p>
                </div>
              ) : (
                items.map((item: any, idx: number) => (
                  <div
                    key={`${item.variantId}-${idx}`}
                    className="grid grid-cols-[1fr_80px_110px_85px_36px] gap-2 px-4 py-3 border-b border-border/40 items-center hover:bg-muted/20 transition-colors group"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 min-w-0">
                        <p className="font-medium text-[13px] truncate flex-1 min-w-0">{item.productName}</p>
                        {(Number(item.mrp) || 0) > (Number(item.unitCost) || 0) + 0.001 && (
                          <Badge
                            variant="outline"
                            className="shrink-0 h-4 px-1 text-[9px] font-semibold border-sky-300 bg-sky-50 text-sky-800"
                            title="Unit price below MRP — line discount applied"
                          >
                            Rate override
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {item.barcode} · {item.size}{item.color ? ` · ${item.color}` : ""}
                      </p>
                    </div>

                    <div className="text-right text-[13px] font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      ₹{fmtINR(item.mrp || 0)}
                    </div>

                    {/* Qty stepper — 44×44 min touch targets */}
                    <div className="flex items-center justify-center gap-1">
                      <button
                        className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-[18px] font-bold active:bg-muted/60 select-none transition-colors"
                        onTouchStart={(e) => { e.preventDefault(); updateQuantity(idx, Math.max(1, item.quantity - 1)); }}
                        onClick={() => updateQuantity(idx, Math.max(1, item.quantity - 1))}
                      >
                        −
                      </button>
                      <span className="w-8 text-center font-bold text-[14px]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {item.quantity}
                      </span>
                      <button
                        className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-[18px] font-bold active:bg-muted/60 select-none transition-colors"
                        onTouchStart={(e) => { e.preventDefault(); updateQuantity(idx, item.quantity + 1); }}
                        onClick={() => updateQuantity(idx, item.quantity + 1)}
                      >
                        +
                      </button>
                    </div>

                    <div className="text-right text-[13px] font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      ₹{fmtINR(Number(item.netAmount) || 0)}
                    </div>

                    <button
                      className="h-9 w-9 rounded-lg flex items-center justify-center text-destructive opacity-40 group-hover:opacity-100 hover:bg-destructive/10 active:bg-destructive/20 select-none transition-all"
                      onTouchStart={(e) => { e.preventDefault(); removeItem(idx); }}
                      onClick={() => removeItem(idx)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Totals bar */}
            {items.length > 0 && (
              <div className="px-4 py-2.5 bg-muted/50 border-t border-border flex justify-between items-center shrink-0">
                <span className="text-[13px] font-medium text-muted-foreground">
                  {totals.quantity} items · MRP ₹{fmtINR(totals.mrp)}
                </span>
                <span className="text-[20px] font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  ₹{fmtINR(finalAmount)}
                </span>
              </div>
            )}
          </div>

          {/* Note */}
          <div className="px-3 py-2 border-t border-border shrink-0">
            <Input
              className="h-9 text-[13px] no-uppercase rounded-lg"
              placeholder="Sale note (optional)..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              inputMode="text"
              autoCorrect="on"
            />
          </div>
        </div>

        {/* ─── RIGHT PANEL — Payment (38%) ─── */}
        <div className="flex flex-col bg-muted/10 overflow-y-auto" style={{ flexBasis: "38%" }}>
          <div className="p-4 space-y-4 flex-1">
            {/* Customer display */}
            {customerName && (
              <div className="bg-card rounded-lg p-3 border border-border">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Customer</p>
                <p className="font-semibold text-[14px]">{customerName}</p>
                {customerPhone && <p className="text-[12px] text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{customerPhone}</p>}
              </div>
            )}

            {/* Salesman */}
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Salesperson</label>
              <select
                className="w-full mt-1.5 h-11 rounded-lg border border-input bg-card px-3 text-[13px]"
                value={selectedSalesman}
                onChange={(e) => setSelectedSalesman(e.target.value)}
              >
                <option value="">— Select —</option>
                {salesmen.map((s: any) => (
                  <option key={s.id || s.employee_name || s.name} value={s.employee_name || s.name}>{s.employee_name || s.name}</option>
                ))}
              </select>
            </div>

            {/* Discount */}
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Flat Discount</label>
              <div className="flex gap-1 mt-1.5 mb-2">
                <Button
                  size="sm"
                  variant={flatDiscountMode === "percent" ? "default" : "outline"}
                  className="h-9 px-4 rounded-lg"
                  onClick={() => onFlatDiscountModeChange("percent")}
                >
                  %
                </Button>
                <Button
                  size="sm"
                  variant={flatDiscountMode === "amount" ? "default" : "outline"}
                  className="h-9 px-4 rounded-lg"
                  onClick={() => onFlatDiscountModeChange("amount")}
                >
                  ₹
                </Button>
              </div>
              <Input
                type="number"
                className="h-11 text-[15px] rounded-lg"
                value={flatDiscountValue || ""}
                onChange={(e) => onFlatDiscountValueChange(parseFloat(e.target.value) || 0)}
                placeholder="0"
                inputMode="decimal"
                enterKeyHint="done"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              />
              {flatDiscountValue > 0 && (
                <p className="text-[12px] text-green-600 mt-1 font-medium">
                  Save ₹{fmtINR(flatDiscountMode === "percent" ? totals.mrp * flatDiscountValue / 100 : flatDiscountValue)}
                </p>
              )}
            </div>

            {/* Amount summary */}
            <div className="bg-card rounded-xl p-4 space-y-2 border border-border shadow-sm">
              <div className="flex justify-between text-[13px]">
                <span className="text-muted-foreground">MRP Total</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>₹{fmtINR(totals.mrp)}</span>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between text-[13px] text-green-600">
                  <span>Discount</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>−₹{fmtINR(totals.discount)}</span>
                </div>
              )}
              {roundOff !== 0 && (
                <div className="flex justify-between text-[13px] text-muted-foreground">
                  <span>Round Off</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{roundOff > 0 ? "+" : ""}₹{roundOff.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-border">
                <span className="text-[16px] font-bold">NET PAYABLE</span>
                <span className="text-[22px] font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "hsl(var(--primary))" }}>
                  ₹{fmtINR(finalAmount)}
                </span>
              </div>
            </div>

            {/* Payment Buttons — 56px touch targets */}
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { label: "💵 Cash", method: "cash", cls: "bg-green-600 hover:bg-green-700 active:bg-green-800" },
                { label: "📱 UPI", method: "upi", cls: "bg-blue-600 hover:bg-blue-700 active:bg-blue-800" },
                { label: "💳 Card", method: "card", cls: "bg-purple-600 hover:bg-purple-700 active:bg-purple-800" },
                { label: "📝 Credit", method: "pay_later", cls: "bg-orange-500 hover:bg-orange-600 active:bg-orange-700" },
              ].map(({ label, method, cls }) => (
                <button
                  key={method}
                  disabled={isSaving || items.length === 0}
                  className={`h-14 rounded-xl font-bold text-[15px] text-white ${cls} disabled:opacity-30 active:scale-[0.97] transition-all select-none shadow-sm`}
                  onTouchStart={(e) => { e.preventDefault(); if (!isSaving && items.length > 0) onPaymentAndPrint(method); }}
                  onClick={() => onPaymentAndPrint(method)}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Mix payment */}
            <button
              disabled={isSaving || items.length === 0}
              className="w-full h-12 rounded-xl bg-muted hover:bg-muted/80 font-semibold text-[13px] border border-border disabled:opacity-30 active:scale-[0.97] transition-all select-none"
              onTouchStart={(e) => { e.preventDefault(); if (!isSaving && items.length > 0) onMixPayment(); }}
              onClick={onMixPayment}
            >
              🔀 Mix Payment
            </button>
          </div>
        </div>
      </div>

      {/* ─── BOTTOM FUNCTION BAR ─── */}
      <div className="h-[52px] flex items-center gap-1 px-2 shrink-0 border-t border-border/60 overflow-x-auto"
        style={{ background: "hsl(222, 47%, 11%)" }}>
        {shortcuts.map(({ key, label, color, action, disabled }) => (
          <button
            key={key}
            disabled={disabled || isSaving}
            className={`flex flex-col items-center justify-center h-[42px] min-w-[72px] px-2 rounded-lg text-white disabled:opacity-30 active:scale-95 transition-all select-none shrink-0 ${color}`}
            onTouchStart={(e) => { e.preventDefault(); if (!disabled && !isSaving && action) action(); }}
            onClick={() => { if (action) action(); }}
          >
            <span className="text-[10px] font-bold opacity-70" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{key}</span>
            <span className="text-[11px] font-semibold leading-tight">{label}</span>
          </button>
        ))}
      </div>

      {/* ─── CAMERA SCANNER OVERLAY ─── */}
      {showCamera && (
        <CameraScanner
          onResult={handleCameraResult}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}
