import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalculatorInput } from "@/components/ui/calculator-input";
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
import { Loader2, ShoppingCart, Plus, X, CalendarIcon, Copy, Printer, ChevronDown, FileSpreadsheet, ChevronLeft, ChevronRight, Check, AlertTriangle, SkipBack, Search, Save, Trash2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineTotalQty } from "@/components/InlineTotalQty";
import { format } from "date-fns";
import { cn, sortSearchResults } from "@/lib/utils";
import { BackToDashboard } from "@/components/BackToDashboard";
import { printBarcodesDirectly } from "@/utils/barcodePrinter";
import { ExcelImportDialog, ImportProgress } from "@/components/ExcelImportDialog";
import { purchaseBillFields, purchaseBillSampleData, parseExcelDate, parseLocalizedNumber } from "@/utils/excelImportUtils";
import { validatePurchaseBill } from "@/lib/validations";
import { SizeGridDialog } from "@/components/SizeGridDialog";
import { ProductEntryDialog } from "@/components/ProductEntryDialog";
import { PriceUpdateConfirmDialog } from "@/components/PriceUpdateConfirmDialog";
import { AddSupplierDialog } from "@/components/AddSupplierDialog";
import { useDraftSave } from "@/hooks/useDraftSave";
import { useDashboardInvalidation } from "@/hooks/useDashboardInvalidation";
import { checkBarcodeExists } from "@/utils/barcodeValidation";

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
  if (item.style && item.style.trim() && item.style.trim() !== '-') parts.push(item.style);
  if (item.color && item.color.trim() && item.color.trim() !== '-') parts.push(item.color);
  if (item.brand && item.brand.trim() && item.brand.trim() !== '-') parts.push(item.brand);
  if (item.category && item.category.trim() && item.category.trim() !== '-') parts.push(item.category);
  return parts.join('-');
};

const PurchaseEntry = () => {
  const { toast } = useToast();
  const { orgNavigate: navigate } = useOrgNavigation();
  const location = useLocation();
  const { currentOrganization } = useOrganization();
  const { invalidatePurchases } = useDashboardInvalidation();
  const queryClient = useQueryClient();
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
  const [billDateOpen, setBillDateOpen] = useState(false);
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
  const [showAddSupplierDialog, setShowAddSupplierDialog] = useState(false);
  // Inline search state for table row
  const [inlineSearchQuery, setInlineSearchQuery] = useState("");
  const [inlineSearchResults, setInlineSearchResults] = useState<ProductVariant[]>([]);
  const [inlineDisplayLimit, setInlineDisplayLimit] = useState(100);
  const [showInlineSearch, setShowInlineSearch] = useState(false);
  const [selectedInlineIndex, setSelectedInlineIndex] = useState(0);
  
  
  // Price update confirmation state
  const [showPriceUpdateDialog, setShowPriceUpdateDialog] = useState(false);
  const [detectedPriceChanges, setDetectedPriceChanges] = useState<PriceChange[]>([]);
  const [pendingPrintAfterPriceUpdate, setPendingPrintAfterPriceUpdate] = useState(false);
  
  // State for selective barcode printing
  const [selectedForPrint, setSelectedForPrint] = useState<Set<string>>(new Set());
  const [pendingSaveItems, setPendingSaveItems] = useState<LineItem[]>([]);
  
  // State for tracking newly added items for smart barcode printing
  const [newlyAddedItems, setNewlyAddedItems] = useState<LineItem[]>([]);
  const [savedBillId, setSavedBillId] = useState<string | null>(null);
  const [savedSupplierId, setSavedSupplierId] = useState<string | null>(null);
  
  // Bill navigation state (like Sales Invoice)
  const [navBillIndex, setNavBillIndex] = useState<number | null>(null);
  const [isLoadingNavBill, setIsLoadingNavBill] = useState(false);
  
  // Barcode duplicate warning state
  const [barcodeWarnings, setBarcodeWarnings] = useState<Map<string, string>>(new Map());
  const barcodeCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // DC Purchase (Direct Cash / No GST) state
  const [isDcPurchase, setIsDcPurchase] = useState(false);

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

  // Barcode duplicate warning check — debounced 600ms after lineItems change
  useEffect(() => {
    if (barcodeCheckTimerRef.current) clearTimeout(barcodeCheckTimerRef.current);
    if (!currentOrganization?.id || lineItems.length === 0) {
      setBarcodeWarnings(new Map());
      return;
    }
    barcodeCheckTimerRef.current = setTimeout(async () => {
      const warnings = new Map<string, string>();
      const barcodesToCheck = lineItems.filter(item => item.barcode && item.barcode.length > 6);
      for (const item of barcodesToCheck) {
        try {
          const { data } = await supabase.rpc('check_barcode_duplicate', {
            p_barcode: item.barcode,
            p_org_id: currentOrganization.id,
            p_exclude_variant_id: item.sku_id || null
          });
          if (data && data.length > 0) {
            const existing = data[0];
            warnings.set(item.temp_id, `⚠️ Barcode already used: "${existing.product_name}" ${existing.size}${existing.color ? ' / ' + existing.color : ''} (Stock: ${existing.stock_qty})`);
          }
        } catch { /* ignore */ }
      }
      setBarcodeWarnings(warnings);
    }, 600);
    return () => { if (barcodeCheckTimerRef.current) clearTimeout(barcodeCheckTimerRef.current); };
  }, [lineItems, currentOrganization?.id]);

  // Fetch settings
  const { data: settings } = useQuery({
    queryKey: ["settings", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("purchase_settings, product_settings, bill_barcode_settings")
        .eq("organization_id", currentOrganization?.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  const showMrp = (settings?.purchase_settings as any)?.show_mrp || false;
  
  // Barcode mode: 'auto' (default) or 'scan' (manual/manufacturer barcode)
  const barcodeMode = (settings?.purchase_settings as any)?.barcode_mode || 'auto';
  const isAutoBarcode = barcodeMode !== 'scan';
  
  // Check if barcode prompt is enabled (defaults to true if not set)
  const enableBarcodePrompt = (settings?.bill_barcode_settings as any)?.enable_barcode_prompt !== false;
  
  // Mobile ERP / IMEI mode
  const mobileERPSettings = (() => {
    const productSettings = settings?.product_settings as any;
    const merp = productSettings?.mobile_erp;
    if (!merp?.enabled) return null;
    return {
      enabled: true,
      imei_scan_enforcement: merp.imei_scan_enforcement ?? true,
      locked_size_qty: merp.locked_size_qty ?? true,
      imei_min_length: merp.imei_min_length ?? 15,
      imei_max_length: merp.imei_max_length ?? 19,
    };
  })();
  const isMobileERPMode = !!mobileERPSettings?.enabled;
  
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
          .select("id, supplier_name, phone, email, gst_number, address, opening_balance")
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
    staleTime: 300000, // 5 minutes - reduces multi-tab load
    refetchOnWindowFocus: false,
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

  // Fetch next serial supplier invoice number
  const { data: nextSupplierInvNo } = useQuery({
    queryKey: ["next-supplier-inv-no", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_bills")
        .select("supplier_invoice_no")
        .eq("organization_id", currentOrganization?.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      // Find the highest numeric supplier_invoice_no
      let maxNum = 0;
      (data || []).forEach((row: any) => {
        const num = parseInt(row.supplier_invoice_no, 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      });
      return String(maxNum + 1);
    },
    enabled: !!currentOrganization?.id && !isEditMode,
  });

  // Fetch all purchase bill IDs for navigation
  const { data: allBillIds } = useQuery({
    queryKey: ['all-purchase-bill-ids', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from('purchase_bills')
        .select('id, software_bill_no')
        .eq('organization_id', currentOrganization.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
    staleTime: 60000,
  });

  // Load a purchase bill by ID for navigation
  const loadBillById = useCallback(async (billId: string) => {
    if (!currentOrganization?.id) return;
    setIsLoadingNavBill(true);
    try {
      const { data: existingBill, error: billError } = await supabase
        .from('purchase_bills')
        .select('*')
        .eq('id', billId)
        .single();
      if (billError) throw billError;

      setBillData({
        supplier_id: existingBill.supplier_id || '',
        supplier_name: existingBill.supplier_name,
        supplier_invoice_no: existingBill.supplier_invoice_no || '',
      });
      setSoftwareBillNo(existingBill.software_bill_no || '');
      setBillDate(new Date(existingBill.bill_date));
      setRoundOff(Number(existingBill.round_off) || 0);
      setOtherCharges(Number(existingBill.other_charges) || 0);
      setDiscountAmount(Number(existingBill.discount_amount) || 0);

      const { data: itemsData, error: itemsError } = await supabase
        .from('purchase_items')
        .select('*')
        .eq('bill_id', billId);
      if (itemsError) throw itemsError;

      const productIds = [...new Set(itemsData.map((item: any) => item.product_id).filter(Boolean))];
      let productDetailsMap = new Map<string, any>();
      if (productIds.length > 0) {
        const { data: productsData } = await supabase
          .from('products')
          .select('id, brand, category, style, color')
          .in('id', productIds);
        if (productsData) {
          productsData.forEach((p: any) => {
            productDetailsMap.set(p.id, { brand: p.brand || '', category: p.category || '', style: p.style || '', color: p.color || '' });
          });
        }
      }

      const loadedItems: LineItem[] = itemsData.map((item: any) => {
        const pd = productDetailsMap.get(item.product_id);
        return {
          temp_id: item.id,
          product_id: item.product_id,
          sku_id: item.sku_id || '',
          product_name: item.product_name || '',
          brand: item.brand || pd?.brand || '',
          category: item.category || pd?.category || '',
          color: item.color || pd?.color || '',
          style: item.style || pd?.style || '',
          size: item.size,
          qty: item.qty,
          pur_price: Number(item.pur_price),
          sale_price: Number(item.sale_price),
          mrp: Number(item.mrp) || 0,
          gst_per: item.gst_per,
          hsn_code: item.hsn_code || '',
          barcode: item.barcode || '',
          discount_percent: 0,
          line_total: Number(item.line_total),
        };
      });

      setLineItems(loadedItems);
      setOriginalLineItems(loadedItems);
      setIsEditMode(true);
      setEditingBillId(billId);
      setSavedBillId(billId);
    } catch (err: any) {
      console.error('Failed to load bill:', err);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load purchase bill' });
    } finally {
      setIsLoadingNavBill(false);
    }
  }, [currentOrganization?.id, toast]);

  const handleLastBill = useCallback(() => {
    if (!allBillIds || allBillIds.length === 0) return;
    setNavBillIndex(0);
    loadBillById(allBillIds[0].id);
  }, [allBillIds, loadBillById]);

  const handlePreviousBill = useCallback(() => {
    if (!allBillIds || navBillIndex === null) return;
    const newIndex = Math.min(navBillIndex + 1, allBillIds.length - 1);
    setNavBillIndex(newIndex);
    loadBillById(allBillIds[newIndex].id);
  }, [allBillIds, navBillIndex, loadBillById]);

  const handleNextBill = useCallback(() => {
    if (!allBillIds || navBillIndex === null) return;
    const newIndex = Math.max(navBillIndex - 1, 0);
    setNavBillIndex(newIndex);
    loadBillById(allBillIds[newIndex].id);
  }, [allBillIds, navBillIndex, loadBillById]);

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

  // Auto-populate supplier invoice number for new bills
  useEffect(() => {
    if (nextSupplierInvNo && !isEditMode && !billData.supplier_invoice_no) {
      setBillData(prev => ({ ...prev, supplier_invoice_no: nextSupplierInvNo }));
    }
  }, [nextSupplierInvNo, isEditMode]);

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
          setOtherCharges(Number(existingBill.other_charges) || 0);
          setDiscountAmount(Number(existingBill.discount_amount) || 0);
          setIsDcPurchase(existingBill.is_dc_purchase === true);
          
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
            purchase_gst_percent,
            sale_gst_percent,
            default_pur_price,
            default_sale_price,
            size_group_id,
            purchase_discount_type,
            purchase_discount_value
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

      const { data, error } = await variantsQuery.limit(100);

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
          gst_per: v.products?.purchase_gst_percent || v.products?.gst_per || 0,
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

  // Handle product created from dialog - auto-add items with qty to bill
  const handleProductCreated = async (product: {
    id: string;
    product_name: string;
    brand: string | null;
    category: string | null;
    gst_per: number;
    purchase_gst_percent?: number;
    sale_gst_percent?: number;
    hsn_code: string | null;
    color: string | null;
    style?: string | null;
    purchase_discount_type?: string | null;
    purchase_discount_value?: number | null;
    variants: any[];
  }) => {
    if (product.variants && product.variants.length > 0) {
      // Check if any variant has purchase_qty > 0 (size-wise qty was entered)
      const variantsWithQty = product.variants.filter((v: any) => (v.purchase_qty || 0) > 0);

      if (variantsWithQty.length > 0) {
        // Auto-add all sizes with qty directly to bill
        let addedCount = 0;
        for (const variant of variantsWithQty) {
          const discountPercent = (() => {
            const pdt = product.purchase_discount_type;
            const pdv = product.purchase_discount_value || 0;
            if (pdv > 0 && (!pdt || pdt === 'percent')) return pdv;
            return 0;
          })();

          addItemRow({
            product_name: product.product_name,
            product_id: product.id,
            sku_id: variant.id,
            size: variant.size,
            qty: variant.purchase_qty,
            pur_price: variant.pur_price || 0,
            sale_price: variant.sale_price || 0,
            mrp: variant.mrp || variant.sale_price || 0,
            gst_per: product.purchase_gst_percent || product.gst_per || 0,
            hsn_code: product.hsn_code || "",
            barcode: variant.barcode || "",
            discount_percent: discountPercent,
            brand: product.brand || "",
            category: product.category || "",
            color: variant.color || product.color || "",
            style: product.style || "",
          });
          addedCount++;
        }

        const totalQty = variantsWithQty.reduce((s: number, v: any) => s + (v.purchase_qty || 0), 0);
        toast({
          title: "Product Added to Bill",
          description: `${product.product_name}: ${addedCount} sizes, ${totalQty} pcs added`,
        });

        // Blur so "1" shortcut works immediately
        (document.activeElement as HTMLElement)?.blur();
      } else {
        // No qty entered — fallback to size grid
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
      }
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
          gst_per: product.purchase_gst_percent || product.gst_per,
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
    const grossBeforeDiscount = lineItems.reduce((sum, r) => sum + (r.qty * r.pur_price), 0);
    const itemDiscount = lineItems.reduce((sum, r) => {
      const sub = r.qty * r.pur_price;
      return sum + (sub * r.discount_percent / 100);
    }, 0);
    const grossAfterItemDiscount = grossBeforeDiscount - itemDiscount;
    const grossAfterAllDiscount = grossAfterItemDiscount - discountAmount;
    const gst = isDcPurchase ? 0 : lineItems.reduce((sum, r) => sum + (r.line_total * r.gst_per / 100), 0);
    const netBeforeRoundOff = grossAfterAllDiscount + gst + otherCharges;
    // Auto round-off: calculate round-off so net amount is always a whole number
    const autoRoundOff = Math.round(netBeforeRoundOff) - netBeforeRoundOff;
    const roundedAutoRoundOff = parseFloat(autoRoundOff.toFixed(2));
    setRoundOff(roundedAutoRoundOff);
    setGrossAmount(grossBeforeDiscount);
    setGstAmount(gst);
    setNetAmount(Math.round(netBeforeRoundOff));
  }, [lineItems, discountAmount, otherCharges, isDcPurchase]);

  // When DC Purchase is toggled ON, zero out GST on all existing line items
  useEffect(() => {
    if (isDcPurchase && lineItems.length > 0) {
      const hasNonZeroGst = lineItems.some(item => item.gst_per > 0);
      if (hasNonZeroGst) {
        setLineItems(prev => prev.map(item => ({ ...item, gst_per: 0 })));
        toast({ title: "DC Purchase", description: "Purchase GST set to 0% for all items (No GST)" });
      }
    }
  }, [isDcPurchase]);

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
            purchase_gst_percent,
            sale_gst_percent,
            default_pur_price,
            default_sale_price,
            size_group_id,
            purchase_discount_type,
            purchase_discount_value
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
          gst_per: v.products?.purchase_gst_percent || v.products?.gst_per || 0,
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
          purchase_gst_percent,
          sale_gst_percent,
          default_pur_price,
          default_sale_price,
          purchase_discount_type,
          purchase_discount_value
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
      
      if (!barcode && isAutoBarcode) {
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
        gst_per: product.purchase_gst_percent || product.gst_per || 0,
        hsn_code: product.hsn_code || "",
        barcode: barcode,
        discount_percent: (() => {
          const pdt = (product as any).purchase_discount_type;
          const pdv = (product as any).purchase_discount_value || 0;
          if (pdv > 0 && (!pdt || pdt === 'percent')) return pdv;
          return 0;
        })(),
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
          barcode = isAutoBarcode ? await generateCentralizedBarcode() : '';
          
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
        if (!barcode && isAutoBarcode) {
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
        gst_per: selectedProduct.purchase_gst_percent || selectedProduct.gst_per || 0,
        hsn_code: selectedProduct.hsn_code || "",
        barcode: barcode,
        discount_percent: (() => {
          const pdt = (selectedProduct as any).purchase_discount_type;
          const pdv = (selectedProduct as any).purchase_discount_value || 0;
          if (pdv > 0 && (!pdt || pdt === 'percent')) return pdv;
          return 0;
        })(),
        brand: selectedProduct.brand || "",
        category: selectedProduct.category || "",
        color: newColor || variant.color || selectedProduct.color || "",
        style: selectedProduct.style || "",
      });
    }

    setShowSizeGrid(false);
    setSizeQty({});
    // Blur so "1" shortcut works immediately
    (document.activeElement as HTMLElement)?.blur();
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
    const effectiveGst = isDcPurchase ? 0 : item.gst_per;
    const subTotal = item.qty * item.pur_price;
    const discountAmount = subTotal * (item.discount_percent / 100);
    const lineTotal = subTotal - discountAmount;
    setLineItems((prev) => [
      ...prev,
      {
        ...item,
        gst_per: effectiveGst,
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
      // Press "1" key to open Add New Product dialog — skip when typing in any input field
      if (e.key === "1" && !showProductDialog) {
        const active = document.activeElement as HTMLElement;
        const tag = active?.tagName?.toLowerCase();
        const isEditable = active?.isContentEditable;
        if (tag === "input" || tag === "textarea" || tag === "select" || isEditable) {
          return; // Allow normal typing
        }
        e.preventDefault();
        setShowProductDialog(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lineItems, showProductDialog]);

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
    
    // Helper function to compare prices with tolerance for floating-point precision
    const arePricesEqual = (p1: number | null | undefined, p2: number | null | undefined): boolean => {
      const v1 = Number(p1) || 0;
      const v2 = Number(p2) || 0;
      return Math.abs(v1 - v2) < 0.001; // Tolerance of 0.001 (less than 1 paisa)
    };
    
    // Compare prices for each unique item (by sku_id)
    const processedSkus = new Set<string>();
    
    for (const item of items) {
      if (!item.sku_id || processedSkus.has(item.sku_id)) continue;
      processedSkus.add(item.sku_id);
      
      const variant = variantMap.get(item.sku_id);
      if (!variant) continue;
      
      // Check pur_price - use tolerance-based comparison
      if (variant.pur_price !== null && !arePricesEqual(variant.pur_price, item.pur_price)) {
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
      
      // Check sale_price - use tolerance-based comparison
      if (variant.sale_price !== null && !arePricesEqual(variant.sale_price, item.sale_price)) {
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
      
      // Check MRP only if MRP setting is enabled - use tolerance-based comparison
      if (showMrp) {
        const itemMrp = Number(item.mrp) || 0;
        const variantMrp = Number(variant.mrp) || 0;
        if (variantMrp > 0 && itemMrp > 0 && !arePricesEqual(variantMrp, itemMrp)) {
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
      // Show print dialog if it was deferred
      if (pendingPrintAfterPriceUpdate) {
        setPendingPrintAfterPriceUpdate(false);
        setShowPrintDialog(true);
      }
    }
  };

  const handlePriceUpdateSkip = () => {
    setShowPriceUpdateDialog(false);
    setDetectedPriceChanges([]);
    // Show print dialog if it was deferred
    if (pendingPrintAfterPriceUpdate) {
      setPendingPrintAfterPriceUpdate(false);
      setShowPrintDialog(true);
    }
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
      const calculatedGrossBeforeDiscount = lineItems.reduce((sum, r) => sum + (r.qty * r.pur_price), 0);
      const calculatedItemDiscount = lineItems.reduce((sum, r) => {
        const sub = r.qty * r.pur_price;
        return sum + (sub * r.discount_percent / 100);
      }, 0);
      const calculatedTotalDiscount = calculatedItemDiscount + discountAmount;
      const calculatedGrossAfterDiscount = calculatedGrossBeforeDiscount - calculatedTotalDiscount;
      const calculatedGst = lineItems.reduce((sum, r) => sum + (r.line_total * r.gst_per / 100), 0);
      const calculatedNet = calculatedGrossAfterDiscount + calculatedGst + otherCharges + roundOff;

      if (isEditMode && editingBillId) {
        // Update existing bill
        const { error: billError } = await supabase
          .from("purchase_bills")
          .update({
            supplier_id: billData.supplier_id || null,
            supplier_name: billData.supplier_name,
              supplier_invoice_no: billData.supplier_invoice_no,
              bill_date: format(billDate, "yyyy-MM-dd"),
              gross_amount: calculatedGrossBeforeDiscount,
              discount_amount: calculatedTotalDiscount,
              gst_amount: isDcPurchase ? 0 : calculatedGst,
              other_charges: otherCharges,
              net_amount: isDcPurchase ? (calculatedGrossAfterDiscount + otherCharges + roundOff) : calculatedNet,
              round_off: roundOff,
              is_dc_purchase: isDcPurchase,
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

        // Store items for barcode printing (edit mode)
        const editItemsWithDetails = await Promise.all(
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
        setSavedPurchaseItems(editItemsWithDetails);
        setSavedBillId(editingBillId);
        setSavedSupplierId(billData.supplier_id || null);
        setNewlyAddedItems(insertedNewItems);

        // Check for price changes and show dialog if any
        const priceChanges = await detectPriceChanges(lineItems);
        if (priceChanges.length > 0) {
          setDetectedPriceChanges(priceChanges);
          setPendingSaveItems([...lineItems]);
          setShowPriceUpdateDialog(true);
          // Defer print dialog until price update is handled
          if (enableBarcodePrompt) {
            setPendingPrintAfterPriceUpdate(true);
          }
        } else {
          // No price changes — show print dialog immediately
          if (enableBarcodePrompt) {
            setShowPrintDialog(true);
          }
        }

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
        setDiscountAmount(0);
        setRoundOff(0);
        setSoftwareBillNo("");
        setIsDcPurchase(false);
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
              gross_amount: calculatedGrossBeforeDiscount,
              discount_amount: calculatedTotalDiscount,
              gst_amount: isDcPurchase ? 0 : calculatedGst,
              other_charges: otherCharges,
              net_amount: isDcPurchase ? (calculatedGrossAfterDiscount + otherCharges + roundOff) : calculatedNet,
              round_off: roundOff,
              organization_id: currentOrganization.id,
              is_dc_purchase: isDcPurchase,
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
          gst_per: isDcPurchase ? 0 : item.gst_per,
          hsn_code: item.hsn_code,
          barcode: item.barcode,
          line_total: item.line_total,
          bill_number: finalBillNo,
          brand: item.brand || null,
          category: item.category || null,
          color: item.color || null,
          style: item.style || null,
          is_dc_item: isDcPurchase,
        }));

        const { error: itemsError } = await supabase
          .from("purchase_items")
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;

        // Flag product variants as DC products (or reset if non-DC purchase)
        const variantIds = [...new Set(lineItems.map(i => i.sku_id))];
        if (variantIds.length > 0) {
          await supabase
            .from("product_variants")
            .update({ is_dc_product: isDcPurchase })
            .in("id", variantIds);
        }

        // Check for price changes and show dialog if any
        const priceChanges = await detectPriceChanges(lineItems);
        const hasPriceChanges = priceChanges.length > 0;
        if (hasPriceChanges) {
          setDetectedPriceChanges(priceChanges);
          setPendingSaveItems([...lineItems]);
          setShowPriceUpdateDialog(true);
        }

        toast({
          title: "Success",
          description: `Purchase bill saved successfully`,
        });

        // Invalidate dashboard queries for immediate UI refresh
        invalidatePurchases();
        queryClient.invalidateQueries({ queryKey: ["next-supplier-inv-no"] });
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

        // Store items for barcode printing
        setSavedPurchaseItems(itemsWithDetails);
        setSavedBillId(billDataResult.id);
        setSavedSupplierId(billData.supplier_id || null);
        setNewlyAddedItems([]); // All items are new for a new bill
        if (enableBarcodePrompt) {
          if (hasPriceChanges) {
            // Defer print dialog until price update is handled
            setPendingPrintAfterPriceUpdate(true);
          } else {
            setShowPrintDialog(true);
          }
        }

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
        setDiscountAmount(0);
        setRoundOff(0);
        setSoftwareBillNo(""); // Reset for next entry
        setIsDcPurchase(false);
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

  const itemDiscountTotal = lineItems.reduce((sum, r) => {
    const sub = r.qty * r.pur_price;
    return sum + (sub * r.discount_percent / 100);
  }, 0);

  const totals = { 
    totalQty: lineItems.reduce((sum, item) => sum + item.qty, 0),
    totalDiscount: discountAmount,
    itemDiscount: itemDiscountTotal,
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
      const suppId = savedSupplierId || billData.supplier_id;
      if (suppId) {
        const { data: supplierData } = await supabase
          .from("suppliers")
          .select("supplier_code")
          .eq("id", suppId)
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
        bill_date: format(billDate, "yyyy-MM-dd"),
        supplier_code: supplierCode,
      }));

      // Clear selection after navigation
      setSelectedForPrint(new Set());

      // Navigate to barcode printing page with items
      navigate("/barcode-printing", { 
        state: { purchaseItems: barcodeItems, billId: savedBillId || editingBillId } 
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

    // Show clear error if no valid rows found after filtering
    if (validRows.length === 0) {
      toast({
        title: "No valid rows found",
        description: "Please check that required columns (Product Name, Size, Quantity, Purchase Price) are mapped correctly.",
        variant: "destructive",
      });
      return;
    }

    const BATCH_SIZE = 20;
    const newLineItems: LineItem[] = [];
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = mappedData.length - validRows.length;

    // Pre-fetch existing products (filter out deleted)
    const { data: existingProducts } = await supabase
      .from('products')
      .select('id, product_name, brand, category, color, style')
      .eq('organization_id', currentOrganization.id)
      .is('deleted_at', null);

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

    // Collect product IDs that appear in the Excel data
    const excelProductKeys = new Set<string>();
    for (const row of validRows) {
      const productKey = [
        row.product_name?.toString().trim() || '',
        row.brand?.toString().trim() || '',
        row.category?.toString().trim() || '',
        row.color?.toString().trim() || '',
        row.style?.toString().trim() || '',
      ].join('|').toLowerCase();
      excelProductKeys.add(productKey);
    }
    const relevantProductIds = Array.from(excelProductKeys)
      .map(k => productMap.get(k))
      .filter(Boolean) as string[];

    // Pre-fetch variants only for products in the Excel (batched to avoid URL length issues)
    const variantMap = new Map<string, { id: string; barcode: string }>();
    if (relevantProductIds.length > 0) {
      const VARIANT_BATCH = 50;
      for (let b = 0; b < relevantProductIds.length; b += VARIANT_BATCH) {
        const batch = relevantProductIds.slice(b, b + VARIANT_BATCH);
        const { data: batchVariants } = await supabase
          .from('product_variants')
          .select('id, product_id, size, barcode, color')
          .eq('organization_id', currentOrganization.id)
          .is('deleted_at', null)
          .in('product_id', batch);
        (batchVariants || []).forEach(v => {
          const key = `${v.product_id}|${(v.color || '').toLowerCase()}|${(v.size || '').toLowerCase()}`;
          variantMap.set(key, { id: v.id, barcode: v.barcode || '' });
        });
      }
    }

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
                gst_per: parseLocalizedNumber(row.gst_per),
                default_pur_price: parseLocalizedNumber(row.pur_price),
                default_sale_price: parseLocalizedNumber(row.sale_price),
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

          const size = row.size?.toString().trim() || '';
          const color = row.color?.toString().trim() || '';
          // Include color in variant key to match unique index (product_id, color, size)
          const variantKey = `${productId}|${color.toLowerCase()}|${size.toLowerCase()}`;
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

            // Check-then-insert pattern (expression-based index can't use ON CONFLICT)
            const colorFilter = color ? `color.eq.${color}` : 'color.is.null';
            const { data: existingVariant } = await supabase
              .from('product_variants')
              .select('id')
              .eq('product_id', productId)
              .eq('size', size || '')
              .or(colorFilter)
              .is('deleted_at', null)
              .eq('organization_id', currentOrganization.id)
              .maybeSingle();

            let newVariantId: string | null = null;
            let variantError: any = null;

            if (existingVariant) {
              newVariantId = existingVariant.id;
            } else {
              // Check for duplicate barcode before inserting new variant
              if (barcode) {
                const { exists, productName: conflictProduct } = await checkBarcodeExists(barcode, currentOrganization.id);
                if (exists) {
                  toast({
                    title: "Duplicate Barcode Warning",
                    description: `Barcode "${barcode}" already exists in "${conflictProduct}". Proceeding with import.`,
                    variant: "destructive",
                  });
                }
              }

              const { data: inserted, error: insertErr } = await supabase
                .from('product_variants')
                .insert({
                  organization_id: currentOrganization.id,
                  product_id: productId,
                  size: size || '',
                  color: color || null,
                  barcode: barcode,
                  pur_price: parseLocalizedNumber(row.pur_price),
                  sale_price: parseLocalizedNumber(row.sale_price),
                  stock_qty: 0,
                  active: true,
                })
                .select('id')
                .single();
              newVariantId = inserted?.id || null;
              variantError = insertErr;
            }

            if (variantError || !newVariantId) {
              errorCount++;
              continue;
            }
            skuId = newVariantId;
            variantMap.set(variantKey, { id: skuId, barcode });
          }

          const qty = parseLocalizedNumber(row.qty) || 0;
          const purPrice = parseLocalizedNumber(row.pur_price) || 0;
          const lineTotal = qty * purPrice;

          newLineItems.push({
            temp_id: `import_${Date.now()}_${Math.random()}`,
            product_id: productId,
            sku_id: skuId,
            product_name: row.product_name?.toString().trim() || '',
            size: size,
            qty: qty,
            pur_price: purPrice,
            sale_price: parseLocalizedNumber(row.sale_price) || 0,
            gst_per: parseLocalizedNumber(row.gst_per) || 0,
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

  const isMobile = useIsMobile();

  if (isMobile) {
    const filledItems = lineItems.filter(i => i.product_id);
    const totalQty = filledItems.reduce((s, i) => s + (i.qty || 0), 0);
    return (
      <div className="flex flex-col min-h-screen bg-muted/30">
        <MobilePageHeader
          title={isEditMode ? "Edit Purchase" : "Purchase Entry"}
          subtitle={softwareBillNo || "NEW"}
          backTo="/purchase-bills"
        />

        <div className="flex-1 overflow-y-auto pb-40 space-y-3 px-4 pt-3">
          {/* Supplier section */}
          <div className="bg-background rounded-2xl p-3.5 border border-border/40 shadow-sm space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Supplier & Bill Details</p>
            <Select value={billData.supplier_id} onValueChange={(value) => {
              const s = suppliers.find((s: any) => s.id === value);
              setBillData({ ...billData, supplier_id: value, supplier_name: s?.supplier_name || "" });
            }}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Select Supplier" /></SelectTrigger>
              <SelectContent>{suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.supplier_name}</SelectItem>)}</SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px]">Bill Date</Label>
                <Input type="date" value={format(billDate, "yyyy-MM-dd")} onChange={(e) => setBillDate(new Date(e.target.value))} className="h-9 text-sm rounded-xl" />
              </div>
              <div>
                <Label className="text-[11px]">Supplier Inv. No.</Label>
                <Input data-field="supplier-invoice-no" value={billData.supplier_invoice_no} onChange={(e) => setBillData({ ...billData, supplier_invoice_no: e.target.value })} placeholder="Inv #" className="h-9 text-sm rounded-xl" />
              </div>
            </div>
          </div>

          {/* Product search */}
          <div className="bg-background rounded-2xl p-3.5 border border-border/40 shadow-sm space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add Products</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="Scan barcode or search…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-11 text-base rounded-xl"
                autoComplete="off"
                autoCapitalize="off"
              />
            </div>
            {/* Mobile Search Results Dropdown */}
            {showSearch && searchResults.length > 0 && (
              <div className="bg-popover border border-border rounded-xl shadow-lg max-h-72 overflow-auto -mx-0.5">
                {searchResults.slice(0, 50).map((result, idx) => (
                  <button
                    key={result.id + idx}
                    type="button"
                    onClick={() => handleProductSelect(result)}
                    className="w-full text-left px-3.5 py-2.5 border-b border-border/30 last:border-0 active:bg-accent/70 transition-colors"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {formatProductDescription({
                            product_name: result.product_name,
                            category: result.category,
                            brand: result.brand,
                            style: result.style,
                            color: result.color,
                            size: result.size
                          })}
                        </p>
                        <div className="flex flex-wrap items-center gap-1 mt-0.5">
                          {result.barcode && <span className="text-[11px] text-muted-foreground font-mono">{result.barcode}</span>}
                          {result.size_range && <span className="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{result.size_range}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-primary">₹{result.pur_price?.toFixed(2) || '0.00'}</p>
                        <p className="text-[11px] text-muted-foreground">Sale: ₹{result.sale_price?.toFixed(2) || '0.00'}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {!showSearch && searchResults.length === 0 && searchQuery.length >= 2 && (
              <p className="text-xs text-muted-foreground text-center py-2">No products found</p>
            )}
          </div>

          {/* Items list */}
          {filledItems.length > 0 && (
            <div className="bg-background rounded-2xl border border-border/40 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border/30">
                <p className="text-xs font-semibold text-foreground">Items ({filledItems.length})</p>
                <p className="text-xs text-muted-foreground">{totalQty} pcs</p>
              </div>
              <div className="divide-y divide-border/20">
                {filledItems.map((item) => {
                  const realIdx = lineItems.indexOf(item);
                  return (
                    <div key={item.temp_id} className="flex items-center justify-between px-3.5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{item.product_name || item.barcode}</p>
                        <p className="text-[11px] text-muted-foreground">{item.size} {item.color}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <button onClick={() => { const u = [...lineItems]; if (u[realIdx].qty > 1) { u[realIdx] = { ...u[realIdx], qty: u[realIdx].qty - 1 }; setLineItems(u); } }}
                            className="w-8 h-8 bg-muted rounded-lg text-base font-bold flex items-center justify-center active:scale-90 touch-manipulation">−</button>
                          <span className="w-8 text-center text-sm font-semibold tabular-nums">{item.qty}</span>
                          <button onClick={() => { const u = [...lineItems]; u[realIdx] = { ...u[realIdx], qty: u[realIdx].qty + 1 }; setLineItems(u); }}
                            className="w-8 h-8 bg-muted rounded-lg text-base font-bold flex items-center justify-center active:scale-90 touch-manipulation">+</button>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <CalculatorInput
                          value={item.pur_price}
                          onChange={(val) => { const u = [...lineItems]; u[realIdx] = { ...u[realIdx], pur_price: val }; setLineItems(u); }}
                          className="w-20 h-8 text-right text-sm rounded-lg border"
                          placeholder="Price"
                        />
                        <p className="text-xs font-semibold text-foreground mt-1 tabular-nums">= ₹{Math.round((item.pur_price || 0) * (item.qty || 0)).toLocaleString("en-IN")}</p>
                        <button onClick={() => setLineItems(lineItems.filter((_, i) => i !== realIdx))} className="text-[10px] text-destructive font-medium mt-1">Remove</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Totals */}
          {filledItems.length > 0 && (
            <div className="bg-background rounded-2xl p-3.5 border border-border/40 shadow-sm space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Qty</span>
                <span className="font-medium tabular-nums">{totalQty} pcs</span>
              </div>
              <div className="flex justify-between text-base font-bold pt-1 border-t border-border/30">
                <span>Grand Total</span>
                <span className="tabular-nums">₹{Math.round(totals.netAmount || 0).toLocaleString("en-IN")}</span>
              </div>
            </div>
          )}
        </div>

        {/* Fixed save bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border p-4 z-30" style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}>
          <button
            onClick={handleSave}
            disabled={loading || lineItems.length === 0}
            className="w-full bg-primary text-primary-foreground rounded-xl h-12 font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 touch-manipulation shadow-sm disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {loading ? "Saving…" : `Save Bill${filledItems.length > 0 ? ` · ₹${Math.round(totals.netAmount || 0).toLocaleString("en-IN")}` : ""}`}
          </button>
        </div>

        {/* All existing dialogs */}
        <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Bill Saved</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Button variant="outline" onClick={() => { setShowPrintDialog(false); navigate("/barcode-printing", { state: { purchaseItems: savedPurchaseItems.length > 0 ? savedPurchaseItems : lineItems, billId: savedBillId || editingBillId } }); }} className="w-full gap-2"><Printer className="h-4 w-4" /> Print Barcodes</Button>
              <Button variant="secondary" onClick={() => { setShowPrintDialog(false); if (savedBillId) navigate("/purchase-entry", { state: { editBillId: savedBillId } }); }} className="w-full gap-2"><Plus className="h-4 w-4" /> Continue Adding</Button>
              <Button variant="outline" onClick={() => setShowPrintDialog(false)} className="w-full">Skip</Button>
            </div>
          </DialogContent>
        </Dialog>
        <ExcelImportDialog open={showExcelImport} onClose={() => setShowExcelImport(false)} targetFields={purchaseBillFields} onImport={handleExcelImport} title="Import Purchase Bill" sampleData={purchaseBillSampleData} sampleFileName="Purchase_Bill_Sample.xlsx" />
        <ProductEntryDialog open={showProductDialog} onOpenChange={setShowProductDialog} onProductCreated={handleProductCreated} hideOpeningQty isDcPurchase={isDcPurchase} isAutoBarcode={isAutoBarcode} />
        <PriceUpdateConfirmDialog open={showPriceUpdateDialog} onOpenChange={setShowPriceUpdateDialog} priceChanges={detectedPriceChanges} onConfirm={handlePriceUpdateConfirm} onSkip={handlePriceUpdateSkip} />
        <AddSupplierDialog open={showAddSupplierDialog} onClose={() => setShowAddSupplierDialog(false)} onSupplierCreated={(supplier) => { refetchSuppliers(); setBillData((prev) => ({ ...prev, supplier_id: supplier.id, supplier_name: supplier.supplier_name })); }} />
        <SizeGridDialog open={showSizeGrid} onClose={() => setShowSizeGrid(false)} product={selectedProduct} variants={sizeGridVariants} onConfirm={handleSizeGridConfirm} />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-100">
      <header className="bg-gradient-to-r from-slate-900 to-slate-800 h-14 flex items-center px-5 gap-3 shrink-0 shadow-[0_2px_12px_rgba(0,0,0,.35)] relative z-50 border-b-2 border-green-500/60">
        {/* Back button */}
        <Button variant="ghost" size="sm" onClick={() => navigate('/purchase-bills')}
          className="text-white/70 hover:text-white hover:bg-white/10 h-8 gap-1.5">
          <ChevronLeft className="h-4 w-4" />
          Purchase Dashboard
        </Button>
        <div className="w-px h-6 bg-white/15" />

        {/* Title */}
        <h1 className="text-white font-bold text-[14px] tracking-tight whitespace-nowrap">
          {isEditMode ? 'Edit Purchase Bill' : 'Purchase Entry'}
        </h1>

        {/* Auto bill number badge */}
        {softwareBillNo && (
          <span className="bg-green-500 text-white font-mono text-[11px] font-bold px-2.5 py-1 rounded-full tracking-wide whitespace-nowrap">
            {softwareBillNo}
          </span>
        )}
        {navBillIndex !== null && allBillIds && (
          <span className="text-white/50 text-xs hidden lg:inline">
            {navBillIndex + 1} of {allBillIds.length}
          </span>
        )}

        {/* Last bill info pill - center */}
        {!isEditMode && lastPurchaseBill && (
          <div className="hidden md:flex items-center gap-2 bg-white/10 rounded-lg px-4 py-1.5 border border-white/20 text-[11px] mx-auto">
            <span className="text-white/50">Last Bill:</span>
            <span className="text-green-300 font-semibold font-mono">
              {lastPurchaseBill.software_bill_no}
            </span>
            {lastPurchaseBill.supplier_invoice_no && (
              <>
                <span className="text-white/30">|</span>
                <span className="text-white/50">Sup Inv:</span>
                <span className="text-green-300 font-semibold font-mono">
                  {lastPurchaseBill.supplier_invoice_no}
                </span>
              </>
            )}
          </div>
        )}

        {/* Nav + Print on the right */}
        <div className="flex items-center gap-1 ml-auto">
          {/* Navigation buttons */}
          <Button variant="ghost" size="sm" onClick={handleLastBill}
            disabled={isLoadingNavBill || !allBillIds?.length}
            className="h-8 text-white hover:text-white hover:bg-white/20 border border-white/30 text-xs gap-1.5 w-8 p-0"
            title="Last Record">
            <SkipBack className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handlePreviousBill}
            disabled={isLoadingNavBill || navBillIndex === null || navBillIndex >= (allBillIds?.length || 0) - 1}
            className="h-8 text-white hover:text-white hover:bg-white/20 border border-white/30 text-xs gap-1.5 w-8 p-0"
            title="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleNextBill}
            disabled={isLoadingNavBill || navBillIndex === null || navBillIndex <= 0}
            className="h-8 text-white hover:text-white hover:bg-white/20 border border-white/30 text-xs gap-1.5 w-8 p-0"
            title="Next">
            <ChevronRight className="h-4 w-4" />
           </Button>
          <div className="w-px h-6 bg-white/15 mx-1" />
          <Button variant="ghost" size="sm" onClick={() => {
              setLineItems([]);
              setBillData({ supplier_id: "", supplier_name: "", supplier_invoice_no: "" });
              setSoftwareBillNo("");
              setBillDate(new Date());
              setOtherCharges(0);
              setRoundOff(0);
              setEditingBillId(null);
              setIsEditMode(false);
              setOriginalLineItems([]);
              setNavBillIndex(null);
              setSavedBillId(null);
              setSavedPurchaseItems([]);
              setNewlyAddedItems([]);
              setSearchQuery("");
              setSearchResults([]);
              setShowSearch(false);
              setSelectedProduct(null);
              setShowPrintDialog(false);
              setBarcodeWarnings(new Map());
              setDetectedPriceChanges([]);
              setSelectedForPrint(new Set());
              setIsDcPurchase(false);
              deleteDraft();
              
            }}
            className="h-8 text-white hover:text-white hover:bg-white/20 border border-white/30 text-xs gap-1.5 px-2.5"
            title="New Bill">
            <Plus className="h-3.5 w-3.5" />
            <span>New</span>
          </Button>
          <div className="w-px h-6 bg-white/15 mx-1" />
          <InlineTotalQty
            totalQty={lineItems.reduce((sum, item) => sum + item.qty, 0)}
            itemCount={lineItems.filter(i => i.product_id).length}
          />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto overflow-x-hidden">

        {/* Supplier & Bill Details Card */}
        <section className='bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0'>
          <div className='flex items-center gap-2 mb-3'>
            <div className='w-[3px] h-[18px] bg-green-600 rounded-full flex-shrink-0' />
            <span className='text-[10px] font-bold uppercase tracking-widest text-slate-400'>
              Supplier & Bill Details
            </span>
          </div>
            <div className='grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 items-end'>
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
                    onClick={() => setShowAddSupplierDialog(true)}
                    title="Add New Supplier"
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
                <Popover open={billDateOpen} onOpenChange={setBillDateOpen}>
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
                      onSelect={(date) => { if (date) { setBillDate(date); setBillDateOpen(false); } }}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* DC Purchase Checkbox */}
              <div className="space-y-2 flex items-end">
                <label className="flex items-center gap-2 cursor-pointer h-10 px-3 border border-orange-300 bg-orange-50 dark:bg-orange-950/20 rounded-md">
                  <Checkbox
                    checked={isDcPurchase}
                    onCheckedChange={(checked) => setIsDcPurchase(checked === true)}
                  />
                  <span className="text-xs font-medium text-orange-700 dark:text-orange-400 whitespace-nowrap">
                    DC Purchase (No GST)
                  </span>
                </label>
              </div>

            </div>

            {/* DC Warning */}
            {isDcPurchase && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <span className="text-xs text-amber-700 dark:text-amber-400">
                  DC Purchase — GST set to 0% for all items. This bill will NOT appear in GST Purchase Register.
                </span>
              </div>
            )}
          </section>

        {/* Products Table Card */}
        <section className='bg-green-50/40 border-b border-green-100 px-6 py-3 flex-shrink-0'>
          <div className='flex items-center gap-3 flex-wrap mt-2'>
            <div className='flex items-center gap-2'>
              <div className='w-[3px] h-[18px] bg-green-600 rounded-full flex-shrink-0' />
              <span className='text-[10px] font-bold uppercase tracking-widest text-slate-400'>
                Products
              </span>
            </div>
              <div className='flex-1'>
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
                          onMouseDown={(e) => e.preventDefault()}
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
          <div className='flex-1 overflow-auto border-0'>
            <Table className='table-fixed min-w-[1460px] border-separate border-spacing-0'>
              <TableHeader className='sticky top-0 z-10 erp-invoice-table-header'>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <input
                        type="checkbox"
                        checked={lineItems.length > 0 && lineItems.every((_, i) => document.getElementById(`check-${i}`)?.getAttribute('data-state') === 'checked')}
                        className="rounded"
                        readOnly
                      />
                    </TableHead>
                    <TableHead className="w-[60px]">SR.NO</TableHead>
                    <TableHead className="w-[260px]">ITEM NAME</TableHead>
                    <TableHead className="w-[50px]">SIZE</TableHead>
                    <TableHead className="w-[120px]">{isMobileERPMode ? 'IMEI NUMBER' : 'BARCODE'}</TableHead>
                    <TableHead className="w-[80px] text-right">QTY</TableHead>
                    <TableHead className='w-[120px] text-right pur-rate-col'>PUR.RATE</TableHead>
                    <TableHead className='w-[120px] text-right sale-rate-col'>SALE.RATE</TableHead>
                    {showMrp && <TableHead className="w-[120px] text-right">MRP</TableHead>}
                    <TableHead className="w-[100px] text-right">GST %</TableHead>
                    <TableHead className="w-[120px] text-right">SUB TOTAL</TableHead>
                    <TableHead className="w-[100px] text-right">DISC %</TableHead>
                    <TableHead className='w-[120px] text-right total-col'>TOTAL</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
              </Table>
              <div className="max-h-[50vh] overflow-y-auto isolate">
              <Table className="table-fixed min-w-[1460px]">
                <TableBody>
                  {lineItems.map((item, index) => {
                    const subTotal = item.qty * item.pur_price;
                    const total = item.line_total;
                    const gstAmount = (total * item.gst_per) / 100;
                    
                    return (
                      <TableRow key={item.temp_id} className={`hover:bg-green-50/40 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}>
                        <TableCell className="w-[40px]">
                          <Checkbox
                            checked={selectedForPrint.has(item.temp_id)}
                            onCheckedChange={() => toggleItemSelection(item.temp_id)}
                            aria-label={`Select ${item.product_name} for printing`}
                          />
                        </TableCell>
                        <TableCell className="w-[60px] text-center font-medium">{index + 1}</TableCell>
                        <TableCell className="w-[260px] max-w-[260px] font-medium" title={formatProductDescription(item)}>
                          <div className="text-sm leading-snug break-words">{formatProductDescription(item)}</div>
                        </TableCell>
                        <TableCell className="w-[50px] text-sm">{item.size || "—"}</TableCell>
                        <TableCell className="w-[120px]">
                          <Badge variant="outline" className={cn("text-xs", isMobileERPMode ? "font-mono tracking-wider" : "font-mono")}>
                            {item.barcode || "—"}
                          </Badge>
                          {barcodeWarnings.has(item.temp_id) && (
                            <div className="flex items-start gap-1.5 mt-1 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-2 py-1.5">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                              <span>{barcodeWarnings.get(item.temp_id)}</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="w-[80px]">
                          <Input
                            ref={index === lineItems.length - 1 ? lastQtyInputRef : undefined}
                            type="number"
                            min="1"
                            value={item.qty || ""}
                            onChange={(e) =>
                              updateLineItem(
                                item.temp_id,
                                "qty",
                                parseInt(e.target.value) || 0
                              )
                            }
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            className="w-full text-right px-2 bg-amber-50 border-amber-200 text-center font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </TableCell>
                        <TableCell className="w-[120px]">
                          <CalculatorInput
                            value={item.pur_price}
                            onChange={(val) =>
                              updateLineItem(item.temp_id, "pur_price", val)
                            }
                            className="w-full text-right bg-green-50 border-green-200 text-green-800 font-bold"
                          />
                        </TableCell>
                        <TableCell className="w-[120px]">
                          <CalculatorInput
                            value={item.sale_price}
                            onChange={(val) =>
                              updateLineItem(item.temp_id, "sale_price", val)
                            }
                            className="w-full text-right bg-blue-50 border-blue-200 text-blue-800 font-bold"
                          />
                        </TableCell>
                        {showMrp && (
                          <TableCell className="w-[120px]">
                            <CalculatorInput
                              value={item.mrp || 0}
                              onChange={(val) =>
                                updateLineItem(item.temp_id, "mrp", val)
                              }
                              className="w-full text-right"
                            />
                          </TableCell>
                        )}
                        <TableCell className="w-[100px]">
                          <Select
                            value={String(item.gst_per)}
                            onValueChange={(value) =>
                              updateLineItem(item.temp_id, "gst_per", Number(value))
                            }
                          >
                            <SelectTrigger className="w-full h-9">
                              <SelectValue placeholder="GST" />
                            </SelectTrigger>
                            <SelectContent className="bg-background z-50">
                              <SelectItem value="0">0%</SelectItem>
                              <SelectItem value="5">5%</SelectItem>
                              <SelectItem value="12">12%</SelectItem>
                              <SelectItem value="18">18%</SelectItem>
                              <SelectItem value="28">28%</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="w-[120px] text-right font-semibold tabular-nums">
                          ₹{subTotal.toFixed(2)}
                        </TableCell>
                        <TableCell className="w-[100px]">
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
                            className="w-full text-right"
                          />
                        </TableCell>
                        <TableCell className="w-[120px] text-right font-bold tabular-nums text-green-700 bg-green-50/40 font-mono">
                          ₹{total.toFixed(2)}
                        </TableCell>
                        <TableCell className="w-[40px]">
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
                  <TableRow className="bg-accent/30 relative" style={{ zIndex: 50 }}>
                    <TableCell className="w-[40px]"></TableCell>
                    <TableCell className="w-[60px] text-center font-medium text-muted-foreground">
                      {lineItems.length + 1}
                    </TableCell>
                    <TableCell colSpan={3} className="relative overflow-visible" style={{ overflow: 'visible' }}>
                      <div className="relative" style={{ overflow: 'visible' }}>
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
                            // Delay hiding to allow click/touch on dropdown items (longer for mobile)
                            setTimeout(() => setShowInlineSearch(false), 400);
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
                        
                        {/* Inline Search Dropdown - Using Portal to escape table overflow */}
                        {showInlineSearch && inlineSearchInputRef.current && createPortal(
                          <div 
                            className="bg-popover border border-border rounded-md shadow-xl max-h-80 overflow-auto"
                            style={{ 
                              position: 'fixed',
                              top: inlineSearchInputRef.current.getBoundingClientRect().bottom + 4,
                              left: inlineSearchInputRef.current.getBoundingClientRect().left,
                              width: Math.min(800, window.innerWidth - inlineSearchInputRef.current.getBoundingClientRect().left - 16),
                              zIndex: 9999,
                            }}
                          >
                            {inlineSearchResults.length > 0 ? (
                              <>
                                {inlineSearchResults.length > inlineDisplayLimit && (
                                  <div className="px-3 py-2 text-sm text-muted-foreground bg-muted/50 border-b flex items-center justify-between">
                                    <span>Showing {inlineDisplayLimit} of {inlineSearchResults.length} results</span>
                                    <Button
                                      variant="link"
                                      size="sm"
                                      className="h-auto p-0 text-primary"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setInlineDisplayLimit(prev => prev + 100);
                                      }}
                                    >
                                      Load More
                                    </Button>
                                  </div>
                                )}
                                {inlineSearchResults.slice(0, inlineDisplayLimit).map((result, idx) => (
                                  <button
                                    key={result.id + idx}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => handleInlineProductSelect(result)}
                                    onMouseEnter={() => setSelectedInlineIndex(idx)}
                                    className={cn(
                                      "w-full text-left px-4 py-3 border-b border-border last:border-0 transition-colors",
                                      idx === selectedInlineIndex ? "bg-primary text-primary-foreground [&_*]:text-primary-foreground" : "text-popover-foreground hover:bg-accent/50"
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
                          </div>,
                          document.body
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
                      <TableCell colSpan={4} className="text-right font-semibold">Total:</TableCell>
                      <TableCell className="w-[130px]"></TableCell>
                      <TableCell className="w-[80px] text-right font-semibold tabular-nums">{totals.totalQty}</TableCell>
                      <TableCell colSpan={showMrp ? 8 : 7}></TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </div>
            {lineItems.length === 0 && (
              <p className="text-xs text-center mt-2 text-muted-foreground">Tip: Press Alt+↓ to copy the last row</p>
            )}
        </section>

      </main>

      <footer className='bg-white border-t-2 border-slate-200 px-6 py-3 flex-shrink-0 shadow-[0_-4px_16px_rgba(0,0,0,.07)] flex items-center justify-between gap-5'>
        {/* LEFT: Totals row */}
        <div className='flex items-center gap-4 flex-1 flex-wrap'>
          <div className='flex flex-col items-center'>
            <span className='text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5'>Gross Amt</span>
            <span className='text-[16px] font-black text-slate-700 font-mono'>Rs.{totals.grossAmount.toFixed(0)}</span>
          </div>

          {totals.itemDiscount > 0 && (
            <>
              <span className='text-slate-300 text-xl font-light'>-</span>
              <div className='flex flex-col items-center'>
                <span className='text-[10px] font-bold uppercase tracking-widest text-red-400 mb-0.5'>Line Disc (Σ)</span>
                <span className='text-[16px] font-black text-red-500 font-mono'>Rs.{totals.itemDiscount.toFixed(0)}</span>
              </div>
            </>
          )}

          {(totals.itemDiscount > 0 || discountAmount > 0) && (
            <>
              <span className='text-slate-300 text-xl font-light'>=</span>
              <div className='flex flex-col items-center bg-red-50 dark:bg-red-950/20 rounded px-2 py-1'>
                <span className='text-[10px] font-bold uppercase tracking-widest text-destructive mb-0.5'>Total Disc</span>
                <span className='text-[16px] font-black text-destructive font-mono'>Rs.{(totals.itemDiscount + discountAmount).toFixed(0)}</span>
              </div>
            </>
          )}

          <span className='text-slate-300 text-xl font-light'>-</span>
          <div className='flex flex-col items-center gap-0.5'>
            <span className='text-[10px] font-bold uppercase tracking-widest text-red-400'>Bill Disc</span>
            <Input type='number' step='0.01' value={discountAmount}
              onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              className='w-24 h-8 text-right text-red-600 font-bold font-mono border-red-200 bg-red-50 text-[13px]'
              placeholder='0.00' />
          </div>

          <span className='text-slate-300 text-xl font-light'>+</span>
          <div className='flex flex-col items-center'>
            <span className='text-[10px] font-bold uppercase tracking-widest text-purple-400 mb-0.5'>GST</span>
            <span className='text-[16px] font-black text-purple-600 font-mono'>Rs.{totals.gstAmount.toFixed(0)}</span>
          </div>

          <span className='text-slate-300 text-xl font-light'>+</span>
          <div className='flex flex-col items-center gap-0.5'>
            <span className='text-[10px] font-bold uppercase tracking-widest text-amber-500'>Other Charges</span>
            <Input type='number' step='0.01' value={otherCharges}
              onChange={(e) => setOtherCharges(parseFloat(e.target.value) || 0)}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              className='w-24 h-8 text-right text-amber-700 font-bold font-mono border-amber-200 bg-amber-50 text-[13px]'
              placeholder='0.00' />
          </div>

          <div className='w-px h-10 bg-slate-200 mx-1' />

          {/* NET AMOUNT PILL */}
          <div className='flex flex-col items-center bg-gradient-to-br from-green-600 to-green-800 text-white rounded-xl px-6 py-2 min-w-[156px] shadow-[0_4px_14px_rgba(22,163,74,.35)]'>
            <span className='text-[9px] uppercase tracking-[.14em] text-green-200 font-bold mb-0.5'>Net Amount</span>
            <span className='text-[22px] font-black leading-none font-mono'>Rs.{totals.netAmount.toFixed(0)}</span>
            {roundOff !== 0 && (
              <span className='text-[10px] text-green-300 mt-0.5'>
                Round off: {roundOff >= 0 ? '+' : ''}{roundOff.toFixed(2)}
              </span>
            )}
          </div>

          <div className='w-px h-10 bg-slate-200 mx-1' />
          <div className='flex flex-col items-center'>
            <span className='text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5'>Items</span>
            <span className='text-[16px] font-black text-slate-700'>{lineItems.filter(i => i.product_id).length}</span>
          </div>
          <div className='flex flex-col items-center'>
            <span className='text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5'>Total Qty</span>
            <span className='text-[16px] font-black text-slate-700'>{lineItems.reduce((s, i) => s + i.qty, 0)}</span>
          </div>
        </div>

        {/* RIGHT: Action buttons */}
        <div className='flex items-center gap-2 flex-shrink-0'>
          {(savedBillId || isEditMode) && (
            <Button onClick={handlePrintBarcodes}
              disabled={lineItems.length === 0}
              variant='outline'
              className='h-9 gap-2 border-purple-200 text-purple-700 hover:bg-purple-50 text-sm'>
              <Printer className='h-4 w-4' />
              Print Barcodes
              {selectedForPrint.size > 0 && ` (${selectedForPrint.size})`}
            </Button>
          )}
          <Button variant='outline'
            className='h-9 border-slate-300 text-slate-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-sm gap-1.5'>
            <X className='h-3.5 w-3.5' />
            Cancel
          </Button>
          <div className='flex flex-col items-center'>
            <Button onClick={handleSave}
              disabled={loading || lineItems.length === 0}
              className='h-9 px-6 bg-green-600 hover:bg-green-700 text-white font-bold text-sm gap-2 shadow-md hover:shadow-lg transition-all'>
              {loading ? (
                <><Loader2 className='h-4 w-4 animate-spin' /> Saving...</>
              ) : (
                <><Check className='h-4 w-4' /> Save Bill</>
              )}
            </Button>
            <span className='text-[10px] text-slate-400 mt-0.5'>Ctrl+S</span>
          </div>
        </div>
      </footer>

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
          allowMultiColor={true}
          defaultPurPrice={selectedProduct?.default_pur_price}
          defaultSalePrice={selectedProduct?.default_sale_price}
          defaultMrp={sizeGridVariants[0]?.mrp || selectedProduct?.default_sale_price}
          showMrp={showMrp}
          showSizePrices={false}
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
              <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
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
                      // Fetch supplier code from suppliers table
                      let supplierCode = "";
                      const suppId = savedSupplierId || billData.supplier_id;
                      if (suppId) {
                        const { data: supplierData } = await supabase
                          .from("suppliers")
                          .select("supplier_code")
                          .eq("id", suppId)
                          .single();
                        supplierCode = supplierData?.supplier_code || "";
                      }

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
                        bill_date: format(billDate, "yyyy-MM-dd"),
                        supplier_code: supplierCode,
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
                        state: { purchaseItems: barcodeItems, billId: savedBillId || editingBillId } 
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
                        // Fetch supplier code from suppliers table
                        let supplierCode = "";
                        const suppId = savedSupplierId || billData.supplier_id;
                        if (suppId) {
                          const { data: supplierData } = await supabase
                            .from("suppliers")
                            .select("supplier_code")
                            .eq("id", suppId)
                            .single();
                          supplierCode = supplierData?.supplier_code || "";
                        }

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
                          bill_date: format(billDate, "yyyy-MM-dd"),
                          supplier_code: supplierCode,
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
                          state: { purchaseItems: barcodeItems, billId: savedBillId || editingBillId } 
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
                  variant="secondary"
                  onClick={() => {
                    setShowPrintDialog(false);
                    if (savedBillId) {
                      // Re-open the same bill in edit mode to add more products
                      navigate("/purchase-entry", { state: { editBillId: savedBillId } });
                    }
                  }}
                  className="w-full gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Continue Adding Products
                </Button>

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
          hideOpeningQty
          isDcPurchase={isDcPurchase}
          isAutoBarcode={isAutoBarcode}
        />

        {/* Price Update Confirmation Dialog */}
        <PriceUpdateConfirmDialog
          open={showPriceUpdateDialog}
          onOpenChange={setShowPriceUpdateDialog}
          priceChanges={detectedPriceChanges}
          onConfirm={handlePriceUpdateConfirm}
          onSkip={handlePriceUpdateSkip}
        />

        {/* Add Supplier Dialog */}
        <AddSupplierDialog
          open={showAddSupplierDialog}
          onClose={() => setShowAddSupplierDialog(false)}
          onSupplierCreated={(supplier) => {
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
          }}
        />

    </div>
  );
};

export default PurchaseEntry;
