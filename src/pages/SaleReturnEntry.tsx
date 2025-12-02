import { useState, useEffect, useRef } from "react";
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
import { Badge } from "@/components/ui/badge";
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
  product_id: string;
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
  const [nextReturnNumber, setNextReturnNumber] = useState<string>("");
  const [taxType, setTaxType] = useState<"exclusive" | "inclusive">("exclusive");
  
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState<string>("");
  
  const [saving, setSaving] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentOrganization) {
      fetchCustomers();
      fetchNextReturnNumber();
    }
  }, [currentOrganization]);

  useEffect(() => {
    if (currentOrganization) {
      fetchProducts();
    }
  }, [currentOrganization, originalSaleNumber, selectedCustomer]);

  const fetchNextReturnNumber = async () => {
    const { data, error } = await supabase.rpc('generate_sale_return_number', {
      p_organization_id: currentOrganization?.id
    });
    if (!error && data) {
      setNextReturnNumber(data);
    }
  };

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
    // Step 1: Build sales query with filters
    let salesQuery = supabase
      .from("sales")
      .select("id")
      .eq("organization_id", currentOrganization?.id);

    // Apply filters if provided
    if (originalSaleNumber?.trim()) {
      salesQuery = salesQuery.eq("sale_number", originalSaleNumber.trim());
    }
    
    if (selectedCustomer) {
      salesQuery = salesQuery.eq("customer_id", selectedCustomer);
    }

    const { data: salesData, error: salesError } = await salesQuery;

    if (salesError) {
      toast({ title: "Error", description: "Failed to load sales data", variant: "destructive" });
      return;
    }

    const saleIds = salesData?.map(s => s.id) || [];
    
    if (saleIds.length === 0) {
      setProducts([]);
      setVariants([]);
      if (originalSaleNumber?.trim() || selectedCustomer) {
        toast({ 
          title: "No Sales Found", 
          description: originalSaleNumber?.trim() 
            ? "No sale found with this sale number" 
            : "No sales found for selected customer",
          variant: "destructive" 
        });
      }
      return;
    }

    const { data: soldItems, error: soldError } = await supabase
      .from("sale_items")
      .select("product_id, variant_id")
      .in("sale_id", saleIds);

    if (soldError) {
      toast({ title: "Error", description: "Failed to load sold products", variant: "destructive" });
      return;
    }

    // Get unique product and variant IDs
    const uniqueProductIds = [...new Set(soldItems?.map(s => s.product_id))];
    const uniqueVariantIds = [...new Set(soldItems?.map(s => s.variant_id))];

    if (uniqueProductIds.length === 0) {
      setProducts([]);
      setVariants([]);
      return;
    }

    // Step 2: Fetch product details for sold products only
    const { data: productsData, error: productsError } = await supabase
      .from("products")
      .select("id, product_name, brand, category")
      .in("id", uniqueProductIds)
      .eq("organization_id", currentOrganization?.id)
      .eq("status", "active");

    if (productsError) {
      toast({ title: "Error", description: "Failed to load products", variant: "destructive" });
      return;
    }

    // Step 3: Fetch variants for sold products
    const { data: variantsData, error: variantsError } = await supabase
      .from("product_variants")
      .select("id, product_id, size, sale_price, stock_qty, barcode, products(gst_per)")
      .in("id", uniqueVariantIds)
      .eq("active", true);

    if (variantsError) {
      toast({ title: "Error", description: "Failed to load product variants", variant: "destructive" });
      return;
    }

    setProducts(productsData || []);
    setVariants(
      variantsData?.map((v) => ({
        id: v.id,
        product_id: v.product_id,
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
    const matchingVariants = variants.filter(v => v.product_id === product.id);
    const barcodeMatch = matchingVariants.some(v => v.barcode?.toLowerCase().includes(search));
    
    return (
      product.product_name.toLowerCase().includes(search) ||
      product.brand?.toLowerCase().includes(search) ||
      product.category?.toLowerCase().includes(search) ||
      barcodeMatch
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
    
    // Auto-focus barcode input after adding
    setTimeout(() => barcodeInputRef.current?.focus(), 100);
  };

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!barcodeInput.trim()) return;
    
    // Find variant by barcode
    const variant = variants.find((v) => v.barcode === barcodeInput.trim());
    
    if (!variant) {
      toast({ 
        title: "Not Found", 
        description: "No product found with this barcode",
        variant: "destructive" 
      });
      setBarcodeInput("");
      return;
    }
    
    // Find associated product
    const product = products.find((p) => p.id === variant.product_id);
    
    if (!product) {
      toast({ 
        title: "Error", 
        description: "Product data not found",
        variant: "destructive" 
      });
      setBarcodeInput("");
      return;
    }
    
    // Check if already added
    const existingIndex = returnItems.findIndex(
      (item) => item.variantId === variant.id
    );
    
    if (existingIndex !== -1) {
      // Increment quantity if already exists
      const updated = [...returnItems];
      updated[existingIndex].quantity += 1;
      updated[existingIndex].lineTotal = 
        updated[existingIndex].quantity * updated[existingIndex].unitPrice;
      setReturnItems(updated);
      toast({ title: "Updated", description: "Quantity increased" });
    } else {
      // Add new item
      addProduct(product.id, variant.id);
      toast({ title: "Added", description: `${product.product_name} added to return` });
    }
    
    // Clear input and refocus
    setBarcodeInput("");
    barcodeInputRef.current?.focus();
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
    
    let gstAmount: number;
    if (taxType === "inclusive") {
      // Extract GST from inclusive price
      gstAmount = returnItems.reduce((sum, item) => {
        return sum + (item.lineTotal - (item.lineTotal / (1 + item.gstPercent / 100)));
      }, 0);
    } else {
      // Calculate GST on exclusive price
      gstAmount = returnItems.reduce((sum, item) => {
        return sum + (item.lineTotal * item.gstPercent) / 100;
      }, 0);
    }
    
    const netAmount = taxType === "inclusive" ? grossAmount : grossAmount + gstAmount;
    return { grossAmount, gstAmount, netAmount };
  };

  const handleSave = async () => {
    if (returnItems.length === 0) {
      toast({ title: "Error", description: "Please add at least one item", variant: "destructive" });
      return;
    }

    setSaving(true);

    try {
      const customer = customers.find((c) => c.id === selectedCustomer);
      const totals = calculateTotals();

      // Generate sale return number
      const { data: returnNumber, error: returnNumberError } = await supabase
        .rpc('generate_sale_return_number', { p_organization_id: currentOrganization?.id });

      if (returnNumberError) throw returnNumberError;

      // Insert sale return
      const { data: returnData, error: returnError } = await supabase
        .from("sale_returns")
        .insert({
          return_number: returnNumber,
          organization_id: currentOrganization?.id,
          customer_id: selectedCustomer || null,
          customer_name: customer?.customer_name || "Walk-in Customer",
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

      toast({ title: "Success", description: `Sale return ${returnData.return_number} saved successfully` });
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
            <CardTitle>Barcode Scanner</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
              <Input
                ref={barcodeInputRef}
                type="text"
                placeholder="Scan or enter barcode..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                className="flex-1"
                autoFocus
              />
              <Button type="submit">Add</Button>
            </form>
            <p className="text-sm text-muted-foreground mt-2">
              Scan barcode or manually enter barcode number to add product to return
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Return Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Return No</Label>
                <Input
                  value={nextReturnNumber}
                  readOnly
                  className="bg-muted"
                />
              </div>

              <div className="space-y-2">
                <Label>Customer (Optional)</Label>
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
                <Label>Tax Type</Label>
                <Select value={taxType} onValueChange={(value: "exclusive" | "inclusive") => setTaxType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exclusive">Exclusive GST</SelectItem>
                    <SelectItem value="inclusive">Inclusive GST</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2 lg:col-span-4">
                <Label>Original Sale Number (Optional)</Label>
                <Input
                  placeholder="Enter original sale invoice number if available"
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
              <div className="flex items-center gap-2">
                <span>Return Items</span>
                <Badge variant="secondary" className="text-xs">Sold Products Only</Badge>
              </div>
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
                          const productVariants = variants.filter((v) => v.product_id === product.id);
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
