import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Search, Plus } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Customer {
  id: string;
  customer_name: string;
  phone: string | null;
}

interface Product {
  id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
}

interface Variant {
  id: string;
  size: string;
  sale_price: number;
  stock_qty: number;
  barcode: string | null;
  gst_per: number;
}

interface ReturnItem {
  productId: string;
  variantId: string;
  productName: string;
  size: string;
  barcode: string | null;
  quantity: number;
  unitPrice: number;
  gstPercent: number;
  lineTotal: number;
}

export default function SaleReturnEntry() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [originalSaleNumber, setOriginalSaleNumber] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (currentOrganization) {
      fetchCustomers();
      fetchProducts();
    }
  }, [currentOrganization]);

  const fetchCustomers = async () => {
    const { data, error } = await supabase
      .from("customers")
      .select("id, customer_name, phone")
      .eq("organization_id", currentOrganization?.id)
      .order("customer_name");

    if (error) {
      toast({ title: "Error", description: "Failed to load customers", variant: "destructive" });
      return;
    }
    setCustomers(data || []);
  };

  const fetchProducts = async () => {
    const { data: productsData, error: productsError } = await supabase
      .from("products")
      .select("id, product_name, brand, category")
      .eq("organization_id", currentOrganization?.id)
      .eq("status", "active");

    if (productsError) {
      toast({ title: "Error", description: "Failed to load products", variant: "destructive" });
      return;
    }

    const { data: variantsData, error: variantsError } = await supabase
      .from("product_variants")
      .select("id, product_id, size, sale_price, stock_qty, barcode, products(gst_per)")
      .in("product_id", productsData?.map((p) => p.id) || [])
      .eq("active", true);

    if (variantsError) {
      toast({ title: "Error", description: "Failed to load product variants", variant: "destructive" });
      return;
    }

    setProducts(productsData || []);
    setVariants(
      variantsData?.map((v) => ({
        id: v.id,
        size: v.size,
        sale_price: v.sale_price || 0,
        stock_qty: v.stock_qty,
        barcode: v.barcode,
        gst_per: (v.products as any)?.gst_per || 0,
      })) || []
    );
  };

  const filteredProducts = products.filter((product) => {
    const search = searchTerm.toLowerCase();
    return (
      product.product_name.toLowerCase().includes(search) ||
      product.brand?.toLowerCase().includes(search) ||
      product.category?.toLowerCase().includes(search)
    );
  });

  const addProduct = (productId: string, variantId: string) => {
    const product = products.find((p) => p.id === productId);
    const variant = variants.find((v) => v.id === variantId);

    if (!product || !variant) return;

    const lineTotal = variant.sale_price;

    const newItem: ReturnItem = {
      productId: product.id,
      variantId: variant.id,
      productName: product.product_name,
      size: variant.size,
      barcode: variant.barcode,
      quantity: 1,
      unitPrice: variant.sale_price,
      gstPercent: variant.gst_per,
      lineTotal,
    };

    setReturnItems([...returnItems, newItem]);
    setSearchOpen(false);
    setSearchTerm("");
  };

  const updateQuantity = (index: number, quantity: number) => {
    if (quantity < 1) return;
    const updated = [...returnItems];
    updated[index].quantity = quantity;
    updated[index].lineTotal = quantity * updated[index].unitPrice;
    setReturnItems(updated);
  };

  const removeItem = (index: number) => {
    setReturnItems(returnItems.filter((_, i) => i !== index));
  };

  const calculateTotals = () => {
    const grossAmount = returnItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const gstAmount = returnItems.reduce((sum, item) => {
      const baseAmount = item.lineTotal;
      return sum + (baseAmount * item.gstPercent) / 100;
    }, 0);
    const netAmount = grossAmount + gstAmount;
    return { grossAmount, gstAmount, netAmount };
  };

  const handleSave = async () => {
    if (!selectedCustomer) {
      toast({ title: "Error", description: "Please select a customer", variant: "destructive" });
      return;
    }

    if (returnItems.length === 0) {
      toast({ title: "Error", description: "Please add at least one item", variant: "destructive" });
      return;
    }

    setSaving(true);

    try {
      const customer = customers.find((c) => c.id === selectedCustomer);
      const totals = calculateTotals();

      // Insert sale return
      const { data: returnData, error: returnError } = await supabase
        .from("sale_returns")
        .insert({
          organization_id: currentOrganization?.id,
          customer_id: selectedCustomer,
          customer_name: customer?.customer_name || "",
          original_sale_number: originalSaleNumber || null,
          return_date: returnDate,
          gross_amount: totals.grossAmount,
          gst_amount: totals.gstAmount,
          net_amount: totals.netAmount,
          notes,
        })
        .select()
        .single();

      if (returnError) throw returnError;

      // Insert return items
      const itemsToInsert = returnItems.map((item) => ({
        return_id: returnData.id,
        product_id: item.productId,
        variant_id: item.variantId,
        product_name: item.productName,
        size: item.size,
        barcode: item.barcode,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        gst_percent: item.gstPercent,
        line_total: item.lineTotal,
      }));

      const { error: itemsError } = await supabase
        .from("sale_return_items")
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      toast({ title: "Success", description: "Sale return saved successfully" });
      navigate("/sale-returns");
    } catch (error) {
      console.error("Error saving sale return:", error);
      toast({ title: "Error", description: "Failed to save sale return", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const totals = calculateTotals();

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Sale Return Entry</h1>
          <Button variant="outline" onClick={() => navigate("/sale-returns")}>
            Back to Dashboard
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Return Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Customer *</Label>
                <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.customer_name} {customer.phone && `- ${customer.phone}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Return Date</Label>
                <Input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Original Sale Number</Label>
                <Input
                  placeholder="Optional"
                  value={originalSaleNumber}
                  onChange={(e) => setOriginalSaleNumber(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Return Items</span>
              <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                <PopoverTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Product
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="end">
                  <Command>
                    <CommandInput
                      placeholder="Search products..."
                      value={searchTerm}
                      onValueChange={setSearchTerm}
                    />
                    <CommandList>
                      <CommandEmpty>No products found</CommandEmpty>
                      <CommandGroup>
                        {filteredProducts.map((product) => {
                          const productVariants = variants.filter((v) => v.id === product.id);
                          return productVariants.map((variant) => (
                            <CommandItem
                              key={variant.id}
                              onSelect={() => addProduct(product.id, variant.id)}
                            >
                              <div className="flex-1">
                                <div className="font-medium">{product.product_name}</div>
                                <div className="text-sm text-muted-foreground">
                                  Size: {variant.size} | Price: ₹{variant.sale_price}
                                  {variant.barcode && ` | ${variant.barcode}`}
                                </div>
                              </div>
                            </CommandItem>
                          ));
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead className="w-24">Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">GST%</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returnItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No items added
                    </TableCell>
                  </TableRow>
                ) : (
                  returnItems.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{item.productName}</TableCell>
                      <TableCell>{item.size}</TableCell>
                      <TableCell>{item.barcode || "-"}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell className="text-right">₹{item.unitPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{item.gstPercent}%</TableCell>
                      <TableCell className="text-right">₹{item.lineTotal.toFixed(2)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <div className="mt-6 flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gross Amount:</span>
                  <span className="font-medium">₹{totals.grossAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total GST:</span>
                  <span className="font-medium">₹{totals.gstAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Net Amount:</span>
                  <span>₹{totals.netAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Additional Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Reason for return, notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button variant="outline" onClick={() => navigate("/sale-returns")}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Return"}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
