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
  Package
} from "lucide-react";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { cn } from "@/lib/utils";

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
  const [products, setProducts] = useState<{ product: Product; variant: Variant }[]>([]);
  const [showProductSearch, setShowProductSearch] = useState(false);

  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [orderNumber, setOrderNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Calculate totals
  const grossAmount = orderItems.reduce((sum, item) => sum + item.line_total, 0);
  const gstAmount = orderItems.reduce((sum, item) => {
    const baseAmount = item.line_total / (1 + item.gst_percent / 100);
    return sum + (item.line_total - baseAmount);
  }, 0);
  const netAmount = grossAmount;

  useEffect(() => {
    if (currentOrganization?.id) {
      generateOrderNumber();
      const customerId = searchParams.get("customerId");
      if (customerId) {
        fetchCustomerById(customerId);
      }
    }
  }, [currentOrganization?.id, searchParams]);

  const generateOrderNumber = async () => {
    const now = new Date();
    const year = now.getMonth() >= 3 ? now.getFullYear() % 100 : (now.getFullYear() - 1) % 100;
    const nextYear = year + 1;

    const { count } = await supabase
      .from("sale_orders")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", currentOrganization!.id)
      .gte("order_date", `${now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1}-04-01`);

    const seq = (count || 0) + 1;
    setOrderNumber(`SO/${year}-${nextYear}/${seq}`);
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
    if (!term || term.length < 2) {
      setProducts([]);
      return;
    }

    const { data: variants } = await supabase
      .from("product_variants")
      .select(`
        id, size, color, barcode, mrp, sale_price, stock_qty, product_id,
        products!inner(id, product_name, brand, category, gst_per, organization_id)
      `)
      .eq("products.organization_id", currentOrganization!.id)
      .is("deleted_at", null)
      .or(`barcode.ilike.%${term}%,products.product_name.ilike.%${term}%`)
      .gt("stock_qty", 0)
      .limit(30);

    if (variants) {
      const results = variants.map((v: any) => ({
        product: v.products as Product,
        variant: {
          id: v.id,
          product_id: v.product_id,
          size: v.size,
          color: v.color,
          barcode: v.barcode,
          mrp: v.mrp,
          sale_price: v.sale_price,
          stock_qty: v.stock_qty,
        } as Variant,
      }));
      setProducts(results);
    }
  }, [currentOrganization?.id]);

  const addItem = (product: Product, variant: Variant) => {
    const existingIndex = orderItems.findIndex(item => item.variant.id === variant.id);
    
    if (existingIndex >= 0) {
      const updated = [...orderItems];
      if (updated[existingIndex].quantity < variant.stock_qty) {
        updated[existingIndex].quantity += 1;
        updated[existingIndex].line_total = updated[existingIndex].quantity * updated[existingIndex].unit_price;
        setOrderItems(updated);
      } else {
        toast.error("Insufficient stock");
      }
    } else {
      const newItem: OrderItem = {
        id: crypto.randomUUID(),
        product,
        variant,
        quantity: 1,
        unit_price: variant.sale_price || variant.mrp || 0,
        discount_percent: 0,
        gst_percent: product.gst_per || 0,
        line_total: variant.sale_price || variant.mrp || 0,
      };
      setOrderItems([...orderItems, newItem]);
    }
    
    setProductSearch("");
    setProducts([]);
    setShowProductSearch(false);
  };

  const updateQuantity = (itemId: string, delta: number) => {
    const updated = orderItems.map(item => {
      if (item.id === itemId) {
        const newQty = Math.max(1, Math.min(item.variant.stock_qty, item.quantity + delta));
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

    setSaving(true);
    try {
      // Create sale order
      const { data: order, error: orderError } = await supabase
        .from("sale_orders")
        .insert({
          organization_id: currentOrganization!.id,
          order_number: orderNumber,
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
        variant_id: item.variant.id,
        product_name: item.product.product_name,
        size: item.variant.size,
        color: item.variant.color,
        barcode: item.variant.barcode,
        order_qty: item.quantity,
        pending_qty: item.quantity,
        fulfilled_qty: 0,
        unit_price: item.unit_price,
        mrp: item.variant.mrp,
        discount_percent: item.discount_percent,
        gst_percent: item.gst_percent,
        line_total: item.line_total,
      }));

      const { error: itemsError } = await supabase
        .from("sale_order_items")
        .insert(items);

      if (itemsError) throw itemsError;

      toast.success("Order saved successfully!");

      if (shareAfter && selectedCustomer.phone) {
        const itemsList = orderItems.map(i => 
          `• ${i.product.product_name} (${i.variant.size}) x ${i.quantity} = ₹${i.line_total.toLocaleString("en-IN")}`
        ).join("\n");

        const message = `🛒 *Sales Order Confirmation*\n\n` +
          `Order No: ${orderNumber}\n` +
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
          <Card className="mt-2 max-h-64 overflow-auto">
            {products.map(({ product, variant }) => (
              <div
                key={variant.id}
                className="p-3 border-b last:border-0 cursor-pointer hover:bg-muted/50"
                onClick={() => addItem(product, variant)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-sm">{product.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {variant.size} {variant.color && `| ${variant.color}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">₹{variant.sale_price || variant.mrp}</p>
                    <p className="text-xs text-muted-foreground">Stock: {variant.stock_qty}</p>
                  </div>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* Order Items */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {orderItems.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No items added yet</p>
            <p className="text-sm">Search products above to add</p>
          </div>
        ) : (
          orderItems.map((item, index) => (
            <Card key={item.id} className="border-0 shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.product.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.variant.size} {item.variant.color && `| ${item.variant.color}`} | ₹{item.unit_price}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeItem(item.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() => updateQuantity(item.id, -1)}
                      disabled={item.quantity <= 1}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-12 text-center font-semibold text-lg">{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() => updateQuantity(item.id, 1)}
                      disabled={item.quantity >= item.variant.stock_qty}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="font-semibold">₹{item.line_total.toLocaleString("en-IN")}</p>
                </div>
              </CardContent>
            </Card>
          ))
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
    </div>
  );
};

export default SalesmanOrderEntry;
