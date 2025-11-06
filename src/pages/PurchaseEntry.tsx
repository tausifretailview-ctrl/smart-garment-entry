import { useState, useEffect, useRef } from "react";
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
import { Loader2, ShoppingCart, Plus, Trash2, CalendarIcon, Copy } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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
  product_name: string;
  size: string;
  qty: number;
  pur_price: number;
  sale_price: number;
  gst_per: number;
  hsn_code: string;
  barcode: string;
  line_total: number;
}

interface SizeQuantity {
  size: string;
  qty: number;
  variant_id: string;
  barcode: string;
}

interface SelectedProductData {
  product_id: string;
  product_name: string;
  brand: string;
  gst_per: number;
  hsn_code: string;
  default_pur_price: number;
  default_sale_price: number;
  variants: Array<{
    id: string;
    size: string;
    barcode: string;
  }>;
}

const PurchaseEntry = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductVariant[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [showSizeGrid, setShowSizeGrid] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<SelectedProductData | null>(null);
  const [sizeQuantities, setSizeQuantities] = useState<SizeQuantity[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [entryMode, setEntryMode] = useState<"grid" | "inline">("grid");
  const [billDate, setBillDate] = useState<Date>(new Date());
  const [modalPurPrice, setModalPurPrice] = useState(0);
  const [modalSalePrice, setModalSalePrice] = useState(0);
  const firstSizeInputRef = useRef<HTMLInputElement>(null);

  const [billData, setBillData] = useState({
    supplier_name: "",
    supplier_invoice_no: "",
    notes: "",
  });

  useEffect(() => {
    if (searchQuery.length >= 2) {
      searchProducts();
    } else {
      setSearchResults([]);
      setShowSearch(false);
    }
  }, [searchQuery]);

  const generateEAN8 = (): string => {
    const seven = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10));
    const sum = seven[0] * 3 + seven[1] + seven[2] * 3 + seven[3] + seven[4] * 3 + seven[5] + seven[6] * 3;
    const chk = (10 - (sum % 10)) % 10;
    return seven.join("") + String(chk);
  };

  const searchProducts = async () => {
    if (!searchQuery || searchQuery.length < 1) {
      setSearchResults([]);
      setShowSearch(false);
      return;
    }

    const { data, error } = await supabase
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
          category,
          hsn_code,
          gst_per,
          default_pur_price,
          default_sale_price
        )
      `)
      .or(`barcode.ilike.%${searchQuery}%,products.product_name.ilike.%${searchQuery}%,products.brand.ilike.%${searchQuery}%,products.style.ilike.%${searchQuery}%`)
      .eq("active", true)
      .limit(20);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to search products",
        variant: "destructive",
      });
      return;
    }

    // Group by product_id to show one result per product
    const productMap = new Map<string, ProductVariant>();
    
    (data || []).forEach((v: any) => {
      const productId = v.products?.id || v.product_id;
      if (!productMap.has(productId)) {
        productMap.set(productId, {
          id: v.id,
          product_id: productId,
          size: v.size,
          pur_price: v.pur_price,
          sale_price: v.sale_price,
          barcode: v.barcode || "",
          product_name: v.products?.product_name || "",
          brand: v.products?.brand || "",
          category: v.products?.category || "",
          gst_per: v.products?.gst_per || 0,
          hsn_code: v.products?.hsn_code || "",
        });
      }
    });

    setSearchResults(Array.from(productMap.values()));
    setShowSearch(true);
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
    // Get product details and all active variants
    const { data: productData, error: productError } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .single();

    const { data: allVariants, error: variantsError } = await supabase
      .from("product_variants")
      .select("*")
      .eq("product_id", productId)
      .eq("active", true);

    if (productError || variantsError) {
      toast({
        title: "Error",
        description: "Failed to load product details",
        variant: "destructive",
      });
      return;
    }

    if (!allVariants || allVariants.length === 0) {
      toast({
        title: "No Variants",
        description: "This product has no active variants",
        variant: "destructive",
      });
      return;
    }

    // If only one variant, add directly
    if (allVariants.length === 1) {
      const v = allVariants[0];
      let barcode = v.barcode || "";
      
      if (!barcode) {
        barcode = generateEAN8();
        await supabase.from("product_variants").update({ barcode }).eq("id", v.id);
      }

      addLineItem({
        product_id: productId,
        product_name: productData.product_name,
        size: v.size,
        qty: 1,
        pur_price: productData.default_pur_price || 0,
        sale_price: productData.default_sale_price || 0,
        gst_per: productData.gst_per || 0,
        hsn_code: productData.hsn_code || "",
        barcode: barcode,
      });
      return;
    }

    // Show size grid modal
    const productInfo: SelectedProductData = {
      product_id: productData.id,
      product_name: productData.product_name,
      brand: productData.brand || "",
      gst_per: productData.gst_per || 0,
      hsn_code: productData.hsn_code || "",
      default_pur_price: productData.default_pur_price || 0,
      default_sale_price: productData.default_sale_price || 0,
      variants: allVariants.map((v: any) => ({
        id: v.id,
        size: v.size,
        barcode: v.barcode || "",
      })),
    };

    setSelectedProduct(productInfo);
    setModalPurPrice(productInfo.default_pur_price);
    setModalSalePrice(productInfo.default_sale_price);
    setSizeQuantities(
      productInfo.variants.map((v) => ({
        size: v.size,
        qty: 0,
        variant_id: v.id,
        barcode: v.barcode,
      }))
    );
    setShowSizeGrid(true);
    setTimeout(() => firstSizeInputRef.current?.focus(), 100);
  };

  const addInlineRow = (variant: ProductVariant) => {
    const lineTotal = 1 * variant.pur_price;
    const newItem: LineItem = {
      temp_id: Date.now().toString() + Math.random(),
      product_id: variant.product_id,
      product_name: variant.product_name,
      size: variant.size,
      qty: 1,
      pur_price: variant.pur_price,
      sale_price: variant.sale_price,
      gst_per: variant.gst_per,
      hsn_code: variant.hsn_code,
      barcode: variant.barcode,
      line_total: lineTotal,
    };
    setLineItems([...lineItems, newItem]);
  };

  const addLineItem = (item: Omit<LineItem, "temp_id" | "line_total">) => {
    const lineTotal = item.qty * item.pur_price;
    const newItem: LineItem = {
      temp_id: Date.now().toString() + Math.random(),
      ...item,
      line_total: lineTotal,
    };
    setLineItems([...lineItems, newItem]);
  };

  const handleSizeGridConfirm = async () => {
    const itemsToAdd = sizeQuantities.filter((sq) => sq.qty > 0);
    if (itemsToAdd.length === 0) {
      toast({
        title: "No Items",
        description: "Please enter quantities for at least one size",
        variant: "destructive",
      });
      return;
    }

    if (!selectedProduct) return;

    for (const sq of itemsToAdd) {
      let barcode = sq.barcode;
      
      // Auto-generate barcode if missing and update variant
      if (!barcode) {
        barcode = generateEAN8();
        await supabase
          .from("product_variants")
          .update({ barcode })
          .eq("id", sq.variant_id);
      }

      addLineItem({
        product_id: selectedProduct.product_id,
        product_name: selectedProduct.product_name,
        size: sq.size,
        qty: sq.qty,
        pur_price: modalPurPrice,
        sale_price: modalSalePrice,
        gst_per: selectedProduct.gst_per,
        hsn_code: selectedProduct.hsn_code,
        barcode: barcode,
      });
    }

    setShowSizeGrid(false);
    setSelectedProduct(null);
    setSizeQuantities([]);
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

  const calculateTotals = () => {
    const grossAmount = lineItems.reduce((sum, item) => sum + item.line_total, 0);
    const gstAmount = lineItems.reduce(
      (sum, item) => sum + (item.line_total * item.gst_per) / 100,
      0
    );
    const netAmount = grossAmount + gstAmount;
    return { grossAmount, gstAmount, netAmount };
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
      const totals = calculateTotals();

      // Insert purchase bill
      const { data: billDataResult, error: billError } = await supabase
        .from("purchase_bills")
        .insert([
          {
            ...billData,
            bill_date: format(billDate, "yyyy-MM-dd"),
            gross_amount: totals.grossAmount,
            gst_amount: totals.gstAmount,
            net_amount: totals.netAmount,
          },
        ])
        .select()
        .single();

      if (billError) throw billError;

      // Insert purchase items
      const itemsToInsert = lineItems.map((item) => ({
        bill_id: billDataResult.id,
        product_id: item.product_id,
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

      // Reset form
      setBillData({
        supplier_name: "",
        supplier_invoice_no: "",
        notes: "",
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

  const totals = calculateTotals();

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
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

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={billData.notes}
                onChange={(e) => setBillData({ ...billData, notes: e.target.value })}
                placeholder="Optional notes"
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-border mb-6">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle>Products</CardTitle>
              <div className="flex items-center gap-4">
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
                      <TableHead>Product Name</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Pur Price</TableHead>
                      <TableHead>Sale Price</TableHead>
                      <TableHead>GST %</TableHead>
                      <TableHead>HSN Code</TableHead>
                      <TableHead>Barcode</TableHead>
                      <TableHead>Line Total</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems.map((item) => (
                      <TableRow key={item.temp_id}>
                        <TableCell className="font-medium">{item.product_name}</TableCell>
                        <TableCell>{item.size}</TableCell>
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
                        <TableCell>{item.gst_per}%</TableCell>
                        <TableCell>{item.hsn_code}</TableCell>
                        <TableCell className="text-xs">{item.barcode}</TableCell>
                        <TableCell className="font-semibold">
                          ₹{item.line_total.toFixed(2)}
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
                    ))}
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
        <Dialog open={showSizeGrid} onOpenChange={setShowSizeGrid}>
          <DialogContent 
            className="max-w-4xl"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSizeGridConfirm();
              } else if (e.key === "Escape") {
                setShowSizeGrid(false);
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>
                Enter Size-wise Qty - {selectedProduct?.product_name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              {/* Horizontal Size Row */}
              <div>
                <Label className="text-sm text-muted-foreground mb-3 block">
                  Enter quantities (Tab to navigate, Enter to confirm, Esc to cancel)
                </Label>
                <div className="flex gap-3 flex-wrap">
                  {sizeQuantities.map((sq, index) => (
                    <div key={sq.size} className="flex flex-col items-center gap-2">
                      <Label className="text-sm font-semibold">{sq.size}</Label>
                      <Input
                        ref={index === 0 ? firstSizeInputRef : undefined}
                        type="number"
                        min="0"
                        value={sq.qty || ""}
                        onChange={(e) => {
                          const updated = [...sizeQuantities];
                          updated[index].qty = parseInt(e.target.value) || 0;
                          setSizeQuantities(updated);
                        }}
                        placeholder="0"
                        className="w-20 text-center"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Price Fields */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label>Purchase Price</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={modalPurPrice}
                    onChange={(e) => setModalPurPrice(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sale Price</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={modalSalePrice}
                    onChange={(e) => setModalSalePrice(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowSizeGrid(false)}>
                  Cancel (Esc)
                </Button>
                <Button onClick={handleSizeGridConfirm}>Confirm (Enter)</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default PurchaseEntry;
