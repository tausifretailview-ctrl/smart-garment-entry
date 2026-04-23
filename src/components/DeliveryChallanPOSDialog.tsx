import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useSettings } from '@/hooks/useSettings';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useStockValidation } from '@/hooks/useStockValidation';
import { useReactToPrint } from 'react-to-print';
import { InvoiceWrapper } from '@/components/InvoiceWrapper';
import { toast } from 'sonner';
import { Truck, X, Trash2, Plus, Minus, Printer, Search, Percent, IndianRupee } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  const { checkStock } = useStockValidation();

  const [items, setItems] = useState<DCItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'card' | 'pay_later'>('cash');
  const [dcNumber, setDcNumber] = useState('');
  const [flatDiscountMode, setFlatDiscountMode] = useState<'percent' | 'amount'>('percent');
  const [flatDiscountValue, setFlatDiscountValue] = useState<number>(0);
  const [srAdjust, setSrAdjust] = useState<number>(0);
  const [isSavingDC, setIsSavingDC] = useState(false);
  const [savedInvoiceData, setSavedInvoiceData] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  const barcodeRef = useRef<HTMLInputElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const searchResultsRef = useRef<any[]>([]);
  const showDropdownRef = useRef(false);
  const selectedIndexRef = useRef(-1);

  // Keep refs in sync with state
  useEffect(() => { searchResultsRef.current = searchResults; }, [searchResults]);
  useEffect(() => { showDropdownRef.current = showDropdown; }, [showDropdown]);
  useEffect(() => { selectedIndexRef.current = selectedIndex; }, [selectedIndex]);

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

  // Product search dropdown logic
  useEffect(() => {
    if (!barcodeInput.trim() || barcodeInput.length < 2 || !productsData) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    const term = barcodeInput.trim().toLowerCase();
    const isBarcode = /\d/.test(term) && term.length >= 5;
    
    // Don't show dropdown for exact barcode matches (let Enter handle it)
    if (isBarcode) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const terms = term.split(/\s+/);
    const results: any[] = [];
    for (const product of productsData) {
      for (const v of (product.product_variants || [])) {
        const searchStr = `${product.product_name} ${product.brand || ''} ${v.size || ''} ${v.color || ''} ${v.barcode || ''}`.toLowerCase();
        const allMatch = terms.every(t => searchStr.includes(t));
        if (allMatch) {
          results.push({
            variant: v,
            product,
            label: `${product.product_name}${v.size ? ' | ' + v.size : ''}${v.color ? ' | ' + v.color : ''}`,
            stock: v.stock_qty || 0,
            mrp: v.mrp || 0,
            salePrice: v.sale_price || v.mrp || 0,
            barcode: v.barcode || '',
            brand: product.brand || '',
          });
        }
        if (results.length >= 30) break;
      }
      if (results.length >= 30) break;
    }
    setSearchResults(results);
    setShowDropdown(results.length > 0);
    setSelectedIndex(-1);
    // Update dropdown position
    if (barcodeRef.current) {
      const rect = barcodeRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, [barcodeInput, productsData]);

  const addVariantToItems = useCallback(async (foundVariant: any, foundProduct: any) => {
    const existingIdx = items.findIndex(i => i.variantId === foundVariant.id);
    const newQty = existingIdx >= 0 ? items[existingIdx].quantity + 1 : 1;
    const stockCheck = await checkStock(foundVariant.id, newQty);
    if (!stockCheck.isAvailable) {
      toast.error(`Only ${stockCheck.availableStock} in stock`);
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
    setBarcodeInput('');
    setShowDropdown(false);
    setTimeout(() => barcodeRef.current?.focus(), 50);
  }, [items, checkStock]);

  const handleDropdownSelect = (result: any) => {
    addVariantToItems(result.variant, result.product);
  };

  const handleClose = () => {
    setItems([]);
    setBarcodeInput('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerId(null);
    setPaymentMethod('cash');
    setFlatDiscountValue(0);
    setFlatDiscountMode('percent');
    setSrAdjust(0);
    setSavedInvoiceData(null);
    setShowDropdown(false);
    onOpenChange(false);
  };

  const grossAmount = items.reduce((s, i) => s + i.mrp * i.quantity, 0);
  const subTotal = items.reduce((s, i) => s + i.netAmount, 0);
  const flatDiscountAmount = flatDiscountMode === 'percent'
    ? Math.round((subTotal * (flatDiscountValue || 0)) / 100 * 100) / 100
    : (flatDiscountValue || 0);
  const netAmount = Math.max(0, subTotal - flatDiscountAmount - (srAdjust || 0));

  const handleBarcodeEnter = useCallback(async (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle dropdown navigation using refs for latest state
    if (showDropdownRef.current && searchResultsRef.current.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => {
          const next = Math.min(prev + 1, searchResultsRef.current.length - 1);
          selectedIndexRef.current = next;
          return next;
        });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => {
          const next = Math.max(prev - 1, 0);
          selectedIndexRef.current = next;
          return next;
        });
        return;
      }
      if (e.key === 'Enter' && selectedIndexRef.current >= 0) {
        e.preventDefault();
        e.stopPropagation();
        const selected = searchResultsRef.current[selectedIndexRef.current];
        if (selected) {
          addVariantToItems(selected.variant, selected.product);
        }
        return;
      }
      if (e.key === 'Escape') {
        setShowDropdown(false);
        showDropdownRef.current = false;
        return;
      }
    }

    if (e.key !== 'Enter' || !barcodeInput.trim()) return;
    e.preventDefault();
    const term = barcodeInput.trim();

    let foundVariant: any = null;
    let foundProduct: any = null;

    // First check in-memory cache
    if (productsData) {
      for (const product of productsData) {
        const v = product.product_variants?.find((v: any) =>
          v.barcode?.toLowerCase() === term.toLowerCase()
        );
        if (v) { foundVariant = v; foundProduct = product; break; }
      }
    }

    // Fallback: direct DB lookup (covers large catalogs where embedded
    // variants get truncated by PostgREST row limits)
    if (!foundVariant && currentOrganization?.id) {
      const { data: variantRow } = await supabase
        .from('product_variants')
        .select(`id, barcode, size, color, stock_qty, sale_price, mrp, product_id, active, deleted_at,
          products!inner(id, product_name, brand, hsn_code, gst_per, product_type, status, deleted_at, organization_id)`)
        .eq('organization_id', currentOrganization.id)
        .eq('barcode', term)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      if (variantRow && (variantRow as any).products
          && (variantRow as any).products.status === 'active'
          && !(variantRow as any).products.deleted_at) {
        foundVariant = variantRow;
        foundProduct = (variantRow as any).products;
      }
    }

    if (!foundVariant || !foundProduct) {
      toast.error(`Barcode "${term}" not found`);
      setTimeout(() => barcodeRef.current?.focus(), 100);
      return;
    }

    await addVariantToItems(foundVariant, foundProduct);
  }, [barcodeInput, productsData, addVariantToItems, currentOrganization?.id]);

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
    if (items.length === 0) { toast.error('Add at least one item'); return; }
    if (!currentOrganization?.id || !user) return;
    if (!dcNumber) { toast.error('DC number not ready, please wait'); return; }

    setIsSavingDC(true);
    try {
      const now = new Date().toISOString();
      const gross = items.reduce((s, i) => s + i.mrp * i.quantity, 0);
      const sub   = items.reduce((s, i) => s + i.netAmount, 0);
      const flatDisc = flatDiscountMode === 'percent'
        ? Math.round((sub * (flatDiscountValue || 0)) / 100 * 100) / 100
        : (flatDiscountValue || 0);
      const sr = srAdjust || 0;
      const net = Math.max(0, sub - flatDisc - sr);

      const cashAmt  = method === 'cash'  ? net : 0;
      const upiAmt   = method === 'upi'   ? net : 0;
      const cardAmt  = method === 'card'  ? net : 0;
      const paidAmt  = method === 'pay_later' ? 0 : net;
      const payStatus = method === 'pay_later' ? 'pending' : 'completed';

      // Insert directly — DC number already generated, skip useSaveSale
      const { data: savedSale, error: saleError } = await (supabase as any)
        .from('sales')
        .insert({
          sale_number:           dcNumber,
          sale_type:             'delivery_challan',
          sale_date:             now,
          organization_id:       currentOrganization.id,
          customer_id:           customerId || null,
          customer_name:         customerName || 'Walk-in',
          customer_phone:        customerPhone || null,
          gross_amount:          gross,
          discount_amount:       flatDisc,
          flat_discount_percent: flatDiscountMode === 'percent' ? (flatDiscountValue || 0) : 0,
          flat_discount_amount:  flatDisc,
          sale_return_adjust:    sr,
          round_off:             0,
          net_amount:            net,
          payment_method:        method,
          payment_status:        payStatus,
          paid_amount:           paidAmt,
          cash_amount:           cashAmt,
          card_amount:           cardAmt,
          upi_amount:            upiAmt,
          refund_amount:         0,
          points_redeemed_amount: 0,
          created_by:            user.id,
        })
        .select()
        .single();

      if (saleError) throw saleError;

      // Insert sale items (required for stock deduction trigger)
      const saleItemsData = items.map(item => ({
        sale_id:          savedSale.id,
        product_id:       item.productId,
        variant_id:       item.variantId,
        product_name:     item.productName,
        size:             item.size,
        barcode:          item.barcode || null,
        color:            item.color || null,
        quantity:         item.quantity,
        unit_price:       item.unitCost,
        mrp:              item.mrp,
        gst_percent:      item.gstPer,
        discount_percent: item.discountPercent,
        line_total:       item.netAmount,
        hsn_code:         item.hsnCode || null,
        discount_share:   0,
        round_off_share:  0,
        net_after_discount: item.netAmount,
        per_qty_net_amount: item.unitCost,
      }));

      const { error: itemsError } = await (supabase as any)
        .from('sale_items')
        .insert(saleItemsData);

      if (itemsError) throw itemsError;

      // Prepare print data
      const invoiceData = {
        billNo:          dcNumber,
        date:            new Date(),
        customerName:    customerName || 'Walk-in',
        customerAddress: '',
        customerMobile:  customerPhone || '',
        items: items.map((item, idx) => ({
          sr:          idx + 1,
          particulars: item.productName,
          size:        item.size,
          barcode:     item.barcode,
          hsn:         item.hsnCode || '',
          sp:          item.unitCost,
          mrp:         item.mrp,
          qty:         item.quantity,
          rate:        item.unitCost,
          total:       item.netAmount,
        })),
        subTotal:      gross,
        discount:      flatDisc,
        grandTotal:    net,
        tenderAmount:  net,
        cashPaid:      cashAmt,
        upiPaid:       upiAmt,
        cardPaid:      cardAmt,
        refundCash:    0,
        paymentMethod: method,
        documentType:  'pos',
      };
      setSavedInvoiceData(invoiceData);

      toast.success(`DC ${dcNumber} saved`);

      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['pos-sales'] });
      queryClient.invalidateQueries({ queryKey: ['cashier-report-sales'] });
      queryClient.invalidateQueries({ queryKey: ['pos-dashboard-sales'] });

      // Auto-print after render
      await new Promise(r => setTimeout(r, 300));
      await new Promise(r => requestAnimationFrame(r));
      await new Promise(r => setTimeout(r, 200));
      handlePrint();

      // Reset for next DC
      setItems([]);
      setBarcodeInput('');
      setCustomerName('');
      setCustomerPhone('');
      setCustomerId(null);
      setFlatDiscountValue(0);
      setSrAdjust(0);
      setSavedInvoiceData(null);

      // Generate next DC number
      const { data: nextDC } = await (supabase as any)
        .rpc('generate_challan_number', { p_organization_id: currentOrganization.id });
      if (nextDC) setDcNumber(nextDC);

      setTimeout(() => barcodeRef.current?.focus(), 100);

    } catch (err: any) {
      console.error('DC save error:', err);
      toast.error(err?.message || 'Failed to save DC');
    } finally {
      setIsSavingDC(false);
    }
  };

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const billFormat = settings?.pos_bill_format || 'thermal';

  return (
    <>
      <div style={{ display: 'none' }}>
        <div ref={printRef}>
          {savedInvoiceData && (
            <InvoiceWrapper {...savedInvoiceData} />
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
              <div className="flex-1 relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  ref={barcodeRef}
                  placeholder="Scan barcode or search product..."
                  value={barcodeInput}
                  onChange={e => setBarcodeInput(e.target.value)}
                  onKeyDown={handleBarcodeEnter}
                  onFocus={() => {
                    if (searchResults.length > 0) {
                      setShowDropdown(true);
                      if (barcodeRef.current) {
                        const rect = barcodeRef.current.getBoundingClientRect();
                        setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
                      }
                    }
                  }}
                  className="flex-1 h-9 text-sm pl-8"
                  autoFocus
                />
              </div>
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
            <div className="flex flex-col gap-2 pt-2 border-t">
              {/* Discount + S/R Adjust row */}
              <div className="flex items-center justify-end gap-3 flex-wrap">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground font-medium">FLAT DISC</span>
                  <div className="flex items-center border rounded-md overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setFlatDiscountMode('percent')}
                      className={cn(
                        "px-2 h-8 flex items-center justify-center text-xs",
                        flatDiscountMode === 'percent' ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"
                      )}
                    >
                      <Percent className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlatDiscountMode('amount')}
                      className={cn(
                        "px-2 h-8 flex items-center justify-center text-xs border-l",
                        flatDiscountMode === 'amount' ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"
                      )}
                    >
                      <IndianRupee className="h-3 w-3" />
                    </button>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={flatDiscountValue || ''}
                      onChange={e => setFlatDiscountValue(Number(e.target.value) || 0)}
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
                    value={srAdjust || ''}
                    onChange={e => setSrAdjust(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="w-24 h-8 text-sm text-right"
                  />
                </div>
                {(flatDiscountAmount > 0 || srAdjust > 0) && (
                  <div className="text-xs text-muted-foreground">
                    Sub: ₹{Math.round(subTotal).toLocaleString('en-IN')}
                    {flatDiscountAmount > 0 && <> − Disc: ₹{Math.round(flatDiscountAmount).toLocaleString('en-IN')}</>}
                    {srAdjust > 0 && <> − S/R: ₹{Math.round(srAdjust).toLocaleString('en-IN')}</>}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-4">
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
          </div>
        </DialogContent>
      </Dialog>

      {/* Product search dropdown portal */}
      {showDropdown && searchResults.length > 0 && createPortal(
        <div
          className="fixed bg-popover border border-border rounded-md shadow-lg overflow-auto"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: Math.max(dropdownPos.width, 400), zIndex: 99999, maxHeight: 280 }}
        >
          {searchResults.map((r, idx) => (
            <div
              key={`${r.variant.id}-${idx}`}
              className={cn(
                "px-3 py-2 cursor-pointer border-b border-border last:border-b-0 text-sm",
                selectedIndex === idx ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              )}
              onMouseDown={e => e.preventDefault()}
              onClick={() => handleDropdownSelect(r)}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              <div className="flex justify-between items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.product.product_name}</div>
                  <div className={cn("text-xs flex flex-wrap gap-1 mt-0.5", selectedIndex === idx ? "text-primary-foreground/70" : "text-muted-foreground")}>
                    {r.brand && <span>{r.brand}</span>}
                    {r.variant.size && <span>• Size: {r.variant.size}</span>}
                    {r.variant.color && <span>• {r.variant.color}</span>}
                    {r.barcode && <span>• {r.barcode}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn("text-xs font-medium", selectedIndex === idx ? "text-primary-foreground" : "text-foreground")}>
                    ₹{r.salePrice}
                  </span>
                  <span className={cn(
                    "text-[11px] font-semibold px-1.5 py-0.5 rounded",
                    selectedIndex === idx
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : r.stock > 0
                        ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                        : "bg-destructive/10 text-destructive"
                  )}>
                    Stk: {r.stock}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
