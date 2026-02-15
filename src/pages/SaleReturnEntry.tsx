import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Trash2, Search, Plus, Check, ChevronsUpDown } from "lucide-react";
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
  hsn_code: string | null;
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
  color?: string;
  barcode: string | null;
  quantity: number;
  unitPrice: number;
  gstPercent: number;
  lineTotal: number;
  hsnCode?: string;
}

export default function SaleReturnEntry() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [originalSaleNumber, setOriginalSaleNumber] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [nextReturnNumber, setNextReturnNumber] = useState<string>("");
  const [taxType, setTaxType] = useState<"exclusive" | "inclusive">("inclusive");
  
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState<string>("");
  
  const [saving, setSaving] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!currentOrganization) return;

    // Fetch initial customers
    supabase
      .from("customers")
      .select("id, customer_name, phone")
      .eq("organization_id", currentOrganization.id)
      .is("deleted_at", null)
      .order("customer_name")
      .limit(50)
      .then(({ data }) => setCustomers(data || []));

    // Fetch next return number
    supabase.rpc('generate_sale_return_number', {
      p_organization_id: currentOrganization.id
    }).then(({ data }) => { if (data) setNextReturnNumber(data); });

    // Fetch all products
    fetchAllProducts();
  }, [currentOrganization]);

  const fetchAllProducts = async () => {
    try {
      // Fetch only products/variants that were sold via Sales & POS
      const soldVariantIds = new Set<string>();
      const soldProductIds = new Set<string>();
      const PAGE_SIZE = 1000;
      let page = 0;
      let hasMore = true;

      // Paginate through sale_items to get all sold variant/product IDs
      while (hasMore) {
        const { data: batch, error } = await supabase
          .from("sale_items")
          .select("product_id, variant_id, sales!inner(organization_id)")
          .eq("sales.organization_id", currentOrganization?.id)
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
        return;
      }

      // Fetch product details for sold products in batches
      const allProducts: Product[] = [];
      for (let i = 0; i < productIdArray.length; i += 500) {
        const batch = productIdArray.slice(i, i + 500);
        const { data, error } = await supabase
          .from("products")
          .select("id, product_name, brand, category, hsn_code")
          .in("id", batch)
          .eq("status", "active")
          .is("deleted_at", null);
        if (error) throw error;
        allProducts.push(...(data || []));
      }

      // Fetch variants for sold products in batches
      const variantIdArray = Array.from(soldVariantIds);
      const allVariants: Variant[] = [];
      for (let i = 0; i < variantIdArray.length; i += 500) {
        const batch = variantIdArray.slice(i, i + 500);
        const { data: variantsData, error: variantsError } = await supabase
          .from("product_variants")
          .select("id, product_id, size, sale_price, stock_qty, barcode, products(gst_per)")
          .in("id", batch)
          .eq("active", true)
          .is("deleted_at", null);

        if (variantsError) throw variantsError;

        allVariants.push(
          ...(variantsData?.map((v) => ({
            id: v.id,
            product_id: v.product_id,
            size: v.size,
            sale_price: v.sale_price || 0,
            stock_qty: v.stock_qty,
            barcode: v.barcode,
            gst_per: (v.products as any)?.gst_per || 0,
          })) || [])
        );
      }

      setProducts(allProducts);
      setVariants(allVariants);
    } catch (error) {
      console.error("Error loading sold products:", error);
      toast({ title: "Error", description: "Failed to load sold products", variant: "destructive" });
    }
  };

  const filteredProducts = products.filter((product) => {
    const search = searchTerm.toLowerCase();
    if (!search) return true;
    const matchingVariants = variants.filter(v => v.product_id === product.id);
    const barcodeMatch = matchingVariants.some(v => v.barcode?.toLowerCase().includes(search));
    
    return (
      product.product_name.toLowerCase().includes(search) ||
      product.brand?.toLowerCase().includes(search) ||
      product.category?.toLowerCase().includes(search) ||
      barcodeMatch
    );
  });

  const addProduct = async (productId: string, variantId: string) => {
    const product = products.find((p) => p.id === productId);
    const variant = variants.find((v) => v.id === variantId);

    if (!product || !variant) return;

    // Fetch original sale price from sale_items (most recent sale)
    const { data: saleItemData } = await supabase
      .from("sale_items")
      .select("per_qty_net_amount, net_after_discount, unit_price, line_total, quantity")
      .eq("variant_id", variantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Use per_qty_net_amount if available (post-migration sales), else fall back
    let unitPrice = variant.sale_price;
    if (saleItemData) {
      if (saleItemData.per_qty_net_amount && saleItemData.per_qty_net_amount > 0) {
        unitPrice = saleItemData.per_qty_net_amount;
      } else if (saleItemData.line_total && saleItemData.quantity) {
        unitPrice = saleItemData.line_total / saleItemData.quantity;
      }
    }

    const newItem: ReturnItem = {
      productId: product.id,
      variantId: variant.id,
      productName: product.product_name,
      size: variant.size,
      barcode: variant.barcode,
      quantity: 1,
      unitPrice,
      gstPercent: variant.gst_per,
      lineTotal: unitPrice,
      hsnCode: product.hsn_code || '',
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
    const query = barcodeInput.trim();
    
    // First try exact barcode match from local cache
    let variant = variants.find((v) => v.barcode === query);
    let product = variant ? products.find((p) => p.id === variant!.product_id) : null;
    
    // If no local barcode match, try product name match
    if (!variant) {
      const matchedProduct = products.find((p) => 
        p.product_name.toLowerCase().includes(query.toLowerCase())
      );
      if (matchedProduct) {
        product = matchedProduct;
        variant = variants.find((v) => v.product_id === matchedProduct.id);
      }
    }
    
    // If still not found, try direct DB lookup but only if it was sold before
    if (!variant || !product) {
      try {
        // First check if this barcode's variant was ever sold in this org
        const { data: dbVariant } = await supabase
          .from("product_variants")
          .select("id, product_id, size, sale_price, stock_qty, barcode, products(id, product_name, brand, category, hsn_code, gst_per, status, deleted_at)")
          .eq("barcode", query)
          .eq("active", true)
          .is("deleted_at", null)
          .maybeSingle();

        if (dbVariant && (dbVariant.products as any)?.status === 'active' && !(dbVariant.products as any)?.deleted_at) {
          // Verify it was sold in this organization
          const { count } = await supabase
            .from("sale_items")
            .select("id", { count: "exact", head: true })
            .eq("variant_id", dbVariant.id)
            .is("deleted_at", null);

          if (count && count > 0) {
            const p = dbVariant.products as any;
            product = { id: p.id, product_name: p.product_name, brand: p.brand, category: p.category, hsn_code: p.hsn_code };
            variant = { id: dbVariant.id, product_id: dbVariant.product_id, size: dbVariant.size, sale_price: dbVariant.sale_price || 0, stock_qty: dbVariant.stock_qty, barcode: dbVariant.barcode, gst_per: p.gst_per || 0 };
          }
        }
      } catch (err) {
        console.error("DB barcode lookup error:", err);
      }
    }
    
    if (!variant || !product) {
      toast({ 
        title: "Not Found", 
        description: "No product found with this barcode or name",
        variant: "destructive" 
      });
      setBarcodeInput("");
      return;
    }
    
    // Check if already added
    const existingIndex = returnItems.findIndex(
      (item) => item.variantId === variant!.id
    );
    
    if (existingIndex !== -1) {
      const updated = [...returnItems];
      updated[existingIndex].quantity += 1;
      updated[existingIndex].lineTotal = 
        updated[existingIndex].quantity * updated[existingIndex].unitPrice;
      setReturnItems(updated);
      toast({ title: "Updated", description: "Quantity increased" });
    } else {
      // Fetch original sale price from sale_items (most recent sale)
      const { data: saleItemData } = await supabase
        .from("sale_items")
        .select("per_qty_net_amount, net_after_discount, unit_price, line_total, quantity")
        .eq("variant_id", variant.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Use per_qty_net_amount if available, else fall back to line_total/qty, then sale_price
      let unitPrice = variant.sale_price;
      if (saleItemData) {
        if (saleItemData.per_qty_net_amount && saleItemData.per_qty_net_amount > 0) {
          unitPrice = saleItemData.per_qty_net_amount;
        } else if (saleItemData.line_total && saleItemData.quantity) {
          unitPrice = saleItemData.line_total / saleItemData.quantity;
        }
      }

      const newItem: ReturnItem = {
        productId: product.id,
        variantId: variant.id,
        productName: product.product_name,
        size: variant.size,
        barcode: variant.barcode,
        quantity: 1,
        unitPrice,
        gstPercent: variant.gst_per,
        lineTotal: unitPrice,
        hsnCode: product.hsn_code || '',
      };
      setReturnItems(prev => [...prev, newItem]);
      toast({ title: "Added", description: `${product.product_name} added to return` });
    }
    
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
        color: item.color || null,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        gst_percent: item.gstPercent,
        line_total: item.lineTotal,
        hsn_code: item.hsnCode || null,
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
    <div className="w-full px-6 py-6 space-y-6">
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
                placeholder="Scan barcode or enter product name..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                className="flex-1"
                autoFocus
              />
              <Button type="submit">Add</Button>
            </form>
            <p className="text-sm text-muted-foreground mt-2">
              Scan barcode or enter product name/barcode number to add product to return
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
                <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={customerSearchOpen}
                      className="w-full justify-between font-normal"
                    >
                      {selectedCustomer
                        ? customers.find(c => c.id === selectedCustomer)?.customer_name || "Selected"
                        : "Select customer"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[350px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search by name or phone..."
                        value={customerSearchTerm}
                        onValueChange={(val) => {
                          setCustomerSearchTerm(val);
                          // Server-side search
                          if (!currentOrganization) return;
                          let query = supabase
                            .from("customers")
                            .select("id, customer_name, phone")
                            .eq("organization_id", currentOrganization.id)
                            .is("deleted_at", null)
                            .order("customer_name")
                            .limit(50);
                          if (val.trim()) {
                            const term = `%${val.trim()}%`;
                            query = query.or(`customer_name.ilike.${term},phone.ilike.${term}`);
                          }
                          query.then(({ data }) => setCustomers(data || []));
                        }}
                      />
                      <CommandList>
                        <CommandEmpty>No customer found.</CommandEmpty>
                        <CommandGroup>
                          {customers.map((customer) => (
                            <CommandItem
                              key={customer.id}
                              value={customer.customer_name + (customer.phone || "")}
                              onSelect={() => {
                                setSelectedCustomer(customer.id);
                                setCustomerSearchOpen(false);
                                setCustomerSearchTerm("");
                              }}
                            >
                              <div className="flex flex-col">
                                <span className="font-medium">{customer.customer_name}</span>
                                {customer.phone && (
                                  <span className="text-xs text-muted-foreground">{customer.phone}</span>
                                )}
                              </div>
                              {selectedCustomer === customer.id && (
                                <Check className="ml-auto h-4 w-4 text-primary" />
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
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
  );
}
