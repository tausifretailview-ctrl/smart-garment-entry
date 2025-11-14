import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Scan, X, Plus, Trash2 } from "lucide-react";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useToast } from "@/hooks/use-toast";
import { useSaveSale } from "@/hooks/useSaveSale";

interface CartItem {
  id: string;
  barcode: string;
  productName: string;
  size: string;
  quantity: number;
  mrp: number;
  gstPer: number;
  discount: number;
  unitCost: number;
  netAmount: number;
  productId: string;
  variantId: string;
}

export default function POSSales() {
  const { toast } = useToast();
  const { saveSale, isSaving } = useSaveSale();
  const [customerName, setCustomerName] = useState("Walk in Customer");
  const [searchInput, setSearchInput] = useState("");
  const [items, setItems] = useState<CartItem[]>([]);
  const [flatDiscountPercent, setFlatDiscountPercent] = useState(0);
  const [roundOff, setRoundOff] = useState(0);

  // Fetch all products with variants
  const { data: productsData } = useQuery({
    queryKey: ['pos-products'],
    queryFn: async () => {
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('*, product_variants(*)');
      
      if (productsError) throw productsError;
      return products;
    },
  });

  // Handle barcode/product search on Enter
  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchInput.trim()) {
      searchAndAddProduct(searchInput.trim());
    }
  };

  const searchAndAddProduct = (searchTerm: string) => {
    if (!productsData) return;

    // Search by barcode or product name
    let foundVariant: any = null;
    let foundProduct: any = null;

    for (const product of productsData) {
      // Check variants for barcode match
      const variantMatch = product.product_variants?.find((v: any) => 
        v.barcode?.toLowerCase() === searchTerm.toLowerCase()
      );
      
      if (variantMatch) {
        foundVariant = variantMatch;
        foundProduct = product;
        break;
      }

      // Check product name match
      if (product.product_name.toLowerCase().includes(searchTerm.toLowerCase())) {
        // Get first available variant
        foundVariant = product.product_variants?.[0];
        foundProduct = product;
        break;
      }
    }

    if (foundVariant && foundProduct) {
      addItemToCart(foundProduct, foundVariant);
      setSearchInput("");
    } else {
      toast({
        title: "Product not found",
        description: "No product matches your search.",
        variant: "destructive",
      });
    }
  };

  const addItemToCart = (product: any, variant: any) => {
    const existingItemIndex = items.findIndex(item => item.barcode === variant.barcode);
    
    if (existingItemIndex >= 0) {
      // Increment quantity if already in cart
      const updatedItems = [...items];
      updatedItems[existingItemIndex].quantity += 1;
      updatedItems[existingItemIndex].netAmount = calculateNetAmount(updatedItems[existingItemIndex]);
      setItems(updatedItems);
    } else {
      // Add new item
      const newItem: CartItem = {
        id: variant.id,
        barcode: variant.barcode || '',
        productName: `${product.product_name} - ${variant.size}`,
        size: variant.size,
        quantity: 1,
        mrp: parseFloat(variant.sale_price || 0),
        gstPer: product.gst_per || 0,
        discount: 0,
        unitCost: parseFloat(variant.sale_price || 0),
        netAmount: parseFloat(variant.sale_price || 0),
        productId: product.id,
        variantId: variant.id,
      };
      setItems([...items, newItem]);
    }
  };

  const calculateNetAmount = (item: CartItem) => {
    const baseAmount = item.mrp * item.quantity;
    const discountAmount = (baseAmount * item.discount) / 100;
    return baseAmount - discountAmount;
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateQuantity = (index: number, newQty: number) => {
    if (newQty < 1) return;
    const updatedItems = [...items];
    updatedItems[index].quantity = newQty;
    updatedItems[index].netAmount = calculateNetAmount(updatedItems[index]);
    setItems(updatedItems);
  };

  // Calculate totals
  const totals = {
    quantity: items.reduce((sum, item) => sum + item.quantity, 0),
    mrp: items.reduce((sum, item) => sum + (item.mrp * item.quantity), 0),
    discount: items.reduce((sum, item) => sum + ((item.mrp * item.quantity * item.discount) / 100), 0),
    subtotal: items.reduce((sum, item) => sum + item.netAmount, 0),
  };

  const flatDiscountAmount = (totals.subtotal * flatDiscountPercent) / 100;
  const finalAmount = totals.subtotal - flatDiscountAmount + roundOff;

  // Handle payment
  const handlePayment = async (paymentMethod: 'cash' | 'card' | 'upi' | 'multiple' | 'pay_later') => {
    const saleData = {
      customerName,
      items,
      grossAmount: totals.mrp,
      discountAmount: totals.discount,
      flatDiscountPercent,
      flatDiscountAmount,
      roundOff,
      netAmount: finalAmount,
    };

    const result = await saveSale(saleData, paymentMethod);
    
    if (result) {
      // Clear cart on success
      setItems([]);
      setCustomerName("Walk in Customer");
      setFlatDiscountPercent(0);
      setRoundOff(0);
      setSearchInput("");
    }
  };

  return (
    <div className="min-h-screen bg-background p-2 md:p-4">
      <BackToDashboard />
      
      <div className="max-w-[1800px] mx-auto space-y-3">
        {/* Header Section - Larger inputs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Input
              placeholder="Scan Barcode/Enter Product Name"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearch}
              className="h-12 text-lg pr-12"
              autoFocus
            />
            <Scan className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground" />
          </div>
          
          <div className="relative">
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="h-12 text-lg pr-20"
            />
            {customerName !== "Walk in Customer" && (
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-10 top-1/2 -translate-y-1/2 h-9 w-9"
                onClick={() => setCustomerName("Walk in Customer")}
              >
                <X className="h-5 w-5" />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
          
          <Input placeholder="Scan Sales Invoice" className="h-12 text-lg" />
        </div>

        {/* Items Table */}
        <Card className="overflow-hidden">
          <div className="bg-black text-white overflow-x-auto">
            <div className="min-w-[900px] grid grid-cols-12 gap-2 p-4 text-base font-medium">
              <div className="col-span-1">Barcode</div>
              <div className="col-span-3">Product</div>
              <div className="col-span-1">Qty</div>
              <div className="col-span-1">MRP</div>
              <div className="col-span-1">Tax%</div>
              <div className="col-span-1">Disc%</div>
              <div className="col-span-2">Unit Price</div>
              <div className="col-span-2">Net Amount</div>
            </div>
          </div>
          
          <div className="min-h-[350px] max-h-[450px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="text-center text-muted-foreground py-24 text-lg">
                Scan or enter product to add items
              </div>
            ) : (
              <div className="overflow-x-auto">
                {items.map((item, index) => (
                  <div key={index} className="min-w-[900px] grid grid-cols-12 gap-2 p-4 border-b hover:bg-muted/50 text-base">
                    <div className="col-span-1 flex items-center">{item.barcode}</div>
                    <div className="col-span-3 flex items-center font-medium">{item.productName}</div>
                    <div className="col-span-1">
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)}
                        className="h-9 text-base"
                        min="1"
                      />
                    </div>
                    <div className="col-span-1 flex items-center">₹{item.mrp.toFixed(2)}</div>
                    <div className="col-span-1 flex items-center">{item.gstPer}%</div>
                    <div className="col-span-1 flex items-center">{item.discount}%</div>
                    <div className="col-span-2 flex items-center">₹{item.unitCost.toFixed(2)}</div>
                    <div className="col-span-2 flex items-center justify-between">
                      <span className="font-semibold">₹{item.netAmount.toFixed(2)}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeItem(index)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Totals Section - Larger text */}
        <div className="bg-cyan-500 text-white p-4 rounded-lg">
          <div className="grid grid-cols-2 md:grid-cols-7 gap-4">
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold">{totals.quantity}</div>
              <div className="text-sm md:text-base mt-1">Quantity</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold">₹{totals.mrp.toFixed(2)}</div>
              <div className="text-sm md:text-base mt-1">MRP</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold">₹0.00</div>
              <div className="text-sm md:text-base mt-1">Add. Charges</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold">₹{totals.discount.toFixed(2)}</div>
              <div className="text-sm md:text-base mt-1">Discount</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="bg-black text-white px-3 py-2 text-base rounded">%</span>
                <Input 
                  type="number"
                  className="w-20 h-10 bg-white text-black text-center text-lg font-semibold" 
                  value={flatDiscountPercent}
                  onChange={(e) => setFlatDiscountPercent(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="text-sm md:text-base mt-1">Flat Discount</div>
            </div>
            <div className="text-center">
              <Input 
                type="number"
                className="w-24 h-10 bg-white text-black text-center text-lg font-semibold mx-auto" 
                value={roundOff}
                onChange={(e) => setRoundOff(parseFloat(e.target.value) || 0)}
                step="0.01"
              />
              <div className="text-sm md:text-base mt-1">Round OFF</div>
            </div>
            <div className="text-center col-span-2 md:col-span-1">
              <div className="text-4xl md:text-5xl font-bold">₹{finalAmount.toFixed(2)}</div>
              <div className="text-sm md:text-base mt-1">Amount</div>
            </div>
          </div>
        </div>

        {/* Payment Buttons - Larger size */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Button 
            className="bg-black hover:bg-black/90 text-white h-16 text-base md:text-lg font-medium"
            disabled={items.length === 0 || isSaving}
            onClick={() => handlePayment('multiple')}
          >
            ⊞ Multiple Pay(F12)
          </Button>
          <Button 
            className="bg-black hover:bg-black/90 text-white h-16 text-base md:text-lg font-medium"
            disabled={items.length === 0 || isSaving}
          >
            ⊞ Redeem Credit
          </Button>
          <Button 
            className="bg-black hover:bg-black/90 text-white h-16 text-base md:text-lg font-medium"
            disabled={items.length === 0 || isSaving}
          >
            ⊟ Hold (F6)
          </Button>
          <Button 
            className="bg-primary hover:bg-primary/90 text-white h-16 text-base md:text-lg font-medium"
            disabled={items.length === 0 || isSaving}
            onClick={() => handlePayment('upi')}
          >
            ▶ UPI (F5)
          </Button>
          <Button 
            className="bg-primary hover:bg-primary/90 text-white h-16 text-base md:text-lg font-medium"
            disabled={items.length === 0 || isSaving}
            onClick={() => handlePayment('card')}
          >
            💳 Card (F3)
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Button 
            className="bg-green-600 hover:bg-green-700 text-white h-16 text-base md:text-lg font-medium"
            disabled={items.length === 0 || isSaving}
            onClick={() => handlePayment('cash')}
          >
            {isSaving ? "Processing..." : "₹ Cash (F4)"}
          </Button>
          <Button 
            className="bg-orange-600 hover:bg-orange-700 text-white h-16 text-base md:text-lg font-medium"
            disabled={items.length === 0 || isSaving}
            onClick={() => handlePayment('pay_later')}
          >
            📅 Pay Later (F11)
          </Button>
          <Button 
            className="bg-black hover:bg-black/90 text-white h-16 text-base md:text-lg font-medium"
            disabled={items.length === 0 || isSaving}
          >
            🖨️ Hold & Print(F7)
          </Button>
          <Button 
            className="bg-primary hover:bg-primary/90 text-white h-16 text-base md:text-lg font-medium"
            disabled={items.length === 0 || isSaving}
            onClick={() => handlePayment('upi')}
          >
            🖨️ UPI & Print (F10)
          </Button>
          <Button 
            className="bg-primary hover:bg-primary/90 text-white h-16 text-base md:text-lg font-medium"
            disabled={items.length === 0 || isSaving}
            onClick={() => handlePayment('card')}
          >
            💳 Card & Print (F9)
          </Button>
          <Button 
            className="bg-green-600 hover:bg-green-700 text-white h-16 text-base md:text-lg font-medium col-span-2 md:col-span-1"
            disabled={items.length === 0 || isSaving}
            onClick={() => handlePayment('cash')}
          >
            🖨️ Cash & Print (F8)
          </Button>
        </div>
      </div>
    </div>
  );
}
