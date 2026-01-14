import { useState, useEffect, useRef, useCallback } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, ShoppingCart, Plus, X, CalendarIcon, Copy, Printer, ChevronDown, FileSpreadsheet } from "lucide-react";
import { format } from "date-fns";
import { cn, sortSearchResults } from "@/lib/utils";
import { BackToDashboard } from "@/components/BackToDashboard";
import { printBarcodesDirectly } from "@/utils/barcodePrinter";
import { ExcelImportDialog, ImportProgress } from "@/components/ExcelImportDialog";
import { purchaseBillFields, purchaseBillSampleData, parseExcelDate } from "@/utils/excelImportUtils";
import { validatePurchaseBill } from "@/lib/validations";
import { SizeGridDialog } from "@/components/SizeGridDialog";
import { ProductEntryDialog } from "@/components/ProductEntryDialog";
import { PriceUpdateConfirmDialog } from "@/components/PriceUpdateConfirmDialog";
import { useDraftSave } from "@/hooks/useDraftSave";

interface PriceChange {
  sku_id: string;
  product_name: string;
  size: string;
  barcode: string;
  field: "pur_price" | "sale_price" | "mrp";
  old_value: number;
  new_value: number;
}

interface ProductVariant {
  id: string;
  product_id: string;
  size: string;
  pur_price: number;
  sale_price: number;
  mrp?: number;
  barcode: string;
  product_name: string;
  brand: string;
  category: string;
  color: string;
  style: string;
  gst_per: number;
  hsn_code: string;
  size_range?: string | null;
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
  mrp?: number;
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
  if (item.brand) parts.push(item.brand);
  if (item.category) parts.push(item.category);
  if (item.style) parts.push(item.style);
  if (item.color) parts.push(item.color);
  parts.push(item.size);
  return parts.join(' | ');
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
  const [discountAmount, setDiscountAmount] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);
  const [roundOff, setRoundOff] = useState(0);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [savedPurchaseItems, setSavedPurchaseItems] = useState<LineItem[]>([]);
  const firstSizeInputRef = useRef<HTMLInputElement>(null);
  const lastQtyInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const inlineSearchInputRef = useRef<HTMLInputElement>(null);
  const isNavigatingForProductRef = useRef(false); // Track navigation to product entry
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [originalLineItems, setOriginalLineItems] = useState<LineItem[]>([]); // Store original items for comparison
  const initialDraftCheckDone = useRef(false); // Track if initial draft check was done
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [showProductDialog, setShowProductDialog] = useState(false);
  // Inline search state for table row
  const [inlineSearchQuery, setInlineSearchQuery] = useState("");
  const [inlineSearchResults, setInlineSearchResults] = useState<ProductVariant[]>([]);
  const [showInlineSearch, setShowInlineSearch] = useState(false);
  const [selectedInlineIndex, setSelectedInlineIndex] = useState(0);
  
  
  // Price update confirmation state
  const [showPriceUpdateDialog, setShowPriceUpdateDialog] = useState(false);
  const [detectedPriceChanges, setDetectedPriceChanges] = useState<PriceChange[]>([]);
  
  // State for selective barcode printing
  const [selectedForPrint, setSelectedForPrint] = useState<Set<string>>(new Set());
  const [pendingSaveItems, setPendingSaveItems] = useState<LineItem[]>([]);
  
  // State for tracking newly added items for smart barcode printing
  const [newlyAddedItems, setNewlyAddedItems] = useState<LineItem[]>([]);
  const [savedBillId, setSavedBillId] = useState<string | null>(null);

  const [billData, setBillData] = useState({
    supplier_id: "",
    supplier_name: "",
    supplier_invoice_no: "",
  });
  const [softwareBillNo, setSoftwareBillNo] = useState<string>("");

  // Draft save hook for auto-saving work in progress
  const {
    hasDraft,
    draftData,
    saveDraft,
    deleteDraft,
    updateCurrentData,
    startAutoSave,
    stopAutoSave,
  } = useDraftSave('purchase');

  // Load draft data callback
  const loadDraftData = useCallback((data: any) => {
    if (!data) return;
    setBillData(data.billData || { supplier_id: "", supplier_name: "", supplier_invoice_no: "" });
    setSoftwareBillNo(data.softwareBillNo || "");
    setBillDate(data.billDate ? new Date(data.billDate) : new Date());
    setLineItems(data.lineItems || []);
    setOtherCharges(data.otherCharges || 0);
    setRoundOff(data.roundOff || 0);
    setEntryMode(data.entryMode || "grid");
    // Restore edit mode if draft was from an edit
    if (data.isEditMode && data.editingBillId) {
      setIsEditMode(true);
      setEditingBillId(data.editingBillId);
      setOriginalLineItems(data.originalLineItems || []);
    }
    toast({
      title: "Draft Loaded",
      description: "Your previous work has been restored",
    });
  }, [toast]);

  // Load draft automatically if navigated from dashboard with loadDraft flag
  useEffect(() => {
    if (location.state?.loadDraft && hasDraft && draftData && !initialDraftCheckDone.current) {
      initialDraftCheckDone.current = true;
      loadDraftData(draftData);
      deleteDraft(); // Clear the draft from database after loading
    }
  }, [location.state?.loadDraft, hasDraft, draftData, loadDraftData, deleteDraft]);

  // Update current data for auto-save whenever form data changes (works in both new and edit mode)
  useEffect(() => {
    if (lineItems.length > 0) {
      updateCurrentData({
        billData,
        softwareBillNo,
        billDate: billDate.toISOString(),
        lineItems,
        roundOff,
        entryMode,
        isEditMode,
        editingBillId,
        originalLineItems,
      });
    } else {
      // Clear data when no items (prevents stale draft)
      updateCurrentData(null);
    }
  }, [billData, softwareBillNo, billDate, lineItems, roundOff, entryMode, isEditMode, editingBillId, originalLineItems, updateCurrentData]);

  // Start auto-save (works for both new and edit mode)
  useEffect(() => {
    startAutoSave();
    return () => {
      // Don't save draft if navigating to product entry (sessionStorage handles this)
      if (lineItems.length > 0 && !isNavigatingForProductRef.current) {
        saveDraft({
          billData,
          softwareBillNo,
          billDate: billDate.toISOString(),
          lineItems,
          roundOff,
          entryMode,
          isEditMode,
          editingBillId,
          originalLineItems,
        }, false);
      }
      stopAutoSave();
    };
  }, [startAutoSave, stopAutoSave, billData, softwareBillNo, billDate, lineItems, roundOff, entryMode, isEditMode, editingBillId, originalLineItems, saveDraft]);

  // Fetch settings
  const { data: settings } = useQuery({
    queryKey: ["settings", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("purchase_settings, product_settings")
        .eq("organization_id", currentOrganization?.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  const showMrp = (settings?.purchase_settings as any)?.show_mrp || false;
  
  // Check if color field is enabled in product settings
  const isColorFieldEnabled = (() => {
    const productSettings = settings?.product_settings as any;
    if (!productSettings?.fields) return true; // Default to enabled if no settings
    return productSettings.fields.color?.enabled !== false;
  })();

  // Fetch suppliers with pagination
  const { data: suppliers = [], refetch: refetchSuppliers } = useQuery({
    queryKey: ["suppliers", currentOrganization?.id],
    queryFn: async () => {
      const allSuppliers: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from("suppliers")
          .select("*")
          .eq("organization_id", currentOrganization?.id)
          .is("deleted_at", null)
          .order("supplier_name")
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allSuppliers.push(...data);
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }
      return allSuppliers;
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch last purchase bill for reference
  const { data: lastPurchaseBill } = useQuery({
    queryKey: ["last-purchase-bill", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_bills")
        .select("software_bill_no, supplier_invoice_no, supplier_name, bill_date")
        .eq("organization_id", currentOrganization?.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows found
      return data;
    },
    enabled: !!currentOrganization?.id && !isEditMode,
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
        // Restore edit mode state if it was saved
        if (parsed.isEditMode) {
          setIsEditMode(true);
          setEditingBillId(parsed.editingBillId);
          setOriginalLineItems(parsed.originalLineItems || []);
        }
        sessionStorage.removeItem('purchaseEntryState');
        deleteDraft();
      } catch (error) {
        console.error('Error restoring purchase state:', error);
      }
    }
  }, []);

  // Load existing bill data if in edit mode or generate new bill number
  useEffect(() => {
    const loadOrGenerateBill = async () => {
      // Skip loading bill from DB when resuming from a draft (draft already contains the latest state)
      if (location.state?.loadDraft) {
        return;
      }

      // Skip if we already restored edit mode from sessionStorage
      if (isEditMode && editingBillId && !location.state?.editBillId) {
        return; // Edit mode was restored from sessionStorage, don't reload
      }

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

          // Fetch product details to fill in missing style/brand/category for older records
          const productIds = [...new Set(itemsData.map((item: any) => item.product_id).filter(Boolean))];
          let productDetailsMap = new Map<string, { brand: string; category: string; style: string; color: string }>();
          
          if (productIds.length > 0) {
            const { data: productsData } = await supabase
              .from("products")
              .select("id, brand, category, style, color")
              .in("id", productIds);
            
            if (productsData) {
              productsData.forEach((p: any) => {
                productDetailsMap.set(p.id, {
                  brand: p.brand || "",
                  category: p.category || "",
                  style: p.style || "",
                  color: p.color || "",
                });
              });
            }
          }
          
          const loadedItems: LineItem[] = itemsData.map((item: any) => {
            const productDetails = productDetailsMap.get(item.product_id);
            return {
              temp_id: item.id, // Use actual database ID as temp_id for tracking
              product_id: item.product_id,
              sku_id: item.sku_id || "",
              product_name: item.product_name || "",
              brand: item.brand || productDetails?.brand || "",
              category: item.category || productDetails?.category || "",
              color: item.color || productDetails?.color || "",
              style: item.style || productDetails?.style || "",
              size: item.size,
              qty: item.qty,
              pur_price: Number(item.pur_price),
              sale_price: Number(item.sale_price),
              mrp: Number(item.mrp) || 0,
              gst_per: item.gst_per,
              hsn_code: item.hsn_code || "",
              barcode: item.barcode || "",
              discount_percent: 0,
              line_total: Number(item.line_total),
            };
          });
          
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
      } else if (!isEditMode) {
        // New bill mode - bill number will be auto-generated on save
        setSoftwareBillNo("");
      }
    };
    
    loadOrGenerateBill();
  }, [location.state?.editBillId, toast, navigate, isEditMode, editingBillId]);

  useEffect(() => {
    if (searchQuery.length >= 1) {
      searchProducts(searchQuery);
    } else {
      setSearchResults([]);
      setShowSearch(false);
    }
  }, [searchQuery]);

  // Inline search effect for table row
  useEffect(() => {
    if (inlineSearchQuery.length >= 1) {
      searchProductsInline(inlineSearchQuery);
    } else {
      setInlineSearchResults([]);
      if (inlineSearchQuery.length > 0 && inlineSearchQuery.length < 1) {
        setShowInlineSearch(true);
      } else {
        setShowInlineSearch(false);
      }
    }
  }, [inlineSearchQuery]);

  const searchProductsInline = async (query: string) => {
    if (!query || query.length < 1) {
      setInlineSearchResults([]);
      setSelectedInlineIndex(0);
      return;
    }

    try {
      // First, search products by name, brand, and style - include size_group_id
      const { data: matchingProducts } = await supabase
        .from("products")
        .select("id, size_group_id")
        .eq("organization_id", currentOrganization?.id)
        .is("deleted_at", null)
        .or(`product_name.ilike.%${query}%,brand.ilike.%${query}%,style.ilike.%${query}%`);

      const productIds = matchingProducts?.map(p => p.id) || [];
      const sizeGroupIds = [...new Set(matchingProducts?.map(p => p.size_group_id).filter(Boolean) || [])];

      // Fetch size groups for these products
      let sizeGroupsMap: Record<string, { group_name: string; sizes: string[] }> = {};
      if (sizeGroupIds.length > 0) {
        const { data: sizeGroups } = await supabase
          .from("size_groups")
          .select("id, group_name, sizes")
          .in("id", sizeGroupIds);
        
        if (sizeGroups) {
          sizeGroups.forEach((sg: any) => {
            sizeGroupsMap[sg.id] = { group_name: sg.group_name, sizes: sg.sizes || [] };
          });
        }
      }

      // Then search product_variants by barcode OR matching product IDs
      let variantsQuery = supabase
        .from("product_variants")
        .select(`
          id,
          size,
          pur_price,
          sale_price,
          mrp,
          barcode,
          active,
          color,
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
            default_sale_price,
            size_group_id
          )
        `)
        .eq("organization_id", currentOrganization?.id)
        .eq("active", true)
        .is("deleted_at", null);

      // Add barcode or product_id filters
      if (productIds.length > 0) {
        variantsQuery = variantsQuery.or(`barcode.ilike.%${query}%,product_id.in.(${productIds.join(",")})`);
      } else {
        variantsQuery = variantsQuery.ilike("barcode", `%${query}%`);
      }

      const { data, error } = await variantsQuery.limit(50);

      if (error) throw error;

      // Also fetch size groups for barcode-matched products that weren't in the initial search
      const additionalSizeGroupIds = [...new Set(
        (data || [])
          .map((v: any) => v.products?.size_group_id)
          .filter((id: string) => id && !sizeGroupsMap[id])
      )];
      
      if (additionalSizeGroupIds.length > 0) {
        const { data: additionalSizeGroups } = await supabase
          .from("size_groups")
          .select("id, group_name, sizes")
          .in("id", additionalSizeGroupIds);
        
        if (additionalSizeGroups) {
          additionalSizeGroups.forEach((sg: any) => {
            sizeGroupsMap[sg.id] = { group_name: sg.group_name, sizes: sg.sizes || [] };
          });
        }
      }

      const results = (data || []).map((v: any) => {
        const sizeGroupId = v.products?.size_group_id;
        const sizeGroup = sizeGroupId ? sizeGroupsMap[sizeGroupId] : null;
        const sizeRange = sizeGroup && Array.isArray(sizeGroup.sizes) && sizeGroup.sizes.length > 1
          ? `${sizeGroup.sizes[0]}-${sizeGroup.sizes[sizeGroup.sizes.length - 1]}`
          : sizeGroup?.sizes?.[0] || null;
        
        return {
          id: v.id,
          product_id: v.products?.id || "",
          size: v.size,
          pur_price: v.pur_price,
          sale_price: v.sale_price,
          mrp: v.mrp || 0,
          barcode: v.barcode || "",
          product_name: v.products?.product_name || "",
          brand: v.products?.brand || "",
          category: v.products?.category || "",
          color: v.color || v.products?.color || "",
          style: v.products?.style || "",
          gst_per: v.products?.gst_per || 0,
          hsn_code: v.products?.hsn_code || "",
          size_range: sizeRange,
        };
      });

      // Apply smart sorting
      const sortedResults = sortSearchResults(results, query, {
        barcode: 'barcode',
        style: 'style',
        productName: 'product_name',
      });

      setInlineSearchResults(sortedResults);
      setSelectedInlineIndex(0);
      setShowInlineSearch(true);
    } catch (error: any) {
      console.error(error);
    }
  };

  const handleInlineProductSelect = async (variant: ProductVariant) => {
    setInlineSearchQuery("");
    setShowInlineSearch(false);
    setInlineSearchResults([]);
    
    if (entryMode === "grid") {
      // For Size Grid mode - open size grid, focus will be handled by handleSizeGridConfirm
      openSizeGridModal(variant.product_id);
    } else {
      // For Free Size mode - add row and focus on QTY field
      addInlineRow(variant);
      setTimeout(() => {
        lastQtyInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        lastQtyInputRef.current?.focus();
      }, 100);
    }
  };

  const handleAddNewProductFromInline = () => {
    // Open the floating product entry dialog instead of navigating
    setShowProductDialog(true);
  };

  // Handle product created from dialog - auto open size grid
  const handleProductCreated = async (product: {
    id: string;
    product_name: string;
    brand: string | null;
    category: string | null;
    gst_per: number;
    hsn_code: string | null;
    color: string | null;
    variants: any[];
  }) => {
    if (product.variants && product.variants.length > 0) {
      // Map variants for SizeGridDialog
      const mappedVariants = product.variants.map((v: any) => ({
        id: v.id,
        size: v.size,
        sale_price: v.sale_price,
        pur_price: v.pur_price,
        mrp: v.mrp || v.sale_price || 0,
        barcode: v.barcode,
        color: v.color || product.color || "",
        stock_qty: v.stock_qty || 0,
      }));

      // Set up and open the size grid
      setSelectedProduct({
        id: product.id,
        product_name: product.product_name,
        brand: product.brand,
        category: product.category,
        gst_per: product.gst_per,
        hsn_code: product.hsn_code,
        color: product.color,
      });
      setSizeGridVariants(mappedVariants);
      setSizeQty({});
      setShowSizeGrid(true);

      toast({
        title: "Product Created",
        description: `${product.product_name} created. Enter quantities in the size grid.`,
      });
    } else {
      toast({
        title: "Product Created",
        description: `${product.product_name} created successfully.`,
      });
    }
  };

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
      
    // Clear the state if any state was present - use window.history to avoid re-prefixing orgSlug
    if (state?.newProduct || state?.createdSupplier) {
      window.history.replaceState({}, '', location.pathname);
    }
  }, [location.state]);


  useEffect(() => {
    const gross = lineItems.reduce((sum, r) => sum + r.line_total, 0);
    const grossAfterDiscount = gross - discountAmount;
    const gst = lineItems.reduce((sum, r) => sum + (r.line_total * r.gst_per / 100), 0);
    const netBeforeRoundOff = grossAfterDiscount + gst + otherCharges;
    setGrossAmount(gross);
    setGstAmount(gst);
    setNetAmount(netBeforeRoundOff + roundOff);
  }, [lineItems, roundOff, discountAmount, otherCharges]);

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

  // AbortController ref to cancel in-flight search requests
  const searchAbortControllerRef = useRef<AbortController | null>(null);

  const searchProducts = async (query: string) => {
    // Cancel any previous search request
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }
    
    // Create new abort controller for this search
    searchAbortControllerRef.current = new AbortController();
    const currentController = searchAbortControllerRef.current;

    if (!query || query.length < 1) {
      setSearchResults([]);
      setSelectedSearchIndex(0);
      return;
    }

    try {
      // First, search products by name, brand, and style - include size_group_id
      const { data: matchingProducts } = await supabase
        .from("products")
        .select("id, size_group_id")
        .is("deleted_at", null)
        .or(`product_name.ilike.%${query}%,brand.ilike.%${query}%,style.ilike.%${query}%`);

      // Check if aborted before continuing
      if (currentController.signal.aborted) return;

      const productIds = matchingProducts?.map(p => p.id) || [];
      const sizeGroupIds = [...new Set(matchingProducts?.map(p => p.size_group_id).filter(Boolean) || [])];

      // Fetch size groups for these products
      let sizeGroupsMap: Record<string, { group_name: string; sizes: string[] }> = {};
      if (sizeGroupIds.length > 0) {
        const { data: sizeGroups } = await supabase
          .from("size_groups")
          .select("id, group_name, sizes")
          .in("id", sizeGroupIds);
        
        if (currentController.signal.aborted) return;
        
        if (sizeGroups) {
          sizeGroups.forEach((sg: any) => {
            sizeGroupsMap[sg.id] = { group_name: sg.group_name, sizes: sg.sizes || [] };
          });
        }
      }

      // Then search product_variants by barcode OR matching product IDs
      let variantsQuery = supabase
        .from("product_variants")
        .select(`
          id,
          size,
          pur_price,
          sale_price,
          mrp,
          barcode,
          active,
          color,
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
            default_sale_price,
            size_group_id
          )
        `)
        .eq("active", true)
        .is("deleted_at", null);

      // Add barcode or product_id filters
      if (productIds.length > 0) {
        variantsQuery = variantsQuery.or(`barcode.ilike.%${query}%,product_id.in.(${productIds.join(",")})`);
      } else {
        variantsQuery = variantsQuery.ilike("barcode", `%${query}%`);
      }

      const { data, error } = await variantsQuery;

      // Check if aborted before setting state
      if (currentController.signal.aborted) return;

      if (error) throw error;

      // Also fetch size groups for barcode-matched products that weren't in the initial search
      const additionalSizeGroupIds = [...new Set(
        (data || [])
          .map((v: any) => v.products?.size_group_id)
          .filter((id: string) => id && !sizeGroupsMap[id])
      )];
      
      if (additionalSizeGroupIds.length > 0) {
        const { data: additionalSizeGroups } = await supabase
          .from("size_groups")
          .select("id, group_name, sizes")
          .in("id", additionalSizeGroupIds);
        
        if (currentController.signal.aborted) return;
        
        if (additionalSizeGroups) {
          additionalSizeGroups.forEach((sg: any) => {
            sizeGroupsMap[sg.id] = { group_name: sg.group_name, sizes: sg.sizes || [] };
          });
        }
      }

      const results = (data || []).map((v: any) => {
        const sizeGroupId = v.products?.size_group_id;
        const sizeGroup = sizeGroupId ? sizeGroupsMap[sizeGroupId] : null;
        const sizeRange = sizeGroup && Array.isArray(sizeGroup.sizes) && sizeGroup.sizes.length > 1
          ? `${sizeGroup.sizes[0]}-${sizeGroup.sizes[sizeGroup.sizes.length - 1]}`
          : sizeGroup?.sizes?.[0] || null;
        
        return {
          id: v.id,
          product_id: v.products?.id || "",
          size: v.size,
          pur_price: v.pur_price,
          sale_price: v.sale_price,
          mrp: v.mrp || 0,
          barcode: v.barcode || "",
          product_name: v.products?.product_name || "",
          brand: v.products?.brand || "",
          category: v.products?.category || "",
          color: v.color || v.products?.color || "",
          style: v.products?.style || "",
          gst_per: v.products?.gst_per || 0,
          hsn_code: v.products?.hsn_code || "",
          size_range: sizeRange,
        };
      });

      // Apply smart sorting
      const sortedResults = sortSearchResults(results, query, {
        barcode: 'barcode',
        style: 'style',
        productName: 'product_name',
      });

      // Final abort check before setting state
      if (currentController.signal.aborted) return;

      setSearchResults(sortedResults);
      setSelectedSearchIndex(0);
      setShowSearch(true);
    } catch (error: any) {
      // Ignore abort errors
      if (error.name === 'AbortError') return;
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to search products",
        variant: "destructive",
      });
    }
  };

  const handleProductSelect = async (variant: ProductVariant) => {
    // CRITICAL: Abort any pending search requests first to prevent race condition
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
      searchAbortControllerRef.current = null;
    }
    
    // Clear search state immediately before opening dialogs
    setSearchQuery("");
    setSearchResults([]);
    setShowSearch(false);

    if (entryMode === "grid") {
      openSizeGridModal(variant.product_id);
    } else {
      addInlineRow(variant);
      // Scroll to and focus on quantity input after adding inline row
      setTimeout(() => {
        lastQtyInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        lastQtyInputRef.current?.focus();
      }, 100);
    }
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
        mrp,
        barcode,
        active,
        color,
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
        mrp: v.mrp || 0,
        gst_per: product.gst_per || 0,
        hsn_code: product.hsn_code || "",
        barcode: barcode,
        discount_percent: 0,
        brand: product.brand || "",
        category: product.category || "",
        color: v.color || product.color || "",
        style: product.style || "",
      });
      return;
    }

    // Map variants with color info for SizeGridDialog
    const mappedVariants = data.map((v: any) => ({
      id: v.id,
      size: v.size,
      sale_price: v.sale_price || v.products?.default_sale_price,
      pur_price: v.pur_price || v.products?.default_pur_price,
      mrp: v.mrp || 0,
      barcode: v.barcode,
      color: v.color || v.products?.color || "",
    }));

    // Show size grid modal
    setSelectedProduct(data[0].products);
    setSizeGridVariants(mappedVariants);
    setSizeQty({});
    setShowSizeGrid(true);
  };

  // Handle confirmation from SizeGridDialog
  const handleSizeGridConfirm = async (items: Array<{ variant: any; qty: number }>, newColor?: string) => {
    for (const { variant, qty } of items) {
      let barcode = variant.barcode || "";
      let skuId = variant.id;
      
      // Check if this is for a new color - need to create variants for all sizes
      const isNewColorVariant = newColor && variant.isCustomSize;
      
      // Check if this is a custom/new size that needs to be created
      if (variant.isCustomSize || isNewColorVariant) {
        try {
          // Generate barcode for new variant
          barcode = await generateCentralizedBarcode();
          
          // Create new product variant
          const { data: newVariant, error: createError } = await supabase
            .from("product_variants")
            .insert({
              product_id: selectedProduct.id,
              organization_id: currentOrganization?.id,
              size: variant.size,
              color: newColor || variant.color || selectedProduct.color || null,
              pur_price: variant.pur_price || selectedProduct.default_pur_price || 0,
              sale_price: variant.sale_price || selectedProduct.default_sale_price || 0,
              mrp: variant.mrp || variant.sale_price || selectedProduct.default_sale_price || 0,
              barcode: barcode,
              stock_qty: 0,
              active: true,
            })
            .select("id")
            .single();
          
          if (createError) throw createError;
          
          skuId = newVariant.id;
          
          toast({
            title: newColor ? "Color Variant Created" : "Size Created",
            description: newColor 
              ? `New variant "${variant.size}" in color "${newColor}" created for ${selectedProduct.product_name}`
              : `New size "${variant.size}" created for ${selectedProduct.product_name}`,
          });
        } catch (error: any) {
          console.error("Error creating new variant:", error);
          toast({
            title: "Error",
            description: `Failed to create new variant ${variant.size}: ${error.message}`,
            variant: "destructive",
          });
          continue;
        }
      } else {
        // Existing variant - auto-generate barcode if missing
        if (!barcode) {
          try {
            barcode = await generateCentralizedBarcode();
            await supabase
              .from("product_variants")
              .update({ barcode })
              .eq("id", variant.id);
          } catch (error) {
            toast({
              title: "Error",
              description: `Failed to generate barcode for size ${variant.size}`,
              variant: "destructive",
            });
            continue;
          }
        }
      }

      addItemRow({
        product_name: selectedProduct.product_name,
        product_id: selectedProduct.id,
        sku_id: skuId,
        size: variant.size,
        qty: qty,
        pur_price: variant.pur_price || selectedProduct.default_pur_price || 0,
        sale_price: variant.sale_price || selectedProduct.default_sale_price || 0,
        mrp: variant.mrp || variant.sale_price || 0,
        gst_per: selectedProduct.gst_per || 0,
        hsn_code: selectedProduct.hsn_code || "",
        barcode: barcode,
        discount_percent: 0,
        brand: selectedProduct.brand || "",
        category: selectedProduct.category || "",
        color: newColor || variant.color || selectedProduct.color || "",
        style: selectedProduct.style || "",
      });
    }

    setShowSizeGrid(false);
    setSizeQty({});
    // For Size Grid mode - focus on search box to find next product
    setTimeout(() => {
      inlineSearchInputRef.current?.focus();
    }, 100);
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
      mrp: variant.mrp || 0,
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

  // Function to detect price changes between line items and product_variants
  const detectPriceChanges = async (items: LineItem[]): Promise<PriceChange[]> => {
    const changes: PriceChange[] = [];
    
    // Get unique sku_ids
    const skuIds = [...new Set(items.filter(i => i.sku_id).map(i => i.sku_id))];
    if (skuIds.length === 0) return [];
    
    // Fetch current prices from product_variants
    const { data: variants, error } = await supabase
      .from("product_variants")
      .select("id, pur_price, sale_price, mrp")
      .in("id", skuIds);
    
    if (error || !variants) return [];
    
    const variantMap = new Map(variants.map(v => [v.id, v]));
    
    // Compare prices for each unique item (by sku_id)
    const processedSkus = new Set<string>();
    
    for (const item of items) {
      if (!item.sku_id || processedSkus.has(item.sku_id)) continue;
      processedSkus.add(item.sku_id);
      
      const variant = variantMap.get(item.sku_id);
      if (!variant) continue;
      
      // Check pur_price
      if (variant.pur_price !== null && variant.pur_price !== item.pur_price) {
        changes.push({
          sku_id: item.sku_id,
          product_name: item.product_name,
          size: item.size,
          barcode: item.barcode,
          field: "pur_price",
          old_value: variant.pur_price || 0,
          new_value: item.pur_price,
        });
      }
      
      // Check sale_price
      if (variant.sale_price !== null && variant.sale_price !== item.sale_price) {
        changes.push({
          sku_id: item.sku_id,
          product_name: item.product_name,
          size: item.size,
          barcode: item.barcode,
          field: "sale_price",
          old_value: variant.sale_price || 0,
          new_value: item.sale_price,
        });
      }
      
      // Check MRP only if MRP setting is enabled
      if (showMrp) {
        const itemMrp = item.mrp || 0;
        const variantMrp = variant.mrp || 0;
        if (variantMrp !== itemMrp && itemMrp > 0) {
          changes.push({
            sku_id: item.sku_id,
            product_name: item.product_name,
            size: item.size,
            barcode: item.barcode,
            field: "mrp",
            old_value: variantMrp,
            new_value: itemMrp,
          });
        }
      }
    }
    
    return changes;
  };

  // Function to update product_variants with selected price changes
  const handlePriceUpdateConfirm = async (selectedChanges: PriceChange[]) => {
    if (selectedChanges.length === 0) {
      setShowPriceUpdateDialog(false);
      return;
    }
    
    try {
      // Group changes by sku_id - also sync last_purchase_* fields
      const updatesBySkuId = new Map<string, Partial<{ 
        pur_price: number; 
        sale_price: number; 
        mrp: number;
        last_purchase_pur_price: number;
        last_purchase_sale_price: number;
        last_purchase_mrp: number;
        last_purchase_date: string;
      }>>();
      
      for (const change of selectedChanges) {
        const existing = updatesBySkuId.get(change.sku_id) || {};
        existing[change.field] = change.new_value;
        
        // Also sync the corresponding last_purchase field to prevent dialog from appearing again
        if (change.field === 'pur_price') {
          existing.last_purchase_pur_price = change.new_value;
        } else if (change.field === 'sale_price') {
          existing.last_purchase_sale_price = change.new_value;
        } else if (change.field === 'mrp') {
          existing.last_purchase_mrp = change.new_value;
        }
        
        // Update the last purchase date to now
        existing.last_purchase_date = new Date().toISOString();
        
        updatesBySkuId.set(change.sku_id, existing);
      }
      
      // Update each variant
      for (const [skuId, updates] of updatesBySkuId) {
        const { error } = await supabase
          .from("product_variants")
          .update(updates)
          .eq("id", skuId);
        
        if (error) throw error;
      }
      
      toast({
        title: "Prices Updated",
        description: `Updated ${updatesBySkuId.size} product variant(s) in Product Master`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update prices",
        variant: "destructive",
      });
    } finally {
      setShowPriceUpdateDialog(false);
      setDetectedPriceChanges([]);
    }
  };

  const handlePriceUpdateSkip = () => {
    setShowPriceUpdateDialog(false);
    setDetectedPriceChanges([]);
  };

  const handleSave = async () => {
    // Prevent double-click saves
    if (loading) return;
    
    // Use Zod schema validation
    const validation = validatePurchaseBill({
      supplier_name: billData.supplier_name,
      supplier_id: billData.supplier_id || undefined,
      supplier_invoice_no: billData.supplier_invoice_no || undefined,
    });

    if (!validation.success) {
      toast({
        title: "Validation Error",
        description: validation.error,
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
      // Calculate totals directly from lineItems to avoid stale state issues
      const calculatedGross = lineItems.reduce((sum, r) => sum + r.line_total, 0);
      const calculatedGst = lineItems.reduce((sum, r) => sum + (r.line_total * r.gst_per / 100), 0);
      const calculatedNet = calculatedGross + calculatedGst + otherCharges + roundOff;

      if (isEditMode && editingBillId) {
        // Update existing bill
        const { error: billError } = await supabase
          .from("purchase_bills")
          .update({
            supplier_id: billData.supplier_id || null,
            supplier_name: billData.supplier_name,
            supplier_invoice_no: billData.supplier_invoice_no,
            bill_date: format(billDate, "yyyy-MM-dd"),
            gross_amount: calculatedGross,
            gst_amount: calculatedGst,
            other_charges: otherCharges,
            net_amount: calculatedNet,
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
            original.mrp !== item.mrp ||
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
              mrp: item.mrp || 0,
              gst_per: item.gst_per,
              line_total: item.line_total,
              // Also update product details that might have been missing in older records
              brand: item.brand || null,
              category: item.category || null,
              color: item.color || null,
              style: item.style || null,
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
            mrp: item.mrp || 0,
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

        let insertedNewItems: LineItem[] = [];
        if (itemsToInsert.length > 0) {
          const { data: insertedData, error: insertError } = await supabase
            .from("purchase_items")
            .insert(itemsToInsert)
            .select();
          
          if (insertError) throw insertError;
          console.log(`Inserted ${itemsToInsert.length} new items`);
          
          // Map inserted items back to LineItem format for barcode printing
          insertedNewItems = lineItems.filter(item => !originalItemsMap.has(item.temp_id));
        }

        // Check for price changes and show dialog if any
        const priceChanges = await detectPriceChanges(lineItems);
        if (priceChanges.length > 0) {
          setDetectedPriceChanges(priceChanges);
          setPendingSaveItems([...lineItems]);
          setShowPriceUpdateDialog(true);
        }

        toast({
          title: "Success",
          description: "Purchase bill updated successfully",
        });

        // Fetch full product details for barcode printing (all items)
        const itemsWithDetails = await Promise.all(
          lineItems.map(async (item) => {
            const { data: product } = await supabase
              .from("products")
              .select("brand, color, style")
              .eq("id", item.product_id)
              .single();
            
            return {
              ...item,
              brand: item.brand || product?.brand || "",
              color: item.color || product?.color || "",
              style: item.style || product?.style || "",
            };
          })
        );

        // Store all items and newly added items for print dialog
        setSavedPurchaseItems(itemsWithDetails);
        setSavedBillId(editingBillId);
        
        // Only set newly added items if there are any
        if (insertedNewItems.length > 0) {
          const newItemsWithDetails = itemsWithDetails.filter(item => 
            insertedNewItems.some(newItem => newItem.temp_id === item.temp_id)
          );
          setNewlyAddedItems(newItemsWithDetails);
        } else {
          setNewlyAddedItems([]);
        }
        
        // Show print dialog after update
        setShowPrintDialog(true);

        // Clear draft after successful save
        await deleteDraft();
        updateCurrentData(null);

        // Reset edit mode state - Critical fix for duplicate bill prevention
        setIsEditMode(false);
        setOriginalLineItems([]);
        setEditingBillId(null);
        
        // Clear location state to prevent re-triggering edit mode on refresh
        window.history.replaceState({}, document.title);
        
        // Stay on purchase bill page - reset form for new entry
        setBillData({
          supplier_id: "",
          supplier_name: "",
          supplier_invoice_no: "",
        });
        setBillDate(new Date());
        setLineItems([]);
        setOtherCharges(0);
        setRoundOff(0);
        setSoftwareBillNo("");
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
              gross_amount: calculatedGross,
              gst_amount: calculatedGst,
              other_charges: otherCharges,
              net_amount: calculatedNet,
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
          mrp: item.mrp || 0,
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

        // Check for price changes and show dialog if any
        const priceChanges = await detectPriceChanges(lineItems);
        if (priceChanges.length > 0) {
          setDetectedPriceChanges(priceChanges);
          setPendingSaveItems([...lineItems]);
          setShowPriceUpdateDialog(true);
        }

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
              brand: item.brand || product?.brand || "",
              color: item.color || product?.color || "",
              style: item.style || product?.style || "",
            };
          })
        );

        // Store items for barcode printing and show dialog
        setSavedPurchaseItems(itemsWithDetails);
        setSavedBillId(billDataResult.id);
        setNewlyAddedItems([]); // All items are new for a new bill
        setShowPrintDialog(true);

        // Clear draft after successful save and prevent re-save on cleanup
        await deleteDraft();
        updateCurrentData(null);

        // Reset edit mode if we were editing
        if (isEditMode) {
          setIsEditMode(false);
          setEditingBillId(null);
          setOriginalLineItems([]);
        }

        // Reset form and generate new bill number
        setBillData({
          supplier_id: "",
          supplier_name: "",
          supplier_invoice_no: "",
        });
        setBillDate(new Date());
        setLineItems([]);
        setOtherCharges(0);
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
    totalDiscount: discountAmount,
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

    // Get items to print - either selected items or all items if none selected
    const itemsToPrint = selectedForPrint.size > 0
      ? lineItems.filter(item => selectedForPrint.has(item.temp_id))
      : lineItems;

    if (itemsToPrint.length === 0) {
      toast({
        title: "No Items Selected",
        description: "Please select items to print barcodes",
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
      const barcodeItems = itemsToPrint.map((item) => ({
        sku_id: item.sku_id,
        product_name: item.product_name || "",
        brand: item.brand || "",
        category: item.category || "",
        color: item.color || "",
        style: item.style || "",
        size: item.size,
        sale_price: item.sale_price,
        mrp: item.mrp,
        pur_price: item.pur_price,
        barcode: item.barcode,
        qty: item.qty,
        bill_number: softwareBillNo || "",
        supplier_code: supplierCode,
      }));

      // Clear selection after navigation
      setSelectedForPrint(new Set());

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

  // Toggle selection for a single item
  const toggleItemSelection = (tempId: string) => {
    setSelectedForPrint(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tempId)) {
        newSet.delete(tempId);
      } else {
        newSet.add(tempId);
      }
      return newSet;
    });
  };

  // Toggle select all
  const toggleSelectAll = () => {
    if (selectedForPrint.size === lineItems.length) {
      setSelectedForPrint(new Set());
    } else {
      setSelectedForPrint(new Set(lineItems.map(item => item.temp_id)));
    }
  };

  // Handle Excel import for purchase bill with batch processing
  const handleExcelImport = async (
    mappedData: Record<string, any>[],
    onProgress?: (progress: ImportProgress) => void
  ) => {
    if (!currentOrganization) return;
    
    // Extract bill-level data from first row if present
    const firstRow = mappedData[0];
    if (firstRow) {
      // Set supplier if provided
      if (firstRow.bill_supplier_name) {
        const supplierName = firstRow.bill_supplier_name?.toString().trim();
        const matchingSupplier = suppliers.find(s => 
          s.supplier_name?.toLowerCase().trim() === supplierName?.toLowerCase()
        );
        if (matchingSupplier) {
          setBillData(prev => ({
            ...prev,
            supplier_id: matchingSupplier.id,
            supplier_name: matchingSupplier.supplier_name,
            supplier_invoice_no: firstRow.bill_supplier_invoice_no?.toString().trim() || prev.supplier_invoice_no,
          }));
        } else {
          // Just set the name if supplier not found
          setBillData(prev => ({
            ...prev,
            supplier_name: supplierName,
            supplier_invoice_no: firstRow.bill_supplier_invoice_no?.toString().trim() || prev.supplier_invoice_no,
          }));
        }
      } else if (firstRow.bill_supplier_invoice_no) {
        // Set invoice number even without supplier name
        setBillData(prev => ({
          ...prev,
          supplier_invoice_no: firstRow.bill_supplier_invoice_no?.toString().trim(),
        }));
      }
      
      // Set bill date if provided
      if (firstRow.bill_date) {
        const parsedDate = parseExcelDate(firstRow.bill_date);
        if (parsedDate) {
          setBillDate(parsedDate);
        }
      }
      
      // Set other charges if provided
      if (firstRow.bill_other_charges) {
        const charges = Number(firstRow.bill_other_charges);
        if (!isNaN(charges) && charges > 0) {
          setOtherCharges(charges);
        }
      }
    }
    
    // Helper function to detect summary/total rows or empty rows
    const isSummaryOrEmptyRow = (row: Record<string, any>): boolean => {
      const summaryKeywords = ['total', 'subtotal', 'sub-total', 'grand total', 'sum', 'net', 'gross', 'amount', 'shipping', 'freight', 'transport', 'charges', 'discount', 'tax', 'gst'];
      let meaningfulValueCount = 0;
      
      for (const value of Object.values(row)) {
        if (value !== undefined && value !== null && value !== '') {
          meaningfulValueCount++;
          if (typeof value === 'string') {
            const lowerValue = value.toLowerCase().trim();
            if (summaryKeywords.some(keyword => lowerValue === keyword || lowerValue.startsWith(keyword + ' ') || lowerValue.endsWith(' ' + keyword))) {
              return true;
            }
          }
        }
      }
      // Skip rows with very few values (likely empty/separator rows)
      return meaningfulValueCount <= 2;
    };

    // Filter valid rows - skip empty rows and summary/total rows
    const validRows = mappedData.filter(row => 
      row.product_name?.toString().trim() && 
      row.size?.toString().trim() && 
      row.qty && Number(row.qty) > 0 &&
      !isSummaryOrEmptyRow(row)
    );

    const BATCH_SIZE = 20;
    const newLineItems: LineItem[] = [];
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = mappedData.length - validRows.length;

    // Pre-fetch existing products to reduce DB calls
    const { data: existingProducts } = await supabase
      .from('products')
      .select('id, product_name, brand, category, color, style')
      .eq('organization_id', currentOrganization.id);

    const productMap = new Map<string, string>();
    (existingProducts || []).forEach(p => {
      const key = [
        p.product_name || '',
        p.brand || '',
        p.category || '',
        p.color || '',
        p.style || '',
      ].join('|').toLowerCase();
      productMap.set(key, p.id);
    });

    // Pre-fetch existing variants
    const productIds = Array.from(productMap.values());
    const { data: existingVariants } = await supabase
      .from('product_variants')
      .select('id, product_id, size, barcode')
      .eq('organization_id', currentOrganization.id)
      .in('product_id', productIds.length > 0 ? productIds : ['']);

    const variantMap = new Map<string, { id: string; barcode: string }>();
    (existingVariants || []).forEach(v => {
      const key = `${v.product_id}|${v.size?.toLowerCase()}`;
      variantMap.set(key, { id: v.id, barcode: v.barcode || '' });
    });

    // Process in batches
    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);

      for (const row of batch) {
        try {
          const productKey = [
            row.product_name?.toString().trim() || '',
            row.brand?.toString().trim() || '',
            row.category?.toString().trim() || '',
            row.color?.toString().trim() || '',
            row.style?.toString().trim() || '',
          ].join('|').toLowerCase();

          let productId = productMap.get(productKey);

          // Create product if doesn't exist
          if (!productId) {
            const { data: newProduct, error: productError } = await supabase
              .from('products')
              .insert({
                organization_id: currentOrganization.id,
                product_name: row.product_name?.toString().trim(),
                category: row.category?.toString().trim() || null,
                brand: row.brand?.toString().trim() || null,
                style: row.style?.toString().trim() || null,
                color: row.color?.toString().trim() || null,
                hsn_code: row.hsn_code?.toString().trim() || null,
                gst_per: Number(row.gst_per) || 0,
                default_pur_price: Number(row.pur_price) || 0,
                default_sale_price: Number(row.sale_price) || 0,
                status: 'active',
              })
              .select('id')
              .single();

            if (productError) {
              errorCount++;
              continue;
            }
            productId = newProduct.id;
            productMap.set(productKey, productId);
          }

          const size = row.size?.toString().trim();
          const variantKey = `${productId}|${size?.toLowerCase()}`;
          let variantInfo = variantMap.get(variantKey);
          let skuId: string;
          let barcode: string;

          if (variantInfo) {
            skuId = variantInfo.id;
            barcode = variantInfo.barcode || row.barcode?.toString().trim() || '';
          } else {
            // Generate barcode if not provided
            barcode = row.barcode?.toString().trim() || '';
            if (!barcode) {
              const { data: barcodeData } = await supabase.rpc(
                'generate_next_barcode',
                { p_organization_id: currentOrganization.id }
              );
              barcode = barcodeData || '';
            }

            // Create variant
            const { data: newVariant, error: variantError } = await supabase
              .from('product_variants')
              .insert({
                organization_id: currentOrganization.id,
                product_id: productId,
                size: size,
                barcode: barcode,
                pur_price: Number(row.pur_price) || 0,
                sale_price: Number(row.sale_price) || 0,
                stock_qty: 0,
                active: true,
              })
              .select('id')
              .single();

            if (variantError) {
              errorCount++;
              continue;
            }
            skuId = newVariant.id;
            variantMap.set(variantKey, { id: skuId, barcode });
          }

          const qty = Number(row.qty) || 0;
          const purPrice = Number(row.pur_price) || 0;
          const lineTotal = qty * purPrice;

          newLineItems.push({
            temp_id: `import_${Date.now()}_${Math.random()}`,
            product_id: productId,
            sku_id: skuId,
            product_name: row.product_name?.toString().trim() || '',
            size: size,
            qty: qty,
            pur_price: purPrice,
            sale_price: Number(row.sale_price) || 0,
            gst_per: Number(row.gst_per) || 0,
            hsn_code: row.hsn_code?.toString().trim() || '',
            barcode: barcode,
            discount_percent: 0,
            line_total: lineTotal,
            brand: row.brand?.toString().trim(),
            category: row.category?.toString().trim(),
            color: row.color?.toString().trim(),
            style: row.style?.toString().trim(),
          });

          successCount++;
        } catch (err) {
          console.error('Error processing row:', err);
          errorCount++;
        }
      }

      // Report progress
      if (onProgress) {
        onProgress({
          current: Math.min(i + BATCH_SIZE, validRows.length),
          total: validRows.length,
          successCount,
          errorCount,
          skippedCount,
          isImporting: true,
        });
      }
    }

    setLineItems(prev => [...prev, ...newLineItems]);

    let description = `Added ${successCount} items from Excel`;
    if (skippedCount > 0) description += `, ${skippedCount} empty rows skipped`;
    if (errorCount > 0) description += `, ${errorCount} errors`;

    toast({
      title: "Import Completed",
      description,
    });
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
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Bill Information</CardTitle>
            {!isEditMode && lastPurchaseBill && (
              <div className="text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-md">
                <span className="font-medium">Last Bill:</span>{" "}
                <span className="text-foreground">{lastPurchaseBill.software_bill_no}</span>
                {lastPurchaseBill.supplier_invoice_no && (
                  <>
                    {" | "}
                    <span className="font-medium">Supplier Inv:</span>{" "}
                    <span className="text-foreground">{lastPurchaseBill.supplier_invoice_no}</span>
                  </>
                )}
              </div>
            )}
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

              <div className="space-y-2 md:col-span-2">
                <Label>Search Product</Label>
                <div className="relative">
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
                          <div className="font-medium flex items-center gap-2">
                            <span>
                              {formatProductDescription({
                                product_name: result.product_name,
                                category: result.category,
                                brand: result.brand,
                                style: result.style,
                                color: result.color,
                                size: result.size
                              })}
                            </span>
                            {result.size_range && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold">
                                {result.size_range}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            {result.barcode && (
                              <span>Barcode: {result.barcode}</span>
                            )}
                            <span className="text-primary font-medium">
                              Pur: ₹{result.pur_price?.toFixed(2) || '0.00'}
                            </span>
                            <span className="text-green-600 dark:text-green-400 font-medium">
                              Sale: ₹{result.sale_price?.toFixed(2) || '0.00'}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Import Excel
                </Button>
                <Button
                  onClick={() => setShowProductDialog(true)}
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
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-x-auto max-h-[60vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={lineItems.length > 0 && selectedForPrint.size === lineItems.length}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all for printing"
                        disabled={lineItems.length === 0}
                      />
                    </TableHead>
                    <TableHead className="w-12">SR.NO</TableHead>
                    <TableHead className="w-auto min-w-[300px]">ITEM NAME</TableHead>
                    <TableHead className="w-28">BARCODE</TableHead>
                    <TableHead className="w-20">QTY</TableHead>
                    <TableHead className="w-28">PUR.RATE</TableHead>
                    <TableHead className="w-28">SALE.RATE</TableHead>
                    {showMrp && <TableHead className="w-28">MRP</TableHead>}
                    <TableHead className="w-24">SUB TOTAL</TableHead>
                    <TableHead className="w-20">DISC %</TableHead>
                    <TableHead className="w-24">TOTAL</TableHead>
                    <TableHead className="w-12 sticky right-0 bg-background"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item, index) => {
                    const subTotal = item.qty * item.pur_price;
                    const total = item.line_total;
                    const gstAmount = (total * item.gst_per) / 100;
                    
                    return (
                      <TableRow key={item.temp_id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedForPrint.has(item.temp_id)}
                            onCheckedChange={() => toggleItemSelection(item.temp_id)}
                            aria-label={`Select ${item.product_name} for printing`}
                          />
                        </TableCell>
                        <TableCell className="text-center font-medium">{index + 1}</TableCell>
                        <TableCell className="font-medium whitespace-nowrap">
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
                              updateLineItem(
                                item.temp_id,
                                "pur_price",
                                parseFloat(e.target.value) || 0
                              )
                            }
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
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
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            className="w-28"
                          />
                        </TableCell>
                        {showMrp && (
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.mrp || 0}
                              onChange={(e) =>
                                updateLineItem(
                                  item.temp_id,
                                  "mrp",
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              onWheel={(e) => (e.target as HTMLInputElement).blur()}
                              className="w-28"
                            />
                          </TableCell>
                        )}
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
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            className="w-20"
                          />
                        </TableCell>
                        <TableCell className="font-semibold">
                          ₹{total.toFixed(2)}
                        </TableCell>
                        <TableCell className="sticky right-0 bg-background">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => removeLineItem(item.temp_id)}
                          >
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  
                  {/* Inline Search Row - Always visible at bottom */}
                  <TableRow className="bg-accent/30">
                    <TableCell></TableCell>
                    <TableCell className="text-center font-medium text-muted-foreground">
                      {lineItems.length + 1}
                    </TableCell>
                    <TableCell className="relative">
                      <div className="relative">
                        <Input
                          ref={inlineSearchInputRef}
                          value={inlineSearchQuery}
                          onChange={(e) => setInlineSearchQuery(e.target.value)}
                          onFocus={() => {
                            if (inlineSearchQuery.length >= 1) {
                              setShowInlineSearch(true);
                            }
                          }}
                          onBlur={() => {
                            // Delay hiding to allow click on dropdown items
                            setTimeout(() => setShowInlineSearch(false), 200);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              if (inlineSearchResults.length > 0) {
                                setSelectedInlineIndex(prev => 
                                  prev < inlineSearchResults.length - 1 ? prev + 1 : 0
                                );
                              }
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              if (inlineSearchResults.length > 0) {
                                setSelectedInlineIndex(prev => 
                                  prev > 0 ? prev - 1 : inlineSearchResults.length - 1
                                );
                              }
                            } else if (e.key === 'Enter') {
                              e.preventDefault();
                              if (inlineSearchResults.length > 0) {
                                handleInlineProductSelect(inlineSearchResults[selectedInlineIndex]);
                              }
                            }
                          }}
                          placeholder="Search product name, brand, barcode..."
                          className="w-full pr-8"
                        />
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        
                        {/* Inline Search Dropdown */}
                        {showInlineSearch && (
                          <div className="absolute top-full left-0 mt-1 w-full min-w-[400px] bg-popover border border-border rounded-md shadow-lg z-[100] max-h-80 overflow-auto">
                            {inlineSearchResults.length > 0 ? (
                              <>
                                {inlineSearchResults.map((result, idx) => (
                                  <button
                                    key={result.id + idx}
                                    onClick={() => handleInlineProductSelect(result)}
                                    onMouseEnter={() => setSelectedInlineIndex(idx)}
                                    className={cn(
                                      "w-full text-left px-4 py-3 text-popover-foreground border-b border-border last:border-0 transition-colors",
                                      idx === selectedInlineIndex ? "bg-accent" : "hover:bg-accent/50"
                                    )}
                                  >
                                    <div className="font-medium flex items-center gap-2">
                                      <span>
                                        {formatProductDescription({
                                          product_name: result.product_name,
                                          category: result.category,
                                          brand: result.brand,
                                          style: result.style,
                                          color: result.color,
                                          size: result.size
                                        })}
                                      </span>
                                      {result.size_range && (
                                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold">
                                          {result.size_range}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                      {result.barcode && (
                                        <span>Barcode: {result.barcode}</span>
                                      )}
                                      <span className="text-primary font-medium">
                                        Pur: ₹{result.pur_price?.toFixed(2) || '0.00'}
                                      </span>
                                      <span className="text-green-600 dark:text-green-400 font-medium">
                                        Sale: ₹{result.sale_price?.toFixed(2) || '0.00'}
                                      </span>
                                    </div>
                                  </button>
                                ))}
                                {/* Add New Product button at bottom of results */}
                                <button
                                  onClick={handleAddNewProductFromInline}
                                  className="w-full text-left px-4 py-3 text-primary font-medium border-t border-border hover:bg-accent/50 transition-colors flex items-center gap-2"
                                >
                                  <Plus className="h-4 w-4" />
                                  Add New Product
                                </button>
                              </>
                            ) : inlineSearchQuery.length >= 1 ? (
                              <>
                                <div className="px-4 py-3 text-sm text-muted-foreground">
                                  No products found for "{inlineSearchQuery}"
                                </div>
                                {/* Add New Product button when no results */}
                                <button
                                  onClick={handleAddNewProductFromInline}
                                  className="w-full text-left px-4 py-3 text-primary font-medium border-t border-border hover:bg-accent/50 transition-colors flex items-center gap-2"
                                >
                                  <Plus className="h-4 w-4" />
                                  Add New Product
                                </button>
                              </>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell colSpan={showMrp ? 9 : 8} className="text-muted-foreground text-sm">
                      <span className="hidden md:inline">Type to search or </span>
                      <button 
                        onClick={handleAddNewProductFromInline}
                        className="text-primary hover:underline font-medium"
                      >
                        + Add New Product
                      </button>
                    </TableCell>
                  </TableRow>
                  
                  {/* Footer row with QTY total */}
                  {lineItems.length > 0 && (
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell></TableCell>
                      <TableCell colSpan={3} className="text-right">Total:</TableCell>
                      <TableCell className="text-center">{totals.totalQty}</TableCell>
                      <TableCell colSpan={showMrp ? 7 : 6}></TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {lineItems.length === 0 && (
              <p className="text-xs text-center mt-2 text-muted-foreground">Tip: Press Alt+↓ to copy the last row</p>
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
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total Discount:</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                    className="w-28 text-right text-destructive"
                    placeholder="0.00"
                  />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GST Amount:</span>
                  <span className="font-semibold">₹{totals.gstAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Other Charges:</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={otherCharges}
                    onChange={(e) => setOtherCharges(parseFloat(e.target.value) || 0)}
                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                    className="w-28 text-right"
                    placeholder="0.00"
                  />
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground">Round Off:</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={roundOff}
                    onChange={(e) => setRoundOff(parseFloat(e.target.value) || 0)}
                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
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
            Print Barcodes {selectedForPrint.size > 0 && `(${selectedForPrint.size})`}
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

        {/* Size Grid Dialog with Color Selection */}
        <SizeGridDialog
          open={showSizeGrid}
          onClose={() => setShowSizeGrid(false)}
          product={selectedProduct}
          variants={sizeGridVariants}
          onConfirm={handleSizeGridConfirm}
          showStock={false}
          validateStock={false}
          title="Enter Size-wise Qty"
          allowCustomSizes={true}
          allowAddColor={isColorFieldEnabled}
          defaultPurPrice={selectedProduct?.default_pur_price}
          defaultSalePrice={selectedProduct?.default_sale_price}
          defaultMrp={sizeGridVariants[0]?.mrp || selectedProduct?.default_sale_price}
          showMrp={showMrp}
        />

        {/* Print Barcode Dialog with Smart Selection */}
        <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Printer className="h-5 w-5" />
                Bill Saved Successfully
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Your purchase bill has been saved. Would you like to print barcodes?
              </p>
              
              {/* Show item counts */}
              <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Total Items:</span>
                  <span className="font-semibold">{savedPurchaseItems.reduce((sum, i) => sum + i.qty, 0)} labels</span>
                </div>
                {newlyAddedItems.length > 0 && (
                  <div className="flex justify-between text-primary">
                    <span>Newly Added:</span>
                    <span className="font-semibold">{newlyAddedItems.reduce((sum, i) => sum + i.qty, 0)} labels</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                {/* Print All Labels Button */}
                <Button
                  onClick={async () => {
                    try {
                      const barcodeItems = savedPurchaseItems.map(item => ({
                        sku_id: item.sku_id,
                        product_name: item.product_name || "",
                        brand: item.brand || "",
                        category: item.category || "",
                        color: item.color || "",
                        style: item.style || "",
                        size: item.size,
                        sale_price: item.sale_price,
                        mrp: item.mrp,
                        pur_price: item.pur_price,
                        barcode: item.barcode,
                        qty: item.qty,
                        bill_number: softwareBillNo || "",
                        supplier_code: "",
                      }));

                      // Mark all items as printed
                      if (savedBillId) {
                        await supabase
                          .from("purchase_items")
                          .update({ barcode_printed: true })
                          .eq("bill_id", savedBillId);
                      }

                      setShowPrintDialog(false);
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
                  className="w-full gap-2"
                >
                  <Printer className="h-4 w-4" />
                  Print All Labels ({savedPurchaseItems.reduce((sum, i) => sum + i.qty, 0)})
                </Button>

                {/* Print New Labels Only Button - only show if there are newly added items */}
                {newlyAddedItems.length > 0 && (
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      try {
                        const barcodeItems = newlyAddedItems.map(item => ({
                          sku_id: item.sku_id,
                          product_name: item.product_name || "",
                          brand: item.brand || "",
                          category: item.category || "",
                          color: item.color || "",
                          style: item.style || "",
                          size: item.size,
                          sale_price: item.sale_price,
                          mrp: item.mrp,
                          pur_price: item.pur_price,
                          barcode: item.barcode,
                          qty: item.qty,
                          bill_number: softwareBillNo || "",
                          supplier_code: "",
                        }));

                        // Mark only new items as printed
                        if (savedBillId && newlyAddedItems.length > 0) {
                          const newSkuIds = newlyAddedItems.map(i => i.sku_id).filter(Boolean);
                          if (newSkuIds.length > 0) {
                            await supabase
                              .from("purchase_items")
                              .update({ barcode_printed: true })
                              .eq("bill_id", savedBillId)
                              .in("sku_id", newSkuIds);
                          }
                        }

                        setShowPrintDialog(false);
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
                    className="w-full gap-2"
                  >
                    <Printer className="h-4 w-4" />
                    Print New Only ({newlyAddedItems.reduce((sum, i) => sum + i.qty, 0)})
                  </Button>
                )}

                <Button
                  variant="outline"
                  onClick={() => setShowPrintDialog(false)}
                  className="w-full"
                >
                  Skip
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


        {/* Product Entry Dialog */}
        <ProductEntryDialog
          open={showProductDialog}
          onOpenChange={setShowProductDialog}
          onProductCreated={handleProductCreated}
        />

        {/* Price Update Confirmation Dialog */}
        <PriceUpdateConfirmDialog
          open={showPriceUpdateDialog}
          onOpenChange={setShowPriceUpdateDialog}
          priceChanges={detectedPriceChanges}
          onConfirm={handlePriceUpdateConfirm}
          onSkip={handlePriceUpdateSkip}
        />
      </div>
    </div>
  );
};

export default PurchaseEntry;
