import { useState, useEffect, useRef, useCallback } from "react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, CalendarIcon, Trash2, Plus, Search, Barcode } from "lucide-react";
import { format } from "date-fns";
import { cn, sortSearchResults } from "@/lib/utils";
import { BackToDashboard } from "@/components/BackToDashboard";

interface ProductVariant {
  id: string;
  product_id: string;
  size: string;
  pur_price: number;
  barcode: string;
  product_name: string;
  brand: string;
  gst_per: number;
  hsn_code: string;
}

interface LineItem {
  temp_id: string;
  product_id: string;
  sku_id: string;
  product_name: string;
  size: string;
  qty: number;
  pur_price: number;
  gst_per: number;
  hsn_code: string;
  barcode: string;
  line_total: number;
  brand?: string;
  discount_percent: number;
  discount_amount: number;
}

const PurchaseReturnEntry = () => {
  const { toast } = useToast();
  const { orgNavigate: navigate } = useOrgNavigation();
  const { currentOrganization } = useOrganization();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const isEditMode = !!editId;
  
  const [loading, setLoading] = useState(false);
  const [loadingReturn, setLoadingReturn] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductVariant[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [returnDate, setReturnDate] = useState<Date>(new Date());
  const [grossAmount, setGrossAmount] = useState(0);
  const [gstAmount, setGstAmount] = useState(0);
  const [netAmount, setNetAmount] = useState(0);
  const [returnNumber, setReturnNumber] = useState("");
  const [taxType, setTaxType] = useState<"exclusive" | "inclusive">("exclusive");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastBarcodeRef = useRef<string>("");

  const [returnData, setReturnData] = useState({
    supplier_id: "",
    supplier_name: "",
    original_bill_number: "",
    notes: "",
  });

  // Generate return number on mount (only for new returns)
  useEffect(() => {
    const generateReturnNumber = async () => {
      if (!currentOrganization?.id || isEditMode) return;
      try {
        const { data, error } = await supabase.rpc("generate_purchase_return_number", {
          p_organization_id: currentOrganization.id,
        });
        if (error) throw error;
        setReturnNumber(data || "");
      } catch (error) {
        console.error("Error generating return number:", error);
      }
    };
    generateReturnNumber();
  }, [currentOrganization?.id, isEditMode]);

  // Load existing return data in edit mode
  useEffect(() => {
    const loadReturnData = async () => {
      if (!editId || !currentOrganization?.id) return;
      
      setLoadingReturn(true);
      try {
        // Fetch return header
        const { data: returnRecord, error: returnError } = await supabase
          .from("purchase_returns" as any)
          .select("*")
          .eq("id", editId)
          .eq("organization_id", currentOrganization.id)
          .single();

        if (returnError) throw returnError;
        if (!returnRecord) throw new Error("Return not found");

        const typedReturn = returnRecord as any;
        
        // Set return data
        setReturnNumber(typedReturn.return_number || "");
        setReturnDate(new Date(typedReturn.return_date));
        setReturnData({
          supplier_id: typedReturn.supplier_id || "",
          supplier_name: typedReturn.supplier_name || "",
          original_bill_number: typedReturn.original_bill_number || "",
          notes: typedReturn.notes || "",
        });

        // Fetch return items
        const { data: items, error: itemsError } = await supabase
          .from("purchase_return_items" as any)
          .select("*")
          .eq("return_id", editId);

        if (itemsError) throw itemsError;

        // Get unique product IDs to fetch product info
        const productIds = [...new Set((items || []).map((item: any) => item.product_id))];
        
        let productMap = new Map();
        if (productIds.length > 0) {
          const { data: productsData, error: productsError } = await supabase
            .from("products")
            .select("id, product_name, brand")
            .in("id", productIds);

          if (!productsError && productsData) {
            productMap = new Map(productsData.map((p: any) => [p.id, p]));
          }
        }

        const loadedItems: LineItem[] = (items || []).map((item: any) => {
          const product = productMap.get(item.product_id);
          return {
            temp_id: item.id,
            product_id: item.product_id,
            sku_id: item.sku_id,
            product_name: product?.product_name || "Unknown",
            size: item.size,
            qty: item.qty,
            pur_price: item.pur_price,
            gst_per: item.gst_per,
            hsn_code: item.hsn_code || "",
            barcode: item.barcode || "",
            line_total: item.line_total,
            brand: product?.brand || "",
            discount_percent: item.discount_percent || 0,
            discount_amount: item.discount_amount || 0,
          };
        });

        setLineItems(loadedItems);
      } catch (error) {
        console.error("Error loading return:", error);
        toast({
          title: "Error",
          description: "Failed to load purchase return",
          variant: "destructive",
        });
        navigate("/purchase-returns");
      } finally {
        setLoadingReturn(false);
      }
    };

    loadReturnData();
  }, [editId, currentOrganization?.id]);

  // Fetch suppliers
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("organization_id", currentOrganization?.id)
        .order("supplier_name");
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Fast barcode scanning - check for exact match first
  const handleBarcodeSearch = useCallback(async (barcode: string) => {
    if (!barcode || barcode.length < 1 || !currentOrganization?.id) return null;
    
    try {
      // Try exact barcode match first for fast scanning
      const { data: exactMatch, error } = await supabase
        .from("product_variants")
        .select(`
          id,
          size,
          pur_price,
          barcode,
          active,
          product_id,
          products (
            id,
            product_name,
            brand,
            hsn_code,
            gst_per,
            organization_id
          )
        `)
        .eq("barcode", barcode)
        .eq("active", true)
        .limit(1);

      if (!error && exactMatch && exactMatch.length > 0) {
        const v = exactMatch[0] as any;
        // Verify organization
        if (v.products?.organization_id === currentOrganization.id) {
          return {
            id: v.id,
            product_id: v.products?.id || "",
            size: v.size,
            pur_price: v.pur_price,
            barcode: v.barcode || "",
            product_name: v.products?.product_name || "",
            brand: v.products?.brand || "",
            gst_per: v.products?.gst_per || 0,
            hsn_code: v.products?.hsn_code || "",
          } as ProductVariant;
        }
      }
      return null;
    } catch (error) {
      console.error("Barcode search error:", error);
      return null;
    }
  }, [currentOrganization?.id]);

  // Handle search with debounce for text search, instant for barcode
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 1) {
      setSearchResults([]);
      setShowSearch(false);
      return;
    }

    // Clear any existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Check if input looks like a barcode scan (fast typing, numeric, etc.)
    const isBarcodeInput = /^\d+$/.test(searchQuery) && searchQuery.length >= 6;

    if (isBarcodeInput && searchQuery !== lastBarcodeRef.current) {
      // Fast barcode scan - try exact match immediately
      handleBarcodeSearch(searchQuery).then((variant) => {
        if (variant) {
          lastBarcodeRef.current = searchQuery;
          // Auto-add or increment quantity
          const existingItem = lineItems.find(item => item.sku_id === variant.id);
          if (existingItem) {
            updateLineItem(existingItem.temp_id, "qty", existingItem.qty + 1);
            toast({
              title: "Quantity Updated",
              description: `${variant.product_name} - ${variant.size} (Qty: ${existingItem.qty + 1})`,
            });
          } else {
            handleProductSelect(variant);
            toast({
              title: "Item Added",
              description: `${variant.product_name} - ${variant.size}`,
            });
          }
          setSearchQuery("");
          setShowSearch(false);
          // Focus back on search input for continuous scanning
          setTimeout(() => searchInputRef.current?.focus(), 100);
        } else {
          // No exact match, fall back to regular search
          searchProducts(searchQuery);
        }
      });
    } else {
      // Regular search with debounce
      searchTimeoutRef.current = setTimeout(() => {
        searchProducts(searchQuery);
      }, 300);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, handleBarcodeSearch, lineItems]);

  useEffect(() => {
    if (taxType === "exclusive") {
      // GST Exclusive: line_total is base price, GST added on top
      const gross = lineItems.reduce((sum, r) => sum + r.line_total, 0);
      // Apply discount on gross amount
      const discountedGross = gross - discountAmount;
      const gst = lineItems.reduce((sum, r) => {
        const itemDiscountedTotal = r.line_total - (r.line_total / gross * discountAmount);
        return sum + (itemDiscountedTotal * r.gst_per / 100);
      }, 0);
      setGrossAmount(gross);
      setGstAmount(gross > 0 ? gst : 0);
      setNetAmount(discountedGross + (gross > 0 ? gst : 0));
    } else {
      // GST Inclusive: line_total includes GST, need to extract base and GST
      let totalGross = 0;
      let totalGst = 0;
      const lineTotal = lineItems.reduce((sum, r) => sum + r.line_total, 0);
      lineItems.forEach((item) => {
        const inclusiveTotal = item.line_total;
        const gstRate = item.gst_per / 100;
        const baseAmount = inclusiveTotal / (1 + gstRate);
        const gstAmt = inclusiveTotal - baseAmount;
        totalGross += baseAmount;
        totalGst += gstAmt;
      });
      // Apply discount proportionally
      const discountRatio = lineTotal > 0 ? discountAmount / lineTotal : 0;
      const adjustedGross = totalGross * (1 - discountRatio);
      const adjustedGst = totalGst * (1 - discountRatio);
      setGrossAmount(totalGross);
      setGstAmount(adjustedGst);
      setNetAmount(adjustedGross + adjustedGst);
    }
  }, [lineItems, taxType, discountAmount]);

  // Sync discount percent and amount
  const handleDiscountPercentChange = (percent: number) => {
    setDiscountPercent(percent);
    const gross = lineItems.reduce((sum, r) => sum + r.line_total, 0);
    setDiscountAmount(gross * percent / 100);
  };

  const handleDiscountAmountChange = (amount: number) => {
    setDiscountAmount(amount);
    const gross = lineItems.reduce((sum, r) => sum + r.line_total, 0);
    setDiscountPercent(gross > 0 ? (amount / gross) * 100 : 0);
  };

  const searchProducts = async (query: string) => {
    if (!query || query.length < 1 || !currentOrganization?.id) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const { data: matchingProducts } = await supabase
        .from("products")
        .select("id")
        .eq("organization_id", currentOrganization.id)
        .or(`product_name.ilike.%${query}%,brand.ilike.%${query}%`);

      const productIds = matchingProducts?.map(p => p.id) || [];

      let variantsQuery = supabase
        .from("product_variants")
        .select(`
          id,
          size,
          pur_price,
          barcode,
          active,
          product_id,
          products (
            id,
            product_name,
            brand,
            hsn_code,
            gst_per,
            organization_id
          )
        `)
        .eq("active", true);

      if (productIds.length > 0) {
        variantsQuery = variantsQuery.or(`barcode.ilike.%${query}%,product_id.in.(${productIds.join(",")})`);
      } else {
        variantsQuery = variantsQuery.ilike("barcode", `%${query}%`);
      }

      const { data, error } = await variantsQuery.limit(50);

      if (error) throw error;

      // Filter by organization and map results
      const results = (data || [])
        .filter((v: any) => v.products?.organization_id === currentOrganization.id)
        .map((v: any) => ({
          id: v.id,
          product_id: v.products?.id || "",
          size: v.size,
          pur_price: v.pur_price,
          barcode: v.barcode || "",
          product_name: v.products?.product_name || "",
          brand: v.products?.brand || "",
          gst_per: v.products?.gst_per || 0,
          hsn_code: v.products?.hsn_code || "",
        }));

      // Apply smart sorting
      const sortedResults = sortSearchResults(results, query, {
        barcode: 'barcode',
        productName: 'product_name',
      });

      setSearchResults(sortedResults);
      setShowSearch(sortedResults.length > 0);
    } catch (error: any) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to search products",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleProductSelect = (variant: ProductVariant) => {
    const lineTotal = 1 * variant.pur_price;
    const newItem: LineItem = {
      temp_id: Date.now().toString() + Math.random(),
      product_id: variant.product_id,
      sku_id: variant.id,
      product_name: variant.product_name,
      size: variant.size,
      qty: 1,
      pur_price: variant.pur_price,
      gst_per: variant.gst_per,
      hsn_code: variant.hsn_code,
      barcode: variant.barcode,
      line_total: lineTotal,
      brand: variant.brand,
      discount_percent: 0,
      discount_amount: 0,
    };
    setLineItems([...lineItems, newItem]);
    setSearchQuery("");
    setShowSearch(false);
  };

  const updateLineItem = (temp_id: string, field: keyof LineItem, value: any) => {
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.temp_id === temp_id) {
          const updated = { ...item, [field]: value };
          // Calculate base amount
          const baseAmount = updated.qty * updated.pur_price;
          
          // Handle discount changes
          if (field === "discount_percent") {
            updated.discount_amount = baseAmount * (updated.discount_percent / 100);
          } else if (field === "discount_amount") {
            updated.discount_percent = baseAmount > 0 ? (updated.discount_amount / baseAmount) * 100 : 0;
          } else if (field === "qty" || field === "pur_price") {
            // Recalculate discount amount when qty or price changes
            updated.discount_amount = baseAmount * (updated.discount_percent / 100);
          }
          
          // Calculate line total after discount
          updated.line_total = baseAmount - updated.discount_amount;
          return updated;
        }
        return item;
      })
    );
  };

  const removeLineItem = (temp_id: string) => {
    setLineItems((prev) => prev.filter((item) => item.temp_id !== temp_id));
  };

  const handleSupplierChange = (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    if (supplier) {
      setReturnData({
        ...returnData,
        supplier_id: supplier.id,
        supplier_name: supplier.supplier_name,
      });
    }
  };

  const handleSave = async () => {
    if (!returnData.supplier_id) {
      toast({
        title: "Error",
        description: "Please select a supplier",
        variant: "destructive",
      });
      return;
    }

    if (lineItems.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one item",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      if (isEditMode && editId) {
        // Update existing return
        const { error: updateError } = await supabase
          .from("purchase_returns" as any)
          .update({
            supplier_id: returnData.supplier_id,
            supplier_name: returnData.supplier_name,
            original_bill_number: returnData.original_bill_number || null,
            return_date: format(returnDate, "yyyy-MM-dd"),
            gross_amount: grossAmount,
            gst_amount: gstAmount,
            net_amount: netAmount,
            notes: returnData.notes || null,
          })
          .eq("id", editId);

        if (updateError) throw updateError;

        // Delete existing items
        const { error: deleteError } = await supabase
          .from("purchase_return_items" as any)
          .delete()
          .eq("return_id", editId);

        if (deleteError) throw deleteError;

        // Insert updated items
        const itemsToInsert = lineItems.map((item) => ({
          return_id: editId,
          product_id: item.product_id,
          sku_id: item.sku_id,
          size: item.size,
          qty: item.qty,
          pur_price: item.pur_price,
          gst_per: item.gst_per,
          hsn_code: item.hsn_code,
          barcode: item.barcode,
          line_total: item.line_total,
        }));

        const { error: itemsError } = await supabase
          .from("purchase_return_items" as any)
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;

        toast({
          title: "Success",
          description: "Purchase return updated successfully",
        });
      } else {
        // Insert new purchase return
        const { data: returnRecord, error: returnError } = await supabase
          .from("purchase_returns" as any)
          .insert({
            organization_id: currentOrganization?.id,
            supplier_id: returnData.supplier_id,
            supplier_name: returnData.supplier_name,
            original_bill_number: returnData.original_bill_number || null,
            return_date: format(returnDate, "yyyy-MM-dd"),
            gross_amount: grossAmount,
            gst_amount: gstAmount,
            net_amount: netAmount,
            notes: returnData.notes || null,
            return_number: returnNumber,
          })
          .select()
          .single();

        if (returnError) throw returnError;

        // Insert return items
        const itemsToInsert = lineItems.map((item) => ({
          return_id: (returnRecord as any).id,
          product_id: item.product_id,
          sku_id: item.sku_id,
          size: item.size,
          qty: item.qty,
          pur_price: item.pur_price,
          gst_per: item.gst_per,
          hsn_code: item.hsn_code,
          barcode: item.barcode,
          line_total: item.line_total,
        }));

        const { error: itemsError } = await supabase
          .from("purchase_return_items" as any)
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;

        toast({
          title: "Success",
          description: "Purchase return saved successfully",
        });
      }

      navigate("/purchase-returns");
    } catch (error: any) {
      console.error("Error saving purchase return:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save purchase return",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loadingReturn) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading purchase return...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            {isEditMode ? "Edit Purchase Return" : "Purchase Return Entry"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isEditMode ? `Editing return: ${returnNumber}` : "Create a new purchase return record"}
          </p>
        </div>
        <BackToDashboard to="/purchase-returns" label="Back to Returns" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Return Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Return No.</Label>
                <Input
                  value={returnNumber}
                  readOnly
                  className="bg-muted font-medium"
                />
              </div>

              <div className="space-y-2">
                <Label>Supplier *</Label>
                <Select value={returnData.supplier_id} onValueChange={handleSupplierChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.supplier_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Return Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !returnDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {returnDate ? format(returnDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={returnDate}
                      onSelect={(date) => date && setReturnDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Original Bill Number</Label>
                <Input
                  placeholder="Enter original purchase bill number"
                  value={returnData.original_bill_number}
                  onChange={(e) =>
                    setReturnData({ ...returnData, original_bill_number: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>GST Type</Label>
                <Select value={taxType} onValueChange={(value: "exclusive" | "inclusive") => setTaxType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exclusive">GST Exclusive</SelectItem>
                    <SelectItem value="inclusive">GST Inclusive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Enter notes or reason for return"
                  value={returnData.notes}
                  onChange={(e) => setReturnData({ ...returnData, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Gross Amount:</span>
              <span className="font-medium">₹{grossAmount.toFixed(2)}</span>
            </div>
            <div className="space-y-2 border-t pt-3">
              <Label className="text-sm text-muted-foreground">Discount</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={discountPercent || ""}
                    onChange={(e) => handleDiscountPercentChange(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="pr-6"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountAmount || ""}
                    onChange={(e) => handleDiscountAmountChange(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="pl-6"
                  />
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                </div>
              </div>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-destructive">
                <span className="text-muted-foreground">Discount:</span>
                <span className="font-medium">-₹{discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">GST Amount:</span>
              <span className="font-medium">₹{gstAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t pt-3">
              <span className="font-semibold">Net Amount:</span>
              <span className="font-bold text-lg">₹{netAmount.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Return Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            {isSearching ? (
              <Loader2 className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
            ) : (
              <Barcode className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            )}
            <Input
              ref={searchInputRef}
              placeholder="Scan barcode or search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchResults.length > 0) {
                  handleProductSelect(searchResults[0]);
                }
              }}
              className="pl-10"
              autoComplete="off"
            />
            {showSearch && searchResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
                {searchResults.map((variant, idx) => (
                  <div
                    key={variant.id}
                    className={cn(
                      "p-3 hover:bg-muted cursor-pointer border-b last:border-b-0",
                      idx === 0 && "bg-primary/5"
                    )}
                    onClick={() => handleProductSelect(variant)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{variant.product_name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{variant.barcode}</div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {variant.brand} | Size: {variant.size} | ₹{variant.pur_price}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {lineItems.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead className="w-24">Qty</TableHead>
                    <TableHead className="w-32">Price</TableHead>
                    <TableHead className="w-20">Disc%</TableHead>
                    <TableHead className="w-24">Disc ₹</TableHead>
                    <TableHead className="w-24">GST%</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item) => (
                    <TableRow key={item.temp_id}>
                      <TableCell className="font-medium">{item.product_name}</TableCell>
                      <TableCell>{item.brand}</TableCell>
                      <TableCell>{item.size}</TableCell>
                      <TableCell>{item.barcode}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={(e) =>
                            updateLineItem(item.temp_id, "qty", parseInt(e.target.value) || 1)
                          }
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
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
                            updateLineItem(item.temp_id, "pur_price", parseFloat(e.target.value) || 0)
                          }
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          className="w-28"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={item.discount_percent}
                          onChange={(e) =>
                            updateLineItem(item.temp_id, "discount_percent", parseFloat(e.target.value) || 0)
                          }
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.discount_amount}
                          onChange={(e) =>
                            updateLineItem(item.temp_id, "discount_amount", parseFloat(e.target.value) || 0)
                          }
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          className="w-24"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={item.gst_per}
                          onChange={(e) =>
                            updateLineItem(item.temp_id, "gst_per", parseFloat(e.target.value) || 0)
                          }
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">
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
            <div className="text-center py-12 text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Search and add products to create a return</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={() => navigate("/purchase-returns")}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditMode ? "Update Return" : "Save Return"}
        </Button>
      </div>
    </div>
  );
};

export default PurchaseReturnEntry;
