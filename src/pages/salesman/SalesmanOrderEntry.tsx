import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  User, 
  ShoppingCart,
  Save,
  Share2,
  ArrowLeft,
  Package,
  Grid3X3
} from "lucide-react";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { cn, sortSearchResults } from "@/lib/utils";
import { SalesmanSizeGridDialog } from "@/components/SalesmanSizeGridDialog";
import { useDraftSave } from "@/hooks/useDraftSave";
import { DraftResumeDialog } from "@/components/DraftResumeDialog";

interface Customer {
  id: string;
  customer_name: string;
  phone: string | null;
  address: string | null;
  balance: number;
}

interface Product {
  id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  gst_per: number;
  size_group_id?: string | null;
}

interface Variant {
  id: string;
  product_id: string;
  size: string;
  color: string | null;
  barcode: string | null;
  mrp: number;
  sale_price: number;
  stock_qty: number;
  isCustomSize?: boolean;
}

interface OrderItem {
  id: string;
  product: Product;
  variant: Variant;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  gst_percent: number;
  line_total: number;
  isCustomSize?: boolean;
}

const SalesmanOrderEntry = () => {
  const [searchParams] = useSearchParams();
  const { navigate } = useOrgNavigation();
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const { sendWhatsApp } = useWhatsAppSend();

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);

  const [productSearch, setProductSearch] = useState("");
  const [products, setProducts] = useState<{ product: Product; variants: Variant[] }[]>([]);
  const [showProductSearch, setShowProductSearch] = useState(false);

  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [orderNumber, setOrderNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDraftDialog, setShowDraftDialog] = useState(false);

  // Size Grid state
  const [showSizeGrid, setShowSizeGrid] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedProductVariants, setSelectedProductVariants] = useState<Variant[]>([]);

  // Draft save hook for mobile resilience
  const {
    hasDraft,
    draftData,
    saveDraft,
    deleteDraft,
    updateCurrentData,
    startAutoSave,
    stopAutoSave,
  } = useDraftSave('salesman_sale_order');

  // Calculate totals
  const grossAmount = orderItems.reduce((sum, item) => sum + item.line_total, 0);
  const gstAmount = orderItems.reduce((sum, item) => {
    const baseAmount = item.line_total / (1 + item.gst_percent / 100);
    return sum + (item.line_total - baseAmount);
  }, 0);
  const netAmount = grossAmount;

  // Check for existing draft on mount
  useEffect(() => {
    if (hasDraft && draftData) {
      setShowDraftDialog(true);
    }
  }, [hasDraft, draftData]);

  // Start auto-save on mount
  useEffect(() => {
    startAutoSave();
    return () => stopAutoSave();
  }, [startAutoSave, stopAutoSave]);

  // Save draft when app goes to background (mobile-specific)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && (orderItems.length > 0 || selectedCustomer)) {
        saveDraft({
          selectedCustomer,
          orderItems,
          notes,
          orderNumber,
        }, false);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [orderItems, selectedCustomer, notes, orderNumber, saveDraft]);

  // Update draft data whenever order changes
  useEffect(() => {
    if (orderItems.length > 0 || selectedCustomer) {
      updateCurrentData({
        selectedCustomer,
        orderItems,
        notes,
        orderNumber,
      });
    }
  }, [selectedCustomer, orderItems, notes, orderNumber, updateCurrentData]);

  useEffect(() => {
    if (currentOrganization?.id) {
      generateOrderNumber();
      const customerId = searchParams.get("customerId");
      if (customerId) {
        fetchCustomerById(customerId);
      }
    }
  }, [currentOrganization?.id, searchParams]);

  // Load draft data
  const loadDraftData = useCallback(() => {
    if (!draftData) return;
    setSelectedCustomer(draftData.selectedCustomer || null);
    setOrderItems(draftData.orderItems || []);
    setNotes(draftData.notes || "");
    if (draftData.orderNumber) setOrderNumber(draftData.orderNumber);
    toast.success("Previous order restored");
    setShowDraftDialog(false);
  }, [draftData]);

  // Start fresh - delete draft
  const handleStartFresh = useCallback(async () => {
    await deleteDraft();
    setShowDraftDialog(false);
  }, [deleteDraft]);

  const generateOrderNumber = async (): Promise<string> => {
    const now = new Date();
    const year = now.getMonth() >= 3 ? now.getFullYear() % 100 : (now.getFullYear() - 1) % 100;
    const nextYear = year + 1;
    const prefix = `SO/${year}-${nextYear}/`;

    // Find max sequence number by querying existing order numbers (include deleted for reuse)
    const { data: orders } = await supabase
      .from("sale_orders")
      .select("order_number")
      .eq("organization_id", currentOrganization!.id)
      .ilike("order_number", `${prefix}%`);

    let maxSeq = 0;
    if (orders) {
      orders.forEach(order => {
        const match = order.order_number?.match(/\/(\d+)$/);
        if (match) {
          const seq = parseInt(match[1], 10);
          if (seq > maxSeq) maxSeq = seq;
        }
      });
    }

    const newOrderNumber = `${prefix}${maxSeq + 1}`;
    setOrderNumber(newOrderNumber);
    return newOrderNumber;
  };

  const fetchCustomerById = async (customerId: string) => {
    const { data } = await supabase
      .from("customers")
      .select("id, customer_name, phone, address, opening_balance")
      .eq("id", customerId)
      .single();

    if (data) {
      // Fetch balance
      const { data: sales } = await supabase
        .from("sales")
        .select("net_amount, paid_amount")
        .eq("customer_id", customerId)
        .eq("organization_id", currentOrganization!.id)
        .is("deleted_at", null);

      const totalSales = sales?.reduce((s, sale) => s + (sale.net_amount || 0), 0) || 0;
      const totalPaid = sales?.reduce((s, sale) => s + (sale.paid_amount || 0), 0) || 0;
      const balance = (data.opening_balance || 0) + totalSales - totalPaid;

      setSelectedCustomer({ ...data, balance });
    }
  };

  const searchCustomers = useCallback(async (term: string) => {
    if (!term || term.length < 2) {
      setCustomers([]);
      return;
    }

    const { data } = await supabase
      .from("customers")
      .select("id, customer_name, phone, address, opening_balance")
      .eq("organization_id", currentOrganization!.id)
      .is("deleted_at", null)
      .or(`customer_name.ilike.%${term}%,phone.ilike.%${term}%`)
      .limit(20);

    if (data) {
      // Simple balance fetch
      const customersWithBalance = await Promise.all(
        data.map(async (c) => {
          const { data: sales } = await supabase
            .from("sales")
            .select("net_amount, paid_amount")
            .eq("customer_id", c.id)
            .is("deleted_at", null);

          const totalSales = sales?.reduce((s, sale) => s + (sale.net_amount || 0), 0) || 0;
          const totalPaid = sales?.reduce((s, sale) => s + (sale.paid_amount || 0), 0) || 0;
          return { ...c, balance: (c.opening_balance || 0) + totalSales - totalPaid };
        })
      );
      setCustomers(customersWithBalance);
    }
  }, [currentOrganization?.id]);

  const searchProducts = useCallback(async (term: string) => {
    if (!term || term.length < 1) {
      setProducts([]);
      return;
    }

    if (!currentOrganization?.id) return;

    try {
      // First, search products by name/style in the organization
      const { data: matchingProducts, error: productsError } = await supabase
        .from("products")
        .select("id, product_name, brand, category, gst_per, style, size_group_id")
        .eq("organization_id", currentOrganization.id)
        .eq("status", "active")
        .is("deleted_at", null)
        .or(`product_name.ilike.%${term}%,style.ilike.%${term}%`)
        .limit(20);

      if (productsError) {
        console.error("Product search error:", productsError);
        return;
      }

      const productIds = matchingProducts?.map(p => p.id) || [];

      // Also search by barcode
      const { data: barcodeVariants, error: barcodeError } = await supabase
        .from("product_variants")
        .select(`
          id, size, color, barcode, mrp, sale_price, stock_qty, product_id,
          products!inner(id, product_name, brand, category, gst_per, organization_id, size_group_id)
        `)
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .ilike("barcode", `%${term}%`)
        .gt("stock_qty", 0)
        .limit(20);

      // Fetch variants for matching products
      let productVariants: any[] = [];
      if (productIds.length > 0) {
        const { data: variants, error: variantsError } = await supabase
          .from("product_variants")
          .select(`
            id, size, color, barcode, mrp, sale_price, stock_qty, product_id,
            products!inner(id, product_name, brand, category, gst_per, organization_id, size_group_id)
          `)
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .in("product_id", productIds)
          .gt("stock_qty", 0)
          .limit(30);

        if (!variantsError && variants) {
          productVariants = variants;
        }
      }

      // Combine and dedupe results
      const allVariants = [...(barcodeVariants || []), ...productVariants];
      const uniqueVariants = allVariants.filter((v, i, arr) => 
        arr.findIndex(x => x.id === v.id) === i
      );

      // Group variants by product
      const productMap = new Map<string, { product: Product; variants: Variant[] }>();
      uniqueVariants.forEach((v: any) => {
        const productId = v.products.id;
        if (!productMap.has(productId)) {
          productMap.set(productId, {
            product: v.products as Product,
            variants: [],
          });
        }
        productMap.get(productId)!.variants.push({
          id: v.id,
          product_id: v.product_id,
          size: v.size,
          color: v.color,
          barcode: v.barcode,
          mrp: v.mrp,
          sale_price: v.sale_price,
          stock_qty: v.stock_qty,
        } as Variant);
      });

      // Apply smart sorting based on product name
      const sortedProducts = sortSearchResults(
        Array.from(productMap.values()),
        term,
        { productName: 'product.product_name' }
      );

      setProducts(sortedProducts);
    } catch (error) {
      console.error("Product search error:", error);
      setProducts([]);
    }
  }, [currentOrganization?.id]);

  const addItem = (product: Product, variant: Variant, qty: number = 1) => {
    setOrderItems((prevItems) => {
      const existingIndex = prevItems.findIndex(item => item.variant.id === variant.id);

      if (existingIndex >= 0) {
        const updated = [...prevItems];
        const currentItem = updated[existingIndex];
        const newQty = currentItem.quantity + qty;

        // Skip stock validation for custom sizes
        if (!variant.isCustomSize && newQty > variant.stock_qty) {
          toast.error(`Insufficient stock for ${variant.size}`);
          return prevItems;
        }

        updated[existingIndex] = {
          ...currentItem,
          quantity: newQty,
          line_total: newQty * currentItem.unit_price,
        };

        return updated;
      }

      const unitPrice = variant.sale_price || variant.mrp || 0;
      const newItem: OrderItem = {
        id: crypto.randomUUID(),
        product,
        variant,
        quantity: qty,
        unit_price: unitPrice,
        discount_percent: 0,
        gst_percent: product.gst_per || 0,
        line_total: unitPrice * qty,
        isCustomSize: variant.isCustomSize || false,
      };

      return [...prevItems, newItem];
    });
  };

  const openSizeGrid = (product: Product, variants: Variant[]) => {
    setSelectedProduct(product);
    setSelectedProductVariants(variants);
    setShowSizeGrid(true);
    setProductSearch("");
    setProducts([]);
    setShowProductSearch(false);
  };

  const handleSizeGridConfirm = (items: Array<{ variant: Variant; qty: number }>) => {
    if (!selectedProduct) return;
    
    items.forEach(({ variant, qty }) => {
      // For custom sizes, variant already has isCustomSize flag
      const fullVariant: Variant = {
        ...variant,
        product_id: selectedProduct.id,
        mrp: variant.mrp || variant.sale_price || 0,
        sale_price: variant.sale_price || 0,
        stock_qty: variant.stock_qty || 0,
        isCustomSize: variant.isCustomSize || false,
      };
      addItem(selectedProduct, fullVariant, qty);
    });
    
    setShowSizeGrid(false);
    setSelectedProduct(null);
    setSelectedProductVariants([]);
  };

  const updateQuantity = (itemId: string, delta: number) => {
    const updated = orderItems.map(item => {
      if (item.id === itemId) {
        // For custom sizes, no stock limit
        const maxQty = item.isCustomSize ? Infinity : item.variant.stock_qty;
        const newQty = Math.max(1, Math.min(maxQty, item.quantity + delta));
        return { ...item, quantity: newQty, line_total: newQty * item.unit_price };
      }
      return item;
    });
    setOrderItems(updated);
  };

  const removeItem = (itemId: string) => {
    setOrderItems(orderItems.filter(item => item.id !== itemId));
  };

  const saveOrder = async (shareAfter: boolean = false) => {
    if (!selectedCustomer) {
      toast.error("Please select a customer");
      return;
    }
    if (orderItems.length === 0) {
      toast.error("Please add at least one item");
      return;
    }

    // Validate no items have zero quantity
    const zeroQtyItems = orderItems.filter(item => item.quantity <= 0);
    if (zeroQtyItems.length > 0) {
      const itemNames = zeroQtyItems.map(item => 
        `${item.product.product_name} (${item.variant.size})`
      ).join(", ");
      toast.error(`Invalid quantity for: ${itemNames}`);
      return;
    }

    // Validate total quantity is greater than zero
    const totalQuantity = orderItems.reduce((sum, item) => sum + item.quantity, 0);
    if (totalQuantity <= 0) {
      toast.error("Order must have at least one item with quantity greater than 0");
      return;
    }

    setSaving(true);
    try {
      // CRITICAL: Regenerate order number atomically before saving to prevent duplicates
      const freshOrderNumber = await generateOrderNumber();
      
      // Create sale order
      const { data: order, error: orderError } = await supabase
        .from("sale_orders")
        .insert({
          organization_id: currentOrganization!.id,
          order_number: freshOrderNumber,
          order_date: new Date().toISOString(),
          customer_id: selectedCustomer.id,
          customer_name: selectedCustomer.customer_name,
          customer_phone: selectedCustomer.phone,
          customer_address: selectedCustomer.address,
          gross_amount: grossAmount,
          discount_amount: 0,
          gst_amount: gstAmount,
          net_amount: netAmount,
          status: "pending",
          notes,
          created_by: user!.id,
          salesman: user!.email,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const items = orderItems.map(item => ({
        order_id: order.id,
        product_id: item.product.id,
        variant_id: item.isCustomSize ? null : item.variant.id,
        product_name: item.product.product_name,
        size: item.variant.size,
        color: item.variant.color,
        barcode: item.isCustomSize ? null : item.variant.barcode,
        order_qty: item.quantity,
        pending_qty: item.quantity,
        fulfilled_qty: 0,
        unit_price: item.unit_price,
        mrp: item.variant.mrp || item.unit_price,
        discount_percent: item.discount_percent,
        gst_percent: item.gst_percent,
        line_total: item.line_total,
        hsn_code: null,
      }));

      const { error: itemsError } = await supabase
        .from("sale_order_items")
        .insert(items);

      if (itemsError) throw itemsError;

      // Clear draft after successful save
      await deleteDraft();

      toast.success("Order saved successfully!");

      if (shareAfter && selectedCustomer.phone) {
        const itemsList = orderItems.map(i => 
          `• ${i.product.product_name} (${i.variant.size}) x ${i.quantity} = ₹${i.line_total.toLocaleString("en-IN")}`
        ).join("\n");

        const message = `🛒 *Sales Order Confirmation*\n\n` +
          `Order No: ${freshOrderNumber}\n` +
          `Customer: ${selectedCustomer.customer_name}\n\n` +
          `*Items:*\n${itemsList}\n\n` +
          `*Total: ₹${netAmount.toLocaleString("en-IN")}*\n\n` +
          `Thank you for your order!`;

        await sendWhatsApp(selectedCustomer.phone, message);
      }

      navigate("/salesman/orders");
    } catch (error: any) {
      console.error("Error saving order:", error);
      toast.error(error.message || "Failed to save order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="p-4 bg-background border-b">
        <div className="flex items-center gap-3 mb-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/salesman")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-semibold">New Sales Order</h1>
            <p className="text-sm text-muted-foreground">{orderNumber}</p>
          </div>
        </div>

        {/* Customer Selection */}
        <Card className="border shadow-sm" onClick={() => setShowCustomerSearch(true)}>
          <CardContent className="p-3">
            {selectedCustomer ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{selectedCustomer.customer_name}</p>
                  <p className="text-sm text-muted-foreground">{selectedCustomer.phone}</p>
                </div>
                <Badge className={cn(
                  selectedCustomer.balance > 0 ? "bg-red-500/10 text-red-600" : "bg-green-500/10 text-green-600"
                )}>
                  O/S: ₹{selectedCustomer.balance.toLocaleString("en-IN")}
                </Badge>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-5 w-5" />
                <span>Select Customer</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Product Search */}
      <div className="p-4 bg-muted/50">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search product or scan barcode..."
            value={productSearch}
            onChange={(e) => {
              setProductSearch(e.target.value);
              searchProducts(e.target.value);
              setShowProductSearch(true);
            }}
            onFocus={() => setShowProductSearch(true)}
            className="pl-10 h-12"
          />
        </div>

        {/* Product Search Results */}
        {showProductSearch && products.length > 0 && (
          <Card className="mt-2 max-h-72 overflow-auto bg-background shadow-lg border z-50">
            {products.map(({ product, variants }) => (
              <div
                key={product.id}
                className="border-b last:border-0 cursor-pointer hover:bg-primary/5"
                onClick={() => openSizeGrid(product, variants)}
              >
                <div className="p-3 flex justify-between items-center">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{product.product_name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {product.brand && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0">{product.brand}</Badge>
                      )}
                      {product.category && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0">{product.category}</Badge>
                      )}
                      <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-blue-100 text-blue-700">
                        {variants.length} sizes
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      {variants[0]?.mrp && variants[0]?.mrp !== variants[0]?.sale_price && (
                        <p className="text-xs text-muted-foreground line-through">
                          MRP: ₹{variants[0].mrp}
                        </p>
                      )}
                      <p className="font-semibold text-primary">
                        ₹{variants[0]?.sale_price || variants[0]?.mrp || 0}
                      </p>
                    </div>
                    <Badge 
                      className={cn(
                        "min-w-[60px] justify-center",
                        variants.reduce((s, v) => s + v.stock_qty, 0) > 0 
                          ? "bg-cyan-500 hover:bg-cyan-600" 
                          : "bg-red-500 hover:bg-red-600"
                      )}
                    >
                      Stock: {variants.reduce((s, v) => s + v.stock_qty, 0)}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* Order Items - Compact Layout */}
      <div className="flex-1 overflow-auto px-3 py-2">
        {orderItems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No items added yet</p>
            <p className="text-xs">Search products above</p>
          </div>
        ) : (
          <div className="divide-y">
            {orderItems.map((item) => (
              <div key={item.id} className="py-2 flex items-center gap-2">
                {/* Product Info - Compact */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="font-medium text-sm truncate leading-tight">{item.product.product_name}</p>
                    {item.isCustomSize && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-amber-200 text-amber-800 shrink-0">New</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 text-xs text-muted-foreground leading-tight">
                    <span className="bg-primary/10 text-primary px-1 rounded font-medium">{item.variant.size}</span>
                    {item.variant.color && (
                      <span className="bg-muted px-1 rounded">{item.variant.color}</span>
                    )}
                    {item.variant.mrp && item.variant.mrp !== item.unit_price && (
                      <span className="line-through">MRP: ₹{item.variant.mrp}</span>
                    )}
                    <span>₹{item.unit_price}</span>
                  </div>
                </div>
                
                {/* Quantity Controls - Compact */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => updateQuantity(item.id, -1)}
                    disabled={item.quantity <= 1}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-8 text-center font-semibold text-sm">{item.quantity}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => updateQuantity(item.id, 1)}
                    disabled={!item.isCustomSize && item.quantity >= item.variant.stock_qty}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                
                {/* Total & Delete */}
                <p className="font-semibold text-sm w-16 text-right">₹{item.line_total.toLocaleString("en-IN")}</p>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeItem(item.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer with Totals and Actions */}
      {orderItems.length > 0 && (
        <div className="p-4 bg-background border-t space-y-4 safe-area-pb">
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal ({orderItems.length} items)</span>
              <span>₹{grossAmount.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">GST</span>
              <span>₹{gstAmount.toLocaleString("en-IN")}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span>
              <span>₹{netAmount.toLocaleString("en-IN")}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 h-14"
              onClick={() => saveOrder(false)}
              disabled={saving}
            >
              <Save className="h-5 w-5 mr-2" />
              Save
            </Button>
            <Button
              className="flex-1 h-14"
              onClick={() => saveOrder(true)}
              disabled={saving}
            >
              <Share2 className="h-5 w-5 mr-2" />
              Save & Share
            </Button>
          </div>
        </div>
      )}

      {/* Customer Search Dialog */}
      <Dialog open={showCustomerSearch} onOpenChange={setShowCustomerSearch}>
        <DialogContent className="max-w-md max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Select Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or phone..."
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  searchCustomers(e.target.value);
                }}
                className="pl-10"
                autoFocus
              />
            </div>
            <div className="max-h-[50vh] overflow-auto space-y-2">
              {customers.map((customer) => (
                <Card
                  key={customer.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => {
                    setSelectedCustomer(customer);
                    setShowCustomerSearch(false);
                    setCustomerSearch("");
                    setCustomers([]);
                  }}
                >
                  <CardContent className="p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{customer.customer_name}</p>
                        <p className="text-sm text-muted-foreground">{customer.phone}</p>
                      </div>
                      <Badge className={cn(
                        customer.balance > 0 ? "bg-red-500/10 text-red-600" : "bg-green-500/10 text-green-600"
                      )}>
                        ₹{customer.balance.toLocaleString("en-IN")}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Size Grid Dialog */}
      <SalesmanSizeGridDialog
        open={showSizeGrid}
        onClose={() => {
          setShowSizeGrid(false);
          setSelectedProduct(null);
          setSelectedProductVariants([]);
        }}
        product={selectedProduct}
        variants={selectedProductVariants}
        onConfirm={handleSizeGridConfirm}
        showStock={true}
        validateStock={false}
        title="Enter Size-wise Quantity"
      />

      {/* Draft Resume Dialog */}
      <DraftResumeDialog
        open={showDraftDialog}
        onOpenChange={setShowDraftDialog}
        onResume={loadDraftData}
        onStartFresh={handleStartFresh}
        draftType="salesman_sale_order"
        lastSaved={draftData?.updated_at}
      />
    </div>
  );
};

export default SalesmanOrderEntry;
