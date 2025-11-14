import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, ShoppingCart, Plus, Trash2, CalendarIcon, Copy, Printer } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { BackToDashboard } from "@/components/BackToDashboard";

interface ProductVariant {
  id: string;
  product_id: string;
  size: string;
  pur_price: number;
  sale_price: number;
  barcode: string;
  product_name: string;
  brand: string;
  category: string;
  gst_per: number;
  hsn_code: string;
}

interface LineItem {
  temp_id: string;
  product_id: string;
  sku_id: string; // variant id for stock tracking
  product_name: string;
  size: string;
  qty: number;
  pur_price: number;
  sale_price: number;
  gst_per: number;
  hsn_code: string;
  barcode: string;
  discount: number; // discount in rupees
  line_total: number; // total before GST
}

interface SizeQuantity {
  size: string;
  qty: number;
  variant_id: string;
  barcode: string;
}

const PurchaseEntry = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductVariant[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [showSizeGrid, setShowSizeGrid] = useState(false);
  const [sizeGridVariants, setSizeGridVariants] = useState<any[]>([]);
  const [sizeQty, setSizeQty] = useState<{ [size: string]: number }>({});
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [entryMode, setEntryMode] = useState<"grid" | "inline">("grid");
  const [billDate, setBillDate] = useState<Date>(new Date());
  const [grossAmount, setGrossAmount] = useState(0);
  const [gstAmount, setGstAmount] = useState(0);
  const [netAmount, setNetAmount] = useState(0);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [savedPurchaseItems, setSavedPurchaseItems] = useState<LineItem[]>([]);
  const firstSizeInputRef = useRef<HTMLInputElement>(null);

  const [billData, setBillData] = useState({
    supplier_name: "",
    supplier_invoice_no: "",
  });

  useEffect(() => {
    if (searchQuery.length >= 2) {
      searchProducts(searchQuery);
    } else {
      setSearchResults([]);
      setShowSearch(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    const gross = lineItems.reduce((sum, r) => sum + r.line_total, 0);
    const gst = lineItems.reduce((sum, r) => sum + (r.line_total * r.gst_per / 100), 0);
    setGrossAmount(gross);
    setGstAmount(gst);
    setNetAmount(gross + gst);
  }, [lineItems]);

  const generateEAN8 = (): string => {
    const seven = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10));
    const sum = seven[0] * 3 + seven[1] + seven[2] * 3 + seven[3] + seven[4] * 3 + seven[5] + seven[6] * 3;
    const chk = (10 - (sum % 10)) % 10;
    return seven.join("") + String(chk);
  };

  const searchProducts = async (query: string) => {
    if (!query || query.length < 1) {
      setSearchResults([]);
      return;
    }

    try {
      // First, search products by name, brand, and style
      const { data: matchingProducts } = await supabase
        .from("products")
        .select("id")
        .or(`product_name.ilike.%${query}%,brand.ilike.%${query}%,style.ilike.%${query}%`);

      const productIds = matchingProducts?.map(p => p.id) || [];

      // Then search product_variants by barcode OR matching product IDs
      let variantsQuery = supabase
        .from("product_variants")
        .select(`
          id,
          size,
          pur_price,
          sale_price,
          barcode,
          active,
          product_id,
          products (
            id,
            product_name,
            brand,
            style,
            color,
            hsn_code,
            gst_per,
            default_pur_price,
            default_sale_price
          )
        `)
        .eq("active", true);

      // Add barcode or product_id filters
      if (productIds.length > 0) {
        variantsQuery = variantsQuery.or(`barcode.ilike.%${query}%,product_id.in.(${productIds.join(",")})`);
      } else {
        variantsQuery = variantsQuery.ilike("barcode", `%${query}%`);
      }

      const { data, error } = await variantsQuery;

      if (error) throw error;

      const results = (data || []).map((v: any) => ({
        id: v.id,
        product_id: v.products?.id || "",
        size: v.size,
        pur_price: v.pur_price,
        sale_price: v.sale_price,
        barcode: v.barcode || "",
        product_name: v.products?.product_name || "",
        brand: v.products?.brand || "",
        category: v.products?.category || "",
        gst_per: v.products?.gst_per || 0,
        hsn_code: v.products?.hsn_code || "",
      }));

      setSearchResults(results);
      setShowSearch(true);
    } catch (error: any) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to search products",
        variant: "destructive",
      });
    }
  };

  const handleProductSelect = async (variant: ProductVariant) => {
    if (entryMode === "grid") {
      openSizeGridModal(variant.product_id);
    } else {
      addInlineRow(variant);
    }
    setSearchQuery("");
    setShowSearch(false);
  };

  const openSizeGridModal = async (productId: string) => {
    const { data, error } = await supabase
      .from("product_variants")
      .select(`
        id,
        size,
        pur_price,
        sale_price,
        barcode,
        active,
        products (
          id,
          product_name,
          brand,
          hsn_code,
          gst_per,
          default_pur_price,
          default_sale_price
        )
      `)
      .eq("product_id", productId)
      .eq("active", true);

    if (error || !data || data.length === 0) {
      toast({
        title: "Error",
        description: "Failed to load product variants",
        variant: "destructive",
      });
      return;
    }

    // If only one variant, add directly
    if (data.length === 1) {
      const v = data[0];
      const product = v.products as any;
      let barcode = v.barcode || "";
      
      if (!barcode) {
        barcode = generateEAN8();
        await supabase.from("product_variants").update({ barcode }).eq("id", v.id);
      }

      addItemRow({
        product_id: productId,
        sku_id: v.id,
        product_name: product.product_name,
        size: v.size,
        qty: 1,
        pur_price: product.default_pur_price || 0,
        sale_price: product.default_sale_price || 0,
        gst_per: product.gst_per || 0,
        hsn_code: product.hsn_code || "",
        barcode: barcode,
        discount: 0,
      });
      return;
    }

    // Show size grid modal
    setSelectedProduct(data[0].products);
    setSizeGridVariants(data);
    setSizeQty({});
    setShowSizeGrid(true);
    setTimeout(() => firstSizeInputRef.current?.focus(), 100);
  };

  const addInlineRow = (variant: ProductVariant) => {
    const lineTotal = 1 * variant.pur_price;
    const newItem: LineItem = {
      temp_id: Date.now().toString() + Math.random(),
      product_id: variant.product_id,
      sku_id: variant.id,
      product_name: variant.product_name,
      size: variant.size,
      qty: 1,
      pur_price: variant.pur_price,
      sale_price: variant.sale_price,
      gst_per: variant.gst_per,
      hsn_code: variant.hsn_code,
      barcode: variant.barcode,
      discount: 0,
      line_total: lineTotal,
    };
    setLineItems([...lineItems, newItem]);
  };

  const addItemRow = (item: Omit<LineItem, "temp_id" | "line_total">) => {
    setLineItems((prev) => [
      ...prev,
      {
        ...item,
        temp_id: Date.now().toString() + Math.random(),
        line_total: item.qty * item.pur_price,
      },
    ]);
  };

  const updateLineItem = (temp_id: string, field: keyof LineItem, value: any) => {
    setLineItems((items) =>
      items.map((item) => {
        if (item.temp_id === temp_id) {
          const updated = { ...item, [field]: value };
          if (field === "qty" || field === "pur_price") {
            updated.line_total = updated.qty * updated.pur_price;
          }
          return updated;
        }
        return item;
      })
    );
  };

  const removeLineItem = (temp_id: string) => {
    setLineItems((items) => items.filter((item) => item.temp_id !== temp_id));
  };

  const handleCopyLastRow = () => {
    if (lineItems.length === 0) return;
    const lastItem = lineItems[lineItems.length - 1];
    const newItem: LineItem = {
      ...lastItem,
      temp_id: Date.now().toString() + Math.random(),
    };
    setLineItems([...lineItems, newItem]);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "ArrowDown") {
        e.preventDefault();
        handleCopyLastRow();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lineItems]);

  const handleSave = async () => {
    if (!billData.supplier_name.trim()) {
      toast({
        title: "Validation Error",
        description: "Supplier name is required",
        variant: "destructive",
      });
      return;
    }

    if (!billData.supplier_invoice_no.trim()) {
      toast({
        title: "Validation Error",
        description: "Supplier invoice number is required",
        variant: "destructive",
      });
      return;
    }

    if (lineItems.length === 0 || !lineItems.some(item => item.qty > 0)) {
      toast({
        title: "Validation Error",
        description: "Please add at least one product with quantity > 0",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Insert purchase bill
      const { data: billDataResult, error: billError } = await supabase
        .from("purchase_bills")
        .insert([
          {
            ...billData,
            bill_date: format(billDate, "yyyy-MM-dd"),
            gross_amount: grossAmount,
            gst_amount: gstAmount,
            net_amount: netAmount,
          },
        ])
        .select()
        .single();

      if (billError) throw billError;

      // Insert purchase items with sku_id for stock tracking
      const itemsToInsert = lineItems.map((item) => ({
        bill_id: billDataResult.id,
        product_id: item.product_id,
        sku_id: item.sku_id,
        size: item.size,
        qty: item.qty,
        pur_price: item.pur_price,
        sale_price: item.sale_price,
        gst_per: item.gst_per,
        hsn_code: item.hsn_code,
        barcode: item.barcode,
        line_total: item.line_total,
      }));

      const { error: itemsError } = await supabase
        .from("purchase_items")
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      toast({
        title: "Success",
        description: `Purchase bill saved successfully`,
      });

      // Fetch full product details for barcode printing
      const itemsWithDetails = await Promise.all(
        lineItems.map(async (item) => {
          const { data: product } = await supabase
            .from("products")
            .select("brand, color, style")
            .eq("id", item.product_id)
            .single();
          
          return {
            ...item,
            brand: product?.brand || "",
            color: product?.color || "",
            style: product?.style || "",
          };
        })
      );

      // Store items for barcode printing and show dialog
      setSavedPurchaseItems(itemsWithDetails);
      setShowPrintDialog(true);

      // Reset form
      setBillData({
        supplier_name: "",
        supplier_invoice_no: "",
      });
      setBillDate(new Date());
      setLineItems([]);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save purchase bill",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const totals = { grossAmount, gstAmount, netAmount };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <BackToDashboard />
        <div className="mb-6 flex items-center gap-3">
          <ShoppingCart className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Purchase Entry</h1>
        </div>

        <Card className="shadow-lg border-border mb-6">
          <CardHeader>
            <CardTitle>Bill Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="supplier_name">Supplier Name *</Label>
                <Input
                  id="supplier_name"
                  value={billData.supplier_name}
                  onChange={(e) =>
                    setBillData({ ...billData, supplier_name: e.target.value })
                  }
                  placeholder="Enter supplier name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier_invoice_no">Supplier Invoice No *</Label>
                <Input
                  id="supplier_invoice_no"
                  value={billData.supplier_invoice_no}
                  onChange={(e) =>
                    setBillData({ ...billData, supplier_invoice_no: e.target.value })
                  }
                  placeholder="Invoice number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bill_date">Bill Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !billDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {billDate ? format(billDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={billDate}
                      onSelect={(date) => date && setBillDate(date)}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-border mb-6">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle>Products</CardTitle>
              <div className="flex items-center gap-4">
                <Button
                  onClick={() => navigate('/product-entry')}
                  variant="outline"
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add New Product
                </Button>
                <div className="flex items-center gap-2">
                  <Label htmlFor="entry-mode" className="text-sm">Entry Mode:</Label>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm", entryMode === "grid" ? "font-semibold" : "text-muted-foreground")}>
                      Size Grid
                    </span>
                    <Switch
                      id="entry-mode"
                      checked={entryMode === "inline"}
                      onCheckedChange={(checked) => setEntryMode(checked ? "inline" : "grid")}
                    />
                    <span className={cn("text-sm", entryMode === "inline" ? "font-semibold" : "text-muted-foreground")}>
                      Inline Rows
                    </span>
                  </div>
                </div>
                <div className="relative w-80">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by product, brand, style, or barcode..."
                    className="pr-10"
                  />
                  <Plus className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  {showSearch && searchResults.length > 0 && (
                    <div className="absolute top-full mt-1 w-full bg-background border border-border rounded-md shadow-lg z-50 max-h-80 overflow-auto">
                      {searchResults.map((result, idx) => (
                        <button
                          key={result.product_id + idx}
                          onClick={() => handleProductSelect(result)}
                          className="w-full text-left px-4 py-3 hover:bg-accent border-b border-border last:border-0"
                        >
                          <div className="font-medium">{result.product_name}</div>
                          <div className="text-sm text-muted-foreground">
                            {result.brand}
                            {result.size && ` | Size: ${result.size}`}
                          </div>
                          {result.barcode && (
                            <div className="text-xs text-muted-foreground">
                              Barcode: {result.barcode}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {lineItems.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">SR.NO</TableHead>
                      <TableHead>ITEM NAME</TableHead>
                      <TableHead className="w-20">QTY</TableHead>
                      <TableHead className="w-28">PUR.RATE</TableHead>
                      <TableHead className="w-28">SALE.RATE</TableHead>
                      <TableHead className="w-28">SUB TOTAL</TableHead>
                      <TableHead className="w-24">DIS(Rs)</TableHead>
                      <TableHead className="w-28">TOTAL</TableHead>
                      <TableHead className="w-24">I-GST</TableHead>
                      <TableHead className="w-24">O-GST</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems.map((item, index) => {
                      const subTotal = item.qty * item.pur_price;
                      const total = item.line_total;
                      const gstAmount = (total * item.gst_per) / 100;
                      
                      return (
                        <TableRow key={item.temp_id}>
                          <TableCell className="text-center font-medium">{index + 1}</TableCell>
                          <TableCell className="font-medium">
                            {item.product_name} - {item.size}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="1"
                              value={item.qty}
                              onChange={(e) =>
                                updateLineItem(
                                  item.temp_id,
                                  "qty",
                                  parseInt(e.target.value) || 0
                                )
                              }
                              className="w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.pur_price}
                              onChange={(e) =>
                                updateLineItem(
                                  item.temp_id,
                                  "pur_price",
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-28"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.sale_price}
                              onChange={(e) =>
                                updateLineItem(
                                  item.temp_id,
                                  "sale_price",
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-28"
                            />
                          </TableCell>
                          <TableCell className="font-semibold">
                            ₹{subTotal.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.discount}
                              onChange={(e) =>
                                updateLineItem(
                                  item.temp_id,
                                  "discount",
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-24"
                            />
                          </TableCell>
                          <TableCell className="font-semibold">
                            ₹{total.toFixed(2)}
                          </TableCell>
                          <TableCell className="font-medium">
                            ₹{gstAmount.toFixed(2)}
                          </TableCell>
                          <TableCell className="font-medium">
                            ₹{gstAmount.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeLineItem(item.temp_id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No products added. Search and add products using the search box above.</p>
                <p className="text-xs mt-2">Tip: Press Alt+↓ to copy the last row</p>
              </div>
            )}
          </CardContent>
        </Card>

        {lineItems.length > 0 && (
          <div className="flex justify-end mb-6">
            <Card className="w-80 shadow-lg border-border">
              <CardHeader>
                <CardTitle className="text-lg">Bill Totals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gross Amount:</span>
                  <span className="font-semibold">₹{totals.grossAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GST Amount:</span>
                  <span className="font-semibold">₹{totals.gstAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 text-lg">
                  <span className="font-semibold">Net Amount:</span>
                  <span className="font-bold text-primary">
                    ₹{totals.netAmount.toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={loading || lineItems.length === 0}
            size="lg"
            className="gap-2 min-w-[150px]"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Bill"
            )}
          </Button>
        </div>

        {/* Size Grid Popup */}
        {showSizeGrid && (
          <Dialog open={showSizeGrid} onOpenChange={setShowSizeGrid}>
            <DialogContent 
              className="max-w-4xl"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setShowSizeGrid(false);
                }
              }}
            >
              <DialogHeader>
                <DialogTitle>Enter Size-wise Qty</DialogTitle>
              </DialogHeader>
              
              <h3 className="mb-2 font-semibold">{selectedProduct?.product_name}</h3>

              <div className="flex gap-2 mb-4 flex-wrap">
                {sizeGridVariants.map((v, index) => (
                  <div key={v.id} className="flex flex-col items-center">
                    <span className="text-sm font-medium">{v.size}</span>
                    <input
                      ref={index === 0 ? firstSizeInputRef : undefined}
                      type="number"
                      min="0"
                      className="w-14 text-center border rounded p-1"
                      value={sizeQty[v.size] || ""}
                      onChange={(e) => setSizeQty({ ...sizeQty, [v.size]: e.target.value })}
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="space-y-2">
                  <Label>Purchase Price</Label>
                  <Input
                    type="number"
                    value={selectedProduct?.default_pur_price || 0}
                    readOnly
                    className="bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sale Price (MRP)</Label>
                  <Input
                    type="number"
                    value={selectedProduct?.default_sale_price || 0}
                    readOnly
                    className="bg-muted"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowSizeGrid(false)}>
                  Cancel (Esc)
                </Button>
                <Button
                  onClick={async () => {
                    const entries = Object.entries(sizeQty);
                    const hasQty = entries.some(([_, qty]) => Number(qty) > 0);
                    
                    if (!hasQty) {
                      toast({
                        title: "No Items",
                        description: "Please enter quantities for at least one size",
                        variant: "destructive",
                      });
                      return;
                    }

                    for (const [size, qty] of entries) {
                      if (Number(qty) > 0) {
                        const variant = sizeGridVariants.find((v) => v.size === size);
                        let barcode = variant?.barcode || "";
                        
                        // Auto-generate barcode if missing
                        if (!barcode && variant) {
                          barcode = generateEAN8();
                          await supabase
                            .from("product_variants")
                            .update({ barcode })
                            .eq("id", variant.id);
                        }

                        addItemRow({
                          product_name: selectedProduct.product_name,
                          product_id: selectedProduct.id,
                          sku_id: variant?.id || "",
                          size,
                          qty: Number(qty),
                          pur_price: variant?.pur_price || selectedProduct.default_pur_price,
                          sale_price: variant?.sale_price || selectedProduct.default_sale_price,
                          gst_per: selectedProduct.gst_per,
                          hsn_code: selectedProduct.hsn_code,
                          barcode: barcode,
                          discount: 0,
                        });
                      }
                    }

                    setShowSizeGrid(false);
                    setSizeQty({});
                  }}
                >
                  Confirm (Enter)
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Print Barcode Dialog */}
        <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Printer className="h-5 w-5" />
                Bill Saved Successfully
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Your purchase bill has been saved. Would you like to print barcodes for the purchased items?
              </p>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowPrintDialog(false)}
                >
                  No, Thanks
                </Button>
                <Button
                  onClick={() => {
                    // Navigate to barcode printing page with state
                    navigate("/barcode-printing", {
                      state: { purchaseItems: savedPurchaseItems },
                    });
                    setShowPrintDialog(false);
                  }}
                  className="gap-2"
                >
                  <Printer className="h-4 w-4" />
                  Print Barcodes
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default PurchaseEntry;
