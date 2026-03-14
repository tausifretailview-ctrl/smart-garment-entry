import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSaveSale } from '@/hooks/useSaveSale';
import { useStockValidation } from '@/hooks/useStockValidation';
import { useReactToPrint } from 'react-to-print';
import { InvoiceWrapper } from '@/components/InvoiceWrapper';
import { toast } from 'sonner';
import { Truck, X, Trash2, Plus, Minus, Printer } from 'lucide-react';
import { format } from 'date-fns';

interface DCItem {
  id: string;
  barcode: string;
  productName: string;
  size: string;
  color: string;
  quantity: number;
  mrp: number;
  unitCost: number;
  netAmount: number;
  productId: string;
  variantId: string;
  gstPer: number;
  discountPercent: number;
  discountAmount: number;
  originalMrp: number | null;
  hsnCode?: string;
  productType?: string;
}

interface DeliveryChallanPOSDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeliveryChallanPOSDialog({ open, onOpenChange }: DeliveryChallanPOSDialogProps) {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { saveSale, isSaving } = useSaveSale();
  const { checkStock } = useStockValidation();

  const [items, setItems] = useState<DCItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'card' | 'pay_later'>('cash');
  const [dcNumber, setDcNumber] = useState('');
  const [isSavingDC, setIsSavingDC] = useState(false);
  const [savedInvoiceData, setSavedInvoiceData] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);

  const barcodeRef = useRef<HTMLInputElement>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const { data: productsData } = useQuery({
    queryKey: ['dc-products', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const allProducts: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data: products } = await supabase
          .from('products')
          .select(`id, product_name, brand, hsn_code, gst_per, product_type, status,
            product_variants(id, barcode, size, color, stock_qty, sale_price, mrp, product_id, active, deleted_at)`)
          .eq('organization_id', currentOrganization.id)
          .eq('status', 'active')
          .is('deleted_at', null)
          .range(offset, offset + PAGE_SIZE - 1);
        if (products && products.length > 0) {
          allProducts.push(...products);
          offset += PAGE_SIZE;
          hasMore = products.length === PAGE_SIZE;
        } else hasMore = false;
      }
      return allProducts.map((p: any) => ({
        ...p,
        product_variants: p.product_variants?.filter((v: any) => !v.deleted_at && v.active !== false),
      })).filter((p: any) => (p.product_variants?.length || 0) > 0);
    },
    enabled: !!currentOrganization?.id && open,
  });

  useEffect(() => {
    if (!currentOrganization?.id || !open) return;
    supabase.from('settings')
      .select('pos_bill_format, sale_settings, bill_barcode_settings, business_name, address, mobile_number, gst_number')
      .eq('organization_id', currentOrganization.id)
      .maybeSingle()
      .then(({ data }) => { if (data) setSettings(data); });
  }, [currentOrganization?.id, open]);

  useEffect(() => {
    if (!open || !currentOrganization?.id) return;
    supabase.rpc('generate_challan_number', { p_organization_id: currentOrganization.id })
      .then(({ data }) => { if (data) setDcNumber(data as string); });
  }, [open, currentOrganization?.id]);

  useEffect(() => {
    if (open) setTimeout(() => barcodeRef.current?.focus(), 200);
  }, [open]);

  const handleClose = () => {
    setItems([]);
    setBarcodeInput('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerId(null);
    setPaymentMethod('cash');
    setSavedInvoiceData(null);
    onOpenChange(false);
  };

  const grossAmount = items.reduce((s, i) => s + i.mrp * i.quantity, 0);
  const netAmount = items.reduce((s, i) => s + i.netAmount, 0);

  const handleBarcodeEnter = useCallback(async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !barcodeInput.trim()) return;
    e.preventDefault();
    const term = barcodeInput.trim();
    setBarcodeInput('');

    if (!productsData) return;

    let foundVariant: any = null;
    let foundProduct: any = null;

    for (const product of productsData) {
      const v = product.product_variants?.find((v: any) =>
        v.barcode?.toLowerCase() === term.toLowerCase()
      );
      if (v) { foundVariant = v; foundProduct = product; break; }
    }

    if (!foundVariant || !foundProduct) {
      toast.error(`Barcode "${term}" not found`);
      setTimeout(() => barcodeRef.current?.focus(), 100);
      return;
    }

    const existingIdx = items.findIndex(i => i.barcode === foundVariant.barcode);
    const newQty = existingIdx >= 0 ? items[existingIdx].quantity + 1 : 1;
    const stockCheck = await checkStock(foundVariant.id, newQty);
    if (!stockCheck.isAvailable) {
      toast.error(`Only ${stockCheck.availableStock} in stock`);
      setTimeout(() => barcodeRef.current?.focus(), 100);
      return;
    }

    const unitCost = foundVariant.sale_price || foundVariant.mrp || 0;

    if (existingIdx >= 0) {
      setItems(prev => prev.map((item, idx) =>
        idx === existingIdx
          ? { ...item, quantity: newQty, netAmount: unitCost * newQty }
          : item
      ));
    } else {
      const newItem: DCItem = {
        id: `dc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        barcode: foundVariant.barcode || '',
        productName: foundProduct.product_name,
        size: foundVariant.size || '',
        color: foundVariant.color || '',
        quantity: 1,
        mrp: foundVariant.mrp || 0,
        originalMrp: foundVariant.mrp || null,
        unitCost,
        netAmount: unitCost,
        productId: foundProduct.id,
        variantId: foundVariant.id,
        gstPer: foundProduct.gst_per || 0,
        discountPercent: 0,
        discountAmount: 0,
        hsnCode: foundProduct.hsn_code || '',
        productType: foundProduct.product_type || 'goods',
      };
      setItems(prev => [...prev, newItem]);
    }

    setTimeout(() => barcodeRef.current?.focus(), 50);
  }, [barcodeInput, productsData, items, checkStock]);

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const changeQty = (id: string, delta: number) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const newQty = Math.max(1, item.quantity + delta);
      return { ...item, quantity: newQty, netAmount: item.unitCost * newQty };
    }));
  };

  const getPageStyle = () => {
    const fmt = settings?.pos_bill_format || 'thermal';
    const size = fmt === 'a4' ? 'A4 portrait' : fmt === 'a5' ? 'A5 portrait' : fmt === 'a5-horizontal' ? 'A5 landscape' : '80mm auto';
    const margin = fmt === 'a4' ? '6mm' : fmt === 'thermal' ? '3mm' : '2mm';
    return `@page { size: ${size}; margin: ${margin}; } @media print { html, body { margin: 0; padding: 0; } }`;
  };

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    pageStyle: getPageStyle(),
  });

  const handleSaveDC = async (method: 'cash' | 'upi' | 'card' | 'pay_later') => {
    if (items.length === 0) {
      toast.error('Add at least one item');
      return;
    }
    if (!currentOrganization?.id) return;

    setIsSavingDC(true);
    try {
      const saleData = {
        customerId: customerId || null,
        customerName: customerName || 'Walk-in',
        customerPhone: customerPhone || null,
        items: items.map(item => ({
          id: item.id,
          barcode: item.barcode,
          productName: item.productName,
          size: item.size,
          color: item.color,
          quantity: item.quantity,
          mrp: item.mrp,
          originalMrp: item.originalMrp,
          gstPer: item.gstPer,
          discountPercent: item.discountPercent,
          discountAmount: item.discountAmount,
          unitCost: item.unitCost,
          netAmount: item.netAmount,
          productId: item.productId,
          variantId: item.variantId,
          hsnCode: item.hsnCode || '',
          productType: item.productType || 'goods',
        })),
        grossAmount,
        discountAmount: 0,
        flatDiscountPercent: 0,
        flatDiscountAmount: 0,
        saleReturnAdjust: 0,
        roundOff: 0,
        netAmount,
        salesman: null,
        notes: `DC: ${dcNumber}`,
        pointsRedeemedAmount: 0,
      };

      const savedSale = await saveSale(saleData as any, method, undefined, 'pos');

      if (savedSale) {
        await supabase.from('sales').update({
          sale_number: dcNumber,
          sale_type: 'delivery_challan',
        }).eq('id', (savedSale as any).id);

        const invoiceData = {
          billNo: dcNumber,
          date: new Date(),
          customerName: customerName || 'Walk-in',
          customerAddress: '',
          customerMobile: customerPhone || '',
          items: items.map((item, idx) => ({
            sr: idx + 1,
            particulars: item.productName,
            size: item.size,
            barcode: item.barcode,
            hsn: item.hsnCode || '',
            sp: item.unitCost,
            mrp: item.mrp,
            qty: item.quantity,
            rate: item.unitCost,
            total: item.netAmount,
          })),
          subTotal: grossAmount,
          discount: 0,
          grandTotal: netAmount,
          tenderAmount: netAmount,
          cashPaid: method === 'cash' ? netAmount : 0,
          upiPaid: method === 'upi' ? netAmount : 0,
          cardPaid: method === 'card' ? netAmount : 0,
          refundCash: 0,
          paymentMethod: method,
          documentType: 'dc',
        };
        setSavedInvoiceData(invoiceData);

        toast.success(`DC ${dcNumber} saved`);

        queryClient.invalidateQueries({ queryKey: ['sales'] });
        queryClient.invalidateQueries({ queryKey: ['pos-sales'] });
        queryClient.invalidateQueries({ queryKey: ['cashier-report-sales'] });

        await new Promise(r => setTimeout(r, 300));
        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => setTimeout(r, 200));
        handlePrint();

        setItems([]);
        setBarcodeInput('');
        setCustomerName('');
        setCustomerPhone('');
        setCustomerId(null);
        setSavedInvoiceData(null);

        const { data: nextDC } = await supabase.rpc('generate_challan_number', {
          p_organization_id: currentOrganization.id
        });
        if (nextDC) setDcNumber(nextDC as string);

        setTimeout(() => barcodeRef.current?.focus(), 100);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save DC');
    } finally {
      setIsSavingDC(false);
    }
  };

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const billFormat = settings?.pos_bill_format || 'thermal';

  return (
    <>
      {/* Hidden print area */}
      <div style={{ display: 'none' }}>
        <div ref={printRef}>
          {savedInvoiceData && (
            <InvoiceWrapper invoiceData={savedInvoiceData} billFormat={billFormat} />
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          {/* Header */}
          <DialogHeader className="p-0">
            <div className="bg-orange-600 text-white px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                <DialogTitle className="text-white text-lg font-bold">
                  Delivery Challan
                </DialogTitle>
                <Badge variant="secondary" className="bg-orange-800/50 text-orange-100 border-0 text-xs">
                  {dcNumber || 'Generating...'}
                </Badge>
              </div>
              <div className="text-xs text-orange-200">
                {format(new Date(), 'dd/MM/yyyy  hh:mm a')}
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 flex flex-col overflow-hidden p-4 gap-3">
            {/* Customer + Barcode row */}
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                placeholder="Customer Name"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                className="w-48 h-9 text-sm"
              />
              <Input
                placeholder="Phone"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                className="w-36 h-9 text-sm"
              />
              <Input
                ref={barcodeRef}
                placeholder="Scan barcode / Enter code..."
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                onKeyDown={handleBarcodeEnter}
                className="flex-1 h-9 text-sm font-mono"
                autoFocus
              />
            </div>

            {/* Items table */}
            <div className="flex-1 overflow-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="px-2 py-2 w-8">#</th>
                    <th className="px-2 py-2">Product</th>
                    <th className="px-2 py-2 w-16">Size</th>
                    <th className="px-2 py-2 w-20 text-right">MRP</th>
                    <th className="px-2 py-2 w-20 text-right">Rate</th>
                    <th className="px-2 py-2 w-28 text-center">Qty</th>
                    <th className="px-2 py-2 w-24 text-right">Amount</th>
                    <th className="px-2 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-muted-foreground">
                        Scan barcode to add items
                      </td>
                    </tr>
                  )}
                  {items.map((item, idx) => (
                    <tr key={item.id} className="border-t hover:bg-muted/30">
                      <td className="px-2 py-1.5 text-muted-foreground">{idx + 1}</td>
                      <td className="px-2 py-1.5">
                        <p className="font-medium truncate max-w-[200px]">{item.productName}</p>
                        <p className="text-xs text-muted-foreground font-mono">{item.barcode}</p>
                      </td>
                      <td className="px-2 py-1.5">{item.size}</td>
                      <td className="px-2 py-1.5 text-right">₹{item.mrp}</td>
                      <td className="px-2 py-1.5 text-right">₹{item.unitCost}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => changeQty(item.id, -1)}
                            className="w-6 h-6 rounded border flex items-center justify-center hover:bg-muted"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-8 text-center font-medium">{item.quantity}</span>
                          <button
                            onClick={() => changeQty(item.id, 1)}
                            className="w-6 h-6 rounded border flex items-center justify-center hover:bg-muted"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold">
                        ₹{Math.round(item.netAmount).toLocaleString('en-IN')}
                      </td>
                      <td className="px-2 py-1.5">
                        <button
                          onClick={() => removeItem(item.id)}
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

            {/* Footer — totals + payment */}
            <div className="flex items-center justify-between gap-4 pt-2 border-t">
              {/* Totals */}
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Items</span>
                  <span className="font-semibold">{items.length}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Qty</span>
                  <span className="font-semibold">{totalQty}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-bold text-lg text-primary">
                    ₹{Math.round(netAmount).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Payment mode + Save buttons */}
              <div className="flex items-center gap-2">
                <Select value={paymentMethod} onValueChange={v => setPaymentMethod(v as any)}>
                  <SelectTrigger className="w-32 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="pay_later">Pay Later</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  className="bg-orange-600 hover:bg-orange-700 text-white gap-1"
                  onClick={() => handleSaveDC(paymentMethod)}
                  disabled={isSavingDC || items.length === 0}
                >
                  {isSavingDC ? (
                    <span className="flex items-center gap-1">
                      ⏳ Saving...
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Printer className="h-4 w-4" />
                      Save & Print
                    </span>
                  )}
                </Button>

                <Button variant="outline" size="sm" onClick={handleClose}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
