import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, ShoppingCart, Plus, Trash2, CalendarIcon, Copy, Printer, ChevronDown, FileSpreadsheet } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { BackToDashboard } from "@/components/BackToDashboard";
import { printBarcodesDirectly } from "@/utils/barcodePrinter";
import { ExcelImportDialog } from "@/components/ExcelImportDialog";
import { purchaseBillFields, purchaseBillSampleData } from "@/utils/excelImportUtils";

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
  color: string;
  style: string;
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
  discount_percent: number; // discount percentage
  line_total: number; // total after discount
  brand?: string;
  category?: string;
  color?: string;
  style?: string;
}

interface SizeQuantity {
  size: string;
  qty: number;
  variant_id: string;
  barcode: string;
}

// Helper function to format product description
const formatProductDescription = (item: {
  product_name: string;
  category?: string;
  brand?: string;
  style?: string;
  color?: string;
  size: string;
}) => {
  const parts = [item.product_name];
  if (item.category) parts.push(item.category);
  if (item.brand) parts.push(item.brand);
  if (item.style) parts.push(item.style);
  if (item.color) parts.push(item.color);
  parts.push(item.size);
  return parts.join(' - ');
};

const PurchaseEntry = () => {
  const { toast } = useToast();
  const { orgNavigate: navigate } = useOrgNavigation();
  const location = useLocation();
  const { currentOrganization } = useOrganization();
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
  const [roundOff, setRoundOff] = useState(0);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [savedPurchaseItems, setSavedPurchaseItems] = useState<LineItem[]>([]);
  const firstSizeInputRef = useRef<HTMLInputElement>(null);
  const lastQtyInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [originalLineItems, setOriginalLineItems] = useState<LineItem[]>([]); // Store original items for comparison
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  const [billData, setBillData] = useState({
    supplier_id: "",
    supplier_name: "",
    supplier_invoice_no: "",
  });
  const [softwareBillNo, setSoftwareBillNo] = useState<string>("");

  // Fetch suppliers
  const { data: suppliers = [], refetch: refetchSuppliers } = useQuery({
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

  // Restore saved purchase state from sessionStorage if available
  useEffect(() => {
    const savedState = sessionStorage.getItem('purchaseEntryState');
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        setBillData(parsed.billData);
        setSoftwareBillNo(parsed.softwareBillNo);
        setBillDate(new Date(parsed.billDate));
        setLineItems(parsed.lineItems);
        setRoundOff(parsed.roundOff || 0);
        sessionStorage.removeItem('purchaseEntryState');
      } catch (error) {
        console.error('Error restoring purchase state:', error);
      }
    }
  }, []);

  // Load existing bill data if in edit mode or generate new bill number
  useEffect(() => {
    const loadOrGenerateBill = async () => {
      const billId = location.state?.editBillId;
      
      if (billId) {
        // Edit mode - load existing bill
        setIsEditMode(true);
        setEditingBillId(billId);
        setLoading(true);
        
        try {
          // Load bill header
          const { data: existingBill, error: billError } = await supabase
            .from("purchase_bills")
            .select("*")
            .eq("id", billId)
            .single();
          
          if (billError) throw billError;
          
          setBillData({
            supplier_id: existingBill.supplier_id || "",
            supplier_name: existingBill.supplier_name,
            supplier_invoice_no: existingBill.supplier_invoice_no || "",
          });
          setSoftwareBillNo(existingBill.software_bill_no || "");
          setBillDate(new Date(existingBill.bill_date));
          setRoundOff(Number(existingBill.round_off) || 0);
          
          // Load bill items - get product details from purchase_items (denormalized data)
          const { data: itemsData, error: itemsError } = await supabase
            .from("purchase_items")
            .select("*")
            .eq("bill_id", billId);
          
          if (itemsError) throw itemsError;
          
          const loadedItems: LineItem[] = itemsData.map((item: any) => ({
            temp_id: item.id, // Use actual database ID as temp_id for tracking
            product_id: item.product_id,
            sku_id: item.sku_id || "",
            product_name: item.product_name || "",
            brand: item.brand || "",
            category: item.category || "",
            color: item.color || "",
            style: item.style || "",
            size: item.size,
            qty: item.qty,
            pur_price: Number(item.pur_price),
            sale_price: Number(item.sale_price),
            gst_per: item.gst_per,
            hsn_code: item.hsn_code || "",
            barcode: item.barcode || "",
            discount_percent: 0,
            line_total: Number(item.line_total),
          }));
          
          setLineItems(loadedItems);
          setOriginalLineItems(loadedItems); // Store original items for comparison
          
          toast({
            title: "Bill Loaded",
            description: "Purchase bill loaded for editing",
          });
        } catch (error: any) {
          console.error("Error loading bill:", error);
          toast({
            title: "Error",
            description: "Failed to load purchase bill",
            variant: "destructive",
          });
          navigate("/purchase-bills");
        } finally {
          setLoading(false);
        }
      } else {
        // New bill mode - bill number will be auto-generated on save
        setSoftwareBillNo("");
      }
    };
    
    loadOrGenerateBill();
  }, [location.state?.editBillId, toast, navigate]);

  useEffect(() => {
    if (searchQuery.length >= 2) {
      searchProducts(searchQuery);
    } else {
      setSearchResults([]);
      setShowSearch(false);
    }
  }, [searchQuery]);

  // Check if returning from product creation with new product data
  useEffect(() => {
    const state = location.state as { newProduct?: any; createdSupplier?: any };
    
    if (state?.newProduct) {
      // Auto-add the newly created product
      const product = state.newProduct;
      if (product.variants && product.variants.length > 0) {
        const firstVariant = product.variants[0];
        handleProductSelect({
          id: firstVariant.id,
          product_id: product.id,
          size: firstVariant.size,
          pur_price: firstVariant.pur_price,
          sale_price: firstVariant.sale_price,
          barcode: firstVariant.barcode,
          product_name: product.product_name,
          brand: product.brand || '',
          category: product.category || '',
          color: product.color || '',
          style: product.style || '',
          gst_per: product.gst_per,
          hsn_code: product.hsn_code || '',
        });
        
        toast({
          title: "Product Added",
          description: `${product.product_name} has been added to purchase`,
        });
      }
    }

    // Handle supplier creation callback
    if (state?.createdSupplier) {
      const supplier = state.createdSupplier;
      refetchSuppliers();
      setBillData((prev) => ({
        ...prev,
        supplier_id: supplier.id,
        supplier_name: supplier.supplier_name,
      }));
      toast({
        title: "Supplier Selected",
        description: `${supplier.supplier_name} has been selected`,
      });
    }
      
    // Clear the state if any state was present
    if (state?.newProduct || state?.createdSupplier) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]);


  useEffect(() => {
    const gross = lineItems.reduce((sum, r) => sum + r.line_total, 0);
    const gst = lineItems.reduce((sum, r) => sum + (r.line_total * r.gst_per / 100), 0);
    const netBeforeRoundOff = gross + gst;
    setGrossAmount(gross);
    setGstAmount(gst);
    setNetAmount(netBeforeRoundOff + roundOff);
  }, [lineItems, roundOff]);

  const generateCentralizedBarcode = async (): Promise<string> => {
    try {
      const { data, error } = await supabase.rpc('generate_next_barcode', {
        p_organization_id: currentOrganization?.id
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error generating barcode:", error);
      toast({
        title: "Error",
        description: "Failed to generate barcode from database",
        variant: "destructive",
      });
      throw error;
    }
  };

  const searchProducts = async (query: string) => {
    if (!query || query.length < 1) {
      setSearchResults([]);
      setSelectedSearchIndex(0);
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
            category,
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
        color: v.products?.color || "",
        style: v.products?.style || "",
        gst_per: v.products?.gst_per || 0,
        hsn_code: v.products?.hsn_code || "",
      }));

      setSearchResults(results);
      setSelectedSearchIndex(0);
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
      // Focus on quantity input after adding inline row
      setTimeout(() => lastQtyInputRef.current?.focus(), 100);
    }
    setSearchQuery("");
    setShowSearch(false);
  };

  const openSizeGridModal = async (productId: string) => {
    if (!currentOrganization) return;
    
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
          category,
          color,
          style,
          hsn_code,
          gst_per,
          default_pur_price,
          default_sale_price
        )
      `)
      .eq("product_id", productId)
      .eq("organization_id", currentOrganization.id)
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
        try {
          barcode = await generateCentralizedBarcode();
          await supabase.from("product_variants").update({ barcode }).eq("id", v.id);
        } catch (error) {
          toast({
            title: "Error",
            description: "Failed to generate barcode for product",
            variant: "destructive",
          });
          return;
        }
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
        discount_percent: 0,
        brand: product.brand || "",
        category: product.category || "",
        color: product.color || "",
        style: product.style || "",
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
    const subTotal = 1 * variant.pur_price;
    const discountAmount = 0;
    const lineTotal = subTotal - discountAmount;
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
      discount_percent: 0,
      line_total: lineTotal,
      brand: variant.brand || "",
      category: variant.category || "",
      color: variant.color || "",
      style: variant.style || "",
    };
    setLineItems([...lineItems, newItem]);
  };

  const addItemRow = (item: Omit<LineItem, "temp_id" | "line_total">) => {
    const subTotal = item.qty * item.pur_price;
    const discountAmount = subTotal * (item.discount_percent / 100);
    const lineTotal = subTotal - discountAmount;
    setLineItems((prev) => [
      ...prev,
      {
        ...item,
        temp_id: Date.now().toString() + Math.random(),
        line_total: lineTotal,
      },
    ]);
  };

  const updateLineItem = (temp_id: string, field: keyof LineItem, value: any) => {
    setLineItems((items) =>
      items.map((item) => {
        if (item.temp_id === temp_id) {
          const updated = { ...item, [field]: value };
          if (field === "qty" || field === "pur_price" || field === "discount_percent") {
            const subTotal = updated.qty * updated.pur_price;
            const discountAmount = subTotal * (updated.discount_percent / 100);
            updated.line_total = subTotal - discountAmount;
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
      if (isEditMode && editingBillId) {
        // Update existing bill
        const { error: billError } = await supabase
          .from("purchase_bills")
          .update({
            supplier_id: billData.supplier_id || null,
            supplier_name: billData.supplier_name,
            supplier_invoice_no: billData.supplier_invoice_no,
            bill_date: format(billDate, "yyyy-MM-dd"),
      gross_amount: grossAmount,
      gst_amount: gstAmount,
      net_amount: netAmount,
      round_off: roundOff,
          })
          .eq("id", editingBillId);

        if (billError) throw billError;

        // =====================================================
        // INTELLIGENT LINE ITEM HANDLING
        // Compare old vs new items to determine INSERT/UPDATE/DELETE
        // =====================================================

        // Build maps for comparison
        const originalItemsMap = new Map(
          originalLineItems.map(item => [item.temp_id, item])
        );
        const currentItemsMap = new Map(
          lineItems.map(item => [item.temp_id, item])
        );

        // 1. Find items to DELETE (in original but not in current)
        const itemsToDelete = originalLineItems
          .filter(item => !currentItemsMap.has(item.temp_id))
          .map(item => item.temp_id);

        if (itemsToDelete.length > 0) {
          const { error: deleteError } = await supabase
            .from("purchase_items")
            .delete()
            .in("id", itemsToDelete);
          
          if (deleteError) throw deleteError;
          console.log(`Deleted ${itemsToDelete.length} items`);
        }

        // 2. Find items to UPDATE (exists in both, but qty/price changed)
        const itemsToUpdate = lineItems.filter(item => {
          const original = originalItemsMap.get(item.temp_id);
          if (!original) return false; // Not in original, so it's new
          
          // Check if any relevant fields changed
          return (
            original.qty !== item.qty ||
            original.pur_price !== item.pur_price ||
            original.sale_price !== item.sale_price ||
            original.gst_per !== item.gst_per
          );
        });

        for (const item of itemsToUpdate) {
          const { error: updateError } = await supabase
            .from("purchase_items")
            .update({
              qty: item.qty,
              pur_price: item.pur_price,
              sale_price: item.sale_price,
              gst_per: item.gst_per,
              line_total: item.line_total,
            })
            .eq("id", item.temp_id);
          
          if (updateError) throw updateError;
        }
        
        if (itemsToUpdate.length > 0) {
          console.log(`Updated ${itemsToUpdate.length} items`);
        }

        // 3. Find items to INSERT (new items not in original)
        const itemsToInsert = lineItems
          .filter(item => !originalItemsMap.has(item.temp_id))
          .map(item => ({
            bill_id: editingBillId,
            product_id: item.product_id,
            sku_id: item.sku_id,
            product_name: item.product_name,
            size: item.size,
            qty: item.qty,
            pur_price: item.pur_price,
            sale_price: item.sale_price,
            gst_per: item.gst_per,
            hsn_code: item.hsn_code || null,
            barcode: item.barcode || null,
            line_total: item.line_total,
            bill_number: softwareBillNo,
            brand: item.brand || null,
            category: item.category || null,
            color: item.color || null,
            style: item.style || null,
          }));

        if (itemsToInsert.length > 0) {
          const { error: insertError } = await supabase
            .from("purchase_items")
            .insert(itemsToInsert);
          
          if (insertError) throw insertError;
          console.log(`Inserted ${itemsToInsert.length} new items`);
        }

        toast({
          title: "Success",
          description: "Purchase bill updated successfully",
        });

        navigate("/purchase-bills");
      } else {
        // Insert new purchase bill
        if (!currentOrganization?.id) throw new Error("No organization selected");
        
        // Generate bill number right before saving
        const { data: newBillNo, error: billNoError } = await supabase.rpc("generate_purchase_bill_number", {
          p_date: format(billDate, "yyyy-MM-dd"),
          p_organization_id: currentOrganization.id
        });
        
        if (billNoError) throw billNoError;
        const finalBillNo = newBillNo;
        
        const { data: billDataResult, error: billError } = await supabase
          .from("purchase_bills")
          .insert([
            {
              software_bill_no: finalBillNo,
              supplier_id: billData.supplier_id || null,
              supplier_name: billData.supplier_name,
              supplier_invoice_no: billData.supplier_invoice_no,
              bill_date: format(billDate, "yyyy-MM-dd"),
              gross_amount: grossAmount,
              gst_amount: gstAmount,
              net_amount: netAmount,
              round_off: roundOff,
              organization_id: currentOrganization.id,
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
          product_name: item.product_name,
          size: item.size,
          qty: item.qty,
          pur_price: item.pur_price,
          sale_price: item.sale_price,
          gst_per: item.gst_per,
          hsn_code: item.hsn_code,
          barcode: item.barcode,
          line_total: item.line_total,
          bill_number: finalBillNo,
          brand: item.brand || null,
          category: item.category || null,
          color: item.color || null,
          style: item.style || null,
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

        // Reset form and generate new bill number
        setBillData({
          supplier_id: "",
          supplier_name: "",
          supplier_invoice_no: "",
        });
        setBillDate(new Date());
        setLineItems([]);
        setRoundOff(0);
        setSoftwareBillNo(""); // Reset for next entry
      }
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

  const totals = { 
    totalQty: lineItems.reduce((sum, item) => sum + item.qty, 0),
    totalDiscount: lineItems.reduce((sum, item) => {
      const subTotal = item.qty * item.pur_price;
      return sum + (subTotal * (item.discount_percent / 100));
    }, 0),
    grossAmount, 
    gstAmount, 
    netAmount 
  };

  const handlePrintBarcodes = async () => {
    if (lineItems.length === 0) {
      toast({
        title: "No Items",
        description: "Add items to print barcodes",
        variant: "destructive",
      });
      return;
    }

    try {
      // Fetch supplier code
      let supplierCode = "";
      if (billData.supplier_id) {
        const { data: supplierData } = await supabase
          .from("suppliers")
          .select("supplier_code")
          .eq("id", billData.supplier_id)
          .single();
        
        supplierCode = supplierData?.supplier_code || "";
      }

      // Format items for barcode printing page
      const barcodeItems = lineItems.map((item) => ({
        sku_id: item.sku_id,
        product_name: item.product_name || "",
        brand: item.brand || "",
        category: item.category || "",
        color: item.color || "",
        style: item.style || "",
        size: item.size,
        sale_price: item.sale_price,
        barcode: item.barcode,
        qty: item.qty,
        bill_number: softwareBillNo || "",
        supplier_code: supplierCode,
      }));

      // Navigate to barcode printing page with items
      navigate("/barcode-printing", { 
        state: { purchaseItems: barcodeItems } 
      });
    } catch (error) {
      console.error("Error preparing barcode data:", error);
      toast({
        title: "Error",
        description: "Failed to prepare barcode data",
        variant: "destructive",
      });
    }
  };

  // Handle Excel import for purchase bill
  const handleExcelImport = async (mappedData: Record<string, any>[]) => {
    if (!currentOrganization) return;
    
    setImportLoading(true);
    try {
      const newLineItems: LineItem[] = [];
      
      for (const row of mappedData) {
        // Skip rows without required fields
        if (!row.product_name || !row.size || !row.qty || row.qty <= 0) continue;
        
        // Generate barcode if not provided
        let barcode = row.barcode || '';
        if (!barcode) {
          const { data: barcodeData, error: barcodeError } = await supabase.rpc(
            'generate_next_barcode',
            { p_organization_id: currentOrganization.id }
          );
          if (barcodeError) throw barcodeError;
          barcode = barcodeData;
        }
        
        // Check if product already exists
        const { data: existingProducts } = await supabase
          .from('products')
          .select('id')
          .eq('organization_id', currentOrganization.id)
          .eq('product_name', row.product_name)
          .eq('brand', row.brand || '')
          .eq('category', row.category || '')
          .eq('color', row.color || '')
          .eq('style', row.style || '')
          .limit(1);
        
        let productId = existingProducts?.[0]?.id;
        
        // Create product if it doesn't exist
        if (!productId) {
          const { data: newProduct, error: productError } = await supabase
            .from('products')
            .insert({
              organization_id: currentOrganization.id,
              product_name: row.product_name,
              category: row.category || null,
              brand: row.brand || null,
              style: row.style || null,
              color: row.color || null,
              hsn_code: row.hsn_code || null,
              gst_per: Number(row.gst_per) || 0,
              default_pur_price: Number(row.pur_price) || 0,
              default_sale_price: Number(row.sale_price) || 0,
              status: 'active',
            })
            .select('id')
            .single();
          
          if (productError) throw productError;
          productId = newProduct.id;
        }
        
        // Check if variant already exists
        const { data: existingVariants } = await supabase
          .from('product_variants')
          .select('id')
          .eq('organization_id', currentOrganization.id)
          .eq('product_id', productId)
          .eq('size', row.size)
          .limit(1);
        
        let skuId = existingVariants?.[0]?.id;
        
        // Create variant if it doesn't exist
        if (!skuId) {
          const { data: newVariant, error: variantError } = await supabase
            .from('product_variants')
            .insert({
              organization_id: currentOrganization.id,
              product_id: productId,
              size: row.size,
              barcode: barcode,
              pur_price: Number(row.pur_price) || 0,
              sale_price: Number(row.sale_price) || 0,
              stock_qty: 0,
              active: true,
            })
            .select('id')
            .single();
          
          if (variantError) throw variantError;
          skuId = newVariant.id;
        }
        
        const lineTotal = Number(row.qty) * Number(row.pur_price);
        
        newLineItems.push({
          temp_id: `import_${Date.now()}_${Math.random()}`,
          product_id: productId,
          sku_id: skuId,
          product_name: row.product_name,
          size: row.size,
          qty: Number(row.qty) || 0,
          pur_price: Number(row.pur_price) || 0,
          sale_price: Number(row.sale_price) || 0,
          gst_per: Number(row.gst_per) || 0,
          hsn_code: row.hsn_code || '',
          barcode: barcode,
          discount_percent: 0,
          line_total: lineTotal,
          brand: row.brand,
          category: row.category,
          color: row.color,
          style: row.style,
        });
      }
      
      setLineItems(prev => [...prev, ...newLineItems]);
      toast({
        title: "Import Successful",
        description: `Added ${newLineItems.length} items from Excel`,
      });
    } catch (error: any) {
      console.error("Import error:", error);
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import Excel data",
        variant: "destructive",
      });
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <BackToDashboard label="Back to Purchase Dashboard" to="/purchase-bills" />
        <div className="mb-6 flex items-center gap-3">
          <ShoppingCart className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">
            {isEditMode ? "Edit Purchase Bill" : "Purchase Entry"}
          </h1>
        </div>

        <Card className="shadow-lg border-border mb-6">
          <CardHeader>
            <CardTitle>Bill Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="software_bill_no">Software Bill No</Label>
                <Input
                  id="software_bill_no"
                  value={isEditMode ? softwareBillNo : "(Auto-generated on save)"}
                  readOnly
                  className="bg-muted"
                  placeholder="Auto-generated"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier_name">Supplier *</Label>
                <div className="flex gap-2">
                  <Select
                    value={billData.supplier_id}
                    onValueChange={(value) => {
                      const supplier = suppliers.find(s => s.id === value);
                      setBillData({ 
                        ...billData, 
                        supplier_id: value,
                        supplier_name: supplier?.supplier_name || ""
                      });
                    }}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50">
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.supplier_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => navigate("/suppliers", { state: { returnTo: "/purchase-entry" } })}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
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
                  onClick={() => setShowExcelImport(true)}
                  variant="outline"
                  className="gap-2"
                  disabled={importLoading}
                >
                  {importLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4" />
                  )}
                  Import Excel
                </Button>
                <Button
                  onClick={() => {
                    // Save current state before navigating
                    const stateToSave = {
                      billData,
                      softwareBillNo,
                      billDate: billDate.toISOString(),
                      lineItems,
                      roundOff,
                    };
                    sessionStorage.setItem('purchaseEntryState', JSON.stringify(stateToSave));
                    navigate('/product-entry', { state: { returnToPurchase: true } });
                  }}
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
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (searchResults.length === 0) return;
                      
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setSelectedSearchIndex(prev => 
                          prev < searchResults.length - 1 ? prev + 1 : 0
                        );
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setSelectedSearchIndex(prev => 
                          prev > 0 ? prev - 1 : searchResults.length - 1
                        );
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        handleProductSelect(searchResults[selectedSearchIndex]);
                      }
                    }}
                    placeholder="Search by product, brand, style, or barcode..."
                    className="pr-10"
                  />
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  {showSearch && searchResults.length > 0 && (
                    <div className="absolute top-full mt-1 w-full bg-popover border border-border rounded-md shadow-lg z-[100] max-h-80 overflow-auto">
                      {searchResults.map((result, idx) => (
                        <button
                          key={result.product_id + idx}
                          onClick={() => handleProductSelect(result)}
                          onMouseEnter={() => setSelectedSearchIndex(idx)}
                          className={cn(
                            "w-full text-left px-4 py-3 text-popover-foreground border-b border-border last:border-0 transition-colors",
                            idx === selectedSearchIndex ? "bg-accent" : "hover:bg-accent/50"
                          )}
                        >
                          <div className="font-medium">
                            {formatProductDescription({
                              product_name: result.product_name,
                              category: result.category,
                              brand: result.brand,
                              style: result.style,
                              color: result.color,
                              size: result.size
                            })}
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
                      <TableHead className="w-32">BARCODE</TableHead>
                      <TableHead className="w-20">QTY</TableHead>
                      <TableHead className="w-28">PUR.RATE</TableHead>
                      <TableHead className="w-28">SALE.RATE</TableHead>
                      <TableHead className="w-28">SUB TOTAL</TableHead>
                      <TableHead className="w-24">DISC %</TableHead>
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
                            {formatProductDescription(item)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-xs">
                              {item.barcode || "—"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Input
                              ref={index === lineItems.length - 1 ? lastQtyInputRef : undefined}
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
                              max="100"
                              step="0.01"
                              value={item.discount_percent}
                              onChange={(e) =>
                                updateLineItem(
                                  item.temp_id,
                                  "discount_percent",
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
                  <span className="text-muted-foreground">Total Qty:</span>
                  <span className="font-semibold">{totals.totalQty}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gross Amount:</span>
                  <span className="font-semibold">₹{totals.grossAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Discount:</span>
                  <span className="font-semibold text-destructive">-₹{totals.totalDiscount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GST Amount:</span>
                  <span className="font-semibold">₹{totals.gstAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground">Round Off:</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={roundOff}
                    onChange={(e) => setRoundOff(parseFloat(e.target.value) || 0)}
                    className="w-28 text-right"
                    placeholder="0.00"
                  />
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

        <div className="flex justify-end gap-3">
          <Button
            onClick={handlePrintBarcodes}
            disabled={lineItems.length === 0}
            size="lg"
            variant="outline"
            className="gap-2 min-w-[150px]"
          >
            <Printer className="h-4 w-4" />
            Print Barcodes
          </Button>
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
                          try {
                            barcode = await generateCentralizedBarcode();
                            await supabase
                              .from("product_variants")
                              .update({ barcode })
                              .eq("id", variant.id);
                          } catch (error) {
                            toast({
                              title: "Error",
                              description: `Failed to generate barcode for size ${size}`,
                              variant: "destructive",
                            });
                            continue; // Skip this variant
                          }
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
                          discount_percent: 0,
                          brand: selectedProduct.brand || "",
                          category: selectedProduct.category || "",
                          color: selectedProduct.color || "",
                          style: selectedProduct.style || "",
                        });
                      }
                    }

                    setShowSizeGrid(false);
                    setSizeQty({});
                    
                    // Focus on the first new item's quantity input
                    setTimeout(() => lastQtyInputRef.current?.focus(), 100);
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
                  onClick={async () => {
                    try {
                      // Fetch supplier code
                      let supplierCode = "";
                      if (billData.supplier_id) {
                        const { data: supplierData } = await supabase
                          .from("suppliers")
                          .select("supplier_code")
                          .eq("id", billData.supplier_id)
                          .single();
                        
                        supplierCode = supplierData?.supplier_code || "";
                      }

                      // Transform items to barcode format
                      const barcodeItems = savedPurchaseItems.map(item => ({
                        sku_id: item.sku_id,
                        product_name: item.product_name || "",
                        brand: item.brand || "",
                        category: item.category || "",
                        color: item.color || "",
                        style: item.style || "",
                        size: item.size,
                        sale_price: item.sale_price,
                        barcode: item.barcode,
                        qty: item.qty,
                        bill_number: softwareBillNo || "",
                        supplier_code: supplierCode,
                      }));

                      setShowPrintDialog(false);

                      // Navigate to barcode printing page
                      navigate("/barcode-printing", { 
                        state: { purchaseItems: barcodeItems } 
                      });
                    } catch (error) {
                      console.error("Error preparing barcode data:", error);
                      toast({
                        title: "Error",
                        description: "Failed to prepare barcode data",
                        variant: "destructive",
                      });
                    }
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

        {/* Excel Import Dialog */}
        <ExcelImportDialog
          open={showExcelImport}
          onClose={() => setShowExcelImport(false)}
          targetFields={purchaseBillFields}
          onImport={handleExcelImport}
          title="Import Purchase Bill from Excel"
          sampleData={purchaseBillSampleData}
          sampleFileName="Purchase_Bill_Sample.xlsx"
        />
      </div>
    </div>
  );
};

export default PurchaseEntry;
