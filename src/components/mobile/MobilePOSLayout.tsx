import { useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MobilePOSCartItem } from "./MobilePOSCartItem";
import { MobilePOSHeader } from "./MobilePOSHeader";
import { MobilePOSBottomBar } from "./MobilePOSBottomBar";
import { MobilePOSPaymentSheet } from "./MobilePOSPaymentSheet";
import { useOfflineSync } from "@/hooks/useOfflineSync";

interface CartItem {
  id: string;
  barcode: string;
  productName: string;
  size: string;
  color: string;
  quantity: number;
  mrp: number;
  originalMrp: number | null;
  gstPer: number;
  discountPercent: number;
  discountAmount: number;
  unitCost: number;
  netAmount: number;
  productId: string;
  variantId: string;
  hsnCode?: string;
  productType?: string;
}

interface MobilePOSLayoutProps {
  // Cart
  items: CartItem[];
  totals: { quantity: number; mrp: number; discount: number; subtotal: number; savings: number };
  finalAmount: number;
  
  // Cart actions
  updateQuantity: (index: number, qty: number) => void;
  removeItem: (index: number) => void;
  
  // Invoice
  invoiceNumber: string;
  
  // Customer
  customerId: string;
  customerName: string;
  customerPhone: string;
  customers: any[];
  customerSearchInput: string;
  onCustomerSearchChange: (value: string) => void;
  openCustomerSearch: boolean;
  setOpenCustomerSearch: (open: boolean) => void;
  onCustomerSelect: (customer: any) => void;
  onAddCustomer: () => void;
  
  // Search
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onBarcodeSubmit: () => void;
  barcodeInputRef: React.RefObject<HTMLInputElement>;
  
  // Payment
  isSaving: boolean;
  onPaymentAndPrint: (method: 'cash' | 'card' | 'upi' | 'pay_later') => void;
  onMixPayment: () => void;
  onHoldBill: () => void;
  
  // Mobile payment sheet
  showMobilePaymentSheet: boolean;
  setShowMobilePaymentSheet: (show: boolean) => void;
  
  // Product type filter
  selectedProductType: string;
  onProductTypeChange: (type: string) => void;
}

export const MobilePOSLayout = ({
  items,
  totals,
  finalAmount,
  updateQuantity,
  removeItem,
  invoiceNumber,
  customerId,
  customerName,
  customerPhone,
  customers,
  customerSearchInput,
  onCustomerSearchChange,
  openCustomerSearch,
  setOpenCustomerSearch,
  onCustomerSelect,
  onAddCustomer,
  searchInput,
  onSearchInputChange,
  onBarcodeSubmit,
  barcodeInputRef,
  isSaving,
  onPaymentAndPrint,
  onMixPayment,
  onHoldBill,
  showMobilePaymentSheet,
  setShowMobilePaymentSheet,
  selectedProductType,
  onProductTypeChange,
}: MobilePOSLayoutProps) => {
  const { isOnline, isSyncing, pendingActions } = useOfflineSync();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when items change
  useEffect(() => {
    if (scrollAreaRef.current && items.length > 0) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [items.length]);

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* Header */}
      <MobilePOSHeader
        invoiceNumber={invoiceNumber}
        isOnline={isOnline}
        isSyncing={isSyncing}
        pendingActions={pendingActions}
        customerName={customerName}
        customerPhone={customerPhone}
        onCustomerSelect={onCustomerSelect}
        onAddCustomer={onAddCustomer}
        searchInput={searchInput}
        onSearchInputChange={onSearchInputChange}
        onBarcodeSubmit={onBarcodeSubmit}
        barcodeInputRef={barcodeInputRef}
        customers={customers}
        customerSearchInput={customerSearchInput}
        onCustomerSearchChange={onCustomerSearchChange}
        openCustomerSearch={openCustomerSearch}
        setOpenCustomerSearch={setOpenCustomerSearch}
        selectedProductType={selectedProductType}
        onProductTypeChange={onProductTypeChange}
      />

      {/* Cart Items - Scrollable area with bottom padding for payment bar */}
      <ScrollArea 
        ref={scrollAreaRef}
        className="flex-1 px-3 pb-[100px]"
      >
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <p className="text-lg font-medium">No items in cart</p>
            <p className="text-sm mt-1">Scan barcode or search products</p>
          </div>
        ) : (
          <div className="py-3 space-y-2">
            {items.map((item, index) => (
              <MobilePOSCartItem
                key={item.id || index}
                item={item}
                index={index}
                onQuantityChange={(idx, qty) => {
                  if (qty >= 1) updateQuantity(idx, qty);
                }}
                onRemove={removeItem}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Bottom Payment Bar */}
      <MobilePOSBottomBar
        quantity={totals.quantity}
        finalAmount={finalAmount}
        hasItems={items.length > 0}
        isSaving={isSaving}
        onCashPayment={() => onPaymentAndPrint('cash')}
        onUPIPayment={() => onPaymentAndPrint('upi')}
        onCardPayment={() => onPaymentAndPrint('card')}
        onMoreOptions={() => setShowMobilePaymentSheet(true)}
      />

      {/* Payment Sheet (More Options) */}
      <MobilePOSPaymentSheet
        open={showMobilePaymentSheet}
        onOpenChange={setShowMobilePaymentSheet}
        onPayment={onPaymentAndPrint}
        onMixPayment={onMixPayment}
        onHold={onHoldBill}
        isSaving={isSaving}
        hasItems={items.length > 0}
        finalAmount={finalAmount}
      />
    </div>
  );
};
