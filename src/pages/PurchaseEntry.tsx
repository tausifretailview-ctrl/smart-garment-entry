import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ShoppingCart, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";

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
  pur_price: number;
  sale_price: number;
  gst_per: number;
  hsn_code: string;
  barcode: string;
}

const PurchaseEntry = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductVariant[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [showSizeGrid, setShowSizeGrid] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [sizeQuantities, setSizeQuantities] = useState<SizeQuantity[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  const [billData, setBillData] = useState({
    supplier_name: "",
    supplier_invoice_no: "",
    bill_date: format(new Date(), "yyyy-MM-dd"),
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

  const searchProducts = async () => {
    const { data: variantsData, error: variantsError } = await supabase
      .from("product_variants")
      .select(`
        id,
        product_id,
        size,
        pur_price,
        sale_price,
        barcode,
        products (
          product_name,
          brand,
          category,
          gst_per,
          hsn_code
        )
      `)
      .or(`barcode.ilike.%${searchQuery}%,products.product_name.ilike.%${searchQuery}%,products.brand.ilike.%${searchQuery}%,size.ilike.%${searchQuery}%`)
      .limit(10);

    if (variantsError) {
      toast({
        title: "Error",
        description: "Failed to search products",
        variant: "destructive",
      });
      return;
    }

    const formattedResults: ProductVariant[] = (variantsData || []).map((v: any) => ({
      id: v.id,
      product_id: v.product_id,
      size: v.size,
      pur_price: v.pur_price,
      sale_price: v.sale_price,
      barcode: v.barcode,
      product_name: v.products?.product_name || "",
      brand: v.products?.brand || "",
      category: v.products?.category || "",
      gst_per: v.products?.gst_per || 0,
      hsn_code: v.products?.hsn_code || "",
    }));

    setSearchResults(formattedResults);
    setShowSearch(true);
  };

  const handleProductSelect = async (variant: ProductVariant) => {
    // Check if product has multiple sizes
    const { data: allVariants, error } = await supabase
      .from("product_variants")
      .select("*, products(product_name, brand, gst_per, hsn_code)")
      .eq("product_id", variant.product_id)
      .eq("active", true);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to load product variants",
        variant: "destructive",
      });
      return;
    }

    if (allVariants && allVariants.length > 1) {
      // Show size grid popup
      setSelectedProduct(variant);
      setSizeQuantities(
        allVariants.map((v: any) => ({
          size: v.size,
          qty: 0,
          pur_price: v.pur_price,
          sale_price: v.sale_price,
          gst_per: v.products?.gst_per || 0,
          hsn_code: v.products?.hsn_code || "",
          barcode: v.barcode,
        }))
      );
      setShowSizeGrid(true);
    } else {
      // Add single item directly
      addLineItem({
        product_id: variant.product_id,
        product_name: variant.product_name,
        size: variant.size,
        qty: 1,
        pur_price: variant.pur_price,
        sale_price: variant.sale_price,
        gst_per: variant.gst_per,
        hsn_code: variant.hsn_code,
        barcode: variant.barcode,
      });
    }

    setSearchQuery("");
    setShowSearch(false);
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

  const handleSizeGridConfirm = () => {
    const itemsToAdd = sizeQuantities.filter((sq) => sq.qty > 0);
    if (itemsToAdd.length === 0) {
      toast({
        title: "No Items",
        description: "Please enter quantities for at least one size",
        variant: "destructive",
      });
      return;
    }

    itemsToAdd.forEach((sq) => {
      addLineItem({
        product_id: selectedProduct.product_id,
        product_name: selectedProduct.product_name,
        size: sq.size,
        qty: sq.qty,
        pur_price: sq.pur_price,
        sale_price: sq.sale_price,
        gst_per: sq.gst_per,
        hsn_code: sq.hsn_code,
        barcode: sq.barcode,
      });
    });

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

  const handleSave = async () => {
    if (!billData.supplier_name.trim()) {
      toast({
        title: "Validation Error",
        description: "Supplier name is required",
        variant: "destructive",
      });
      return;
    }

    if (lineItems.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please add at least one product",
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
        bill_date: format(new Date(), "yyyy-MM-dd"),
        notes: "",
      });
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
                <Label htmlFor="supplier_invoice_no">Supplier Invoice No</Label>
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
                <Input
                  id="bill_date"
                  type="date"
                  value={billData.bill_date}
                  onChange={(e) =>
                    setBillData({ ...billData, bill_date: e.target.value })
                  }
                />
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
            <div className="flex items-center justify-between">
              <CardTitle>Products</CardTitle>
              <div className="relative w-80">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by product, brand, size, or barcode..."
                  className="pr-10"
                />
                <Plus className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                {showSearch && searchResults.length > 0 && (
                  <div className="absolute top-full mt-1 w-full bg-background border border-border rounded-md shadow-lg z-50 max-h-80 overflow-auto">
                    {searchResults.map((result) => (
                      <button
                        key={result.id}
                        onClick={() => handleProductSelect(result)}
                        className="w-full text-left px-4 py-3 hover:bg-accent border-b border-border last:border-0"
                      >
                        <div className="font-medium">{result.product_name}</div>
                        <div className="text-sm text-muted-foreground">
                          {result.brand} | Size: {result.size} | ₹{result.pur_price}
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
                No products added. Search and add products using the search box above.
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
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>
                Select Sizes - {selectedProduct?.product_name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {sizeQuantities.map((sq, index) => (
                  <div key={sq.size} className="space-y-2 p-4 border rounded-lg">
                    <Label className="font-semibold text-center block">
                      Size: {sq.size}
                    </Label>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Quantity</Label>
                      <Input
                        type="number"
                        min="0"
                        value={sq.qty}
                        onChange={(e) => {
                          const updated = [...sizeQuantities];
                          updated[index].qty = parseInt(e.target.value) || 0;
                          setSizeQuantities(updated);
                        }}
                        placeholder="Qty"
                      />
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>Pur: ₹{sq.pur_price}</div>
                      <div>Sale: ₹{sq.sale_price}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowSizeGrid(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSizeGridConfirm}>Confirm</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default PurchaseEntry;
