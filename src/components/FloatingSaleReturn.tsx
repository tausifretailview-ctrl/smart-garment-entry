import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus, Minus, Search, Loader2, Scan, FileText, Banknote, CreditCard } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type RefundType = "cash_refund" | "credit_note";

interface ReturnItem {
  productId: string;
  variantId: string;
  productName: string;
  size: string;
  barcode: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface Product {
  id: string;
  product_name: string;
  brand: string | null;
  hsn_code: string | null;
}

interface Variant {
  id: string;
  product_id: string;
  size: string;
  sale_price: number;
  barcode: string | null;
  gst_per: number;
}

interface SaleItemRecord {
  variant_id: string;
  product_id: string;
  product_name: string;
  size: string;
  barcode: string | null;
  quantity: number;
  per_qty_net_amount: number;
  line_total: number;
}

interface FloatingSaleReturnProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  customerId?: string;
  customerName?: string;
  onReturnSaved: (returnAmount: number, returnNumber: string) => void;
}

export const FloatingSaleReturn = ({
  open,
  onOpenChange,
  organizationId,
  customerId,
  customerName,
  onReturnSaved,
}: FloatingSaleReturnProps) => {
  const { toast } = useToast();
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [billNumber, setBillNumber] = useState("");
  const [billSaleId, setBillSaleId] = useState<string | null>(null);
  const [billItems, setBillItems] = useState<SaleItemRecord[]>([]);
  const [billLookupLoading, setBillLookupLoading] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [refundType, setRefundType] = useState<RefundType>("credit_note");
  // Load sold products when dialog opens
  useEffect(() => {
    if (open && organizationId) {
      loadSoldProducts();
      // Auto-focus barcode input
      setTimeout(() => barcodeInputRef.current?.focus(), 200);
    }
    if (!open) {
      setReturnItems([]);
      setBarcodeInput("");
      setSearchTerm("");
      setBillNumber("");
      setBillSaleId(null);
      setBillItems([]);
      setRefundType("credit_note");
    }
  }, [open, organizationId]);

  const loadSoldProducts = async () => {
    setLoading(true);
    try {
      const soldVariantIds = new Set<string>();
      const soldProductIds = new Set<string>();
      const PAGE_SIZE = 1000;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: batch, error } = await supabase
          .from("sale_items")
          .select("product_id, variant_id, sales!inner(organization_id)")
          .eq("sales.organization_id", organizationId)
          .is("deleted_at", null)
          .order("id")
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (error) throw error;
        (batch || []).forEach(item => {
          if (item.product_id) soldProductIds.add(item.product_id);
          if (item.variant_id) soldVariantIds.add(item.variant_id);
        });
        hasMore = (batch?.length || 0) === PAGE_SIZE;
        page++;
      }

      const productIdArray = Array.from(soldProductIds);
      if (productIdArray.length === 0) {
        setProducts([]);
        setVariants([]);
        setLoading(false);
        return;
      }

      const allProducts: Product[] = [];
      for (let i = 0; i < productIdArray.length; i += 500) {
        const batch = productIdArray.slice(i, i + 500);
        const { data } = await supabase
          .from("products")
          .select("id, product_name, brand, hsn_code")
          .in("id", batch)
          .eq("status", "active")
          .is("deleted_at", null);
        allProducts.push(...(data || []));
      }

      const variantIdArray = Array.from(soldVariantIds);
      const allVariants: Variant[] = [];
      for (let i = 0; i < variantIdArray.length; i += 500) {
        const batch = variantIdArray.slice(i, i + 500);
        const { data } = await supabase
          .from("product_variants")
          .select("id, product_id, size, sale_price, barcode, products(gst_per)")
          .in("id", batch)
          .eq("active", true)
          .is("deleted_at", null);
        allVariants.push(
          ...(data?.map(v => ({
            id: v.id,
            product_id: v.product_id,
            size: v.size,
            sale_price: v.sale_price || 0,
            barcode: v.barcode,
            gst_per: (v.products as any)?.gst_per || 0,
          })) || [])
        );
      }

      setProducts(allProducts);
      setVariants(allVariants);
    } catch (error) {
      console.error("Error loading sold products:", error);
    } finally {
      setLoading(false);
    }
  };

  // Look up sale by bill number
  const lookupBillNumber = async () => {
    if (!billNumber.trim()) {
      setBillSaleId(null);
      setBillItems([]);
      return;
    }
    setBillLookupLoading(true);
    try {
      const { data: sale } = await supabase
        .from("sales")
        .select("id")
        .eq("sale_number", billNumber.trim())
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .maybeSingle();

      if (!sale) {
        toast({ title: "Not Found", description: `No sale found with number "${billNumber.trim()}"`, variant: "destructive" });
        setBillSaleId(null);
        setBillItems([]);
        setBillLookupLoading(false);
        return;
      }

      setBillSaleId(sale.id);

      const { data: items } = await supabase
        .from("sale_items")
        .select("variant_id, product_id, product_name, size, barcode, quantity, per_qty_net_amount, line_total")
        .eq("sale_id", sale.id)
        .is("deleted_at", null);

      setBillItems((items as SaleItemRecord[]) || []);
      toast({ title: "Bill Found", description: `${(items || []).length} items loaded from ${billNumber.trim()}` });
    } catch (err) {
      console.error("Bill lookup error:", err);
    } finally {
      setBillLookupLoading(false);
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    }
  };

  const fetchUnitPrice = async (variantId: string, fallbackPrice: number): Promise<number> => {
    // If bill number is specified, use exact price from that bill
    if (billSaleId && billItems.length > 0) {
      const billItem = billItems.find(bi => bi.variant_id === variantId);
      if (billItem && billItem.per_qty_net_amount && billItem.per_qty_net_amount > 0) {
        return billItem.per_qty_net_amount;
      }
      if (billItem && billItem.line_total && billItem.quantity) {
        return billItem.line_total / billItem.quantity;
      }
    }

    // Fallback: most recent sale price
    const { data: saleItemData } = await supabase
      .from("sale_items")
      .select("per_qty_net_amount, line_total, quantity")
      .eq("variant_id", variantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (saleItemData) {
      if (saleItemData.per_qty_net_amount && saleItemData.per_qty_net_amount > 0) {
        return saleItemData.per_qty_net_amount;
      }
      if (saleItemData.line_total && saleItemData.quantity) {
        return saleItemData.line_total / saleItemData.quantity;
      }
    }
    return fallbackPrice;
  };

  const addProduct = async (productId: string, variantId: string) => {
    const product = products.find(p => p.id === productId);
    const variant = variants.find(v => v.id === variantId);
    if (!product || !variant) return;

    // If bill is specified, warn if item not in that bill
    if (billSaleId && billItems.length > 0) {
      const inBill = billItems.find(bi => bi.variant_id === variantId);
      if (!inBill) {
        toast({ title: "Warning", description: "This item was not found in the specified bill", variant: "destructive" });
      }
    }

    // Check if already added
    const existingIndex = returnItems.findIndex(item => item.variantId === variantId);
    if (existingIndex !== -1) {
      const updated = [...returnItems];
      updated[existingIndex].quantity += 1;
      updated[existingIndex].lineTotal = updated[existingIndex].quantity * updated[existingIndex].unitPrice;
      setReturnItems(updated);
      setSearchOpen(false);
      setSearchTerm("");
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
      return;
    }

    const unitPrice = await fetchUnitPrice(variantId, variant.sale_price);

    setReturnItems(prev => [...prev, {
      productId: product.id,
      variantId: variant.id,
      productName: product.product_name,
      size: variant.size,
      barcode: variant.barcode,
      quantity: 1,
      unitPrice,
      lineTotal: unitPrice,
    }]);
    setSearchOpen(false);
    setSearchTerm("");
    setTimeout(() => barcodeInputRef.current?.focus(), 100);
  };

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    const query = barcodeInput.trim();

    // Try local barcode match
    let variant = variants.find(v => v.barcode === query);
    let product = variant ? products.find(p => p.id === variant!.product_id) : null;

    // Try product name match
    if (!variant) {
      const matchedProduct = products.find(p =>
        p.product_name.toLowerCase().includes(query.toLowerCase())
      );
      if (matchedProduct) {
        product = matchedProduct;
        variant = variants.find(v => v.product_id === matchedProduct.id);
      }
    }

    // DB lookup fallback
    if (!variant || !product) {
      try {
        const { data: dbVariant } = await supabase
          .from("product_variants")
          .select("id, product_id, size, sale_price, barcode, products(id, product_name, brand, hsn_code, gst_per, status, deleted_at)")
          .eq("barcode", query)
          .eq("active", true)
          .is("deleted_at", null)
          .maybeSingle();

        if (dbVariant && (dbVariant.products as any)?.status === 'active' && !(dbVariant.products as any)?.deleted_at) {
          const { count } = await supabase
            .from("sale_items")
            .select("id", { count: "exact", head: true })
            .eq("variant_id", dbVariant.id)
            .is("deleted_at", null);

          if (count && count > 0) {
            const p = dbVariant.products as any;
            product = { id: p.id, product_name: p.product_name, brand: p.brand, hsn_code: p.hsn_code };
            variant = { id: dbVariant.id, product_id: dbVariant.product_id, size: dbVariant.size, sale_price: dbVariant.sale_price || 0, barcode: dbVariant.barcode, gst_per: p.gst_per || 0 };

            // Add to local cache
            if (!products.find(pp => pp.id === p.id)) setProducts(prev => [...prev, product!]);
            if (!variants.find(vv => vv.id === dbVariant.id)) setVariants(prev => [...prev, variant!]);
          }
        }
      } catch (err) {
        console.error("DB barcode lookup error:", err);
      }
    }

    if (!variant || !product) {
      toast({ title: "Not Found", description: "No sold product found with this barcode", variant: "destructive" });
      setBarcodeInput("");
      return;
    }

    // Warn if bill specified but item not in that bill
    if (billSaleId && billItems.length > 0) {
      const inBill = billItems.find(bi => bi.variant_id === variant!.id);
      if (!inBill) {
        toast({ title: "Warning", description: "This item was not found in the specified bill" });
      }
    }

    // Check if already added
    const existingIndex = returnItems.findIndex(item => item.variantId === variant!.id);
    if (existingIndex !== -1) {
      const updated = [...returnItems];
      updated[existingIndex].quantity += 1;
      updated[existingIndex].lineTotal = updated[existingIndex].quantity * updated[existingIndex].unitPrice;
      setReturnItems(updated);
    } else {
      const unitPrice = await fetchUnitPrice(variant.id, variant.sale_price);
      setReturnItems(prev => [...prev, {
        productId: product!.id,
        variantId: variant!.id,
        productName: product!.product_name,
        size: variant!.size,
        barcode: variant!.barcode,
        quantity: 1,
        unitPrice,
        lineTotal: unitPrice,
      }]);
    }

    setBarcodeInput("");
    barcodeInputRef.current?.focus();
  };

  const updateQuantity = (index: number, qty: number) => {
    if (qty < 1) return;
    const updated = [...returnItems];
    updated[index].quantity = qty;
    updated[index].lineTotal = qty * updated[index].unitPrice;
    setReturnItems(updated);
  };

  const removeItem = (index: number) => {
    setReturnItems(prev => prev.filter((_, i) => i !== index));
  };

  const totalAmount = returnItems.reduce((sum, item) => sum + item.lineTotal, 0);

  const handleSaveReturn = async () => {
    if (returnItems.length === 0) {
      toast({ title: "Error", description: "Add at least one item to return", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { data: returnNumber, error: rnError } = await supabase
        .rpc('generate_sale_return_number', { p_organization_id: organizationId });
      if (rnError) throw rnError;

      const grossAmount = totalAmount;
      const gstAmount = returnItems.reduce((sum, item) => {
        const v = variants.find(vv => vv.id === item.variantId);
        const gstPer = v?.gst_per || 0;
        return sum + (item.lineTotal - (item.lineTotal / (1 + gstPer / 100)));
      }, 0);

      const { data: returnData, error: returnError } = await supabase
        .from("sale_returns")
        .insert({
          return_number: returnNumber,
          organization_id: organizationId,
          customer_id: customerId || null,
          customer_name: customerName || "Walk-in Customer",
          return_date: new Date().toISOString().split("T")[0],
          gross_amount: grossAmount,
          gst_amount: gstAmount,
          net_amount: grossAmount,
          refund_type: refundType === "cash_refund" ? "cash_refund" : "credit_note",
        } as any)
        .select()
        .single();

      if (returnError) throw returnError;

      const itemsToInsert = returnItems.map(item => {
        const v = variants.find(vv => vv.id === item.variantId);
        return {
          return_id: returnData.id,
          product_id: item.productId,
          variant_id: item.variantId,
          product_name: item.productName,
          size: item.size,
          barcode: item.barcode,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          gst_percent: v?.gst_per || 0,
          line_total: item.lineTotal,
        };
      });

      const { error: itemsError } = await supabase
        .from("sale_return_items")
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      const refundLabel = refundType === "cash_refund" ? "Cash Refund" : "Credit Note";
      toast({ title: "Return Saved", description: `Return ${returnNumber} — ₹${Math.round(grossAmount)} (${refundLabel})` });
      onReturnSaved(grossAmount, returnNumber);
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving return:", error);
      toast({ title: "Error", description: "Failed to save sale return", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter(product => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    const matchingVariants = variants.filter(v => v.product_id === product.id);
    const barcodeMatch = matchingVariants.some(v => v.barcode?.toLowerCase().includes(search));
    return (
      product.product_name.toLowerCase().includes(search) ||
      product.brand?.toLowerCase().includes(search) ||
      barcodeMatch
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcwIcon className="h-5 w-5" />
            Sale Return
            {customerName && <span className="text-sm font-normal text-muted-foreground">— {customerName}</span>}
          </DialogTitle>
        </DialogHeader>

        {/* Bill Number Lookup */}
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label className="text-xs mb-1">Original Sale Bill No (optional)</Label>
            <div className="relative">
              <FileText className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="e.g. POS/25-26/52"
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lookupBillNumber(); } }}
                className="pl-9"
              />
            </div>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={lookupBillNumber} disabled={billLookupLoading || !billNumber.trim()}>
            {billLookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lookup"}
          </Button>
          {billSaleId && (
            <span className="text-xs text-green-600 font-medium whitespace-nowrap pb-1">✓ {billItems.length} items</span>
          )}
        </div>

        {/* Barcode Scanner */}
        <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Scan className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={barcodeInputRef}
              type="text"
              placeholder="Scan barcode or enter product name..."
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          <Button type="submit" size="sm">Add</Button>
          <Popover open={searchOpen} onOpenChange={setSearchOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <Search className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <Command>
                <CommandInput placeholder="Search sold products..." value={searchTerm} onValueChange={setSearchTerm} />
                <CommandList>
                  <CommandEmpty>{loading ? "Loading..." : "No sold products found"}</CommandEmpty>
                  <CommandGroup>
                    {filteredProducts.slice(0, 50).map(product => {
                      const productVariants = variants.filter(v => v.product_id === product.id);
                      return productVariants.map(variant => (
                        <CommandItem
                          key={variant.id}
                          onSelect={() => addProduct(product.id, variant.id)}
                          className="flex justify-between"
                        >
                          <span className="truncate">{product.product_name} - {variant.size}</span>
                          <span className="text-xs text-muted-foreground ml-2">₹{variant.sale_price}</span>
                        </CommandItem>
                      ));
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </form>

        {/* Return Items Table */}
        {returnItems.length > 0 ? (
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="w-[80px] text-center">Size</TableHead>
                  <TableHead className="w-[120px] text-center">Qty</TableHead>
                  <TableHead className="w-[80px] text-right">Rate</TableHead>
                  <TableHead className="w-[80px] text-right">Total</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returnItems.map((item, index) => (
                  <TableRow key={item.variantId}>
                    <TableCell className="font-medium text-sm">{item.productName}</TableCell>
                    <TableCell className="text-center text-sm">{item.size}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => updateQuantity(index, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)}
                          className="w-14 h-7 text-center text-sm"
                          min={1}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => updateQuantity(index, item.quantity + 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm">₹{item.unitPrice.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-sm font-semibold">₹{item.lineTotal.toFixed(2)}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => removeItem(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground border rounded-md">
            <Scan className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Scan barcode to add return items</p>
          </div>
        )}

        {/* Refund Type Selection */}
        <div className="pt-2 border-t">
          <Label className="text-xs font-semibold mb-2 block">Refund Type</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRefundType("cash_refund")}
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-all",
                refundType === "cash_refund"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40"
              )}
            >
              <Banknote className="h-4 w-4" />
              Cash Refund
            </button>
            <button
              type="button"
              onClick={() => setRefundType("credit_note")}
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-all",
                refundType === "credit_note"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40"
              )}
            >
              <CreditCard className="h-4 w-4" />
              Credit Note
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="text-lg font-bold">
            Return Total: <span className="text-destructive">₹{Math.round(totalAmount).toLocaleString('en-IN')}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSaveReturn} disabled={saving || returnItems.length === 0}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {refundType === "cash_refund" ? "Save & Refund" : "Save Return"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Simple rotate icon since we use RotateCcw from lucide
const RotateCcwIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);
