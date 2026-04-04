import { useState, useRef, useCallback } from "react";
import { Search, ShoppingCart, Trash2, Camera, User, FileText, RotateCcw, Pause } from "lucide-react";
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
}: TabletPOSLayoutProps) {
  const [showCamera, setShowCamera] = useState(false);

  // Handle scanned barcode from camera
  const handleCameraResult = useCallback((code: string) => {
    onSearchInputChange(code);
    setShowCamera(false);
    // Trigger submit after setting value
    setTimeout(() => onBarcodeSubmit(), 50);
  }, [onSearchInputChange, onBarcodeSubmit]);

  // Handle enter key — supports iOS Go button
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === "Go" || e.keyCode === 13) {
      e.preventDefault();
      onBarcodeSubmit();
    }
  }, [onBarcodeSubmit]);

  const fmtINR = (n: number) => Math.round(n).toLocaleString("en-IN");

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* ─── TOP HEADER ─── */}
      <header className="h-14 bg-primary text-primary-foreground flex items-center justify-between px-4 shadow-md z-50 shrink-0">
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-5 w-5" />
          <span className="font-bold text-base">EzzyPOS</span>
          <Badge variant="secondary" className="text-xs font-mono">
            {invoiceNumber}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost" size="sm"
            onClick={onNewBill}
            className="text-primary-foreground hover:bg-primary/80 text-xs h-9 px-3"
          >
            + New
          </Button>
          <Button
            variant="ghost" size="sm"
            onClick={onHoldBill}
            className="text-primary-foreground hover:bg-primary/80 text-xs h-9 px-3"
          >
            <Pause className="h-3.5 w-3.5 mr-1" />Hold
          </Button>
          <Button
            variant="ghost" size="sm"
            onClick={onSaleReturn}
            className="text-primary-foreground hover:bg-primary/80 text-xs h-9 px-3"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />Return
          </Button>
          <Button
            variant="ghost" size="sm"
            onClick={onClear}
            className="text-primary-foreground hover:bg-destructive/80 text-xs h-9 px-3"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />Clear
          </Button>
        </div>
      </header>

      {/* ─── MAIN BODY ─── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ─── LEFT PANEL — Scan + Cart (60%) ─── */}
        <div className="flex-1 flex flex-col border-r border-border min-w-0" style={{ flexBasis: "62%" }}>
          {/* Search Bars */}
          <div className="p-3 border-b border-border bg-muted/30 space-y-2 shrink-0">
            {/* Customer */}
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10 h-11 text-base no-uppercase"
                placeholder="Customer name or phone..."
                value={customerSearchInput}
                onChange={(e) => onCustomerSearchChange(e.target.value)}
                inputMode="text"
                autoCorrect="off"
                autoCapitalize="words"
                enterKeyHint="next"
              />
              {/* Customer dropdown */}
              {openCustomerSearch && customerSearchInput.length >= 2 && (
                <div className="absolute top-full left-0 right-0 z-50 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto mt-1">
                  {customers.map((c: any) => (
                    <button
                      key={c.id}
                      className="w-full text-left px-4 py-3 hover:bg-accent text-sm border-b border-border/50 last:border-0"
                      onTouchStart={(e) => { e.preventDefault(); onCustomerSelect(c); setOpenCustomerSearch(false); }}
                      onClick={() => { onCustomerSelect(c); setOpenCustomerSearch(false); }}
                    >
                      <span className="font-medium">{c.customer_name}</span>
                      {c.phone && <span className="text-muted-foreground ml-2">{c.phone}</span>}
                    </button>
                  ))}
                  <button
                    className="w-full text-left px-4 py-3 text-primary font-medium hover:bg-accent"
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
                  className="pl-10 h-11 text-base no-uppercase"
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
                />
              </div>
              {/* Camera button — large touch target */}
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0"
                onTouchStart={(e) => { e.preventDefault(); setShowCamera(true); }}
                onClick={() => setShowCamera(true)}
              >
                <Camera className="h-5 w-5" />
              </Button>
            </div>

            {/* Product search results dropdown */}
            {openProductSearch && searchInput.length >= 2 && filteredProducts && filteredProducts.length > 0 && (
              <div className="bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                {filteredProducts.slice(0, 20).map((product: any) => 
                  product.product_variants?.map((variant: any) => (
                    <button
                      key={variant.id}
                      className="w-full text-left px-4 py-3 hover:bg-accent text-sm border-b border-border/50 last:border-0 flex justify-between items-center"
                      onTouchStart={(e) => { e.preventDefault(); onProductSelect?.(product, variant); }}
                      onClick={() => onProductSelect?.(product, variant)}
                    >
                      <div>
                        <span className="font-medium">{product.product_name}</span>
                        <span className="text-muted-foreground ml-2">{variant.size}{variant.color ? ` · ${variant.color}` : ""}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-medium">₹{fmtINR(variant.mrp || 0)}</span>
                        <span className="text-muted-foreground text-xs ml-2">Stk: {variant.stock_qty || 0}</span>
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
            <div className="grid grid-cols-[1fr_80px_100px_80px_40px] gap-2 px-4 py-2 bg-muted/50 text-xs font-semibold text-muted-foreground border-b border-border shrink-0">
              <span>Product</span>
              <span className="text-right">MRP</span>
              <span className="text-center">Qty</span>
              <span className="text-right">Total</span>
              <span />
            </div>

            {/* Cart Rows */}
            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
                  <ShoppingCart className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-base">Scan a barcode or search to add items</p>
                </div>
              ) : (
                items.map((item: any, idx: number) => (
                  <div
                    key={`${item.variantId}-${idx}`}
                    className="grid grid-cols-[1fr_80px_100px_80px_40px] gap-2 px-4 py-3 border-b border-border/50 items-center"
                  >
                    {/* Product info */}
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{item.productName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.barcode} · {item.size}{item.color ? ` · ${item.color}` : ""}
                      </p>
                    </div>

                    {/* MRP */}
                    <div className="text-right text-sm font-medium">
                      ₹{fmtINR(item.mrp || 0)}
                    </div>

                    {/* Qty stepper — large touch targets */}
                    <div className="flex items-center justify-center gap-1">
                      <button
                        className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center text-lg font-bold active:bg-muted/70 select-none"
                        onTouchStart={(e) => { e.preventDefault(); updateQuantity(idx, Math.max(1, item.quantity - 1)); }}
                        onClick={() => updateQuantity(idx, Math.max(1, item.quantity - 1))}
                      >
                        −
                      </button>
                      <span className="w-8 text-center font-bold text-sm">{item.quantity}</span>
                      <button
                        className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center text-lg font-bold active:bg-muted/70 select-none"
                        onTouchStart={(e) => { e.preventDefault(); updateQuantity(idx, item.quantity + 1); }}
                        onClick={() => updateQuantity(idx, item.quantity + 1)}
                      >
                        +
                      </button>
                    </div>

                    {/* Line total */}
                    <div className="text-right text-sm font-semibold">
                      ₹{fmtINR((item.mrp || 0) * item.quantity)}
                    </div>

                    {/* Delete */}
                    <button
                      className="h-9 w-9 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10 active:bg-destructive/20 select-none"
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
              <div className="px-4 py-2.5 bg-muted/50 border-t border-border flex justify-between items-center text-sm font-medium shrink-0">
                <span>{totals.quantity} items · MRP ₹{fmtINR(totals.mrp)}</span>
                <span className="text-lg font-bold">₹{fmtINR(finalAmount)}</span>
              </div>
            )}
          </div>

          {/* Note */}
          <div className="px-3 py-2 border-t border-border shrink-0">
            <Input
              className="h-9 text-sm no-uppercase"
              placeholder="Sale note (optional)..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              inputMode="text"
              autoCorrect="on"
            />
          </div>
        </div>

        {/* ─── RIGHT PANEL — Payment (38%) ─── */}
        <div className="flex flex-col bg-muted/20 overflow-y-auto" style={{ flexBasis: "38%" }}>
          <div className="p-4 space-y-4">
            {/* Salesman */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Salesperson</label>
              <select
                className="w-full mt-1 h-11 rounded-md border border-input bg-card px-3 text-sm"
                value={selectedSalesman}
                onChange={(e) => setSelectedSalesman(e.target.value)}
              >
                <option value="">— Select —</option>
                {salesmen.map((s: any) => (
                  <option key={s.id || s.name} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Discount */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Flat Discount</label>
              <div className="flex gap-1 mt-1 mb-2">
                <Button
                  size="sm"
                  variant={flatDiscountMode === "percent" ? "default" : "outline"}
                  className="h-9 px-4"
                  onClick={() => onFlatDiscountModeChange("percent")}
                >
                  %
                </Button>
                <Button
                  size="sm"
                  variant={flatDiscountMode === "amount" ? "default" : "outline"}
                  className="h-9 px-4"
                  onClick={() => onFlatDiscountModeChange("amount")}
                >
                  ₹
                </Button>
              </div>
              <Input
                type="number"
                className="h-11 text-base"
                value={flatDiscountValue || ""}
                onChange={(e) => onFlatDiscountValueChange(parseFloat(e.target.value) || 0)}
                placeholder="0"
                inputMode="decimal"
                enterKeyHint="done"
              />
              {flatDiscountValue > 0 && (
                <p className="text-xs text-green-600 mt-1 font-medium">
                  Save ₹{fmtINR(flatDiscountMode === "percent" ? totals.mrp * flatDiscountValue / 100 : flatDiscountValue)}
                </p>
              )}
            </div>

            {/* Amount summary */}
            <div className="bg-card rounded-lg p-3 space-y-1.5 border border-border">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">MRP Total</span>
                <span>₹{fmtINR(totals.mrp)}</span>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Discount</span>
                  <span>−₹{fmtINR(totals.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold pt-1 border-t border-border">
                <span>NET</span>
                <span>₹{fmtINR(finalAmount)}</span>
              </div>
            </div>

            {/* Payment Buttons — large 56px touch targets */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "💵 Cash", method: "cash", cls: "bg-green-600 hover:bg-green-700 text-white" },
                { label: "📱 UPI", method: "upi", cls: "bg-blue-600 hover:bg-blue-700 text-white" },
                { label: "💳 Card", method: "card", cls: "bg-purple-600 hover:bg-purple-700 text-white" },
                { label: "📝 Credit", method: "pay_later", cls: "bg-orange-500 hover:bg-orange-600 text-white" },
              ].map(({ label, method, cls }) => (
                <button
                  key={method}
                  disabled={isSaving || items.length === 0}
                  className={`h-14 rounded-xl font-bold text-base ${cls} disabled:opacity-40 active:scale-95 transition-transform select-none`}
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
              className="w-full h-12 rounded-xl bg-muted hover:bg-muted/80 font-semibold text-sm border border-border disabled:opacity-40 active:scale-95 transition-transform select-none"
              onTouchStart={(e) => { e.preventDefault(); if (!isSaving && items.length > 0) onMixPayment(); }}
              onClick={onMixPayment}
            >
              🔀 Mix Payment
            </button>
          </div>
        </div>
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
