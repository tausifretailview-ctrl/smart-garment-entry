import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { isDecimalUOM } from "@/constants/uom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSettings } from "@/hooks/useSettings";
import { applyGarmentGstRule } from "@/utils/gstRules";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useCustomerBalance } from "@/hooks/useCustomerBalance";
import { useCustomerSearch, useCustomerBalances } from "@/hooks/useCustomerSearch";
import { useCustomerPoints, useCustomerPointsBalance } from "@/hooks/useCustomerPoints";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarIcon, Home, Plus, X, Search, Eye, Check, Loader2, AlertCircle, Scan, Printer, ChevronLeft, ChevronRight, SkipBack, Lock, CreditCard, FileText, Coins, Trash2, Save } from "lucide-react";
import { Banknote, Smartphone, Wallet } from "lucide-react";
import { MixPaymentDialog } from "@/components/MixPaymentDialog";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { CameraScanButton } from "@/components/CameraBarcodeScannerDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { useBeepSound } from "@/hooks/useBeepSound";
import { useMobileERP } from "@/hooks/useMobileERP";
import { FinancerDetailsForm, FinancerDetails } from "@/components/FinancerDetailsForm";

import { SizeGridDialog } from "@/components/SizeGridDialog";
import { format } from "date-fns";
import { cn, sortSearchResults, buildProductDisplayName } from "@/lib/utils";
import { BackToDashboard } from "@/components/BackToDashboard";
import { InvoiceWrapper } from "@/components/InvoiceWrapper";

import { useReactToPrint } from "react-to-print";
import { useDirectPrint } from "@/hooks/useDirectPrint";
import { waitForPrintReady } from "@/utils/printReady";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useStockValidation } from "@/hooks/useStockValidation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useDraftSave } from "@/hooks/useDraftSave";
import { useCustomerBrandDiscounts } from "@/hooks/useCustomerBrandDiscounts";
import { fetchCustomerProductPrice } from "@/hooks/useCustomerProductPrice";
import { ProductHistoryDialog } from "@/components/ProductHistoryDialog";
import { PriceSelectionDialog } from "@/components/PriceSelectionDialog";
import { useShopName } from "@/hooks/useShopName";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { logError } from "@/lib/errorLogger";

interface LineItem {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  size: string;
  barcode: string;
  color: string;
  quantity: number;
  box: string;
  mrp: number;
  salePrice: number;
  discountPercent: number;
  discountAmount: number;
  gstPercent: number;
  lineTotal: number;
  hsnCode: string;
  uom?: string;
}

const customerSchema = z.object({
  customer_name: z.string().trim().max(100).optional().or(z.literal("")),
  phone: z.string().trim().max(20, "Mobile number must be less than 20 characters").optional().or(z.literal("")),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional(),
  gst_number: z.string().trim().max(15).optional(),
  transport_details: z.string().trim().max(200).optional().or(z.literal("")),
});

export default function SalesInvoice() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const { checkStock, validateCartStock, showStockError, showMultipleStockErrors } = useStockValidation();
  const shopName = useShopName();
  const { isColumnVisible } = useUserPermissions();
  const showCol = {
    hsn: isColumnVisible('sales_invoice', 'hsn'),
    box: isColumnVisible('sales_invoice', 'box'),
    color: isColumnVisible('sales_invoice', 'color'),
    mrp: isColumnVisible('sales_invoice', 'mrp'),
    disc_percent: isColumnVisible('sales_invoice', 'disc_percent'),
    disc_amount: isColumnVisible('sales_invoice', 'disc_amount'),
    gst: isColumnVisible('sales_invoice', 'gst'),
  };
  const location = useLocation();
  const { orgNavigate: navigate } = useOrgNavigation();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  
  // Customer balance hook
  const { balance: customerBalance, openingBalance: customerOpeningBalance, isLoading: isBalanceLoading } = useCustomerBalance(
    selectedCustomerId || null,
    currentOrganization?.id || null
  );
  // Customer brand discounts hook
  const { getBrandDiscount, hasBrandDiscounts, brandDiscounts, isLoading: isBrandDiscountsLoading } = useCustomerBrandDiscounts(selectedCustomerId || null);

  // CRM Loyalty Points
  const {
    calculatePoints,
    isPointsEnabled,
    isRedemptionEnabled,
    calculateMaxRedeemablePoints,
    calculateRedemptionValue,
    redeemPoints,
    awardPoints,
    pointsSettings,
  } = useCustomerPoints();
  const { data: customerPointsData } = useCustomerPointsBalance(selectedCustomerId || null);
  const [pointsToRedeem, setPointsToRedeem] = useState<number>(0);
  const [invoiceDate, setInvoiceDate] = useState<Date>(new Date());
  const [dueDate, setDueDate] = useState<Date>(new Date());
  const invoiceSavedRef = useRef(false); // Track if invoice was saved to prevent draft re-save
  const savingLockRef = useRef(false); // Synchronous lock to prevent duplicate saves from rapid clicks
  const printRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const lastInputTime = useRef<number>(0);
  const dropdownDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Barcode scanner detection for instant add (like POS)
  const { recordKeystroke, reset: resetScannerDetection, detectScannerInput, scheduleAutoSubmit, cancelAutoSubmit, markSubmitted } = useBarcodeScanner();
  const { playSuccessBeep, playErrorBeep } = useBeepSound();
  
  // Initialize 7 empty rows for predefined table
  const [lineItems, setLineItems] = useState<LineItem[]>(
    Array(7).fill(null).map((_, i) => ({
      id: `row-${i}`,
      productId: '',
      variantId: '',
      productName: '',
      size: '',
      barcode: '',
      color: '',
      quantity: 0,
      box: '',
      mrp: 0,
      salePrice: 0,
      discountPercent: 0,
      discountAmount: 0,
      gstPercent: 0,
      lineTotal: 0,
      hsnCode: '',
    }))
  );
  const [openProductSearch, setOpenProductSearch] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [productSearchResults, setProductSearchResults] = useState<any[]>([]);
  const [productDisplayLimit, setProductDisplayLimit] = useState(100);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [openCustomerSearch, setOpenCustomerSearch] = useState(false);
  const [openCustomerDialog, setOpenCustomerDialog] = useState(false);
  const [paymentTerm, setPaymentTerm] = useState<string>("");
  const [termsConditions, setTermsConditions] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [showNotesSection, setShowNotesSection] = useState(false);
  const [shippingAddress, setShippingAddress] = useState<string>("");
  const [shippingInstructions, setShippingInstructions] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const mobileERP = useMobileERP();
  const [financerDetails, setFinancerDetails] = useState<FinancerDetails | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [originalItemsForEdit, setOriginalItemsForEdit] = useState<Array<{ variantId: string; quantity: number }>>([]);
  const [taxType, setTaxType] = useState<"exclusive" | "inclusive">("inclusive");
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [savedInvoiceData, setSavedInvoiceData] = useState<any>(null);
  const [salesman, setSalesman] = useState<string>("");
  const [flatDiscountPercent, setFlatDiscountPercent] = useState<number>(0);
  const [flatDiscountRupees, setFlatDiscountRupees] = useState<number>(0);
  const [otherCharges, setOtherCharges] = useState<number>(0);
  const [roundOff, setRoundOff] = useState<number>(0);
  const [nextInvoicePreview, setNextInvoicePreview] = useState<string>("");

  // Payment override (default = credit / pay_later). Footer Cash/UPI/Mix buttons set this.
  const [paymentOverride, setPaymentOverride] = useState<{
    method: 'cash' | 'upi' | 'multiple';
    cashAmount: number;
    upiAmount: number;
    cardAmount: number;
    bankAmount: number;
    financeAmount: number;
    totalPaid: number;
  } | null>(null);
  const [showMixPaymentDialog, setShowMixPaymentDialog] = useState(false);
  const pendingAutoSaveRef = useRef(false);
  
  // Size grid entry mode - default to grid, will be overridden by settings
  const [entryMode, setEntryMode] = useState<"grid" | "inline">("grid");
  const [sizeGridEnabled, setSizeGridEnabled] = useState(true);
  const [showSizeGrid, setShowSizeGrid] = useState(false);
  const [showPriceSelectionDialog, setShowPriceSelectionDialog] = useState(false);
  const [pendingPriceSelection, setPendingPriceSelection] = useState<any>(null);
  const [sizeGridProduct, setSizeGridProduct] = useState<any>(null);
  const [sizeGridVariants, setSizeGridVariants] = useState<any[]>([]);
  
  // Product history dialog state
  const [historyProduct, setHistoryProduct] = useState<{ id: string; name: string } | null>(null);

  // Invoice navigation state (like POS)
  const [navInvoiceIndex, setNavInvoiceIndex] = useState<number | null>(null);
  const [isLoadingNavInvoice, setIsLoadingNavInvoice] = useState(false);


  // Draft save hook
  const {
    hasDraft,
    draftData,
    saveDraft,
    deleteDraft,
    updateCurrentData,
    startAutoSave,
    stopAutoSave,
  } = useDraftSave('sale_invoice');

  // Load draft data
  const loadDraftData = useCallback((data: any) => {
    if (!data) return;
    setInvoiceDate(data.invoiceDate ? new Date(data.invoiceDate) : new Date());
    setDueDate(data.dueDate ? new Date(data.dueDate) : new Date());
    setLineItems(data.lineItems || Array(7).fill(null).map((_, i) => ({
      id: `row-${i}`, productId: '', variantId: '', productName: '', size: '', barcode: '', color: '',
      quantity: 0, box: '', mrp: 0, salePrice: 0, discountPercent: 0, discountAmount: 0, gstPercent: 0, lineTotal: 0, hsnCode: '',
    })));
    setSelectedCustomerId(data.selectedCustomerId || "");
    setSelectedCustomer(data.selectedCustomer || null);
    setPaymentTerm(data.paymentTerm || "");
    setTermsConditions(data.termsConditions || "");
    setNotes(data.notes || "");
    setShippingAddress(data.shippingAddress || "");
    setShippingInstructions(data.shippingInstructions || "");
    setTaxType(data.taxType || "inclusive");
    setSalesman(data.salesman || "");
    setFlatDiscountPercent(data.flatDiscountPercent || 0);
    setFlatDiscountRupees(data.flatDiscountRupees || 0);
    setOtherCharges(data.otherCharges || 0);
    setRoundOff(data.roundOff || 0);
    // Silent restore - no toast to avoid disturbing user
  }, [toast]);

  // Check for draft on mount (only if not in edit mode)
  const initialDraftCheckDone = useRef(false);

  // Load draft automatically if navigated from dashboard with loadDraft flag
  useEffect(() => {
    if (location.state?.loadDraft && hasDraft && draftData && !initialDraftCheckDone.current) {
      initialDraftCheckDone.current = true;
      loadDraftData(draftData);
      deleteDraft(); // Clear the draft from database after loading
    }
  }, [location.state?.loadDraft, hasDraft, draftData, loadDraftData, deleteDraft]);

  // Update current data for auto-save whenever form data changes
  useEffect(() => {
    const filledItems = lineItems.filter(item => item.productId !== '');
    if (!editingInvoiceId && !savedInvoiceData && filledItems.length > 0) {
      updateCurrentData({
        invoiceDate: invoiceDate.toISOString(),
        dueDate: dueDate.toISOString(),
        lineItems,
        selectedCustomerId,
        selectedCustomer,
        paymentTerm,
        termsConditions,
        notes,
        shippingAddress,
        shippingInstructions,
        taxType,
        salesman,
        flatDiscountPercent,
        flatDiscountRupees,
        otherCharges,
        roundOff,
      });
    }
  }, [invoiceDate, dueDate, lineItems, selectedCustomerId, selectedCustomer, paymentTerm, termsConditions, notes, shippingAddress, shippingInstructions, taxType, salesman, flatDiscountPercent, flatDiscountRupees, otherCharges, roundOff, editingInvoiceId, savedInvoiceData, updateCurrentData]);

  // Start auto-save when not in edit mode
  useEffect(() => {
    if (!editingInvoiceId && !location.state?.editInvoiceId) {
      startAutoSave();
    }
    return () => {
      stopAutoSave();
    };
  }, [editingInvoiceId, startAutoSave, stopAutoSave, location.state?.editInvoiceId]);

  // Separate effect for saving draft on unmount - uses ref to avoid stale closure issues
  useEffect(() => {
    return () => {
      // Don't save draft if invoice was successfully saved
      if (invoiceSavedRef.current) {
        return;
      }
      // Save draft immediately when component unmounts (tab switch, navigation)
      const filledItems = lineItems.filter(item => item.productId !== '');
      if (!editingInvoiceId && filledItems.length > 0) {
        saveDraft({
          invoiceDate: invoiceDate.toISOString(),
          dueDate: dueDate.toISOString(),
          lineItems,
          selectedCustomerId,
          selectedCustomer,
          paymentTerm,
          termsConditions,
          notes,
          shippingAddress,
          shippingInstructions,
          taxType,
          salesman,
          flatDiscountPercent,
          flatDiscountRupees,
          otherCharges,
          roundOff,
        }, false);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcut for printing
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "p") {
        e.preventDefault();
        if (savedInvoiceData) {
          handlePrintInvoice();
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => {
      window.removeEventListener("keydown", handleKeyPress);
    };
  }, [savedInvoiceData]);

  // Ctrl+S to save invoice
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        const filledItems = lineItems.filter(item => item.productId !== '');
        if (filledItems.length > 0 && !isSaving && !savingLockRef.current) {
          handleSaveInvoice();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lineItems, isSaving]);

  // F1 = Cash, F2 = UPI, F3 = Mix payment shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (isTyping) return;
      if (e.key === 'F1') {
        e.preventDefault();
        handlePaymentShortcut('cash');
      } else if (e.key === 'F2') {
        e.preventDefault();
        handlePaymentShortcut('upi');
      } else if (e.key === 'F3') {
        e.preventDefault();
        handlePaymentShortcut('mix');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // Handle payment shortcut buttons: set payment override then auto-save
  const handlePaymentShortcut = (mode: 'cash' | 'upi' | 'mix') => {
    const filledItems = lineItems.filter(item => item.productId !== '');
    if (filledItems.length === 0) {
      toast({ variant: 'destructive', title: 'No items', description: 'Please add at least one product first.' });
      return;
    }
    if (mode === 'cash') {
      setPaymentOverride({
        method: 'cash',
        cashAmount: netAmount, upiAmount: 0, cardAmount: 0, bankAmount: 0, financeAmount: 0,
        totalPaid: netAmount,
      });
      pendingAutoSaveRef.current = true;
    } else if (mode === 'upi') {
      setPaymentOverride({
        method: 'upi',
        cashAmount: 0, upiAmount: netAmount, cardAmount: 0, bankAmount: 0, financeAmount: 0,
        totalPaid: netAmount,
      });
      pendingAutoSaveRef.current = true;
    } else {
      setShowMixPaymentDialog(true);
    }
  };

  // After paymentOverride is set via Cash/UPI shortcut, trigger save
  useEffect(() => {
    if (pendingAutoSaveRef.current && paymentOverride) {
      pendingAutoSaveRef.current = false;
      if (!isSaving && !savingLockRef.current) {
        handleSaveInvoice();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentOverride]);

  // Mutually exclusive discount: Apply customer master discount ONLY if no brand discounts exist
  useEffect(() => {
    if (selectedCustomer && !hasBrandDiscounts) {
      // Customer has NO brand discounts, so apply master discount as flat discount
      if (selectedCustomer.discount_percent && selectedCustomer.discount_percent > 0) {
        setFlatDiscountPercent(selectedCustomer.discount_percent);
      }
    } else if (selectedCustomer && hasBrandDiscounts) {
      // Customer has brand discounts, so don't auto-apply flat discount
      // Only reset if this was an auto-applied customer discount (not manually set)
      // For simplicity, we just don't set flat discount when brand discounts exist
    }
  }, [selectedCustomer, hasBrandDiscounts]);

  const customerForm = useForm<z.infer<typeof customerSchema>>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      customer_name: "",
      phone: "",
      email: "",
      address: "",
      gst_number: "",
      transport_details: "",
    },
  });

  // Customer search state
  const [customerSearchInput, setCustomerSearchInput] = useState("");
  
  // Use reliable customer search hook - pass search term directly
  const { 
    customers: customersData = [], 
    filteredCustomers,
    isLoading: isCustomersLoading,
    isError: isCustomersError,
    refetch: refetchCustomers,
    hasMore: hasMoreCustomers,
  } = useCustomerSearch(customerSearchInput);
  
  const { getCustomerBalance, getCustomerAdvance } = useCustomerBalances();

  // Fetch settings (centralized, cached 5min)
  const { data: settingsData } = useSettings();

  // Garment / Footwear GST auto-bump rule (from purchase_settings)
  const garmentGstSettings = {
    garment_gst_rule_enabled: ((settingsData as any)?.purchase_settings?.garment_gst_rule_enabled === true),
    garment_gst_threshold: (settingsData as any)?.purchase_settings?.garment_gst_threshold,
  };

  // Read size grid setting from settings
  useEffect(() => {
    if (settingsData) {
      const saleSettings = settingsData.sale_settings as any;
      const enabled = saleSettings?.enable_size_grid_sales !== false; // default true
      setSizeGridEnabled(enabled);
      if (!enabled) {
        setEntryMode("inline");
      }
    }
  }, [settingsData]);

  // Direct print hook
  const { isDirectPrintEnabled, directPrint } = useDirectPrint(
    (settingsData as any)?.bill_barcode_settings
  );

  // Fetch products with variants and size groups
  const { data: productsData } = useQuery({
    queryKey: ['products-with-variants', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      // Fetch all products using pagination to bypass 1000 row limit
      const allProducts: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from('products')
          .select(`
            id, product_name, brand, hsn_code, gst_per, sale_gst_percent, purchase_gst_percent, product_type, status, category, style, color, sale_discount_type, sale_discount_value, uom,
            product_variants (
              id, barcode, size, color, stock_qty, sale_price, mrp, pur_price, product_id, active, deleted_at,
              last_purchase_sale_price, last_purchase_mrp, last_purchase_date
            ),
            size_groups (id, group_name, sizes)
          `)
          .eq('organization_id', currentOrganization.id)
          .eq('status', 'active')
          .is('deleted_at', null)
          .order('product_name')
          .order('id')
          .range(offset, offset + PAGE_SIZE - 1);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          allProducts.push(...data);
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }
      
      // Calculate size_range for each product and filter deleted variants
      return allProducts.map((product: any) => {
        const sizeGroup = product.size_groups;
        let size_range: string | null = null;
        if (sizeGroup && Array.isArray(sizeGroup.sizes) && sizeGroup.sizes.length > 0) {
          size_range = sizeGroup.sizes.length > 1
            ? `${sizeGroup.sizes[0]}-${sizeGroup.sizes[sizeGroup.sizes.length - 1]}`
            : sizeGroup.sizes[0];
        }
        return { 
          ...product, 
          size_range,
          product_variants: product.product_variants?.filter((v: any) => !v.deleted_at)
        };
      });
    },
    enabled: !!currentOrganization?.id,
    staleTime: 300000, // 5 minutes - reduces multi-tab load
    refetchOnWindowFocus: false,
  });

  // Fetch employees for Salesman dropdown
  const { data: employeesData } = useQuery({
    queryKey: ['employees', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      const { data, error } = await supabase
        .from('employees')
        .select('id, employee_name, status')
        .eq('organization_id', currentOrganization.id)
        .eq('status', 'active')
        .order('employee_name');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  // Fetch last saved invoice
  const { data: lastInvoice } = useQuery({
    queryKey: ['last-invoice', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;
      
      const { data, error } = await supabase
        .from('sales')
        .select('sale_number, customer_name, net_amount, sale_items(quantity)')
        .eq('organization_id', currentOrganization.id)
        .eq('sale_type', 'invoice')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) return null;
      
      const totalQty = data.sale_items?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 0;
      return {
        sale_number: data.sale_number,
        customer_name: data.customer_name,
        total_qty: totalQty,
        net_amount: data.net_amount || 0,
      };
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch all invoice IDs for navigation (like POS)
  const { data: allInvoiceIds } = useQuery({
    queryKey: ['all-sale-invoice-ids', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from('sales')
        .select('id, sale_number')
        .eq('organization_id', currentOrganization.id)
        .eq('sale_type', 'invoice')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
    staleTime: 60000,
  });

  // Auto-correct stale FY in literal format strings
  const autoCorrectFY = (fmt: string): string => {
    const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const m = ist.getMonth() + 1;
    const y = ist.getFullYear();
    const fyStart = m >= 4 ? y : y - 1;
    const currentFY = `${String(fyStart).slice(-2)}-${String(fyStart + 1).slice(-2)}`;
    return fmt.replace(/\/(\d{2})-(\d{2})\//, `/${currentFY}/`);
  };

  // Generate next invoice number preview
  useEffect(() => {
    const previewNextInvoice = async () => {
      if (!currentOrganization?.id || editingInvoiceId) return;
      
      try {
        const settings = settingsData?.sale_settings as any;
        if (settings?.invoice_numbering_format || settings?.invoice_series_start) {
          const rawFormat = settings.invoice_numbering_format || settings.invoice_series_start;
          const rawSeriesStart = settings.invoice_series_start;
          const format = autoCorrectFY(rawFormat);
          const seriesStart = rawSeriesStart ? autoCorrectFY(rawSeriesStart) : rawSeriesStart;
          const hasPlaceholders = format.includes('{');
          
          if (hasPlaceholders) {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const fyStart = now.getMonth() >= 3 ? year : year - 1;
            const fyEnd = fyStart + 1;
            const fyShort = `${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`;
            
            let preview = format
              .replace('{FY}', fyShort)
              .replace('{YYYY}', String(year))
              .replace('{MM}', month)
              .replace('{N}', '?');
            
            setNextInvoicePreview(preview);
          } else {
            // Literal format — compute next sequence respecting series start
            let minSequence = 1;
            let basePattern = format.replace(/\d+$/, '');
            
            if (seriesStart && seriesStart.trim()) {
              const startMatches = seriesStart.match(/^(.*?)(\d+)$/);
              if (startMatches) {
                basePattern = startMatches[1];
                minSequence = parseInt(startMatches[2]);
              }
            }
            
            const { data: lastSales } = await supabase
              .from('sales')
              .select('sale_number')
              .eq('organization_id', currentOrganization.id)
              .is('deleted_at', null)
              .like('sale_number', `${basePattern}%`)
              .order('created_at', { ascending: false })
              .limit(50);
            
            let sequence = minSequence;
            if (lastSales && lastSales.length > 0) {
              let maxSeq = 0;
              for (const s of lastSales) {
                const matches = s.sale_number.match(/(\d+)$/);
                if (matches) maxSeq = Math.max(maxSeq, parseInt(matches[1]));
              }
              sequence = Math.max(maxSeq + 1, minSequence);
            }
            
            setNextInvoicePreview(`${basePattern}${sequence}`);
          }
        } else {
          // Preview next INV number without incrementing the sequence
          const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
          const month = ist.getMonth() + 1; // 1-based
          const year = ist.getFullYear();
          const fyStart = month >= 4 ? year : year - 1;
          const fyEnd = fyStart + 1;
          const series = `INV/${String(fyStart).slice(2)}-${String(fyEnd).slice(2)}`;
          
          // Read current last_number from sequences table
          const { data: seqRow } = await supabase
            .from('bill_number_sequences')
            .select('last_number')
            .eq('organization_id', currentOrganization.id)
            .eq('series', series)
            .maybeSingle();
          
          const nextNum = (seqRow?.last_number || 0) + 1;
          setNextInvoicePreview(`${series}/${nextNum}`);
        }
      } catch (error) {
        console.error('Error previewing next invoice:', error);
        setNextInvoicePreview('INV/??-??/?');
      }
    };
    
    previewNextInvoice();
  }, [currentOrganization?.id, editingInvoiceId, settingsData]);

  // Pre-populate form if editing existing invoice
  // IMPORTANT: Using useEffect instead of useState callback to ensure this runs
  // every time location.state changes (e.g., when navigating back to edit the same invoice)
  // This fixes the bug where originalItemsForEdit became stale on re-edits
  useEffect(() => {
    const invoiceData = location.state?.invoiceData;
    if (invoiceData) {
      setEditingInvoiceId(invoiceData.id);
      setInvoiceDate(new Date(invoiceData.sale_date));
      setDueDate(invoiceData.due_date ? new Date(invoiceData.due_date) : new Date());
      setSelectedCustomerId(invoiceData.customer_id || "");
      
      // Set customer if available
      if (invoiceData.customer_id) {
        const customer = {
          id: invoiceData.customer_id,
          customer_name: invoiceData.customer_name,
          phone: invoiceData.customer_phone,
          email: invoiceData.customer_email,
          address: invoiceData.customer_address,
        };
        setSelectedCustomer(customer);
      }
      
      setPaymentTerm(invoiceData.payment_term || "");
      setTermsConditions(invoiceData.terms_conditions || "");
      setNotes(invoiceData.notes || "");
      setShippingAddress(invoiceData.shipping_address || "");
      setShippingInstructions(invoiceData.shipping_instructions || "");
      setSalesman(invoiceData.salesman || "");
      setFlatDiscountPercent(invoiceData.flat_discount_percent || 0);
      setFlatDiscountRupees(invoiceData.flat_discount_amount || 0);
      setOtherCharges(invoiceData.other_charges || 0);
      setRoundOff(invoiceData.round_off || 0);
      
      // Transform sale items back to line items
      if (invoiceData.sale_items && invoiceData.sale_items.length > 0) {
        const transformedItems = invoiceData.sale_items.map((item: any) => ({
          id: item.id,
          productId: item.product_id,
          variantId: item.variant_id,
          productName: item.product_name,
          size: item.size,
          barcode: item.barcode || '',
          color: item.color || '',
          quantity: item.quantity,
          mrp: item.mrp,
          salePrice: item.unit_price,
          discountPercent: item.discount_percent,
          discountAmount: 0,
          gstPercent: item.gst_percent,
          lineTotal: item.line_total,
          hsnCode: item.hsn_code || '',
        }));
        setLineItems(transformedItems);
        
        // Store original items for stock validation in edit mode
        // This MUST be set fresh every time we load invoice data for editing
        setOriginalItemsForEdit(invoiceData.sale_items.map((item: any) => ({
          variantId: item.variant_id,
          quantity: item.quantity,
        })));
      }
    }
  }, [location.state?.invoiceData]);

  // Load invoice by ID when navigated from dashboard with just editInvoiceId (no full data)
  useEffect(() => {
    const editId = location.state?.editInvoiceId;
    const hasFullData = location.state?.invoiceData;
    if (editId && !hasFullData && currentOrganization?.id) {
      loadInvoiceById(editId);
    }
  }, [location.state?.editInvoiceId, location.state?.invoiceData, currentOrganization?.id]);

  // Load invoice for duplication when navigated from dashboard
  useEffect(() => {
    const duplicateId = location.state?.duplicateInvoiceId;
    if (duplicateId && currentOrganization?.id) {
      (async () => {
        try {
          const { data: invoiceData, error } = await supabase
            .from('sales')
            .select(`*, sale_items(*)`)
            .eq('id', duplicateId)
            .single();
          if (error || !invoiceData) throw error || new Error('Invoice not found');
          
          // Load all fields but DON'T set editingInvoiceId (it's a new invoice)
          setInvoiceDate(new Date());
          setDueDate(new Date());
          setSelectedCustomerId(invoiceData.customer_id || "");
          if (invoiceData.customer_id) {
            setSelectedCustomer({
              id: invoiceData.customer_id,
              customer_name: invoiceData.customer_name,
              phone: invoiceData.customer_phone,
              email: invoiceData.customer_email,
              address: invoiceData.customer_address,
            });
          }
          setPaymentTerm(invoiceData.payment_term || "");
          setTermsConditions(invoiceData.terms_conditions || "");
          setNotes(invoiceData.notes || "");
          setShippingAddress(invoiceData.shipping_address || "");
          setShippingInstructions(invoiceData.shipping_instructions || "");
          setSalesman(invoiceData.salesman || "");
          setFlatDiscountPercent(invoiceData.flat_discount_percent || 0);
          setFlatDiscountRupees(invoiceData.flat_discount_amount || 0);
          setOtherCharges(invoiceData.other_charges || 0);
          setRoundOff(invoiceData.round_off || 0);
          
          if (invoiceData.sale_items?.length > 0) {
            setLineItems(invoiceData.sale_items.map((item: any) => ({
              id: crypto.randomUUID(),
              productId: item.product_id,
              variantId: item.variant_id,
              productName: item.product_name,
              size: item.size,
              barcode: item.barcode || '',
              color: item.color || '',
              quantity: item.quantity,
              box: '',
              mrp: item.mrp,
              salePrice: item.unit_price,
              discountPercent: item.discount_percent,
              discountAmount: 0,
              gstPercent: item.gst_percent,
              lineTotal: item.line_total,
              hsnCode: item.hsn_code || '',
            })));
          }
        } catch (err) {
          console.error('Failed to load invoice for duplication:', err);
        }
      })();
    }
  }, [location.state?.duplicateInvoiceId, currentOrganization?.id]);

  // Recalculate all line items when tax type changes
  useEffect(() => {
    if (lineItems.length > 0) {
      setLineItems(prevItems => prevItems.map(item => calculateLineTotal(item)));
    }
  }, [taxType]);

  // Apply brand discounts to existing line items when brand discounts load
  useEffect(() => {
    if (isBrandDiscountsLoading || !hasBrandDiscounts || brandDiscounts.length === 0) return;
    if (!productsData) return;
    
    // Check if customer has master discount (brand discounts should not apply in that case)
    const customerHasMasterDiscount = selectedCustomer?.discount_percent && selectedCustomer.discount_percent > 0;
    if (customerHasMasterDiscount) return;
    
    // Check if any line items need discount updates
    let hasChanges = false;
    const updatedItems = lineItems.map(item => {
      if (!item.productId) return item;
      
      // Find the product to get its brand
      const product = productsData.find((p: any) => p.id === item.productId);
      if (!product?.brand) return item;
      
      // Get the brand discount
      const brandDiscount = getBrandDiscount(product.brand);
      
      // Only update if current discount is 0 and brand discount exists
      if (item.discountPercent === 0 && brandDiscount > 0) {
        hasChanges = true;
        return calculateLineTotal({
          ...item,
          discountPercent: brandDiscount,
        });
      }
      
      return item;
    });
    
    if (hasChanges) {
      setLineItems(updatedItems);
      toast({
        title: "Brand discounts applied",
        description: "Discounts have been updated for matching products",
      });
    }
  }, [brandDiscounts, hasBrandDiscounts, isBrandDiscountsLoading, productsData, selectedCustomer?.discount_percent]);

  // Build in-memory barcode index for O(1) lookup (like POS)
  const barcodeIndex = useMemo(() => {
    const index = new Map<string, { product: any; variant: any }>();
    if (!productsData) return index;
    for (const product of productsData) {
      for (const variant of product.product_variants || []) {
        if (variant.barcode) {
          index.set(variant.barcode.toLowerCase(), { product, variant });
        }
      }
    }
    return index;
  }, [productsData]);

  // Product search with server-side filtering and smart sorting
  useEffect(() => {
    const searchProducts = async () => {
      if (!searchInput || searchInput.length < 1 || !currentOrganization?.id) {
        setProductSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const query = searchInput;
        
        // Separate price tokens (pure numbers like 695, 795) from text tokens
        const allTokens = query.trim().split(/\s+/).filter(Boolean);
        const priceTokens = allTokens.filter(t => /^\d+(\.\d+)?$/.test(t) && Number(t) >= 10);
        const textTokens = allTokens.filter(t => !(/^\d+(\.\d+)?$/.test(t) && Number(t) >= 10));
        const textQuery = textTokens.length > 0 ? textTokens.join(' ') : query;
        
        // Search products by name, brand, style (using text tokens only)
        const { data: matchingProducts } = await supabase
          .from("products")
          .select("id, size_group_id")
          .eq("organization_id", currentOrganization.id)
          .eq("status", "active")
          .is("deleted_at", null)
          .or(`product_name.ilike.%${textQuery}%,brand.ilike.%${textQuery}%,style.ilike.%${textQuery}%,category.ilike.%${textQuery}%`);

        const productIds = matchingProducts?.map(p => p.id) || [];
        const sizeGroupIds = [...new Set(matchingProducts?.map(p => p.size_group_id).filter(Boolean) || [])];

        // Fetch size groups
        let sizeGroupsMap: Record<string, { sizes: string[] }> = {};
        if (sizeGroupIds.length > 0) {
          const { data: sizeGroups } = await supabase
            .from("size_groups")
            .select("id, sizes")
            .in("id", sizeGroupIds);
          
          if (sizeGroups) {
            sizeGroups.forEach((sg: any) => {
              sizeGroupsMap[sg.id] = { sizes: sg.sizes || [] };
            });
          }
        }

        // Search product_variants by barcode OR matching product IDs
        let variantsQuery = supabase
          .from("product_variants")
          .select(`
            id, size, pur_price, sale_price, mrp, barcode, active, color, stock_qty, product_id,
            last_purchase_sale_price, last_purchase_mrp, last_purchase_date,
            products (id, product_name, brand, category, style, color, hsn_code, gst_per, sale_gst_percent, purchase_gst_percent, size_group_id, sale_discount_type, sale_discount_value, uom, product_type)
          `)
          .eq("organization_id", currentOrganization.id)
          .eq("active", true)
          .is("deleted_at", null);

        const isBarcode = /^[A-Z]{2,4}[0-9]{5,}$|^[0-9]{6,}$/.test(query.trim());

        if (isBarcode) {
          // Exact + prefix match — uses B-tree index
          if (productIds.length > 0) {
            variantsQuery = variantsQuery.or(`barcode.eq.${query.trim()},barcode.ilike.${query.trim()}%,product_id.in.(${productIds.join(",")})`);
          } else {
            variantsQuery = variantsQuery.or(`barcode.eq.${query.trim()},barcode.ilike.${query.trim()}%`);
          }
        } else {
          // Fuzzy search — uses trgm index (use textQuery to avoid price tokens in text search)
          if (productIds.length > 0) {
            variantsQuery = variantsQuery.or(`barcode.ilike.%${textQuery}%,color.ilike.%${textQuery}%,size.ilike.%${textQuery}%,product_id.in.(${productIds.join(",")})`);
          } else {
            variantsQuery = variantsQuery.or(`barcode.ilike.%${textQuery}%,color.ilike.%${textQuery}%,size.ilike.%${textQuery}%`);
          }
        }

        const { data, error } = await variantsQuery.limit(100);

        if (error) throw error;

        // Filter: keep service/combo products regardless of stock, require stock > 0 for goods
        const filtered = (data || []).filter((v: any) => {
          const pType = v.products?.product_type;
          return pType === 'service' || pType === 'combo' || (v.stock_qty || 0) > 0;
        });

        // Map results
        let results = filtered.map((v: any) => {
          const sizeGroupId = v.products?.size_group_id;
          const sizeGroup = sizeGroupId ? sizeGroupsMap[sizeGroupId] : null;
          const sizeRange = sizeGroup && Array.isArray(sizeGroup.sizes) && sizeGroup.sizes.length > 1
            ? `${sizeGroup.sizes[0]}-${sizeGroup.sizes[sizeGroup.sizes.length - 1]}`
            : sizeGroup?.sizes?.[0] || null;
          
          return {
            variant: v,
            product: {
              ...v.products,
              size_range: sizeRange,
            },
            style: v.products?.style || '',
            barcode: v.barcode || '',
            product_name: v.products?.product_name || '',
          };
        });

        // Client-side price filtering: if user typed price tokens (e.g., "695"), filter by sale_price match
        if (priceTokens.length > 0) {
          results = results.filter(r => {
            const salePrice = String(Math.round(r.variant.sale_price || 0));
            const mrpPrice = String(Math.round(r.variant.mrp || 0));
            return priceTokens.every(pt => salePrice === pt || mrpPrice === pt || salePrice.includes(pt) || mrpPrice.includes(pt));
          });
        }

        // Deduplicate variants by product_id + size + color
        const dedupeMap = new Map<string, typeof results[0]>();
        for (const r of results) {
          const key = `${r.variant.product_id}_${(r.variant.size || '').toLowerCase()}_${(r.variant.color || '').toLowerCase()}`;
          const existing = dedupeMap.get(key);
          if (!existing) {
            dedupeMap.set(key, r);
          } else {
            if ((r.variant.stock_qty || 0) > (existing.variant.stock_qty || 0)) {
              dedupeMap.set(key, r);
            } else if ((r.variant.stock_qty || 0) === (existing.variant.stock_qty || 0) && (r.variant.sale_price || 0) < (existing.variant.sale_price || 0)) {
              dedupeMap.set(key, r);
            }
          }
        }
        results = Array.from(dedupeMap.values());

        // Sort with smart sorting
        const sortedResults = sortSearchResults(results, searchInput, {
          barcode: 'barcode',
          style: 'style',
          productName: 'product_name',
        });

        setProductSearchResults(sortedResults);
      } catch (error) {
        console.error("Product search error:", error);
        setProductSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    const debounceTimer = setTimeout(searchProducts, 150);
    return () => clearTimeout(debounceTimer);
  }, [searchInput, currentOrganization?.id]);
  // Open size grid modal for a product - fetch ALL variants fresh from DB
  const openSizeGridForProduct = async (product: any, selectedSalePrice?: number) => {
    if (!currentOrganization) return;

    // Fetch variants ONLY for the specific product the user selected.
    // (Earlier code broadened this to all products with same name+brand, which caused
    //  cross-product dedup bugs when tenants had duplicate product records.)
    const matchingProductIds = [product.id];

    // Fetch variants from ALL matching products
    const { data, error } = await supabase
      .from("product_variants")
      .select("id, size, color, barcode, sale_price, mrp, stock_qty, pur_price, active, product_id")
      .in("product_id", matchingProductIds)
      .eq("organization_id", currentOrganization.id)
      .eq("active", true)
      .is("deleted_at", null);

    if (error || !data || data.length === 0) {
      toast({
        title: "No variants found",
        description: "This product has no active variants.",
        variant: "destructive",
      });
      return;
    }

    // Deduplicate by size+color (prefer matching selected price, then higher stock)
    const uniqueMap = new Map<string, any>();
    for (const v of data) {
      const key = `${(v.size || '').toLowerCase()}_${(v.color || '').toLowerCase()}`;
      const existing = uniqueMap.get(key);
      if (!existing) {
        uniqueMap.set(key, v);
        continue;
      }

      const existingStock = existing.stock_qty || 0;
      const newStock = v.stock_qty || 0;

      if (selectedSalePrice) {
        const existingMatchesPrice = Math.round(existing.sale_price || 0) === Math.round(selectedSalePrice);
        const newMatchesPrice = Math.round(v.sale_price || 0) === Math.round(selectedSalePrice);

        if (newMatchesPrice && !existingMatchesPrice) {
          // New matches user's selected price, existing doesn't — new wins
          uniqueMap.set(key, v);
        } else if (!newMatchesPrice && existingMatchesPrice) {
          // Existing matches price — keep it
        } else {
          // Both match price, or neither matches — tiebreak by higher stock
          if (newStock > existingStock) uniqueMap.set(key, v);
        }
      } else {
        // No selected price — prefer higher stock
        if (newStock > existingStock) uniqueMap.set(key, v);
      }
    }

    const mergedVariants = Array.from(uniqueMap.values());

    // Subtract quantities already in the cart so the grid shows "effective available" stock
    const cartQtyByVariant = new Map<string, number>();
    for (const item of lineItems) {
      if (item.variantId) {
        cartQtyByVariant.set(item.variantId, (cartQtyByVariant.get(item.variantId) || 0) + item.quantity);
      }
    }

    setSizeGridProduct(product);
    setSizeGridVariants(mergedVariants.map((v: any) => ({
      id: v.id,
      size: v.size,
      stock_qty: Math.max(0, (v.stock_qty || 0) - (cartQtyByVariant.get(v.id) || 0)),
      sale_price: v.sale_price || 0,
      mrp: v.mrp || 0,
      color: v.color || product.color || "",
      barcode: v.barcode,
    })));
    setShowSizeGrid(true);

    // Safety net: if the dropdown advertised stock for a specific size but the size-grid
    // computed zero or less for that same size+color, log it. This means the dedup/merge
    // produced a worse result than the source data and needs investigation.
    try {
      const dropdownVariant = (product as any)?.variant || null;
      if (dropdownVariant && dropdownVariant.size) {
        const key = `${(dropdownVariant.size || '').toLowerCase()}_${(dropdownVariant.color || '').toLowerCase()}`;
        const gridEntry = mergedVariants.find((gv: any) => {
          const gk = `${(gv.size || '').toLowerCase()}_${(gv.color || '').toLowerCase()}`;
          return gk === key;
        });
        const dropdownStock = dropdownVariant.stock_qty || 0;
        const gridStock = gridEntry?.stock_qty || 0;
        if (dropdownStock > 0 && gridStock < dropdownStock) {
          logError(
            {
              operation: 'size_grid_stock_mismatch',
              organizationId: currentOrganization?.id,
              additionalContext: {
                productId: product.id,
                productName: product.product_name,
                size: dropdownVariant.size,
                color: dropdownVariant.color,
                dropdownStock,
                gridStock,
                variantCount: data?.length || 0,
              },
            },
            new Error(`Size-grid stock (${gridStock}) is less than dropdown stock (${dropdownStock}) for ${product.product_name} ${dropdownVariant.size}`)
          );
        }
      }
    } catch (_) {
      // never throw from safety-net
    }
  };

  // Handle size grid confirmation
  const handleSizeGridConfirm = async (items: Array<{ variant: any; qty: number }>) => {
    const product = sizeGridProduct;
    if (!product) return;

    // Build all new items first, then update state once
    let updatedItems = [...lineItems];
    let addedCount = 0;

    for (const { variant, qty } of items) {
      // In edit mode, calculate freed stock from original invoice for this variant
      let freedQty = 0;
      if (editingInvoiceId && originalItemsForEdit.length > 0) {
        freedQty = originalItemsForEdit
          .filter(orig => orig.variantId === variant.id)
          .reduce((sum, orig) => sum + orig.quantity, 0);
      }

      // Stock validation with freed quantity
      const stockCheck = await checkStock(variant.id, qty, freedQty);
      if (!stockCheck.isAvailable) {
        showStockError(product.product_name, variant.size, qty, stockCheck.availableStock);
        continue;
      }

      // Check if already exists in current working array
      const existingIndex = updatedItems.findIndex(item => item.variantId === variant.id && item.productId !== '');
      
      if (existingIndex >= 0) {
        const newQty = updatedItems[existingIndex].quantity + qty;
        const stockCheckIncrease = await checkStock(variant.id, newQty, freedQty);
        if (!stockCheckIncrease.isAvailable) {
          showStockError(product.product_name, variant.size, newQty, stockCheckIncrease.availableStock);
          continue;
        }
        updatedItems[existingIndex].quantity = newQty;
        updatedItems[existingIndex] = calculateLineTotal(updatedItems[existingIndex]);
        addedCount++;
      } else {
        // Find empty row in working array or add new
        const emptyRowIndex = updatedItems.findIndex(item => item.productId === '');
        
        // Check for brand-wise customer discount
        const brandDiscount = getBrandDiscount(product.brand);
        const discountPercent = brandDiscount > 0 ? brandDiscount : 0;
        
        const newItem: LineItem = calculateLineTotal({
          id: emptyRowIndex >= 0 ? updatedItems[emptyRowIndex].id : `row-${updatedItems.length}`,
          productId: product.id,
          variantId: variant.id,
          productName: buildProductDisplayName(product),
          size: variant.size,
          barcode: variant.barcode || '',
          color: variant.color || product.color || '',
          quantity: qty,
          box: '',
          mrp: variant.mrp || variant.sale_price || 0,
          salePrice: variant.sale_price || 0,
          discountPercent,
          discountAmount: 0,
          gstPercent: applyGarmentGstRule(variant.sale_price || 0, product.sale_gst_percent || product.gst_per || 0, garmentGstSettings),
          lineTotal: 0,
          hsnCode: product.hsn_code || '',
          uom: product.uom || 'NOS',
        });
        
        if (emptyRowIndex >= 0) {
          updatedItems[emptyRowIndex] = newItem;
        } else {
          updatedItems = [...updatedItems, newItem];
        }
        addedCount++;
      }
    }
    
    // Update state once with all changes
    setLineItems(updatedItems);
    
    // Toast removed - was interrupting workflow
    
    setTimeout(() => {
      tableContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  // Optimized barcode input change handler with scanner detection (like POS)
  const handleBarcodeInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const now = Date.now();
    const timeSinceLastKeystroke = now - lastInputTime.current;
    
    recordKeystroke();
    lastInputTime.current = now;
    setSearchInput(value);
    
    // Clear previous debounce timer
    if (dropdownDebounceTimer.current) {
      clearTimeout(dropdownDebounceTimer.current);
      dropdownDebounceTimer.current = null;
    }
    
    // Detect scanner input - don't trigger any search for fast input
    const isScannerLike = detectScannerInput(value, timeSinceLastKeystroke);
    if (isScannerLike || (value.length >= 4 && timeSinceLastKeystroke < 50)) {
      // Schedule auto-submit for scanners that don't send Enter
      scheduleAutoSubmit(value, (val) => {
        searchAndAddProduct(val);
        setSearchInput("");
        resetScannerDetection();
        setTimeout(() => barcodeInputRef.current?.focus(), 50);
      });
      return; // Wait for Enter key or auto-submit
    }
  }, [recordKeystroke, detectScannerInput, scheduleAutoSubmit, resetScannerDetection]);

  // Handle barcode/product search on Enter - reads DOM value to avoid React state lag
  const handleBarcodeSearch = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Read directly from the input element to avoid stale React state
      const rawValue = (e.currentTarget || e.target as HTMLInputElement)?.value?.trim();
      if (!rawValue) return;
      e.preventDefault();
      
      // Clear any pending debounce / auto-submit timer
      if (dropdownDebounceTimer.current) {
        clearTimeout(dropdownDebounceTimer.current);
        dropdownDebounceTimer.current = null;
      }
      cancelAutoSubmit();
      markSubmitted(rawValue);
      
      searchAndAddProduct(rawValue);
      resetScannerDetection();
    }
  }, [resetScannerDetection, cancelAutoSubmit, markSubmitted]);

  const searchAndAddProduct = useCallback(async (searchTerm: string) => {
    const normalizedSearchTerm = searchTerm.trim().toLowerCase();
    if (!normalizedSearchTerm) return;

    // O(1) barcode lookup from in-memory index
    const indexMatch = barcodeIndex.get(normalizedSearchTerm);
    let foundVariant: any = indexMatch?.variant || null;
    let foundProduct: any = indexMatch?.product || null;

    // Fallback: local linear search when cache/index misses
    if (!foundVariant && productsData) {
      for (const product of productsData) {
        const variantMatch = product.product_variants?.find((v: any) =>
          v.barcode?.toLowerCase() === normalizedSearchTerm && (v.stock_qty > 0 || product.product_type === 'service' || product.product_type === 'combo')
        );
        if (variantMatch) {
          foundVariant = variantMatch;
          foundProduct = product;
          break;
        }
      }
    }

    // Recovery path: exact DB barcode lookup when cache is stale/not loaded
    if (!foundVariant && currentOrganization?.id) {
      const { data: dbVariant, error: dbError } = await supabase
        .from('product_variants')
        .select(`
          id, barcode, size, color, stock_qty, sale_price, mrp, pur_price, product_id, active,
          last_purchase_sale_price, last_purchase_mrp, last_purchase_date,
          products!inner(
            id, product_name, brand, hsn_code, gst_per, sale_gst_percent, purchase_gst_percent,
            category, style, color, product_type, organization_id, size_group_id,
            sale_discount_type, sale_discount_value, uom, status, deleted_at
          )
        `)
        .eq('organization_id', currentOrganization.id)
        .eq('barcode', searchTerm.trim())
        .eq('active', true)
        .is('deleted_at', null)
        .eq('products.organization_id', currentOrganization.id)
        .eq('products.status', 'active')
        .is('products.deleted_at', null)
        .maybeSingle();

      if (dbError) {
        console.error('Barcode lookup failed:', dbError);
      }

      if (dbVariant && (dbVariant as any).products) {
        const dbProduct = (dbVariant as any).products;
        if ((dbVariant.stock_qty || 0) > 0 || dbProduct.product_type === 'service' || dbProduct.product_type === 'combo') {
          foundVariant = dbVariant;
          foundProduct = dbProduct;
        }
      }
    }

    if (foundVariant && foundProduct) {
      // Barcode uniquely identifies a specific variant (size+color) — always add directly, skip size grid
      playSuccessBeep();
      await addProductToInvoice(foundProduct, foundVariant, undefined, { skipSizeGrid: true });
      setSearchInput("");
      setTimeout(() => barcodeInputRef.current?.focus(), 50);
      return;
    }

    playErrorBeep();
    toast({
      title: "Product not found",
      description: "No product matches the scanned barcode.",
      variant: "destructive",
    });
    setSearchInput("");
    barcodeInputRef.current?.focus();
  }, [productsData, barcodeIndex, currentOrganization?.id, entryMode, playSuccessBeep, playErrorBeep, toast]);

  const addProductToInvoice = async (product: any, variant: any, overridePrice?: { sale_price: number; mrp: number }, options?: { skipSizeGrid?: boolean }) => {
    // If in grid mode, open size grid dialog
    // For MTR/roll products, barcode uniquely identifies the variant — skip size grid
    // skipSizeGrid: passed from barcode scan path — barcode already identifies exact variant
    const isMtrProduct = (product.uom || '').toUpperCase() === 'MTR' ||
      /^\d+(\.\d+)?\s*MTR$/i.test(variant?.size || '');
    
    if (entryMode === "grid" && !isMtrProduct && !options?.skipSizeGrid) {
      openSizeGridForProduct(product, variant?.sale_price);
      setOpenProductSearch(false);
      setSearchInput("");
      return;
    }

    // In edit mode, calculate freed stock from original invoice for this variant
    let freedQty = 0;
    if (editingInvoiceId && originalItemsForEdit.length > 0) {
      freedQty = originalItemsForEdit
        .filter(orig => orig.variantId === variant.id)
        .reduce((sum, orig) => sum + orig.quantity, 0);
    }

    // Check if last_purchase prices differ from master prices (for new items only)
    // We need to prepare the new item data before the functional update,
    // but the duplicate check MUST happen inside setLineItems to avoid stale state during rapid scans
    const masterSalePrice = parseFloat(variant.sale_price || 0);
    const masterMrp = variant.mrp ? parseFloat(variant.mrp) : masterSalePrice;
    const lastPurchaseSalePrice = variant.last_purchase_sale_price ? parseFloat(variant.last_purchase_sale_price) : null;
    const lastPurchaseMrp = variant.last_purchase_mrp ? parseFloat(variant.last_purchase_mrp) : null;
    
    // Check for customer-specific pricing (only if enabled in settings)
    let customerPrice = null;
    const isCustomerPriceMemoryEnabled = (settingsData?.sale_settings as any)?.enable_customer_price_memory ?? false;
    if (isCustomerPriceMemoryEnabled && selectedCustomerId && currentOrganization?.id) {
      const custPrice = await fetchCustomerProductPrice(
        currentOrganization.id,
        selectedCustomerId,
        variant.id
      );
      if (custPrice && custPrice.lastSalePrice !== masterSalePrice) {
        customerPrice = {
          sale_price: custPrice.lastSalePrice,
          mrp: custPrice.lastMrp,
          date: custPrice.lastSaleDate,
          customerName: selectedCustomer?.customer_name,
        };
      }
    }
    
    // If no override provided, check if prices differ and show selection dialog
    if (!overridePrice) {
      const askPriceOnScan = (settingsData as any)?.sale_settings?.ask_price_on_scan ?? true;
      const hasLastPurchaseDiff = askPriceOnScan && lastPurchaseSalePrice !== null && lastPurchaseSalePrice !== masterSalePrice;
      const hasCustomerDiff = customerPrice !== null;

      if (hasLastPurchaseDiff || hasCustomerDiff) {
        setPendingPriceSelection({
          product,
          variant,
          masterPrice: { sale_price: masterSalePrice, mrp: masterMrp },
          lastPurchasePrice: hasLastPurchaseDiff ? {
            sale_price: lastPurchaseSalePrice!,
            mrp: lastPurchaseMrp ?? masterMrp,
          } : undefined,
          customerPrice: hasCustomerDiff ? customerPrice : undefined,
        });
        setShowPriceSelectionDialog(true);
        return;
      }
    }
    
    const salePrice = overridePrice?.sale_price ?? masterSalePrice;
    const mrpToUse = overridePrice?.mrp ?? masterMrp;
    
    const customerHasMasterDiscount = selectedCustomer?.discount_percent && selectedCustomer.discount_percent > 0;
    const brandDiscount = customerHasMasterDiscount ? 0 : getBrandDiscount(product.brand);
    // Auto-apply product-level sale discount if no brand/customer discount
    const productSaleDiscount = (() => {
      const sdt = (product as any).sale_discount_type;
      const sdv = (product as any).sale_discount_value || 0;
      if (sdv > 0 && (!sdt || sdt === 'percent')) return sdv;
      return 0;
    })();
    const discountPercent = brandDiscount > 0 ? brandDiscount : (productSaleDiscount > 0 ? productSaleDiscount : 0);

    // Use functional update with duplicate check INSIDE to prevent stale state during rapid barcode scans
    setLineItems(prev => {
      // Check for existing item inside the updater to always see latest state
      const existingIndex = prev.findIndex(item => item.variantId === variant.id && item.productId !== '');
      
      if (existingIndex >= 0) {
        // Merge: increment quantity
        const updatedItems = [...prev];
        updatedItems[existingIndex] = calculateLineTotal({
          ...updatedItems[existingIndex],
          quantity: updatedItems[existingIndex].quantity + 1,
        });
        return updatedItems;
      }
      
      // New item: find empty row or append
      const newItemBase = {
        productId: product.id,
        variantId: variant.id,
        productName: buildProductDisplayName(product),
        size: variant.size,
        barcode: variant.barcode || '',
        color: variant.color || product.color || '',
        quantity: 1,
        box: '',
        mrp: mrpToUse,
        salePrice: salePrice,
        discountPercent,
        discountAmount: 0,
        gstPercent: applyGarmentGstRule(salePrice, product.sale_gst_percent || product.gst_per || 0, garmentGstSettings),
        lineTotal: 0,
        hsnCode: product.hsn_code || '',
        uom: product.uom || 'NOS',
      };
      
      const emptyRowIndex = prev.findIndex(item => item.productId === '');
      if (emptyRowIndex === -1) {
        const newItem: LineItem = calculateLineTotal({
          ...newItemBase,
          id: `row-${prev.length}`,
        });
        return [...prev, newItem];
      } else {
        const updatedItems = [...prev];
        updatedItems[emptyRowIndex] = calculateLineTotal({
          ...newItemBase,
          id: updatedItems[emptyRowIndex].id,
        });
        return updatedItems;
      }
    });

    // Validate stock asynchronously after state update
    // Use a microtask to read the updated quantity
    setTimeout(() => {
      setLineItems(prev => {
        const idx = prev.findIndex(item => item.variantId === variant.id && item.productId !== '');
        if (idx >= 0) {
          const currentQty = prev[idx].quantity;
          checkStock(variant.id, currentQty, freedQty).then(stockCheck => {
            if (!stockCheck.isAvailable) {
              playErrorBeep();
              showStockError(stockCheck.productName, stockCheck.size, currentQty, stockCheck.availableStock);
              // Revert
              setLineItems(p => {
                const items = [...p];
                const i = items.findIndex(item => item.variantId === variant.id && item.productId !== '');
                if (i >= 0) {
                  items[i] = calculateLineTotal({ ...items[i], quantity: items[i].quantity - 1 });
                }
                return items;
              });
            }
          });
        }
        return prev; // No change, just reading
      });
    }, 0);

    // Show toast if brand discount was applied
    if (brandDiscount > 0) {
      toast({
        title: `Brand discount applied: ${brandDiscount}%`,
        description: `${product.brand} discount for this customer`,
      });
    }
    
    setOpenProductSearch(false);
    setSearchInput("");
    
    // Auto-scroll to the table after product is added
    setTimeout(() => {
      tableContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    
    // Return focus to barcode input for continuous scanning
    setTimeout(() => barcodeInputRef.current?.focus(), 50);
    
    // Toast removed - was interrupting workflow
  };

  // Load invoice by ID for navigation
  const loadInvoiceById = useCallback(async (saleId: string) => {
    if (!currentOrganization?.id) return;
    setIsLoadingNavInvoice(true);
    try {
      const { data: invoiceData, error } = await supabase
        .from('sales')
        .select(`*, sale_items(*)`)
        .eq('id', saleId)
        .single();
      if (error || !invoiceData) throw error || new Error('Invoice not found');

      // Fetch product UOMs so MTR/roll multiplier is applied on edit
      const productIds = [...new Set((invoiceData.sale_items || []).map((it: any) => it.product_id).filter(Boolean))];
      const productUomMap = new Map<string, string>();
      if (productIds.length > 0) {
        const { data: productsData } = await supabase
          .from('products')
          .select('id, uom')
          .in('id', productIds as string[]);
        if (productsData) {
          productsData.forEach((p: any) => productUomMap.set(p.id, p.uom || 'NOS'));
        }
      }

      setEditingInvoiceId(invoiceData.id);
      setInvoiceDate(new Date(invoiceData.sale_date));
      setDueDate(invoiceData.due_date ? new Date(invoiceData.due_date) : new Date());
      setSelectedCustomerId(invoiceData.customer_id || "");
      if (invoiceData.customer_id) {
        setSelectedCustomer({
          id: invoiceData.customer_id,
          customer_name: invoiceData.customer_name,
          phone: invoiceData.customer_phone,
          email: invoiceData.customer_email,
          address: invoiceData.customer_address,
        });
      } else {
        setSelectedCustomer(null);
        setSelectedCustomerId("");
      }
      setPaymentTerm(invoiceData.payment_term || "");
      setTermsConditions(invoiceData.terms_conditions || "");
      setNotes(invoiceData.notes || "");
      setShippingAddress(invoiceData.shipping_address || "");
      setShippingInstructions(invoiceData.shipping_instructions || "");
      setSalesman(invoiceData.salesman || "");
      setFlatDiscountPercent(invoiceData.flat_discount_percent || 0);
      setFlatDiscountRupees(invoiceData.flat_discount_amount || 0);
      setOtherCharges(invoiceData.other_charges || 0);
      setRoundOff(invoiceData.round_off || 0);

      if (invoiceData.sale_items && invoiceData.sale_items.length > 0) {
        const transformedItems = invoiceData.sale_items.map((item: any) => {
          const uom = productUomMap.get(item.product_id) || 'NOS';
          const base: any = {
            id: item.id,
            productId: item.product_id,
            variantId: item.variant_id,
            productName: item.product_name,
            size: item.size,
            barcode: item.barcode || '',
            color: item.color || '',
            quantity: item.quantity,
            box: '',
            mrp: item.mrp,
            salePrice: item.unit_price,
            discountPercent: item.discount_percent,
            discountAmount: 0,
            gstPercent: item.gst_percent,
            lineTotal: item.line_total,
            hsnCode: item.hsn_code || '',
            uom,
          };
          const mult = getMtrMultiplier(base);
          const subTotal = base.salePrice * mult;
          const discAmt = (subTotal * (base.discountPercent || 0)) / 100;
          base.lineTotal = subTotal - discAmt;
          return base;
        });
        setLineItems(transformedItems);
        setOriginalItemsForEdit(invoiceData.sale_items.map((item: any) => ({
          variantId: item.variant_id,
          quantity: item.quantity,
        })));
      }

      // Populate savedInvoiceData so Print button works immediately
      const filledItems = (invoiceData.sale_items || []).map((item: any) => ({
        productId: item.product_id,
        variantId: item.variant_id,
        productName: item.product_name,
        size: item.size,
        barcode: item.barcode || '',
        color: item.color || '',
        quantity: item.quantity,
        mrp: item.mrp,
        salePrice: item.unit_price,
        discountPercent: item.discount_percent,
        discountAmount: 0,
        gstPercent: item.gst_percent,
        lineTotal: item.line_total,
        hsnCode: item.hsn_code || '',
        uom: productUomMap.get(item.product_id) || 'NOS',
      }));
      setSavedInvoiceData({
        invoiceNumber: invoiceData.sale_number,
        sale_number: invoiceData.sale_number,
        filledItems,
        netAmount: invoiceData.net_amount,
        grossAmount: invoiceData.gross_amount,
        totalDiscount: invoiceData.discount_amount + (invoiceData.flat_discount_amount || 0),
        customer: {
          id: invoiceData.customer_id,
          customer_name: invoiceData.customer_name,
          phone: invoiceData.customer_phone,
          email: invoiceData.customer_email,
          address: invoiceData.customer_address,
          gst_number: null,
        },
      });
    } catch (err: any) {
      console.error('Failed to load invoice:', err);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load invoice' });
    } finally {
      setIsLoadingNavInvoice(false);
    }
  }, [currentOrganization?.id, toast]);

  const handleLastInvoice = useCallback(() => {
    if (!allInvoiceIds || allInvoiceIds.length === 0) return;
    setNavInvoiceIndex(0);
    loadInvoiceById(allInvoiceIds[0].id);
  }, [allInvoiceIds, loadInvoiceById]);

  const handlePreviousInvoice = useCallback(() => {
    if (!allInvoiceIds || navInvoiceIndex === null) return;
    const newIndex = Math.min(navInvoiceIndex + 1, allInvoiceIds.length - 1);
    setNavInvoiceIndex(newIndex);
    loadInvoiceById(allInvoiceIds[newIndex].id);
  }, [allInvoiceIds, navInvoiceIndex, loadInvoiceById]);

  const handleNextInvoice = useCallback(() => {
    if (!allInvoiceIds || navInvoiceIndex === null) return;
    const newIndex = Math.max(navInvoiceIndex - 1, 0);
    setNavInvoiceIndex(newIndex);
    loadInvoiceById(allInvoiceIds[newIndex].id);
  }, [allInvoiceIds, navInvoiceIndex, loadInvoiceById]);


  const getMtrMultiplier = (item: { uom?: string; size?: string; quantity: number }): number => {
    if ((item.uom || '').toUpperCase() === 'MTR') {
      const meters = parseFloat(item.size || '');
      if (!isNaN(meters) && meters > 0) return meters;
    }
    return item.quantity;
  };

  const calculateLineTotal = (item: LineItem): LineItem => {
    const baseAmount = item.salePrice * getMtrMultiplier(item);
    // Round discount to 2dp to prevent float drift
    const discountAmount = item.discountPercent > 0
      ? Math.round((baseAmount * item.discountPercent) / 100 * 100) / 100
      : Math.round(item.discountAmount * 100) / 100;
    const amountAfterDiscount = Math.round((baseAmount - discountAmount) * 100) / 100;
    
    let lineTotal: number;
    if (taxType === "inclusive") {
      // For inclusive GST, the price already includes tax
      lineTotal = amountAfterDiscount;
    } else {
      // Round GST to 2dp per line item — prevents accumulated float error
      const gstAmount = Math.round((amountAfterDiscount * item.gstPercent) / 100 * 100) / 100;
      lineTotal = Math.round((amountAfterDiscount + gstAmount) * 100) / 100;
    }
    
    return {
      ...item,
      discountAmount,
      lineTotal,
    };
  };

  const updateQuantity = async (id: string, quantity: number) => {
    const item = lineItems.find(i => i.id === id);
    const isDecimal = isDecimalUOM(item?.uom);
    if (isDecimal ? quantity <= 0 : quantity < 1) return;
    
    // Find the item being updated
    if (!item || !item.variantId) return;
    
    // In edit mode, calculate freed stock from original invoice for this variant
    let freedQty = 0;
    if (editingInvoiceId && originalItemsForEdit.length > 0) {
      freedQty = originalItemsForEdit
        .filter(orig => orig.variantId === item.variantId)
        .reduce((sum, orig) => sum + orig.quantity, 0);
    }
    
    // Real-time stock validation with freed quantity
    const stockCheck = await checkStock(item.variantId, quantity, freedQty);
    
    if (!stockCheck.isAvailable) {
      showStockError(
        item.productName,
        item.size,
        quantity,
        stockCheck.availableStock
      );
      return;
    }
    
    const updatedItems = lineItems.map(item => 
      item.id === id ? calculateLineTotal({ ...item, quantity }) : item
    );
    setLineItems(updatedItems);
  };

  const updateBox = (id: string, box: string) => {
    setLineItems(prev => prev.map(item =>
      item.id === id ? { ...item, box } : item
    ));
  };

  const updateDiscountPercent = (id: string, discountPercent: number) => {
    const updatedItems = lineItems.map(item => 
      item.id === id ? calculateLineTotal({ ...item, discountPercent, discountAmount: 0 }) : item
    );
    setLineItems(updatedItems);
  };

  const updateDiscountAmount = (id: string, discountAmount: number) => {
    const updatedItems = lineItems.map(item => 
      item.id === id ? calculateLineTotal({ ...item, discountAmount, discountPercent: 0 }) : item
    );
    setLineItems(updatedItems);
  };

  const updateGSTPercent = (id: string, gstPercent: number) => {
    const updatedItems = lineItems.map(item => 
      item.id === id ? calculateLineTotal({ ...item, gstPercent: applyGarmentGstRule(item.salePrice, gstPercent, garmentGstSettings) }) : item
    );
    setLineItems(updatedItems);
  };

  const updateMRP = (id: string, mrp: number) => {
    const updatedItems = lineItems.map(item => 
      item.id === id ? calculateLineTotal({ ...item, mrp }) : item
    );
    setLineItems(updatedItems);
  };

  const updateSalePrice = (id: string, salePrice: number) => {
    const updatedItems = lineItems.map(item => 
      item.id === id ? calculateLineTotal({ ...item, salePrice, gstPercent: applyGarmentGstRule(salePrice, item.gstPercent, garmentGstSettings) }) : item
    );
    setLineItems(updatedItems);
  };

  const removeItem = (id: string) => {
    // Clear the row instead of removing it
    const updatedItems = lineItems.map(item => 
      item.id === id ? {
        ...item,
        productId: '',
        variantId: '',
        productName: '',
        size: '',
        barcode: '',
        color: '',
        quantity: 0,
        mrp: 0,
        salePrice: 0,
        discountPercent: 0,
        discountAmount: 0,
        gstPercent: 0,
        lineTotal: 0,
        hsnCode: '',
      } : item
    );
    setLineItems(updatedItems);
  };

  const handleCreateCustomer = async (values: z.infer<typeof customerSchema>) => {
    try {
      if (!currentOrganization?.id) throw new Error("No organization selected");
      
      const { createOrGetCustomer } = await import("@/utils/customerUtils");
      
      const result = await createOrGetCustomer({
        customer_name: values.customer_name,
        phone: values.phone,
        email: values.email,
        address: values.address,
        gst_number: values.gst_number,
        transport_details: values.transport_details,
        organization_id: currentOrganization.id,
      });
      
      if (result.isExisting) {
        toast({
          title: "Customer Found",
          description: `${result.customer.customer_name} already exists and has been selected`,
        });
      } else {
        toast({
          title: "Customer Created",
          description: `${result.customer.customer_name} has been added successfully`,
        });
      }
      
      // Auto-select the customer
      setSelectedCustomerId(result.customer.id);
      setSelectedCustomer(result.customer);
      
      // Reset form and close dialog
      customerForm.reset();
      setOpenCustomerDialog(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create customer",
      });
    }
  };

  const sendToWhatsApp = async (invoiceNumber: string, customerPhone: string, items: LineItem[], totalAmount: number) => {
    if (!customerPhone) {
      toast({
        title: "No Phone Number",
        description: "Customer phone number is required to send via WhatsApp",
        variant: "destructive"
      });
      return;
    }

    try {
      // Fetch the full invoice data from database
      const { data: invoiceData, error: fetchError } = await supabase
        .from('sales')
        .select(`
          *,
          sale_items (*)
        `)
        .eq('sale_number', invoiceNumber)
        .single();

      if (fetchError || !invoiceData) {
        throw new Error('Failed to fetch invoice data');
      }

      // Generate and download PDF first
      const billSettings = settingsData?.bill_barcode_settings as any || {};
      const declarationText = billSettings.bill_header || 'Declaration: Composition taxable person, not eligible to collect tax on supplies.';
      const termsText = billSettings.bill_footer || '';
      const termsList = termsText ? termsText.split('\n').filter((t: string) => t.trim()) : [
        'GOODS ONCE SOLD WILL NOT BE TAKEN BACK.',
        'NO EXCHANGE WITHOUT BARCODE & BILL.',
        'EXCHANGE TIME: 01:00 TO 04:00 PM.'
      ];

      // Fetch shop logo if available
      let logoUrl: string | undefined;
      const saleSettings = settingsData?.sale_settings as any || {};
      if (saleSettings.shop_logo_path) {
        const { data: logoData } = await supabase
          .storage
          .from('company-logos')
          .createSignedUrl(saleSettings.shop_logo_path, 3600);
        
        if (logoData?.signedUrl) {
          logoUrl = logoData.signedUrl;
        }
      }

      // Transform invoice items for PDF generation
      const transformedItems = invoiceData.sale_items?.map((item: any, index: number) => ({
        sr: index + 1,
        particulars: item.product_name,
        size: item.size,
        barcode: item.barcode || '',
        hsn: '',
        sp: item.mrp,
        qty: item.quantity,
        rate: item.unit_price,
        total: item.line_total,
      })) || [];

      // Calculate payment details
      const paymentMethod = invoiceData.payment_method || 'pending';
      let cashPaid = 0, upiPaid = 0, cardPaid = 0;
      if (invoiceData.payment_status === 'completed') {
        if (paymentMethod === 'cash') cashPaid = invoiceData.net_amount;
        else if (paymentMethod === 'upi') upiPaid = invoiceData.net_amount;
        else if (paymentMethod === 'card') cardPaid = invoiceData.net_amount;
      }

      // Prepare invoice data for PDF
      const pdfInvoiceData = {
        billNo: invoiceData.sale_number,
        date: new Date(invoiceData.sale_date),
        time: new Date(invoiceData.sale_date).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        }),
        customerName: invoiceData.customer_name,
        customerAddress: invoiceData.customer_address || '',
        customerMobile: invoiceData.customer_phone || '',
        items: transformedItems,
        subTotal: invoiceData.gross_amount,
        discount: invoiceData.discount_amount,
        grandTotal: invoiceData.net_amount,
        tenderAmount: invoiceData.net_amount,
        cashPaid,
        upiPaid,
        cardPaid,
        refundCash: 0,
        paymentMethod,
        businessName: settingsData?.business_name || 'BUSINESS NAME',
        businessAddress: settingsData?.address || '',
        businessContact: settingsData?.mobile_number || '',
        businessEmail: settingsData?.email_id || '',
        gstNumber: settingsData?.gst_number || '',
        logo: logoUrl,
        mrpTotal: invoiceData.gross_amount,
        declarationText,
        termsList,
      };

      // TODO: Re-implement PDF generation for WhatsApp sharing
      // await generateInvoiceFromHTML(pdfInvoiceData);

      // Create WhatsApp message
      const message = `Hello ${selectedCustomer?.customer_name || 'Customer'},

Thank you for your business!

*Invoice Details:*
Invoice No: ${invoiceNumber}
Date: ${format(invoiceDate, 'dd/MM/yyyy')}
Amount: ₹${totalAmount.toFixed(2)}

Items: ${items.length} product(s)

${items.map((item, i) => 
  `${i + 1}. ${item.productName} (${item.size}) - Qty: ${item.quantity} - ₹${item.lineTotal.toFixed(2)}`
).join('\n')}

Total Amount: *₹${totalAmount.toFixed(2)}*

${paymentTerm ? `Payment Terms: ${paymentTerm}` : ''}

Thank you for choosing us!`;

      // Format phone number (remove non-digits and ensure country code)
      let formattedPhone = customerPhone.replace(/[^\d]/g, '');
      if (!formattedPhone.startsWith('91') && formattedPhone.length === 10) {
        formattedPhone = '91' + formattedPhone;
      }

      // Open WhatsApp with pre-filled message
      const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, '_blank');

      toast({
        title: "PDF Downloaded & WhatsApp Opened",
        description: "Please attach the downloaded PDF in WhatsApp chat",
      });
    } catch (error: any) {
      console.error('Error sending to WhatsApp:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to generate invoice PDF",
      });
    }
  };

  const handleSaveInvoice = async () => {
    // Synchronous lock check - prevents duplicate saves from rapid clicks/keyboard shortcuts
    if (savingLockRef.current) {
      
      return;
    }
    savingLockRef.current = true;

    // State-based check (secondary protection)
    if (isSaving) {
      
      savingLockRef.current = false;
      return;
    }

    // Validation
    if (!selectedCustomerId || !selectedCustomer) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please select a customer",
      });
      return;
    }

    // Check if customer mobile is required (for any sale with pending/partial payment)
    // Since Sales Invoice defaults to pay_later, customer mobile is mandatory
    if (!selectedCustomer.phone || !selectedCustomer.phone.trim()) {
      toast({
        variant: "destructive",
        title: "Customer Details Required",
        description: "Please enter customer details first for balance invoice. Mobile number is mandatory for invoices.",
      });
      return;
    }

    const filledItems = lineItems.filter(item => item.productId !== '');
    if (filledItems.length === 0) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please add at least one product",
      });
      savingLockRef.current = false;
      return;
    }

    // Validate no items have 0 or negative quantity
    const zeroQtyItems = filledItems.filter(item => !item.quantity || item.quantity <= 0);
    if (zeroQtyItems.length > 0) {
      toast({
        variant: "destructive",
        title: "Invalid Quantity",
        description: `${zeroQtyItems.length} item(s) have zero or invalid quantity. Please fix before saving.`,
      });
      savingLockRef.current = false;
      return;
    }

    // Real-time stock validation before saving
    // When editing, fetch fresh original items from database to avoid stale state issues
    const invoiceItems = filledItems.map(item => ({
      variantId: item.variantId,
      quantity: item.quantity,
      productName: item.productName,
      size: item.size,
    }));

    // Fetch fresh original items from database for accurate stock validation in edit mode
    let freshOriginalItems: Array<{ variantId: string; quantity: number }> = [];
    if (editingInvoiceId) {
      const { data: existingItems } = await supabase
        .from('sale_items')
        .select('variant_id, quantity')
        .eq('sale_id', editingInvoiceId);
      
      if (existingItems) {
        freshOriginalItems = existingItems.map(item => ({
          variantId: item.variant_id,
          quantity: item.quantity,
        }));
      }
      
    }

    const insufficientItems = await validateCartStock(
      invoiceItems,
      editingInvoiceId ? freshOriginalItems : undefined
    );
    
    if (insufficientItems.length > 0) {
      showMultipleStockErrors(insufficientItems);
      return;
    }

    setIsSaving(true);
    try {
      if (editingInvoiceId) {
        // Update existing invoice - correct order for stock triggers:
        // 1. Delete sale_items (triggers stock restoration via handle_sale_item_delete)
        // 2. Insert new sale_items (triggers stock deduction via update_stock_on_sale)
        // 3. Update sales record
        
        // Step 1: Delete existing sale items (triggers stock restoration)
        const { error: deleteError } = await supabase
          .from('sale_items')
          .delete()
          .eq('sale_id', editingInvoiceId);

        if (deleteError) throw deleteError;

        // Step 2: Insert updated sale items (triggers stock deduction)
        const saleItems = filledItems.map(item => ({
          sale_id: editingInvoiceId,
          product_id: item.productId,
          variant_id: item.variantId,
          product_name: item.productName,
          size: item.size,
          barcode: item.barcode || null,
          color: item.color || null,
          quantity: item.quantity,
          unit_price: item.salePrice,
          mrp: item.mrp,
          discount_percent: item.discountPercent,
          gst_percent: item.gstPercent,
          line_total: item.lineTotal,
          hsn_code: item.hsnCode || null,
        }));

        const { error: itemsError } = await supabase
          .from('sale_items')
          .insert(saleItems);

        if (itemsError) throw itemsError;

        // Step 3: Update the sales record
        const { error: updateError } = await supabase
          .from('sales')
          .update({
            sale_date: invoiceDate.toISOString(),
            customer_id: selectedCustomerId,
            customer_name: selectedCustomer.customer_name,
            customer_phone: selectedCustomer.phone || null,
            customer_email: selectedCustomer.email || null,
            customer_address: selectedCustomer.address || null,
            gross_amount: grossAmount,
            discount_amount: lineItemDiscount,
            flat_discount_percent: flatDiscountPercent,
            flat_discount_amount: flatDiscountAmount,
            other_charges: otherCharges,
            round_off: roundOff,
            net_amount: netAmount,
            points_redeemed_amount: pointsRedemptionValue,
            due_date: dueDate.toISOString().split('T')[0],
            payment_term: paymentTerm || null,
            terms_conditions: termsConditions || null,
            notes: notes || null,
            shipping_address: shippingAddress || null,
            shipping_instructions: shippingInstructions || null,
            salesman: salesman || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingInvoiceId);

        if (updateError) throw updateError;

        // Recalculate payment_status if net_amount changed
        const { data: updatedSale } = await supabase
          .from('sales')
          .select('paid_amount, net_amount, sale_return_adjust')
          .eq('id', editingInvoiceId)
          .single();

        if (updatedSale) {
          const totalSettled = (updatedSale.paid_amount || 0) + (updatedSale.sale_return_adjust || 0);
          const correctStatus = totalSettled >= updatedSale.net_amount - 1
            ? 'completed'
            : totalSettled > 0 ? 'partial' : 'pending';

          await supabase
            .from('sales')
            .update({ payment_status: correctStatus })
            .eq('id', editingInvoiceId);
        }

        toast({
          title: "Invoice Updated",
          description: "Invoice has been updated successfully",
        });

        // Invalidate dashboard queries so list refreshes on return
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
        queryClient.invalidateQueries({ queryKey: ['invoice-dashboard-stats'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });

        // Mark invoice as saved to prevent draft re-save on unmount
        invoiceSavedRef.current = true;
        // Clear any existing draft after successful save
        await deleteDraft();
        stopAutoSave();
        updateCurrentData(null);

        // Fetch the updated invoice number
        const { data: invoiceData } = await supabase
          .from('sales')
          .select('sale_number')
          .eq('id', editingInvoiceId)
          .single();

        // NOTE: WhatsApp auto-send is DISABLED for invoice updates to prevent duplicate messages
        // Users can manually resend from the WhatsApp Logs or Sales Dashboard if needed
        // The edge function also has a 60-minute duplicate prevention check as a fallback

        // Store invoice data and show print dialog
        setSavedInvoiceData({
          invoiceNumber: invoiceData?.sale_number,
          filledItems,
          netAmount,
          grossAmount,
          totalDiscount,
          customer: selectedCustomer,
        });
        setShowPrintDialog(true);
      } else {
        // Create new invoice — respect invoice_series_start from settings
        let saleNumber: string;
        const saleSettings = settingsData?.sale_settings as any;
        
        if (saleSettings?.invoice_numbering_format || saleSettings?.invoice_series_start) {
          const rawFormat = saleSettings.invoice_numbering_format || saleSettings.invoice_series_start;
          const rawSeriesStart = saleSettings.invoice_series_start;
          const format = autoCorrectFY(rawFormat);
          const seriesStart = rawSeriesStart ? autoCorrectFY(rawSeriesStart) : rawSeriesStart;
          const hasPlaceholders = format.includes('{');
          
          let minSequence = 1;
          let basePattern = format.replace(/\d+$/, '');
          
          if (seriesStart && seriesStart.trim()) {
            const startMatches = seriesStart.match(/^(.*?)(\d+)$/);
            if (startMatches) {
              basePattern = startMatches[1];
              minSequence = parseInt(startMatches[2]);
            }
          }
          
          if (hasPlaceholders) {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            
            const { data: lastSale } = await supabase
              .from('sales')
              .select('sale_number')
              .eq('organization_id', currentOrganization!.id)
              .is('deleted_at', null)
              .like('sale_number', `%${year}%`)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            
            let sequence = minSequence;
            if (lastSale?.sale_number) {
              const matches = lastSale.sale_number.match(/(\d+)$/);
              if (matches) sequence = Math.max(parseInt(matches[1]) + 1, minSequence);
            }
            
            saleNumber = format
              .replace('{YYYY}', String(year))
              .replace('{YY}', String(year).slice(-2))
              .replace('{MM}', month)
              .replace('{####}', String(sequence).padStart(4, '0'))
              .replace('{###}', String(sequence).padStart(3, '0'))
              .replace('{#####}', String(sequence).padStart(5, '0'));
          } else {
            const { data: lastSales } = await supabase
              .from('sales')
              .select('sale_number')
              .eq('organization_id', currentOrganization!.id)
              .is('deleted_at', null)
              .like('sale_number', `${basePattern}%`)
              .order('created_at', { ascending: false })
              .limit(50);
            
            let sequence = minSequence;
            if (lastSales && lastSales.length > 0) {
              let maxSeq = 0;
              for (const s of lastSales) {
                const matches = s.sale_number.match(/(\d+)$/);
                if (matches) maxSeq = Math.max(maxSeq, parseInt(matches[1]));
              }
              sequence = Math.max(maxSeq + 1, minSequence);
            }
            saleNumber = `${basePattern}${sequence}`;
          }
        } else {
          const { data: defaultNumber, error: saleNumError } = await supabase
            .rpc('generate_sale_number_atomic', { p_organization_id: currentOrganization?.id });
          if (saleNumError) throw saleNumError;
          saleNumber = defaultNumber;
        }

        const { data: saleData, error: saleError } = await supabase
          .from('sales')
          .insert([{
            sale_number: saleNumber,
            sale_date: invoiceDate.toISOString(),
            sale_type: 'invoice',
            customer_id: selectedCustomerId,
            customer_name: selectedCustomer.customer_name,
            customer_phone: selectedCustomer.phone || null,
            customer_email: selectedCustomer.email || null,
            customer_address: selectedCustomer.address || null,
            gross_amount: grossAmount,
            discount_amount: lineItemDiscount,
            flat_discount_percent: flatDiscountPercent,
            flat_discount_amount: flatDiscountAmount,
            other_charges: otherCharges,
            round_off: roundOff,
            net_amount: netAmount,
            points_redeemed_amount: pointsRedemptionValue,
            payment_method: paymentOverride?.method ?? 'pay_later',
            payment_status: paymentOverride
              ? (paymentOverride.totalPaid >= netAmount ? 'completed' : 'partial')
              : 'pending',
            paid_amount: paymentOverride?.totalPaid ?? 0,
            cash_amount: paymentOverride?.cashAmount ?? 0,
            upi_amount: paymentOverride?.upiAmount ?? 0,
            card_amount: paymentOverride?.cardAmount ?? 0,
            organization_id: currentOrganization?.id,
            shop_name: shopName || null,
            due_date: dueDate.toISOString().split('T')[0],
            payment_term: paymentTerm || null,
            terms_conditions: termsConditions || null,
            notes: notes || null,
            shipping_address: shippingAddress || null,
            shipping_instructions: shippingInstructions || null,
            salesman: salesman || null,
          }])
          .select()
          .single();

        if (saleError) throw saleError;

        const saleItems = filledItems.map(item => ({
          sale_id: saleData.id,
          product_id: item.productId,
          variant_id: item.variantId,
          product_name: item.productName,
          size: item.size,
          barcode: item.barcode || null,
          color: item.color || null,
          quantity: item.quantity,
          unit_price: item.salePrice,
          mrp: item.mrp,
          discount_percent: item.discountPercent,
          gst_percent: item.gstPercent,
          line_total: item.lineTotal,
          hsn_code: item.hsnCode || null,
        }));

        const { error: itemsError } = await supabase
          .from('sale_items')
          .insert(saleItems);

        if (itemsError) throw itemsError;

        // Save financer details if provided
        if (financerDetails?.financer_name) {
          await supabase
            .from('sale_financer_details')
            .insert({
              sale_id: saleData.id,
              organization_id: currentOrganization?.id,
              financer_name: financerDetails.financer_name,
              loan_number: financerDetails.loan_number || null,
              emi_amount: financerDetails.emi_amount || null,
              tenure: financerDetails.tenure || null,
              down_payment: financerDetails.down_payment || null,
              down_payment_mode: financerDetails.down_payment_mode || 'cash',
              bank_transfer_amount: financerDetails.bank_transfer_amount || 0,
              finance_discount: financerDetails.finance_discount || 0,
            });
        }

        // CRM: Redeem points if requested
        if (pointsToRedeem > 0 && selectedCustomerId) {
          redeemPoints(
            selectedCustomerId,
            saleData.id,
            pointsToRedeem,
            saleNumber
          ).then(() => {
            queryClient.invalidateQueries({ queryKey: ['customer-points', selectedCustomerId] });
          });
        }

        // CRM: Award points for this purchase
        if (isPointsEnabled && selectedCustomerId) {
          awardPoints(
            selectedCustomerId,
            saleData.id,
            netAmount,
            saleNumber
          ).then(() => {
            queryClient.invalidateQueries({ queryKey: ['customer-points', selectedCustomerId] });
          });
        }

        // Auto-send WhatsApp invoice notification - FIRE AND FORGET (non-blocking)
        if (selectedCustomer?.phone && currentOrganization?.id) {
          (async () => { try {
            const { data: whatsappSettings } = await (supabase as any)
              .from('whatsapp_api_settings')
              .select('is_active, auto_send_invoice, invoice_template_name')
              .eq('organization_id', currentOrganization.id)
              .maybeSingle();

            if (whatsappSettings?.is_active && whatsappSettings?.auto_send_invoice) {
              const companyName = (settingsData as any)?.business_name || currentOrganization.name || 'Our Company';

              const formattedDate = new Date(invoiceDate).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              });
              const formattedAmount = `${Number(netAmount).toLocaleString('en-IN')}`;

              const totalQty = filledItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

              const messageText = `Hello ${selectedCustomer.customer_name},\n\nYour invoice ${saleNumber} has been created.\nAmount: ₹${formattedAmount}\nDate: ${formattedDate}\n\nThank you for your business!\n${companyName}`;

              supabase.functions.invoke('send-whatsapp', {
                body: {
                  organizationId: currentOrganization.id,
                  phone: selectedCustomer.phone,
                  message: messageText,
                  templateType: 'sales_invoice',
                  templateName: whatsappSettings.invoice_template_name || null,
                  saleData: {
                    sale_id: saleData.id,
                    org_slug: currentOrganization.slug,
                    customer_name: selectedCustomer.customer_name,
                    sale_number: saleNumber,
                    sale_date: invoiceDate,
                    net_amount: netAmount,
                    gross_amount: grossAmount,
                    discount_amount: flatDiscountAmount,
                    items_count: totalQty,
                    organization_name: companyName,
                  },
                  referenceId: saleData.id,
                  referenceType: 'sale',
                },
              });
            }
          } catch (e) {
            console.error('WhatsApp auto-send failed (SalesInvoice):', e);
          } })();
        }

        // Silent operation - no toast for invoice save

        // Invalidate dashboard queries so list refreshes on return
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
        queryClient.invalidateQueries({ queryKey: ['invoice-dashboard-stats'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });

        // Mark invoice as saved to prevent draft re-save on unmount
        invoiceSavedRef.current = true;
        // Clear any existing draft after successful save
        await deleteDraft();
        stopAutoSave();
        updateCurrentData(null);

        // Store invoice data for print dialog BEFORE clearing the form
        const invoiceDataForPrint = {
          invoiceNumber: saleNumber,
          filledItems,
          netAmount,
          grossAmount,
          totalDiscount,
          customer: selectedCustomer,
        };

        // Reset form immediately for new invoice readiness
        setLineItems(
          Array(7).fill(null).map((_, i) => ({
            id: `row-${i}`,
            productId: '',
            variantId: '',
            productName: '',
            size: '',
            barcode: '',
            color: '',
            quantity: 0,
            box: '',
            mrp: 0,
            salePrice: 0,
            discountPercent: 0,
            discountAmount: 0,
            gstPercent: 0,
            lineTotal: 0,
            hsnCode: '',
          }))
        );
        setSelectedCustomerId("");
        setSelectedCustomer(null);
        setPointsToRedeem(0);
        setInvoiceDate(new Date());
        setDueDate(new Date());
        setPaymentTerm("");
        setTermsConditions("");
        setNotes("");
        setShippingAddress("");
        setShippingInstructions("");
        setSalesman("");
        setFlatDiscountPercent(0);
        setFlatDiscountRupees(0);
        setOtherCharges(0);
        setRoundOff(0);
        setEditingInvoiceId(null);
        setOriginalItemsForEdit([]);
        setPaymentOverride(null);

        // Now show print dialog with saved data
        setSavedInvoiceData(invoiceDataForPrint);
        setShowPrintDialog(true);
      }
    } catch (error: any) {
      logError(
        {
          operation: 'sale_invoice_save',
          organizationId: currentOrganization?.id,
          additionalContext: {
            lineItemsCount: lineItems.length,
            customerId: selectedCustomerId,
            isEditMode: !!editingInvoiceId,
          },
        },
        error
      );
      console.error('Error saving invoice:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save invoice",
      });
      setPaymentOverride(null);
    } finally {
      savingLockRef.current = false;
      setIsSaving(false);
    }
  };

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    onAfterPrint: () => {
      toast({
        title: "Success",
        description: "Invoice printed successfully",
      });
      // Don't clear savedInvoiceData if viewing a navigated invoice (editingInvoiceId is set)
      // so that the Print button remains available for re-printing
      if (!editingInvoiceId) {
        setSavedInvoiceData(null);
      }
      setShowPrintDialog(false);
    },
  });

  const handlePrintInvoice = async () => {
    if (!savedInvoiceData || !currentOrganization?.id) return;
    
    // Try QZ Tray direct print first
    if (isDirectPrintEnabled) {
      waitForPrintReady(printRef, async () => {
        const saleSettings = (settingsData as any)?.sale_settings;
        const billFormat = saleSettings?.sales_bill_format || 'a4';
        const paperSize = billFormat === 'thermal' ? '80mm' : billFormat === 'a5' ? 'A5' : 'A4';
        await directPrint(printRef.current, {
          context: 'sale',
          paperSize,
          onFallback: () => {
            handlePrint();
          },
          onSuccess: () => {
            if (!editingInvoiceId) {
              setSavedInvoiceData(null);
            }
            setShowPrintDialog(false);
          },
        });
      });
      return;
    }
    
    // Fallback: browser print - wait for data + DOM + images
    waitForPrintReady(printRef, () => {
      handlePrint();
    });
  };

  const handleClosePrintDialog = () => {
    setShowPrintDialog(false);
    
    // If editing, navigate back to dashboard
    if (editingInvoiceId) {
      setEditingInvoiceId(null);
      setOriginalItemsForEdit([]);
      navigate('/sales-invoice-dashboard');
    }
    
    setSavedInvoiceData(null);
  };

  // Calculate totals
  const grossAmount = lineItems.reduce((sum, item) => sum + (item.salePrice * getMtrMultiplier(item)), 0);
  const lineItemDiscount = lineItems.reduce((sum, item) => {
    const baseAmount = item.salePrice * getMtrMultiplier(item);
    // Use discountAmount if set, otherwise calculate from discountPercent
    const discount = item.discountAmount > 0 
      ? item.discountAmount 
      : (item.discountPercent > 0 ? (baseAmount * item.discountPercent) / 100 : 0);
    return sum + discount;
  }, 0);
  // Flat discount: Stack both percent and rupees discounts together
  const flatDiscountPercentAmount = (grossAmount * flatDiscountPercent) / 100;
  const flatDiscountAmount = flatDiscountPercentAmount + flatDiscountRupees;
  const totalDiscount = lineItemDiscount + flatDiscountAmount;
  const amountAfterDiscount = grossAmount - totalDiscount + otherCharges;
  
  const totalGST = lineItems.reduce((sum, item) => {
    const baseAmount = item.salePrice * getMtrMultiplier(item) - item.discountAmount;
    // Apply flat discount proportionally
    const proportionalFlatDiscount = grossAmount > 0 ? (baseAmount / grossAmount) * flatDiscountAmount : 0;
    const adjustedBase = Math.round((baseAmount - proportionalFlatDiscount) * 100) / 100;
    if (taxType === "inclusive") {
      // Extract GST from inclusive price
      return sum + Math.round((adjustedBase - (adjustedBase / (1 + item.gstPercent / 100))) * 100) / 100;
    } else {
      // Calculate GST on exclusive price
      return sum + Math.round((adjustedBase * item.gstPercent) / 100 * 100) / 100;
    }
  }, 0);
  
  // Points redemption
  const pointsRedemptionValue = calculateRedemptionValue(pointsToRedeem);
  const netBeforeRoundOff = (taxType === "inclusive" ? amountAfterDiscount : amountAfterDiscount + totalGST) - pointsRedemptionValue;
  
  // Auto-calculate round-off to make final amount a whole number
  const calculatedRoundOff = Math.round(netBeforeRoundOff) - netBeforeRoundOff;
  
  // Auto-update roundOff when line items change (if not manually set)
  useEffect(() => {
    if (lineItems.filter(i => i.productId).length > 0) {
      const newRoundOff = parseFloat(calculatedRoundOff.toFixed(2));
      if (Math.abs(newRoundOff - roundOff) > 0.001) {
        setRoundOff(newRoundOff);
      }
    } else if (roundOff !== 0) {
      setRoundOff(0);
    }
  }, [netBeforeRoundOff, lineItems]);
  
  const netAmount = Math.round(netBeforeRoundOff + roundOff);

  const isMobile = useIsMobile();

  if (isMobile) {
    const filledItems = lineItems.filter(i => i.productId !== '');
    const totalQty = filledItems.reduce((s, i) => s + (i.quantity || 0), 0);
    return (
      <div className="flex flex-col min-h-screen bg-muted/30">
        <MobilePageHeader
          title={editingInvoiceId ? "Edit Invoice" : "Sales Invoice"}
          subtitle={savedInvoiceData?.sale_number || nextInvoicePreview || "NEW"}
          backTo="/sales-invoice-dashboard"
        />

        <div className="flex-1 overflow-y-auto pb-40 space-y-3 px-4 pt-3">
          {/* Customer Section */}
          <div className="bg-background rounded-2xl p-3.5 border border-border/40 shadow-sm space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer</p>
            <button
              onClick={() => setOpenCustomerSearch(true)}
              className="w-full h-10 rounded-xl border border-border bg-muted/30 px-3 text-left text-sm"
            >
              {selectedCustomer ? (
                <span className="font-medium text-foreground">{selectedCustomer.customer_name} {selectedCustomer.phone ? `· ${selectedCustomer.phone}` : ''}</span>
              ) : (
                <span className="text-muted-foreground">Tap to select customer…</span>
              )}
            </button>
            {selectedCustomer && customerBalance !== null && customerBalance !== 0 && (
              <p className={cn("text-xs font-medium", customerBalance > 0 ? "text-amber-600" : "text-emerald-600")}>
                {customerBalance > 0 ? `Outstanding: ₹${Math.round(customerBalance).toLocaleString("en-IN")}` : `Advance: ₹${Math.abs(Math.round(customerBalance)).toLocaleString("en-IN")}`}
              </p>
            )}
          </div>

          {/* Barcode / Product Search */}
          <div className="bg-background rounded-2xl p-3.5 border border-border/40 shadow-sm space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add Items</p>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={barcodeInputRef}
                  placeholder="Scan barcode or search product…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={handleBarcodeSearch}

                  className="pl-10 h-11 text-base rounded-xl"
                  autoComplete="off"
                  autoCapitalize="off"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              <CameraScanButton
                onBarcodeScanned={(barcode) => {
                  const trimmed = barcode.trim();
                  if (!trimmed) return;
                  markSubmitted(trimmed);
                  cancelAutoSubmit();
                  setSearchInput("");
                  searchAndAddProduct(trimmed);
                  setTimeout(() => barcodeInputRef.current?.focus(), 50);
                }}
                className="h-11 w-11 rounded-xl shrink-0"
              />
            </div>
            {/* Mobile Search Results Dropdown */}
            {productSearchResults.length > 0 && searchInput.length >= 1 && (
              <div className="bg-popover border border-border rounded-xl shadow-lg max-h-72 overflow-auto -mx-0.5">
                {productSearchResults.slice(0, 50).map(({ product, variant }) => (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => addProductToInvoice(product, variant)}
                    className="w-full text-left px-3.5 py-2.5 border-b border-border/30 last:border-0 active:bg-accent/70 transition-colors"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{product.product_name}</p>
                        <div className="flex flex-wrap items-center gap-1 mt-0.5">
                          {product.brand && <span className="text-[11px] bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-1.5 py-0.5 rounded">{product.brand}</span>}
                          {product.category && <span className="text-[11px] bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800 px-1.5 py-0.5 rounded">{product.category}</span>}
                          {product.style && <span className="text-[11px] bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded">{product.style}</span>}
                          {(variant.color || product.color) && (variant.color || product.color) !== '-' && <span className="text-[11px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{variant.color || product.color}</span>}
                          {variant.size && <span className="text-[11px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-mono">Size: {variant.size}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                          {variant.barcode && <span className="font-mono">{variant.barcode}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-primary">₹{variant.sale_price}</p>
                        <p className={cn("text-[11px] font-medium", (variant.stock_qty || 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                          Stock: {variant.stock_qty || 0}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {!isSearching && productSearchResults.length === 0 && searchInput.length >= 2 && (
              <p className="text-xs text-muted-foreground text-center py-2">No products found</p>
            )}
          </div>

          {/* Items list */}
          {filledItems.length > 0 && (
            <div className="bg-background rounded-2xl border border-border/40 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border/30">
                <p className="text-xs font-semibold text-foreground">Items ({filledItems.length})</p>
                <p className="text-xs text-muted-foreground">{totalQty} pcs total</p>
              </div>
              <div className="divide-y divide-border/20">
                {filledItems.map((item) => {
                  const realIdx = lineItems.indexOf(item);
                  return (
                    <div key={item.id} className="flex items-center justify-between px-3.5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{item.productName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {item.size ? `${item.size} · ` : ""}{item.color || ""} × ₹{Math.round(item.salePrice || item.mrp || 0)}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <button onClick={() => {
                            const updated = [...lineItems];
                            if (updated[realIdx].quantity > 1) { const newItem = { ...updated[realIdx], quantity: updated[realIdx].quantity - 1 }; updated[realIdx] = calculateLineTotal(newItem); setLineItems(updated); }
                          }} className="w-8 h-8 bg-muted rounded-lg text-base font-bold flex items-center justify-center active:scale-90 touch-manipulation">−</button>
                          <span className="w-8 text-center text-sm font-semibold tabular-nums">{item.quantity}</span>
                          <button onClick={() => {
                            const updated = [...lineItems];
                            const newItem = { ...updated[realIdx], quantity: updated[realIdx].quantity + 1 }; updated[realIdx] = calculateLineTotal(newItem);
                            setLineItems(updated);
                          }} className="w-8 h-8 bg-muted rounded-lg text-base font-bold flex items-center justify-center active:scale-90 touch-manipulation">+</button>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-sm font-bold text-foreground tabular-nums">₹{Math.round(item.lineTotal || 0).toLocaleString("en-IN")}</p>
                        <button onClick={() => {
                          setLineItems(lineItems.map((li, i) => i === realIdx ? { ...li, productId: '', variantId: '', productName: '', quantity: 0, lineTotal: 0 } : li));
                        }} className="text-[10px] text-destructive font-medium mt-1">Remove</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Total summary */}
          {filledItems.length > 0 && (
            <div className="bg-background rounded-2xl p-3.5 border border-border/40 shadow-sm space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium tabular-nums">₹{Math.round(grossAmount).toLocaleString("en-IN")}</span>
              </div>
              {totalDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="font-medium text-emerald-600 tabular-nums">− ₹{Math.round(totalDiscount).toLocaleString("en-IN")}</span>
                </div>
              )}
              {totalGST > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">GST ({taxType})</span>
                  <span className="font-medium tabular-nums">₹{Math.round(totalGST).toLocaleString("en-IN")}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold pt-1 border-t border-border/30">
                <span>Total</span>
                <span className="tabular-nums">₹{netAmount.toLocaleString("en-IN")}</span>
              </div>
            </div>
          )}
        </div>

        {/* Fixed bottom save bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border p-4 space-y-2 z-30" style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}>
          <button
            onClick={() => handleSaveInvoice()}
            disabled={isSaving || savingLockRef.current || !lineItems.some(i => i.productId)}
            className="w-full bg-primary text-primary-foreground rounded-xl h-12 font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 touch-manipulation shadow-sm disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? "Saving…" : `Save Invoice${filledItems.length > 0 ? ` · ₹${netAmount.toLocaleString("en-IN")}` : ""}`}
          </button>
        </div>

        {/* All existing dialogs */}
        <Dialog open={openCustomerDialog} onOpenChange={setOpenCustomerDialog}>
          <DialogContent><DialogHeader><DialogTitle>New Customer</DialogTitle></DialogHeader>
            <Form {...customerForm}>
              <form onSubmit={customerForm.handleSubmit((data) => { /* handled by existing logic */ })} className="space-y-3">
                <FormField control={customerForm.control} name="phone" render={({ field }) => (<FormItem><FormLabel>Phone *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={customerForm.control} name="customer_name" render={({ field }) => (<FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                <Button type="submit" className="w-full">Create</Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        <AlertDialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Print Invoice?</AlertDialogTitle><AlertDialogDescription>Invoice saved successfully.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel onClick={handleClosePrintDialog}>Skip</AlertDialogCancel><AlertDialogAction onClick={handlePrintInvoice}>Print</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <SizeGridDialog open={showSizeGrid} onClose={() => setShowSizeGrid(false)} product={sizeGridProduct} variants={sizeGridVariants} onConfirm={handleSizeGridConfirm} showStock validateStock title="Enter Size-wise Qty" />
        <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <InvoiceWrapper ref={printRef} billNo={savedInvoiceData?.invoiceNumber || `DRAFT`} date={invoiceDate} customerName={savedInvoiceData?.customer?.customer_name || selectedCustomer?.customer_name || ""} customerAddress={savedInvoiceData?.customer?.address || ""} customerMobile={savedInvoiceData?.customer?.phone || ""} customerGSTIN={savedInvoiceData?.customer?.gst_number || ""} customerTransportDetails="" items={(savedInvoiceData?.filledItems || filledItems).map((item: any, index: number) => ({ sr: index + 1, particulars: item.productName, size: item.size, barcode: item.barcode || "", hsn: item.hsnCode || "", sp: item.salePrice, mrp: item.mrp, qty: item.quantity, rate: item.salePrice, total: item.lineTotal, color: item.color || "", gstPercent: item.gstPercent || 0, discountPercent: item.discountPercent || 0 }))} subTotal={savedInvoiceData?.grossAmount ?? grossAmount} discount={savedInvoiceData?.totalDiscount ?? totalDiscount} grandTotal={savedInvoiceData?.netAmount ?? netAmount} paymentMethod="Cash" financerDetails={financerDetails} />
        </div>
        {historyProduct && currentOrganization && <ProductHistoryDialog isOpen={!!historyProduct} onClose={() => setHistoryProduct(null)} productId={historyProduct.id} productName={historyProduct.name} organizationId={currentOrganization.id} />}
        {pendingPriceSelection && <PriceSelectionDialog open={showPriceSelectionDialog} onOpenChange={(open) => { setShowPriceSelectionDialog(open); if (!open) setPendingPriceSelection(null); }} productName={pendingPriceSelection.product?.product_name || ''} size={pendingPriceSelection.variant?.size || ''} masterPrice={pendingPriceSelection.masterPrice} lastPurchasePrice={pendingPriceSelection.lastPurchasePrice} customerPrice={pendingPriceSelection.customerPrice} onSelect={(source, prices) => { const { product, variant } = pendingPriceSelection; setShowPriceSelectionDialog(false); setPendingPriceSelection(null); addProductToInvoice(product, variant, prices); }} />}
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-slate-50 dark:bg-background pb-6" data-entry-form>
      {/* Professional Header Bar */}
      <header className="bg-gradient-to-r from-slate-900 to-slate-800 shrink-0 flex flex-col">
        <div className="h-[52px] flex items-center px-5 gap-3">
          {/* Left: Nav */}
          <Button variant="ghost" size="sm" onClick={() => navigate('/sales-invoice-dashboard')}
            className="h-8 text-white/70 hover:text-white hover:bg-white/10 border border-white/15 text-xs gap-1.5">
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Button>
          <div className="w-px h-6 bg-white/15 mx-1" />
          <span className="text-white font-bold text-[15px] whitespace-nowrap">
            {editingInvoiceId ? 'Edit Invoice' : 'Sales Invoice'}
          </span>
          <span className="bg-blue-600 text-white font-mono text-[11px] font-bold px-3 py-1 rounded-md">
            {editingInvoiceId && allInvoiceIds?.[navInvoiceIndex ?? -1]?.sale_number
              ? allInvoiceIds[navInvoiceIndex!].sale_number
              : (savedInvoiceData?.sale_number || 'NEW')}
          </span>
          {navInvoiceIndex !== null && allInvoiceIds && (
            <span className="text-white/50 text-xs hidden lg:inline">
              {navInvoiceIndex + 1} of {allInvoiceIds.length}
            </span>
          )}
          {isLoadingNavInvoice && <Loader2 className="h-4 w-4 animate-spin text-white/60" />}

          <div className="flex-1" />

          {/* Right: Actions */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handleLastInvoice}
              disabled={isLoadingNavInvoice || !allInvoiceIds?.length}
              className="h-8 text-white hover:text-white hover:bg-white/20 border border-white/30 text-xs gap-1.5 w-8 p-0"
              title="Last Record">
              <SkipBack className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handlePreviousInvoice}
              disabled={isLoadingNavInvoice || navInvoiceIndex === null || navInvoiceIndex >= (allInvoiceIds?.length || 0) - 1}
              className="h-8 text-white hover:text-white hover:bg-white/20 border border-white/30 text-xs gap-1.5 w-8 p-0"
              title="Previous">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleNextInvoice}
              disabled={isLoadingNavInvoice || navInvoiceIndex === null || navInvoiceIndex <= 0}
              className="h-8 text-white hover:text-white hover:bg-white/20 border border-white/30 text-xs gap-1.5 w-8 p-0"
              title="Next">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="w-px h-6 bg-white/20 mx-1" />
            <Button variant="ghost" size="sm" onClick={() => {
                setLineItems(Array(7).fill(null).map((_, i) => ({
                  id: `row-${i}`, productId: '', variantId: '', productName: '', size: '', barcode: '', color: '',
                  quantity: 0, box: '', mrp: 0, salePrice: 0, discountPercent: 0, discountAmount: 0, gstPercent: 0, lineTotal: 0, hsnCode: '',
                })));
                setSelectedCustomerId("");
                setSelectedCustomer(null);
                setInvoiceDate(new Date());
                setDueDate(new Date());
                setPaymentTerm("");
                setTermsConditions("");
                setNotes("");
                setShippingAddress("");
                setShippingInstructions("");
                setEditingInvoiceId(null);
                setOriginalItemsForEdit([]);
                setSavedInvoiceData(null);
                setFlatDiscountPercent(0);
                setFlatDiscountRupees(0);
                setOtherCharges(0);
                setRoundOff(0);
                setSalesman("");
                setNavInvoiceIndex(null);
                setShowNotesSection(false);
                setShowPrintDialog(false);
                setPointsToRedeem(0);
                setSearchInput("");
                setProductSearchResults([]);
                deleteDraft();
                invoiceSavedRef.current = false;
                savingLockRef.current = false;
              }}
              className="h-8 text-white hover:text-white hover:bg-white/20 border border-white/30 text-xs gap-1.5 px-2.5"
              title="New Bill">
              <Plus className="h-3.5 w-3.5" />
              <span>New</span>
            </Button>
            {(editingInvoiceId || savedInvoiceData) && (
              <>
                <div className="w-px h-6 bg-white/20 mx-1" />
                <Button size="sm" onClick={handlePrintInvoice}
                  className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white border-0 text-xs gap-1.5">
                  <Printer className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Print</span>
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Last invoice info row + Search Invoice */}
        {!editingInvoiceId && (
          <div className="h-[34px] bg-slate-800/80 border-t border-white/10 flex items-center justify-between gap-2 text-[12px] px-5">
            <div className="flex items-center gap-2">
              {lastInvoice ? (
                <>
                  <span className="text-white/50">Last:</span>
                  <span className="text-blue-300 font-mono font-bold text-[11px]">{lastInvoice.sale_number}</span>
                  <span className="text-white/25">|</span>
                  <span className="text-white/50">Qty:</span>
                  <span className="text-white font-bold">{lastInvoice.total_qty}</span>
                  <span className="text-white/25">|</span>
                  <span className="text-white font-bold">₹{Math.round(lastInvoice.net_amount || 0).toLocaleString('en-IN')}</span>
                  <span className="text-white/25">|</span>
                  <span className="text-white/70">{lastInvoice.customer_name}</span>
                </>
              ) : (
                <span className="text-white/40">No invoices yet</span>
              )}
            </div>
            <div className="relative flex items-center">
              <Search className="absolute left-2 h-3.5 w-3.5 text-white/40" />
              <input
                placeholder="Search Invoice & Enter"
                className="no-uppercase h-[26px] w-[200px] bg-white/10 border border-white/15 rounded text-[11px] text-white font-mono pl-7 pr-2 placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-blue-400/50 focus:bg-white/15"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const searchVal = (e.target as HTMLInputElement).value.trim();
                    if (!searchVal || !allInvoiceIds?.length) return;
                    const match = allInvoiceIds.find(inv => 
                      inv.sale_number?.toLowerCase() === searchVal.toLowerCase() ||
                      inv.sale_number?.toLowerCase().includes(searchVal.toLowerCase())
                    );
                    if (match) {
                      const idx = allInvoiceIds.indexOf(match);
                      setNavInvoiceIndex(idx);
                      loadInvoiceById(match.id);
                      (e.target as HTMLInputElement).value = '';
                    } else {
                      toast({ variant: 'destructive', title: 'Not Found', description: `Invoice "${searchVal}" not found` });
                    }
                  }
                }}
              />
            </div>
          </div>
        )}
      </header>

      {/* Main content area */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">

      {/* Invoice & Customer Details Section */}
      <section className="bg-white border-b border-slate-100 px-5 py-2 shrink-0 shadow-sm">

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-start">
          {/* Customer Selection */}
          <div className="col-span-2 md:col-span-1 lg:col-span-2">
            <Label className="text-[13px] font-semibold text-slate-500">Customer <span className="text-red-500">*</span></Label>
            <div className="flex gap-1.5">
              <Popover open={openCustomerSearch} onOpenChange={setOpenCustomerSearch}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openCustomerSearch}
                    className="flex-1 justify-between h-10 text-sm"
                  >
                    {selectedCustomer ? (
                      <span>{selectedCustomer.customer_name} - {selectedCustomer.phone}</span>
                    ) : (
                      <span className="text-muted-foreground">Search customer by name, phone...</span>
                    )}
                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0 z-50" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput 
                      placeholder="Search by name, phone, email..." 
                      value={customerSearchInput}
                      onValueChange={(val) => {
                        setCustomerSearchInput(val);
                      }}
                    />
                    <CommandList className="max-h-[300px]">
                      {isCustomersLoading ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : isCustomersError ? (
                        <CommandEmpty className="py-4 text-center">
                          <div className="text-destructive flex items-center justify-center gap-2">
                            <AlertCircle className="h-4 w-4" />
                            <span>Error loading customers</span>
                          </div>
                          <Button
                            variant="link"
                            size="sm"
                            onClick={() => refetchCustomers()}
                            className="mt-2"
                          >
                            Try again
                          </Button>
                        </CommandEmpty>
                      ) : filteredCustomers.length === 0 && customerSearchInput.length >= 1 ? (
                        <CommandEmpty className="py-3">
                          <div className="text-center text-sm text-muted-foreground mb-2">No customers found</div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const searchVal = customerSearchInput.trim();
                              const isPhone = /^\d{10,}$/.test(searchVal.replace(/\D/g, ''));
                              customerForm.reset({
                                customer_name: isPhone ? "" : searchVal,
                                phone: isPhone ? searchVal : "",
                                email: "",
                                address: "",
                                gst_number: "",
                              });
                              setOpenCustomerSearch(false);
                              setOpenCustomerDialog(true);
                            }}
                            className="gap-1"
                          >
                            <Plus className="h-4 w-4" />
                            Create "{customerSearchInput}"
                          </Button>
                        </CommandEmpty>
                      ) : filteredCustomers.length === 0 ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                          Start typing to search customers...
                        </div>
                      ) : (
                        <>
                          <CommandGroup heading={`Found ${filteredCustomers.length} customers${hasMoreCustomers ? ' - refine search for more' : ''}`}>
                            {filteredCustomers.map((customer: any) => {
                              const balance = getCustomerBalance(customer);
                              const advanceAmt = getCustomerAdvance(customer.id);
                              return (
                                <CommandItem
                                  key={customer.id}
                                  value={customer.id}
                                  onSelect={() => {
                                    setSelectedCustomerId(customer.id);
                                    setSelectedCustomer(customer);
                                    setPointsToRedeem(0);
                                    setOpenCustomerSearch(false);
                                    setCustomerSearchInput("");
                                  }}
                                  className="cursor-pointer"
                                >
                                  <div className="flex flex-col gap-1 w-full">
                                    <div className="flex items-center justify-between">
                                      <span className="font-medium uppercase">{customer.customer_name}</span>
                                      <div className="flex items-center gap-1.5">
                                        {advanceAmt > 0 && (
                                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600">
                                            ₹{advanceAmt.toLocaleString('en-IN')} Adv
                                          </span>
                                        )}
                                        {balance !== 0 && (
                                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                            balance > 0 
                                              ? 'bg-destructive/10 text-destructive' 
                                              : 'bg-green-500/10 text-green-600'
                                          }`}>
                                            ₹{Math.abs(balance).toLocaleString('en-IN')} {balance > 0 ? 'Due' : 'Cr'}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <span className="text-sm text-muted-foreground">
                                      {customer.phone && `Phone: ${customer.phone}`}
                                      {customer.email && ` | Email: ${customer.email}`}
                                    </span>
                                  </div>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setOpenCustomerDialog(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {/* Balance badge below field */}
            {selectedCustomerId && !isBalanceLoading && (
              <div className={`inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border ${
                customerBalance > 0
                  ? 'bg-red-50 text-red-600 border-red-200'
                  : customerBalance < 0
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
              }`}>
                <CreditCard className="h-3 w-3" />
                ₹{Math.abs(customerBalance).toLocaleString('en-IN')} {customerBalance > 0 ? 'due' : customerBalance < 0 ? 'credit' : ''}
              </div>
            )}
            {selectedCustomerId && selectedCustomer?.discount_percent > 0 && (
              <span className="inline-flex text-xs font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary mt-1">
                {selectedCustomer.discount_percent}% Disc
              </span>
            )}
            {/* Brand discounts / transport */}
            {selectedCustomer && (
              <div className="mt-1.5">
                {isBrandDiscountsLoading ? (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading brand discounts...
                  </span>
                ) : hasBrandDiscounts && brandDiscounts.length > 0 ? (
                  <div className="flex flex-wrap gap-1 items-center">
                    <span className="text-xs text-muted-foreground">Brand Discounts:</span>
                    {brandDiscounts.map((bd, idx) => (
                      <span 
                        key={idx} 
                        className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium"
                      >
                        {bd.brand}: {bd.discount_percent}%
                      </span>
                    ))}
                  </div>
                ) : selectedCustomer.discount_percent > 0 ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Customer Discount:</span>
                    <span className="text-xs bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded font-medium">
                      {selectedCustomer.discount_percent}%
                    </span>
                  </div>
                ) : null}
              </div>
            )}
            {/* CRM Loyalty Points */}
            {selectedCustomerId && isPointsEnabled && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {/* Points Balance Badge */}
                <div className="flex items-center gap-1.5 bg-amber-500 text-white px-2.5 py-1 rounded-lg text-xs font-semibold">
                  <Coins className="h-3.5 w-3.5" />
                  <span>{customerPointsData?.balance || 0} pts</span>
                  {lineItems.filter(i => i.productId).length > 0 && (
                    <span className="text-amber-100 text-xs">
                      +{calculatePoints(lineItems.reduce((s, i) => s + i.lineTotal, 0))} earn
                    </span>
                  )}
                </div>

                {/* Redeem Input */}
                {isRedemptionEnabled &&
                 (customerPointsData?.balance || 0) >= (pointsSettings?.min_points_for_redemption || 10) && (
                  <div className="flex items-center gap-1.5 bg-green-600 px-2.5 py-1 rounded-lg">
                    <span className="text-white text-xs font-medium">Redeem:</span>
                    <Input
                      type="number"
                      className="w-16 h-7 bg-white text-green-700 text-center text-xs font-semibold rounded border-0"
                      value={pointsToRedeem || ""}
                      placeholder="0"
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        const max = calculateMaxRedeemablePoints(
                          grossAmount - lineItemDiscount - flatDiscountAmount,
                          customerPointsData?.balance || 0
                        );
                        setPointsToRedeem(Math.min(Math.max(0, val), max));
                      }}
                      min={0}
                      max={calculateMaxRedeemablePoints(
                        grossAmount - lineItemDiscount - flatDiscountAmount,
                        customerPointsData?.balance || 0
                      )}
                    />
                    <span className="text-white text-xs whitespace-nowrap">
                      pts = ₹{calculateRedemptionValue(pointsToRedeem).toFixed(0)}
                    </span>
                  </div>
                )}
              </div>
            )}
            {selectedCustomer?.transport_details && (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="font-medium">Transport:</span>
                <span>{selectedCustomer.transport_details}</span>
              </div>
            )}
          </div>

          {/* Invoice No */}
          <div>
            <label className="text-[13px] font-medium text-muted-foreground mb-1 block">Invoice No</label>
            <Input 
              value={editingInvoiceId ? (savedInvoiceData?.sale_number || '') : nextInvoicePreview} 
              readOnly 
              className="bg-muted font-mono font-bold text-sm h-10"
              placeholder="Auto-generated"
            />
          </div>

          {/* Invoice Date */}
          <div>
            <label className="text-[13px] font-medium text-muted-foreground mb-1 block">Invoice Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-10 text-sm")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(invoiceDate, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-50">
                <Calendar mode="single" selected={invoiceDate} onSelect={(d) => d && setInvoiceDate(d)} />
              </PopoverContent>
            </Popover>
          </div>

          {/* Tax Type */}
          <div>
            <label className="text-[13px] font-medium text-muted-foreground mb-1 block">Tax Type</label>
            <Select value={taxType} onValueChange={(v: "exclusive" | "inclusive") => setTaxType(v)}>
              <SelectTrigger className="h-10 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-50">
                <SelectItem value="exclusive">Exclusive GST</SelectItem>
                <SelectItem value="inclusive">Inclusive GST</SelectItem>
              </SelectContent>
            </Select>
          </div>

           {/* Salesman */}
          <div>
            <label className="text-[13px] font-medium text-muted-foreground mb-1 block">Salesman</label>
            <Select value={salesman || "none"} onValueChange={(v) => setSalesman(v === "none" ? "" : v)}>
              <SelectTrigger className="h-10 text-sm">
                <SelectValue placeholder="Select salesman" />
              </SelectTrigger>
              <SelectContent className="z-50">
                <SelectItem value="none">None</SelectItem>
                {employeesData?.map(emp => (
                  <SelectItem key={emp.id} value={emp.employee_name}>
                    {emp.employee_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

        </div>
      </section>

      {/* Product Entry Bar */}
      <section className="bg-slate-50 border-b border-slate-200 px-5 py-3 shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Entry Mode Toggle */}
            {sizeGridEnabled && (
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-sm ${entryMode === "grid" ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                Size Grid
              </span>
              <Switch
                checked={entryMode === "inline"}
                onCheckedChange={(checked) => setEntryMode(checked ? "inline" : "grid")}
              />
              <span className={`text-sm ${entryMode === "inline" ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                Inline
              </span>
            </div>
            )}

            {/* Barcode Scan Input */}
            <div className="flex gap-1 w-[250px] shrink-0">
              <div className="relative flex-1">
                <Scan className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={barcodeInputRef}
                  placeholder="Scan barcode..."
                  value={searchInput}
                  onChange={handleBarcodeInputChange}
                  onKeyDown={handleBarcodeSearch}
                  className="pl-10 pr-4 h-10 font-mono bg-card border-border"
                  autoFocus
                />
              </div>
              <CameraScanButton
                onBarcodeScanned={(barcode) => {
                  const trimmed = barcode.trim();
                  if (!trimmed) return;
                  markSubmitted(trimmed);
                  cancelAutoSubmit();
                  setSearchInput("");
                  searchAndAddProduct(trimmed);
                  setTimeout(() => barcodeInputRef.current?.focus(), 50);
                }}
                className="h-10 w-10 shrink-0"
              />
            </div>

            {/* Divider */}
            <div className="text-muted-foreground/30 text-lg font-light select-none">|</div>

            {/* Browse Products Search Bar */}
            <Popover open={openProductSearch} onOpenChange={setOpenProductSearch}>
              <PopoverTrigger asChild>
                <div className="relative flex-1 min-w-[250px] cursor-pointer">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Browse products by name, brand, category, size..."
                    className="pl-10 pr-4 h-10 bg-card border-border cursor-pointer text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    readOnly
                    onClick={() => setOpenProductSearch(true)}
                  />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-[600px] p-0 z-50" align="start">
                <Command shouldFilter={false}>
                  <CommandInput placeholder="Search by name, barcode, brand, style..." value={searchInput} onValueChange={setSearchInput} />
                  <CommandList className="max-h-[400px]">
                    {isSearching ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : productSearchResults.length === 0 && searchInput.length >= 1 ? (
                      <CommandEmpty>No products found</CommandEmpty>
                    ) : productSearchResults.length === 0 ? (
                      <div className="py-6 text-center text-sm text-muted-foreground">
                        Start typing to search products...
                      </div>
                    ) : (
                      <>
                        {productSearchResults.length > productDisplayLimit && (
                          <div className="px-3 py-2 text-sm text-muted-foreground bg-muted/50 border-b flex items-center justify-between">
                            <span>Showing {productDisplayLimit} of {productSearchResults.length} results</span>
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                setProductDisplayLimit(prev => prev + 100);
                              }}
                            >
                              Load More
                            </Button>
                          </div>
                        )}
                        <CommandGroup>
                          {productSearchResults.slice(0, productDisplayLimit).map(({ product, variant }) => (
                          <CommandItem
                            key={variant.id}
                            value={variant.id}
                            onSelect={() => addProductToInvoice(product, variant)}
                            className="cursor-pointer py-2 group"
                          >
                            <div className="flex flex-col w-full gap-1">
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium group-data-[selected=true]:text-white">{product.product_name}</span>
                                  {product.size_range && (
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold group-data-[selected=true]:bg-white/20 group-data-[selected=true]:text-white">
                                      {product.size_range}
                                    </span>
                                  )}
                                </div>
                                <span className="font-semibold text-primary group-data-[selected=true]:text-white">₹{variant.sale_price}</span>
                              </div>
                              <div className="flex justify-between items-center text-xs text-muted-foreground group-data-[selected=true]:text-white/80">
                                <div className="flex gap-2 flex-wrap">
                                  {product.brand && <span className="bg-muted px-1.5 py-0.5 rounded group-data-[selected=true]:bg-white/20 group-data-[selected=true]:text-white">{product.brand}</span>}
                                  {product.category && <span className="bg-muted px-1.5 py-0.5 rounded group-data-[selected=true]:bg-white/20 group-data-[selected=true]:text-white">{product.category}</span>}
                                  {product.style && <span className="bg-muted px-1.5 py-0.5 rounded group-data-[selected=true]:bg-white/20 group-data-[selected=true]:text-white">{product.style}</span>}
                                  {(variant.color || product.color) && (
                                    <span className="bg-accent/50 text-accent-foreground px-1.5 py-0.5 rounded font-medium group-data-[selected=true]:bg-white/20 group-data-[selected=true]:text-white">{variant.color || product.color}</span>
                                  )}
                                  <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium group-data-[selected=true]:bg-white/25 group-data-[selected=true]:text-white">Size: {variant.size}</span>
                                </div>
                                <div className="flex gap-2 items-center">
                                  {variant.mrp && variant.mrp !== variant.sale_price && (
                                    <span className="line-through group-data-[selected=true]:text-white/70">MRP: ₹{variant.mrp}</span>
                                  )}
                                  <span className={`${variant.stock_qty > 5 ? 'text-green-600' : 'text-orange-500'} group-data-[selected=true]:text-white/90`}>
                                    Stock: {variant.stock_qty}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </CommandItem>
                          ))}
                        </CommandGroup>
                      </>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Total Qty Pill */}
            <div className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg ml-auto cursor-default transition-colors">
              <span className="text-[12px] font-semibold text-white/80">Total Qty</span>
              <span className="text-[18px] font-black text-white tabular-nums font-mono leading-none">
                {lineItems.reduce((sum, item) => sum + (item.productId ? item.quantity : 0), 0)}
              </span>
            </div>
          </div>
      </section>

      {/* Line Items Table — fills remaining space; only this area scrolls */}
      <section className="flex-1 min-h-0 px-6 pb-2 overflow-hidden bg-slate-100 relative">
        <div
          ref={tableContainerRef}
          className="h-full overflow-y-auto isolate rounded-lg border border-slate-200 shadow-sm bg-slate-100"
        >
         <div className="bg-white min-h-full pb-4">
          <table className="w-full border-separate border-spacing-0 erp-desktop-table">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-800 border-b-2 border-blue-600">
                <th className="text-center text-[14px] uppercase tracking-[.06em] font-bold h-12 text-white px-3 w-10 rounded-tl-lg">#</th>
                <th className="text-left text-[14px] uppercase tracking-[.06em] font-bold h-12 text-white px-3 min-w-[200px]">PRODUCT</th>
                <th className="text-center text-[14px] uppercase tracking-[.06em] font-bold h-12 text-white px-3 w-20">SIZE</th>
                {showCol.color && <th className="text-center text-[14px] uppercase tracking-[.06em] font-bold h-12 text-white px-3 w-20">COLOR</th>}
                <th className="text-center text-[14px] uppercase tracking-[.06em] font-bold h-12 text-white px-3 w-24">BARCODE</th>
                {showCol.hsn && <th className="text-center text-[14px] uppercase tracking-[.06em] font-bold h-12 text-white px-3 w-20">HSN</th>}
                <th className="text-center text-[14px] uppercase tracking-[.06em] font-bold h-12 text-white px-3 w-16">QTY</th>
                {showCol.box && <th className="text-center text-[14px] uppercase tracking-[.06em] font-bold h-12 text-white px-3 w-16">BOX</th>}
                {showCol.mrp && <th className="text-right text-[14px] uppercase tracking-[.06em] font-bold h-12 text-white px-3 w-24">MRP</th>}
                <th className="text-right text-[14px] uppercase tracking-[.06em] font-bold h-12 text-white px-3 w-24">PRICE</th>
                {showCol.disc_percent && <th className="text-right text-[14px] uppercase tracking-[.06em] font-bold h-12 text-white px-3 w-20">DISC%</th>}
                {showCol.disc_amount && <th className="text-right text-[14px] uppercase tracking-[.06em] font-bold h-12 text-white px-3 w-24">DISC ₹</th>}
                {showCol.gst && <th className="text-center text-[14px] uppercase tracking-[.06em] font-bold h-12 text-white px-3 w-16">GST%</th>}
                <th className="text-right text-[14px] uppercase tracking-[.06em] font-bold h-12 text-white px-3 w-28 bg-blue-700 rounded-tr-lg">TOTAL</th>
                <th className="w-8 px-1 h-10 bg-slate-800"></th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const filledItems = lineItems.filter(item => item.productId !== '');

                if (filledItems.length === 0) {
                  const baseCols = 8; // #, product, size, barcode, qty, price, total, action
                  const optCols = [showCol.color, showCol.hsn, showCol.box, showCol.mrp, showCol.disc_percent, showCol.disc_amount, showCol.gst].filter(Boolean).length;
                  const totalCols = baseCols + optCols;
                  return Array.from({ length: 7 }, (_, i) => (
                    <tr key={`empty-${i}`} className="h-[38px] border-b border-muted/30">
                      <td className="text-center text-[12px] text-muted-foreground/40 px-3">{i + 1}</td>
                      {Array.from({ length: totalCols - 1 }, (_, j) => (
                        <td key={j} className="px-3"></td>
                      ))}
                    </tr>
                  ));
                }

                // Reverse filled items so newest appears first
                const displayItems = filledItems.slice().reverse();

                const baseCols = 8;
                const optCols = [showCol.color, showCol.hsn, showCol.box, showCol.mrp, showCol.disc_percent, showCol.disc_amount, showCol.gst].filter(Boolean).length;
                const totalCols = baseCols + optCols;
                const padCount = Math.max(0, 7 - displayItems.length);

                const itemRows = displayItems.map((item, displayIndex) => {
                  const originalIndex = lineItems.findIndex(li => li.id === item.id);
                  const srNo = originalIndex + 1;

                  return (
                    <tr
                      key={item.id}
                      className={`group border-b border-border/40 transition-colors ${displayIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} hover:bg-blue-50/50`}
                    >
                      <td className="text-center text-[15px] text-muted-foreground px-3 py-2.5">{srNo}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setHistoryProduct({ id: item.productId, name: item.productName })}
                          className="text-primary hover:underline text-left font-semibold break-words whitespace-normal leading-tight text-[14px]"
                        >
                          {item.productName}
                        </button>
                        {item.color && (
                          <div className="text-xs text-muted-foreground mt-0.5">{item.color}</div>
                        )}
                      </td>
                      <td className="text-center px-3 py-2">
                        {item.size ? (
                          <span className={`inline-block text-[15px] font-bold px-2 py-0.5 rounded ${
                            ['XS','S','M','L','XL','XXL','XXXL'].includes(item.size?.toUpperCase())
                              ? 'bg-blue-100 text-blue-700'
                              : /^\d+$/.test(item.size)
                                ? 'bg-green-100 text-green-700'
                                : 'bg-slate-100 text-slate-600'
                          }`}>
                            {item.size}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      {showCol.color && <td className="text-center text-[15px] font-semibold text-slate-900 dark:text-slate-100 px-3 py-2.5 hidden lg:table-cell">
                        {item.color || <span className="text-slate-300">—</span>}
                      </td>}
                      <td className="text-center px-3 py-2">
                        <span className="font-mono text-[15px] font-semibold text-blue-600">{item.barcode || <span className="text-slate-300 font-normal">—</span>}</span>
                      </td>
                      {showCol.hsn && <td className="text-center text-[15px] font-semibold text-slate-900 dark:text-slate-100 px-3 py-2.5">{item.hsnCode || <span className="text-slate-300">—</span>}</td>}
                      <td className="text-center px-1.5 py-1">
                        <Input
                          type="number"
                          min={isDecimalUOM(item.uom) ? "0.001" : "1"}
                          step={isDecimalUOM(item.uom) ? "0.001" : "1"}
                          value={item.quantity || ""}
                          placeholder="1"
                          onChange={(e) => updateQuantity(item.id, isDecimalUOM(item.uom) ? (parseFloat(e.target.value) || 0.001) : (parseInt(e.target.value) || 1))}
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          className="w-16 h-10 text-center font-bold text-[17px] bg-warning/10 border-warning/30 focus:border-warning mx-auto tabular-nums"
                        />
                        {item.uom && item.uom !== 'NOS' && item.uom !== 'PCS' && (
                          <span className="text-[10px] text-muted-foreground text-center block">{item.uom}</span>
                        )}
                      </td>
                      {showCol.box && <td className="text-center px-1.5 py-1">
                        <Input
                          type="text"
                          value={item.box || ''}
                          onChange={(e) => updateBox(item.id, e.target.value)}
                          placeholder=""
                          className="w-14 h-10 text-center text-[15px] mx-auto"
                        />
                      </td>}
                      {showCol.mrp && <td className="text-right px-1.5 py-1">
                        <Input
                          type="number"
                          min="0"
                          value={item.mrp || ""}
                          placeholder="0"
                          onChange={(e) => updateMRP(item.id, parseFloat(e.target.value) || 0)}
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          className="w-[120px] h-10 text-right text-[17px] tabular-nums ml-auto"
                        />
                      </td>}
                      <td className="text-right px-1.5 py-1">
                        <Input
                          type="number"
                          min="0"
                          value={item.salePrice || ""}
                          placeholder="0"
                          onChange={(e) => updateSalePrice(item.id, parseFloat(e.target.value) || 0)}
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          className="w-[120px] h-10 text-right text-[15px] font-semibold tabular-nums ml-auto"
                        />
                      </td>
                      {showCol.disc_percent && <td className="text-right px-1.5 py-1">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={item.discountPercent || ""}
                          placeholder="0"
                          onChange={(e) => updateDiscountPercent(item.id, parseFloat(e.target.value) || 0)}
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          className="w-16 h-10 text-right text-[17px] tabular-nums ml-auto"
                        />
                      </td>}
                      {showCol.disc_amount && <td className="text-right px-1.5 py-1">
                        <Input
                          type="number"
                          min="0"
                          value={item.discountAmount || ""}
                          placeholder="-"
                          onChange={(e) => updateDiscountAmount(item.id, parseFloat(e.target.value) || 0)}
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          className="w-20 h-10 text-right text-[17px] tabular-nums ml-auto text-destructive"
                        />
                      </td>}
                      {showCol.gst && <td className="text-center px-3 py-2">
                        <span className="text-[15px] font-semibold text-muted-foreground">{item.gstPercent}%</span>
                      </td>}
                      <td className="text-right px-3 py-2 bg-blue-50/40">
                        <span className="text-[17px] font-bold text-blue-700 font-mono tabular-nums">
                          ₹{item.lineTotal.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-1 py-1.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeItem(item.id)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                });

                const padRows = Array.from({ length: padCount }, (_, i) => {
                  const srNo = displayItems.length + i + 1;
                  return (
                    <tr key={`pad-${i}`} className="h-[42px] border-b border-border/40 bg-white">
                      <td className="text-center text-[12px] text-muted-foreground/40 px-3">{srNo}</td>
                      {Array.from({ length: totalCols - 1 }, (_, j) => (
                        <td key={j} className="px-3"></td>
                      ))}
                    </tr>
                  );
                });

                return [...itemRows, ...padRows];
              })()}
              {/* Total Row */}
              {lineItems.some(item => item.productId) && (
                <tr className="bg-muted/50 font-medium">
                  <td className="px-3 py-2" colSpan={3 + (showCol.color ? 1 : 0) + 1 + (showCol.hsn ? 1 : 0)} />
                  <td className="text-center font-bold text-primary text-sm tabular-nums px-3 py-2">
                    {lineItems.reduce((sum, item) => sum + (item.productId ? item.quantity : 0), 0)}
                  </td>
                  <td className="px-3 py-2" colSpan={(showCol.box ? 1 : 0) + 2 + (showCol.disc_percent ? 1 : 0) + (showCol.disc_amount ? 1 : 0) + (showCol.gst ? 1 : 0)} />
                  <td className="text-right font-bold text-sm tabular-nums px-3 py-2">₹{grossAmount.toFixed(2)}</td>
                  <td className="px-1 py-2" />
                </tr>
              )}
            </tbody>
          </table>
         </div>
        </div>
      </section>

        {/* Collapsible Notes Section — sibling of table so it never pushes the footer */}
        {showNotesSection && (
          <div className="shrink-0 px-6 py-3 bg-slate-50 border-t border-slate-200 max-h-[30vh] overflow-y-auto">
            <div className="flex items-center gap-2 mb-2">
              <Label className="text-[12px] font-semibold text-slate-600">Notes / Remarks</Label>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 ml-auto" onClick={() => setShowNotesSection(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="text-[13px] bg-white" placeholder="Add notes or remarks..." />
          </div>
        )}

        {/* Financer Details (Mobile ERP) */}
        {mobileERP.enabled && mobileERP.financer_billing && (
          <div className="shrink-0 px-6 py-3 border-t border-slate-200 max-h-[30vh] overflow-y-auto bg-white">
            <FinancerDetailsForm
              value={financerDetails}
              onChange={(details) => setFinancerDetails(details)}
            />
          </div>
        )}

      </main>

      {/* Footer — sibling of <main>, locked above the global StatusBar */}
      <footer className="shrink-0 relative z-30 shadow-[0_-10px_30px_rgba(0,0,0,0.4)]">
        {/* Top Row: Inputs + Stats + Net Amount — single line */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white overflow-x-auto border-t-2 border-blue-600">
          <div className="flex items-center px-4 py-3 gap-0 min-w-max">
            {/* FLAT DISC % */}
            <span className="text-[15px] font-extrabold uppercase tracking-wider text-slate-200 mr-2 whitespace-nowrap">Flat Disc %</span>
            <Input
              type="number" min="0" max="100"
              value={flatDiscountPercent || ""}
              placeholder="0"
              onChange={(e) => setFlatDiscountPercent(parseFloat(e.target.value) || 0)}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              className="w-[80px] h-10 text-[17px] text-right bg-white text-slate-900 font-extrabold font-mono border-0 rounded-sm"
            />

            <div className="w-px h-8 bg-slate-600 mx-3 shrink-0" />

            {/* FLAT DISC ₹ */}
            <span className="text-[15px] font-extrabold uppercase tracking-wider text-slate-200 mr-2 whitespace-nowrap">Flat Disc ₹</span>
            <Input
              type="number" min="0"
              value={flatDiscountRupees || ""}
              placeholder="0"
              onChange={(e) => setFlatDiscountRupees(parseFloat(e.target.value) || 0)}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              className="w-[90px] h-10 text-[17px] text-right bg-white text-slate-900 font-extrabold font-mono border-0 rounded-sm"
            />

            <div className="w-px h-8 bg-slate-600 mx-3 shrink-0" />

            {/* Other Charges */}
            <span className="text-[15px] font-extrabold uppercase tracking-wider text-slate-200 mr-2 whitespace-nowrap">Charges</span>
            <Input
              type="number" min="0"
              value={otherCharges || ""}
              placeholder="0"
              onChange={(e) => setOtherCharges(parseFloat(e.target.value) || 0)}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              className="w-[90px] h-10 text-[17px] text-right bg-white text-slate-900 font-extrabold font-mono border-0 rounded-sm"
            />

            <div className="w-px h-8 bg-slate-600 mx-3 shrink-0" />

            {/* Round Off */}
            <span className="text-[15px] font-extrabold uppercase tracking-wider text-slate-200 mr-2 whitespace-nowrap">Round</span>
            <Input
              type="number" step="0.01"
              value={roundOff || ""}
              placeholder="0"
              onChange={(e) => setRoundOff(parseFloat(e.target.value) || 0)}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              className="w-[80px] h-10 text-[17px] text-right bg-white text-slate-900 font-extrabold font-mono border-0 rounded-sm"
            />

            {pointsToRedeem > 0 && (
              <>
                <div className="w-px h-8 bg-slate-600 mx-3 shrink-0" />
                <span className="text-[15px] text-amber-300 font-extrabold flex items-center gap-1 whitespace-nowrap">
                  <Coins className="h-4 w-4" />
                  Pts: -₹{pointsRedemptionValue.toFixed(0)}
                </span>
              </>
            )}

            {/* Right-pinned Net Amount */}
            {/* Mini stats block: Items / Qty / Gross / Discount */}
            <div className="ml-auto flex items-center gap-4 shrink-0">
              <div className="hidden md:flex flex-col gap-0.5 pl-4 border-l border-slate-600">
                <div className="flex items-center justify-between gap-3 min-w-[120px]">
                  <span className="text-[12px] uppercase tracking-wider text-slate-300 font-extrabold">Items</span>
                  <span className="text-[16px] font-extrabold text-white tabular-nums">
                    {lineItems.filter(i => i.productId).length}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 min-w-[120px]">
                  <span className="text-[12px] uppercase tracking-wider text-slate-300 font-extrabold">Total Qty</span>
                  <span className="text-[16px] font-extrabold text-white tabular-nums">
                    {lineItems.reduce((s, i) => s + (i.productId ? i.quantity : 0), 0)}
                  </span>
                </div>
              </div>
              <div className="hidden lg:flex flex-col gap-0.5 pl-4 border-l border-slate-600">
                <div className="flex items-center justify-between gap-3 min-w-[140px]">
                  <span className="text-[12px] uppercase tracking-wider text-slate-300 font-extrabold">Gross</span>
                  <span className="text-[16px] font-extrabold text-slate-100 tabular-nums">₹{grossAmount.toFixed(0)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 min-w-[140px]">
                  <span className="text-[12px] uppercase tracking-wider text-rose-400 font-extrabold">Discount</span>
                  <span className="text-[16px] font-extrabold text-rose-400 tabular-nums">
                    -₹{(lineItemDiscount + flatDiscountAmount).toFixed(0)}
                  </span>
                </div>
              </div>
              <div className="pl-4 border-l-2 border-blue-600/60 flex flex-col items-end shrink-0">
                <span className="text-[13px] font-extrabold uppercase tracking-wider text-yellow-400 underline decoration-yellow-400/40 underline-offset-2">Net Payable</span>
                <span className="text-[40px] font-black font-mono tabular-nums leading-none text-green-400 tracking-tighter">₹{netAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Formula strip + action buttons */}
        <div className="bg-slate-950 flex flex-wrap items-center px-4 py-2 gap-x-3 gap-y-1.5">
          <div className="hidden xl:flex items-center gap-2 text-[15px] text-slate-300 font-mono flex-1 min-w-0 overflow-hidden whitespace-nowrap">
            <span>Subtotal <span className="text-white font-extrabold">₹{grossAmount.toFixed(0)}</span></span>
            <span className="text-slate-600">—</span>
            <span>Disc <span className="text-red-300 font-extrabold">₹{(lineItemDiscount + flatDiscountAmount).toFixed(0)}</span></span>
            <span className="text-slate-600">+</span>
            <span>GST <span className="text-white font-extrabold">₹{taxType === 'exclusive' ? totalGST.toFixed(0) : '0'}</span></span>
            <span className="text-slate-600">=</span>
            <span>Net <span className="text-emerald-300 font-black text-[16px]">₹{netAmount.toLocaleString('en-IN')}</span></span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Payment shortcuts: Cash F1 / UPI F2 / Mix F3 (default = Credit / pay_later) */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlePaymentShortcut('cash')}
              disabled={isSaving || !lineItems.some(i => i.productId)}
              className={cn(
                "h-9 px-3.5 text-[13px] gap-1.5 font-extrabold border text-white",
                paymentOverride?.method === 'cash'
                  ? "bg-emerald-500 text-white border-emerald-400 hover:bg-emerald-500"
                  : "border-emerald-500/60 hover:bg-emerald-700/40 hover:text-white"
              )}
              title="Cash payment (F1)"
            >
              <Banknote className="h-4 w-4" />
              Cash <kbd className="ml-0.5 px-1 py-px rounded bg-black/20 text-[11px] font-mono">F1</kbd>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlePaymentShortcut('upi')}
              disabled={isSaving || !lineItems.some(i => i.productId)}
              className={cn(
                "h-9 px-3.5 text-[13px] gap-1.5 font-extrabold border text-white",
                paymentOverride?.method === 'upi'
                  ? "bg-violet-500 text-white border-violet-400 hover:bg-violet-500"
                  : "border-violet-500/60 hover:bg-violet-700/40 hover:text-white"
              )}
              title="UPI payment (F2)"
            >
              <Smartphone className="h-4 w-4" />
              UPI <kbd className="ml-0.5 px-1 py-px rounded bg-black/20 text-[11px] font-mono">F2</kbd>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlePaymentShortcut('mix')}
              disabled={isSaving || !lineItems.some(i => i.productId)}
              className={cn(
                "h-9 px-3.5 text-[13px] gap-1.5 font-extrabold border text-white",
                paymentOverride?.method === 'multiple'
                  ? "bg-amber-500 text-white border-amber-400 hover:bg-amber-500"
                  : "border-amber-500/60 hover:bg-amber-700/40 hover:text-white"
              )}
              title="Mix payment (F3)"
            >
              <Wallet className="h-4 w-4" />
              Mix <kbd className="ml-0.5 px-1 py-px rounded bg-black/20 text-[11px] font-mono">F3</kbd>
            </Button>
            {paymentOverride && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPaymentOverride(null)}
                className="h-9 px-2 text-[13px] text-slate-400 hover:bg-slate-800 hover:text-white"
                title="Clear payment selection (back to Credit)"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
            <div className="w-px h-6 bg-slate-700 mx-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowNotesSection(prev => !prev)}
              className="h-9 px-3 text-[13px] font-bold text-slate-200 hover:bg-slate-800 hover:text-white gap-1.5"
            >
              <FileText className="h-4 w-4" />
              Notes
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/sales-invoice-dashboard')}
              className="h-9 px-3 text-[13px] font-bold text-red-300 hover:bg-red-900/50 hover:text-red-200 gap-1.5"
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveInvoice}
              disabled={isSaving || savingLockRef.current || !lineItems.some(i => i.productId)}
              className="h-9 px-5 text-[14px] bg-green-600 text-white hover:bg-green-500 font-extrabold gap-1.5 shadow-[0_0_15px_rgba(34,197,94,0.4)] active:scale-95 transition-all"
            >
              {isSaving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
              ) : (
                <><Check className="h-4 w-4" /> <span className="kbd-hint">{editingInvoiceId ? 'Save Invoice' : '✓ Save Invoice'} <kbd>Ctrl+S</kbd></span></>
              )}
            </Button>
          </div>
        </div>
      </footer>

      {/* Mix Payment Dialog (F3) */}
      <MixPaymentDialog
        open={showMixPaymentDialog}
        onOpenChange={setShowMixPaymentDialog}
        billAmount={netAmount}
        onSave={(payment) => {
          setShowMixPaymentDialog(false);
          setPaymentOverride({
            method: 'multiple',
            cashAmount: payment.cashAmount,
            upiAmount: payment.upiAmount,
            cardAmount: payment.cardAmount,
            bankAmount: payment.bankAmount,
            financeAmount: payment.financeAmount,
            totalPaid: payment.totalPaid,
          });
          pendingAutoSaveRef.current = true;
        }}
      />

      {/* Create Customer Dialog */}
      <Dialog open={openCustomerDialog} onOpenChange={setOpenCustomerDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
          </DialogHeader>
          <Form {...customerForm}>
            <form onSubmit={customerForm.handleSubmit(handleCreateCustomer)} className="space-y-4">
              <FormField
                control={customerForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mobile Number<span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Enter mobile number" autoFocus />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={customerForm.control}
                name="customer_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Enter customer name (optional)" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={customerForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder="Enter email address" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={customerForm.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Enter address" rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={customerForm.control}
                name="gst_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GST Number</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Enter GST number" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={customerForm.control}
                name="transport_details"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Transport Details</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., VRL Logistics, Navi Mumbai" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    customerForm.reset();
                    setOpenCustomerDialog(false);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  Create Customer
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Print Confirmation Dialog */}
      <AlertDialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Print Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              Invoice {savedInvoiceData?.invoiceNumber} has been saved successfully.
              Would you like to print it now?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleClosePrintDialog}>
              Skip
            </AlertDialogCancel>
            <AlertDialogAction onClick={handlePrintInvoice}>
              Print Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Size Grid Dialog */}
      <SizeGridDialog
        open={showSizeGrid}
        onClose={() => setShowSizeGrid(false)}
        product={sizeGridProduct}
        variants={sizeGridVariants}
        onConfirm={handleSizeGridConfirm}
        showStock={true}
        validateStock={true}
        title="Enter Size-wise Qty (Stock Validated)"
      />



      {/* Hidden Invoice for Printing */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <InvoiceWrapper
          ref={printRef}
          billNo={savedInvoiceData?.invoiceNumber || `DRAFT-${Date.now()}`}
          date={invoiceDate}
          customerName={savedInvoiceData?.customer.customer_name || selectedCustomer?.customer_name || ""}
          customerAddress={savedInvoiceData?.customer.address || selectedCustomer?.address || ""}
          customerMobile={savedInvoiceData?.customer.phone || selectedCustomer?.phone || ""}
          customerGSTIN={savedInvoiceData?.customer.gst_number || selectedCustomer?.gst_number || ""}
          customerTransportDetails={(savedInvoiceData?.customer as any)?.transport_details || (selectedCustomer as any)?.transport_details || ""}
          items={(savedInvoiceData?.filledItems || lineItems.filter(item => item.productId)).map((item: any, index: number) => ({
              sr: index + 1,
              particulars: item.productName,
              size: item.size,
              barcode: item.barcode || "",
              hsn: item.hsnCode || "",
              sp: item.salePrice,
              mrp: item.mrp,
              qty: item.quantity,
              rate: item.salePrice,
              total: item.lineTotal,
              color: item.color || "",
              gstPercent: item.gstPercent || 0,
              discountPercent: item.discountPercent || 0,
            }))}
            subTotal={savedInvoiceData?.grossAmount ?? grossAmount}
            discount={savedInvoiceData?.totalDiscount ?? totalDiscount}
            grandTotal={savedInvoiceData?.netAmount ?? netAmount}
            paymentMethod="Cash"
            financerDetails={financerDetails}
          />
        </div>

      {/* Product History Dialog */}
      {historyProduct && currentOrganization && (
        <ProductHistoryDialog
          isOpen={!!historyProduct}
          onClose={() => setHistoryProduct(null)}
          productId={historyProduct.id}
          productName={historyProduct.name}
          organizationId={currentOrganization.id}
        />
      )}

      {/* Price Selection Dialog */}
      {pendingPriceSelection && (
        <PriceSelectionDialog
          open={showPriceSelectionDialog}
          onOpenChange={(open) => {
            setShowPriceSelectionDialog(open);
            if (!open) setPendingPriceSelection(null);
          }}
          productName={pendingPriceSelection.product?.product_name || ''}
          size={pendingPriceSelection.variant?.size || ''}
          masterPrice={pendingPriceSelection.masterPrice}
          lastPurchasePrice={pendingPriceSelection.lastPurchasePrice}
          customerPrice={pendingPriceSelection.customerPrice}
          onSelect={(source, prices) => {
            const { product, variant } = pendingPriceSelection;
            setShowPriceSelectionDialog(false);
            setPendingPriceSelection(null);
            addProductToInvoice(product, variant, prices);
          }}
        />
      )}
    </div>
  );
}
