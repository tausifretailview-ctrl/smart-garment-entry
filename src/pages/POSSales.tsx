import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useMobileERP, validateIMEI } from "@/hooks/useMobileERP";
import { useSettings } from "@/hooks/useSettings";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useVisibilityRefetch } from "@/hooks/useVisibilityRefetch";
import { useOrganization } from "@/contexts/OrganizationContext";
import { usePOS } from "@/contexts/POSContext";
import { useCustomerBalance } from "@/hooks/useCustomerBalance";
import { useCustomerSearch, useCustomerBalances } from "@/hooks/useCustomerSearch";
import { useCreditNotes } from "@/hooks/useCreditNotes";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Scan, X, Plus, Trash2, Banknote, CreditCard, Smartphone, Printer, ChevronLeft, ChevronRight, ChevronDown, FileText, RotateCcw, Check, UserPlus, MessageCircle, Link2, Wallet, IndianRupee, ArrowUp, Pause, Loader2, AlertCircle, Clock, Coins, BarChart3, Package, History } from "lucide-react";
import { MobilePOSLayout } from "@/components/mobile/MobilePOSLayout";
import { FloatingPOSReports } from "@/components/FloatingPOSReports";
import { FloatingSaleReturn } from "@/components/FloatingSaleReturn";

import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { useSaveSale } from "@/hooks/useSaveSale";
import { useStockValidation } from "@/hooks/useStockValidation";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { useCustomerPoints, useCustomerPointsBalance } from "@/hooks/useCustomerPoints";
import { useCustomerBrandDiscounts } from "@/hooks/useCustomerBrandDiscounts";
import { useBeepSound } from "@/hooks/useBeepSound";
import { useCashDrawer } from "@/hooks/useCashDrawer";
import { useSoftDelete } from "@/hooks/useSoftDelete";
import { CreditNotePrint } from "@/components/CreditNotePrint";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { InvoiceWrapper } from "@/components/InvoiceWrapper";
import { PrintPreviewDialog } from "@/components/PrintPreviewDialog";
import { MixPaymentDialog } from "@/components/MixPaymentDialog";
import { PriceSelectionDialog } from "@/components/PriceSelectionDialog";
import { QuickServiceProductDialog } from "@/components/QuickServiceProductDialog";
import { printInvoicePDF, generateInvoiceFromHTML, printInvoiceDirectly, printA5BillFormat } from "@/utils/pdfGenerator";
import { format } from "date-fns";
import { useReactToPrint } from "react-to-print";
import { useDirectPrint } from "@/hooks/useDirectPrint";
import { ProductHistoryDialog } from "@/components/ProductHistoryDialog";
import { DcSaleTransferDialog } from "@/components/DcSaleTransferDialog";
import { FinancerDetailsForm, FinancerDetails, saveFinancerDetails } from "@/components/FinancerDetailsForm";

interface PendingPriceSelection {
  product: any;
  variant: any;
  masterPrice: { sale_price: number; mrp: number };
  lastPurchasePrice: { sale_price: number; mrp: number; date?: Date };
}

interface CartItem {
  id: string;
  barcode: string;
  productName: string;
  size: string;
  color: string;
  quantity: number;
  mrp: number;
  originalMrp: number | null; // MRP from product_variants for savings calculation
  gstPer: number;
  discountPercent: number;
  discountAmount: number;
  unitCost: number;
  netAmount: number;
  productId: string;
  variantId: string;
  hsnCode?: string;
  productType?: string; // Track product type to handle service items differently
  isDcProduct?: boolean; // DC (Direct Cash) product flag
}

export default function POSSales() {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { setOnNewSale, setOnClearCart, setOnOpenCashierReport, setOnOpenStockReport, setOnOpenSaleReturn, setOnSaveChanges, setOnEstimatePrint, setHasItems, setIsEditing, setIsSavingChanges } = usePOS();
  const { saveSale, updateSale, holdSale, resumeHeldSale, isSaving } = useSaveSale();
  const { createCreditNote, getAvailableCreditBalance, applyCredit, isCreating: isCreatingCreditNote, isApplying: isApplyingCredit } = useCreditNotes();
  const isMobile = useIsMobile();
  const [isHeldSale, setIsHeldSale] = useState(false);
  const [availableCreditBalance, setAvailableCreditBalance] = useState(0);
  const [creditApplied, setCreditApplied] = useState(0);
  const [pendingSaleReturnCredits, setPendingSaleReturnCredits] = useState<Array<{ id: string; return_number: string; net_amount: number; credit_note_id: string | null }>>([]);
  const [showSRCreditDropdown, setShowSRCreditDropdown] = useState(false);
  const { checkStock, validateCartStock, showStockError, showMultipleStockErrors } = useStockValidation();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const _savedCart = (() => {
    try {
      const key = `pos_cart_${currentOrganization?.id || 'default'}`;
      const s = localStorage.getItem(key);
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  })();

  const [customerId, setCustomerId] = useState<string>(_savedCart?.customerId || "");
  const [customerName, setCustomerName] = useState(_savedCart?.customerName || "");
  const [customerPhone, setCustomerPhone] = useState(_savedCart?.customerPhone || "");
  const [searchInput, setSearchInput] = useState("");
  const [showMobilePaymentSheet, setShowMobilePaymentSheet] = useState(false);
  const [selectedProductType, setSelectedProductType] = useState<string>("all");
  
  // Customer balance hook
  const { balance: customerBalance, openingBalance: customerOpeningBalance, isLoading: isBalanceLoading } = useCustomerBalance(
    customerId || null,
    currentOrganization?.id || null
  );
  
  // Customer points hooks
  const { calculatePoints, isPointsEnabled, isRedemptionEnabled, calculateMaxRedeemablePoints, calculateRedemptionValue, redeemPoints, pointsSettings } = useCustomerPoints();
  const { data: customerPointsData } = useCustomerPointsBalance(customerId || null);
  const { getBrandDiscount, hasBrandDiscounts, brandDiscounts } = useCustomerBrandDiscounts(customerId || null);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [items, setItemsRaw] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(
        `pos_cart_${currentOrganization?.id || 'default'}`
      );
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.items) && parsed.items.length > 0) {
          return parsed.items;
        }
      }
    } catch { /* ignore parse errors */ }
    return [];
  });
  const itemsRef = useRef<CartItem[]>([]);
  const setItems = useCallback((updater: CartItem[] | ((prev: CartItem[]) => CartItem[])) => {
    setItemsRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      itemsRef.current = next;
      return next;
    });
  }, []);
  const [flatDiscountValue, setFlatDiscountValue] = useState(0);
  const [flatDiscountMode, setFlatDiscountMode] = useState<'percent' | 'amount'>('percent');
  const [saleReturnAdjust, setSaleReturnAdjust] = useState(0);
  const [roundOff, setRoundOff] = useState(0);
  const [isManualRoundOff, setIsManualRoundOff] = useState(false);
  const [currentInvoiceIndex, setCurrentInvoiceIndex] = useState(0);
  const [openProductSearch, setOpenProductSearch] = useState(false);
  const [productSearchResults, setProductSearchResults] = useState<any[]>([]);
  const [isProductSearchLoading, setIsProductSearchLoading] = useState(false);
  const [openCustomerSearch, setOpenCustomerSearch] = useState(false);
  const [currentSaleId, setCurrentSaleId] = useState<string | null>(null);
  const [originalItemsForEdit, setOriginalItemsForEdit] = useState<Array<{ variantId: string; quantity: number }>>([]);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [showPrintConfirmDialog, setShowPrintConfirmDialog] = useState(false);
  const [savedInvoiceData, setSavedInvoiceData] = useState<any>(null);
  const [currentInvoiceNumber, setCurrentInvoiceNumber] = useState("");
  const [nextInvoicePreview, setNextInvoicePreview] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'upi' | 'multiple' | 'pay_later'>('cash');
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [posBillFormat, setPosBillFormat] = useState<'a4' | 'a5' | 'a5-horizontal' | 'thermal' | null>(null);
  const [posInvoiceTemplate, setPosInvoiceTemplate] = useState<'professional' | 'modern' | 'classic' | 'compact'>('professional');
  const [showInvoicePreviewSetting, setShowInvoicePreviewSetting] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);
  const invoicePrintRef = useRef<HTMLDivElement>(null);
  const printBtnRef = useRef<HTMLButtonElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const itemsContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showAddCustomerDialog, setShowAddCustomerDialog] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [invoiceSearchInput, setInvoiceSearchInput] = useState("");
  const [showMixPaymentDialog, setShowMixPaymentDialog] = useState(false);
  const [refundAmount, setRefundAmount] = useState(0);
  const [creditNoteData, setCreditNoteData] = useState<any>(null);
  const [showCreditNoteDialog, setShowCreditNoteDialog] = useState(false);
  const creditNotePrintRef = useRef<HTMLDivElement>(null);
  const [openSalesmanSearch, setOpenSalesmanSearch] = useState(false);
  const [selectedSalesman, setSelectedSalesman] = useState("");
  const [salesmanSearchInput, setSalesmanSearchInput] = useState("");
  const [saleNotes, setSaleNotes] = useState(_savedCart?.saleNotes || "");
  const [newCustomerForm, setNewCustomerForm] = useState({
    customer_name: "",
    phone: "",
    email: "",
    address: "",
    gst_number: "",
  });
  
  // Price selection dialog state
  const [showPriceSelectionDialog, setShowPriceSelectionDialog] = useState(false);
  const [pendingPriceSelection, setPendingPriceSelection] = useState<PendingPriceSelection | null>(null);
  
  // Stock not available dialog state
  const [showStockNotAvailableDialog, setShowStockNotAvailableDialog] = useState(false);
  const [stockNotAvailableMessage, setStockNotAvailableMessage] = useState("");

  // Floating reports state
  const [showFloatingCashierReport, setShowFloatingCashierReport] = useState(false);
  const [showFloatingStockReport, setShowFloatingStockReport] = useState(false);
  const [showFloatingSaleReturn, setShowFloatingSaleReturn] = useState(false);

  // Quick service product dialog state
  const [showQuickServiceDialog, setShowQuickServiceDialog] = useState(false);
  const [quickServiceCode, setQuickServiceCode] = useState("");

  // Financer / EMI details state (for Mobile ERP)
  const [financerDetails, setFinancerDetails] = useState<FinancerDetails | null>(null);
  const [showFinancerDialog, setShowFinancerDialog] = useState(false);

  // Out-of-stock product history dialog state
  const [showOutOfStockHistory, setShowOutOfStockHistory] = useState(false);
  const [outOfStockProduct, setOutOfStockProduct] = useState<{ productId: string; productName: string } | null>(null);

  const { playSuccessBeep, playErrorBeep } = useBeepSound();

  // Cash drawer hook
  const { openDrawer: openCashDrawer } = useCashDrawer();
  const { softDelete } = useSoftDelete();

  // Persist cart to localStorage so it survives tab switching
  useEffect(() => {
    try {
      const key = `pos_cart_${currentOrganization?.id || 'default'}`;
      if (items.length === 0) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify({
          items,
          customerId,
          customerName,
          customerPhone,
          saleNotes,
          savedAt: Date.now(),
        }));
      }
    } catch { /* ignore storage errors */ }
  }, [items, customerId, customerName, customerPhone, saleNotes, currentOrganization?.id]);

  // Show notification if cart was restored from previous session
  useEffect(() => {
    try {
      const key = `pos_cart_${currentOrganization?.id || 'default'}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.items) && parsed.items.length > 0) {
          const totalQty = parsed.items.reduce(
            (s: number, i: any) => s + (i.quantity || 0), 0
          );
          const timeDiff = Date.now() - (parsed.savedAt || 0);
          if (timeDiff < 4 * 60 * 60 * 1000) {
            // Silent restore - no toast to avoid disturbing user
          } else {
            localStorage.removeItem(key);
            setItems([]);
          }
        }
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Barcode scanner detection for instant cart add
  const { recordKeystroke, reset: resetScannerDetection, detectScannerInput } = useBarcodeScanner();
  const lastInputTime = useRef<number>(0);
  const dropdownDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productSearchSeqRef = useRef(0);
  
  // Visibility-based polling - pauses when tab is hidden
  const posRefetchInterval = useVisibilityRefetch(300000); // 5 minutes (reduced from 1 min for multi-tab perf)
  
  // Ref to skip customer re-search after dropdown selection
  const customerJustSelected = useRef(false);

  // Load sale data if saleId is in URL (edit mode)
  useEffect(() => {
    const saleId = searchParams.get('saleId');
    if (saleId && currentOrganization?.id) {
      loadSaleForEdit(saleId);
    }
  }, [searchParams, currentOrganization?.id]);

  // Fetch POS bill format from settings
  useEffect(() => {
    if (currentOrganization?.id) {
      fetchPosBillFormat();
    }
  }, [currentOrganization?.id]);

  // Auto-focus barcode input on mount and keep focus when idle
  useEffect(() => {
    // Focus immediately on mount
    barcodeInputRef.current?.focus();
    
    // Re-focus periodically when no dialog is open
    const focusInterval = setInterval(() => {
      const activeElement = document.activeElement;
      const isDialogOpen = document.querySelector('[role="dialog"]');
      const isPopoverOpen = document.querySelector('[data-radix-popper-content-wrapper]');
      
      // Only auto-focus if no dialog/popover is open and user isn't in another input
      if (
        !isDialogOpen && 
        !isPopoverOpen &&
        activeElement?.tagName !== 'INPUT' &&
        activeElement?.tagName !== 'SELECT' &&
        activeElement?.tagName !== 'TEXTAREA'
      ) {
        barcodeInputRef.current?.focus();
      }
    }, 500);

    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't refocus if user is clicking on input, select, textarea, or button
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'BUTTON' ||
        target.closest('button') ||
        target.closest('[role="dialog"]') ||
        target.closest('[role="listbox"]') ||
        target.closest('[data-radix-collection-item]')
      ) {
        return;
      }
      // Refocus on barcode input after a small delay
      setTimeout(() => barcodeInputRef.current?.focus(), 50);
    };

    document.addEventListener('click', handleGlobalClick);
    return () => {
      document.removeEventListener('click', handleGlobalClick);
      clearInterval(focusInterval);
    };
  }, []);

  const fetchPosBillFormat = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('sale_settings')
        .eq('organization_id', currentOrganization?.id)
        .maybeSingle();

      if (error) throw error;
      if (data?.sale_settings) {
        const settings = data.sale_settings as any;
        setPosBillFormat(settings.pos_bill_format || 'thermal');
        setPosInvoiceTemplate(settings.invoice_template || 'professional');
        setShowInvoicePreviewSetting(settings.show_invoice_preview ?? true);
      }
    } catch (error) {
      console.error('Error fetching POS bill format:', error);
    }
  };

  const loadSaleForEdit = async (saleId: string) => {
    try {
      // Fetch sale data
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .select('*')
        .eq('id', saleId)
        .eq('organization_id', currentOrganization?.id)
        .single();

      if (saleError) throw saleError;

      // Check if this is a held sale
      const isHeld = sale.payment_status === 'hold';
      setIsHeldSale(isHeld);

      // Populate form with sale data
      setCurrentSaleId(saleId);
      setCurrentInvoiceNumber(sale.sale_number);
      setCustomerId(sale.customer_id || "");
      setCustomerName(sale.customer_name);
      setCustomerPhone(sale.customer_phone || "");
      const savedFlatPercent = Number(sale.flat_discount_percent) || 0;
      const savedFlatAmount = Number(sale.flat_discount_amount) || 0;
      if (savedFlatPercent > 0) {
        setFlatDiscountValue(savedFlatPercent);
        setFlatDiscountMode('percent');
      } else if (savedFlatAmount > 0) {
        setFlatDiscountValue(savedFlatAmount);
        setFlatDiscountMode('amount');
      } else {
        setFlatDiscountValue(0);
        setFlatDiscountMode('percent');
      }
      setSaleReturnAdjust(sale.sale_return_adjust || 0);
      setRoundOff(Number(sale.round_off) || 0);
      setIsManualRoundOff(true);
      setPaymentMethod(sale.payment_method as any);
      setSelectedSalesman(sale.salesman || "");

      if (isHeld && sale.notes) {
        // Load items from notes (held sale doesn't have sale_items)
        try {
          const holdData = JSON.parse(sale.notes);
          if (holdData.items && Array.isArray(holdData.items)) {
            setItems(holdData.items);
            if (holdData.flatDiscountPercent !== undefined) {
              setFlatDiscountValue(holdData.flatDiscountPercent);
              setFlatDiscountMode('percent');
            }
            if (holdData.saleReturnAdjust !== undefined) {
              setSaleReturnAdjust(holdData.saleReturnAdjust);
            }
            if (holdData.roundOff !== undefined) {
              setRoundOff(holdData.roundOff);
            }
          }
        } catch (parseError) {
          console.error('Error parsing held sale notes:', parseError);
        }
        
        toast({
          title: "Held Bill Loaded",
          description: `Bill ${sale.sale_number} loaded. Complete the sale with a payment method.`,
        });
      } else {
        // Fetch sale items for regular sales
        const { data: saleItems, error: itemsError } = await supabase
          .from('sale_items')
          .select('*')
          .eq('sale_id', saleId);

        if (itemsError) throw itemsError;

        // Convert sale items to cart items
        const cartItems: CartItem[] = saleItems.map(item => ({
          id: item.id,
          barcode: item.barcode || '',
          productName: item.product_name,
          size: item.size,
          color: item.color || '',
          quantity: item.quantity,
          mrp: item.mrp,
          originalMrp: item.mrp > item.unit_price ? item.mrp : null,
          gstPer: item.gst_percent,
          discountPercent: item.discount_percent,
          discountAmount: 0,
          unitCost: item.unit_price,
          netAmount: item.line_total,
          productId: item.product_id,
          variantId: item.variant_id,
          hsnCode: item.hsn_code || '',
        }));

        setItems(cartItems);
        
        // Load sale notes for regular sales
        setSaleNotes(sale.notes || "");
        
        // Store original items for stock validation in edit mode
        setOriginalItemsForEdit(saleItems.map(item => ({
          variantId: item.variant_id,
          quantity: item.quantity,
        })));

        sonnerToast.success(`Invoice ${sale.sale_number} loaded for editing`);
      }
    } catch (error: any) {
      console.error('Error loading sale:', error);
      toast({
        title: "Error",
        description: "Failed to load invoice for editing",
        variant: "destructive",
      });
    }
  };

  // Fetch settings (centralized, cached 5min)
  const { data: settingsData } = useSettings();

  // Direct print hook
  const { isDirectPrintEnabled, isAutoPrintEnabled, directPrint } = useDirectPrint(
    (settingsData as any)?.bill_barcode_settings
  );

  // Keyboard shortcuts for POS actions
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ignore shortcuts if already saving to prevent duplicate saves
      if (isSaving) return;

      // F1 - Cash Payment (Save & Print)
      if (e.key === 'F1') {
        e.preventDefault();
        handlePaymentAndPrint('cash');
      }
      // F2 - UPI Payment (Save & Print)
      else if (e.key === 'F2') {
        e.preventDefault();
        handlePaymentAndPrint('upi');
      }
      // F3 - Card Payment (Save & Print)
      else if (e.key === 'F3') {
        e.preventDefault();
        handlePaymentAndPrint('card');
      }
      // F4 - Credit (Pay Later)
      else if (e.key === 'F4') {
        e.preventDefault();
        handlePaymentAndPrint('pay_later');
      }
      // F5 - Sale Return
      else if (e.key === 'F5') {
        e.preventDefault();
        setShowFloatingSaleReturn(true);
      }
      // F6 - Mix Payment
      else if (e.key === 'F6') {
        e.preventDefault();
        handleMixPayment();
      }
      // F7 - Hold Bill
      else if (e.key === 'F7') {
        e.preventDefault();
        handleHoldBill();
      }
      // F8 - Cashier Report
      else if (e.key === 'F8') {
        e.preventDefault();
        setShowFloatingCashierReport(true);
      }
      // F9 - Print Estimate (no save)
      else if (e.key === 'F9') {
        e.preventDefault();
        if (items.length > 0) {
          handleEstimatePrintRef.current?.();
        }
      }
      // Esc - Clear items
      else if (e.key === 'Escape') {
        e.preventDefault();
        handleClearAll();
      }
      // Ctrl+P - Print saved invoice
      else if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        if (savedInvoiceData) {
          handlePrintFromDialog();
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [items, customerName, flatDiscountValue, roundOff, paymentMethod, savedInvoiceData, isSaving]);

  // Apply defaults when settings are loaded
  useEffect(() => {
    if (settingsData && (settingsData as any).sale_settings) {
      const saleSettings = (settingsData as any).sale_settings;
      if (saleSettings.default_discount) {
        setFlatDiscountValue(saleSettings.default_discount);
        setFlatDiscountMode('percent');
      }
      if (saleSettings.default_payment_method) {
        setPaymentMethod(saleSettings.default_payment_method.toLowerCase() as any);
      }
    }
  }, [settingsData]);

  // Update date and time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Refs for print handlers (to avoid hoisting issues)
  const handleEstimatePrintRef = useRef<(() => void) | null>(null);
  const handlePrintRef = useRef<(() => void) | null>(null);

  // Register POS header actions
  useEffect(() => {
    setOnNewSale(() => () => {
      setItems([]);
      setCustomerName("");
      setCustomerId("");
      setCustomerPhone("");
      setFlatDiscountValue(0);
      setFlatDiscountMode('percent');
      setSaleReturnAdjust(0);
      setRoundOff(0);
      setIsManualRoundOff(false);
      setRefundAmount(0);
      setCreditApplied(0);
      setAvailableCreditBalance(0);
      setSearchInput("");
      setCurrentInvoiceIndex(0);
      setCurrentSaleId(null);
      setCurrentInvoiceNumber("");
      setSelectedSalesman("");
      setSaleNotes("");
      setFinancerDetails(null);
      toast({
        title: "New Invoice",
        description: "Cart cleared. Ready for new sale.",
      });
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    });
    
    setOnClearCart(() => () => {
      setItems([]);
      setSaleNotes("");
      toast({
        title: "Cart Cleared",
        description: "All items removed from cart",
      });
    });

    // Register floating report handlers
    setOnOpenCashierReport(() => () => {
      setShowFloatingCashierReport(true);
    });
    
    setOnOpenStockReport(() => () => {
      setShowFloatingStockReport(true);
    });

    setOnOpenSaleReturn(() => () => {
      setShowFloatingSaleReturn(true);
    });

    return () => {
      setOnNewSale(null);
      setOnClearCart(null);
      setOnOpenCashierReport(null);
      setOnOpenStockReport(null);
      setOnOpenSaleReturn(null);
    };
  }, [setOnNewSale, setOnClearCart, setOnOpenCashierReport, setOnOpenStockReport, setOnOpenSaleReturn, toast]);

  // Update hasItems in header
  useEffect(() => {
    setHasItems(items.length > 0);
  }, [items.length, setHasItems]);

  // Update isEditing state when currentSaleId changes
  useEffect(() => {
    setIsEditing(!!currentSaleId);
  }, [currentSaleId, setIsEditing]);

  // Save metadata changes handler (customer, salesman, notes only)
  const handleSaveMetadataChanges = useCallback(async () => {
    if (!currentSaleId || !currentOrganization?.id) return;
    
    setIsSavingChanges(true);
    try {
      const { error } = await supabase
        .from('sales')
        .update({
          customer_id: customerId || null,
          customer_name: customerName || 'Walk-in Customer',
          customer_phone: customerPhone || null,
          salesman: selectedSalesman || null,
          notes: saleNotes || null,
        })
        .eq('id', currentSaleId)
        .eq('organization_id', currentOrganization.id);

      if (error) throw error;

      toast({
        title: "Changes Saved",
        description: "Customer, salesman & notes updated successfully.",
      });

      queryClient.invalidateQueries({ queryKey: ['todaysSales'] });
    } catch (error: any) {
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save changes",
        variant: "destructive",
      });
    } finally {
      setIsSavingChanges(false);
    }
  }, [currentSaleId, currentOrganization?.id, customerId, customerName, customerPhone, selectedSalesman, saleNotes, toast, queryClient, setIsSavingChanges]);

  // Register save changes handler
  useEffect(() => {
    setOnSaveChanges(() => handleSaveMetadataChanges);
    return () => setOnSaveChanges(null);
  }, [setOnSaveChanges, handleSaveMetadataChanges]);

  // Preview next invoice number when not editing existing sale
  useEffect(() => {
    const previewNextInvoice = async () => {
      if (currentSaleId || !currentOrganization?.id) return;
      
      try {
        // Use the database function to get the next invoice number
        const { data: nextNumber, error } = await supabase.rpc('generate_pos_number', {
          p_organization_id: currentOrganization.id
        });
        
        if (error) throw error;
        setNextInvoicePreview(nextNumber || 'INV/25-26/1');
      } catch (error) {
        console.error('Error previewing next invoice:', error);
        setNextInvoicePreview('INV/25-26/1');
      }
    };
    
    previewNextInvoice();
  }, [currentSaleId, currentOrganization?.id]);

  // Fetch today's sales
  const { data: todaysSales } = useQuery({
    queryKey: ['todays-sales', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data, error } = await (supabase as any)
        .from('sales')
        .select('id, sale_number, sale_date, net_amount, paid_amount, payment_status, customer_name, customer_phone, payment_method, created_at, sale_type, customer_id, round_off, flat_discount_percent, flat_discount_amount, sale_return_adjust, salesman, notes')
        .eq('organization_id', currentOrganization.id)
        .eq('sale_type', 'pos')
        .is('deleted_at', null)
        .neq('payment_status', 'hold')
        .gte('sale_date', today.toISOString())
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
    staleTime: 120000, // Cache for 2 minutes
    refetchInterval: posRefetchInterval,
    refetchOnWindowFocus: false,
  });

  // Fetch employees for salesman dropdown
  const { data: employees } = useQuery({
    queryKey: ['pos-employees', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from('employees')
        .select('id, employee_name, designation')
        .eq('organization_id', currentOrganization.id)
        .is('deleted_at', null)
        .eq('status', 'active')
        .order('employee_name');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Filter employees based on search
  const filteredEmployees = (employees || []).filter((emp: any) =>
    emp.employee_name.toLowerCase().includes(salesmanSearchInput.toLowerCase())
  );

  useEffect(() => {
    const handleNavigationKeyPress = (e: KeyboardEvent) => {
      // Page Up - Previous Invoice (older)
      if (e.key === 'PageUp') {
        e.preventDefault();
        if (todaysSales && todaysSales.length > 0 && currentInvoiceIndex < todaysSales.length - 1) {
          handlePreviousInvoice();
        }
      }
      // Page Down - Next Invoice (newer)
      else if (e.key === 'PageDown') {
        e.preventDefault();
        if (todaysSales && todaysSales.length > 0 && currentInvoiceIndex > 0) {
          handleNextInvoice();
        }
      }
      // End - Last (newest) Invoice
      else if (e.key === 'End') {
        e.preventDefault();
        if (todaysSales && todaysSales.length > 0) {
          handleLastInvoice();
        }
      }
    };

    window.addEventListener('keydown', handleNavigationKeyPress);
    return () => window.removeEventListener('keydown', handleNavigationKeyPress);
  }, [todaysSales, currentInvoiceIndex]);

  // DC Sale Transfer dialog state
  const [showDcTransferDialog, setShowDcTransferDialog] = useState(false);
  const [dcTransferItems, setDcTransferItems] = useState<any[]>([]);
  const [dcTransferSaleId, setDcTransferSaleId] = useState("");

  const { data: productsData } = useQuery({
    queryKey: ['pos-products', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      // Fetch all products using pagination to bypass 1000 row limit
      const allProducts: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const { data: products, error: productsError } = await supabase
          .from('products')
          .select(`
            id, product_name, brand, hsn_code, gst_per, sale_gst_percent, purchase_gst_percent, product_type, status, category, style, color, sale_discount_type, sale_discount_value,
            product_variants (
              id, barcode, size, color, stock_qty, sale_price, mrp, pur_price, product_id, active, deleted_at,
              last_purchase_sale_price, last_purchase_mrp, last_purchase_date, is_dc_product
            )
          `)
          .eq('organization_id', currentOrganization.id)
          .eq('status', 'active')
          .is('deleted_at', null)
          .range(offset, offset + PAGE_SIZE - 1);
        
        if (productsError) throw productsError;
        
        if (products && products.length > 0) {
          allProducts.push(...products);
          offset += PAGE_SIZE;
          hasMore = products.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }
      
      // Filter products: service/combo always shown, goods only with available stock
      // First, filter out deleted variants from all products
      const productsWithValidVariants = allProducts.map((product: any) => ({
        ...product,
        product_variants: product.product_variants?.filter((v: any) => !v.deleted_at)
      }));
      
      return productsWithValidVariants.filter((product: any) => {
        // Service and combo products are always available (no stock tracking)
        if (product.product_type === 'service' || product.product_type === 'combo') {
          return product.product_variants?.length > 0;
        }
        // Goods products require available stock
        const hasAvailableStock = product.product_variants?.some((v: any) => v.stock_qty > 0);
        return hasAvailableStock;
      }).map((product: any) => {
        // Service/combo: keep all variants, goods: filter by stock
        if (product.product_type === 'service' || product.product_type === 'combo') {
          return product;
        }
        return {
          ...product,
          product_variants: product.product_variants?.filter((v: any) => v.stock_qty > 0)
        };
      }) || [];
    },
    enabled: !!currentOrganization?.id,
    staleTime: 300000, // Cache for 5 minutes
    refetchInterval: posRefetchInterval,
    refetchOnWindowFocus: false,
  });

  // Use reliable customer search hook - pass customerName directly as search term
  const { 
    customers = [], 
    filteredCustomers,
    isLoading: isCustomersLoading,
    isError: isCustomersError,
    refetch: refetchCustomers,
    hasMore: hasMoreCustomers,
  } = useCustomerSearch(customerName, { enabled: !customerJustSelected.current });
  
  const { getCustomerBalance, getCustomerAdvance } = useCustomerBalances();

  // Fetch credit balance and pending sale return credit notes when customer changes
  useEffect(() => {
    const fetchCreditBalance = async () => {
      if (customerId) {
        const balance = await getAvailableCreditBalance(customerId);
        setAvailableCreditBalance(balance);
        // Fetch pending sale return credit notes for this customer
        if (currentOrganization?.id) {
          const { data: pendingReturns } = await supabase
            .from("sale_returns")
            .select("id, return_number, net_amount, credit_note_id")
            .eq("organization_id", currentOrganization.id)
            .eq("customer_id", customerId)
            .is("deleted_at", null)
            .in("credit_status", ["pending"])
            .eq("refund_type", "credit_note")
            .order("return_date", { ascending: false });
          setPendingSaleReturnCredits(pendingReturns || []);
        }
      } else {
        setAvailableCreditBalance(0);
        setCreditApplied(0);
        setPendingSaleReturnCredits([]);
      }
    };
    fetchCreditBalance();
  }, [customerId]);

  // Mutually exclusive discount: Apply customer master discount ONLY if no brand discounts exist
  useEffect(() => {
    if (customerId && customers) {
      const customer = customers.find((c: any) => c.id === customerId);
      if (customer && hasBrandDiscounts) {
        // Customer HAS brand discounts - reset flat discount to avoid double discount
        setFlatDiscountValue(0);
        setFlatDiscountMode('percent');
      } else if (customer && !hasBrandDiscounts) {
        // Customer has NO brand discounts, so apply master discount as flat discount
        if (customer.discount_percent && customer.discount_percent > 0) {
          setFlatDiscountValue(customer.discount_percent);
          setFlatDiscountMode('percent');
        }
      }
      // If customer has brand discounts, don't auto-apply flat discount
      // Brand discounts will be applied per-item when products are added
    }
  }, [customerId, customers, hasBrandDiscounts]);

  // Handle barcode/product search on Enter - optimized for scanner input
  const handleSearch = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchInput.trim()) {
      e.preventDefault();
      
      // Clear any pending dropdown timer
      if (dropdownDebounceTimer.current) {
        clearTimeout(dropdownDebounceTimer.current);
        dropdownDebounceTimer.current = null;
      }
      
      // Close dropdown immediately for scanner input
      setOpenProductSearch(false);
      
      // Search and add product directly
      searchAndAddProduct(searchInput.trim());
      
      // Reset scanner detection for next input
      resetScannerDetection();
      
      // Keep focus on barcode input for continuous scanning
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 50);
    }
  }, [searchInput, resetScannerDetection]);

  // Optimized input change handler with scanner detection
  const handleBarcodeInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const now = Date.now();
    const timeSinceLastKeystroke = now - lastInputTime.current;
    
    // Record keystroke for scanner detection
    recordKeystroke();
    lastInputTime.current = now;
    
    // Update the input value
    setSearchInput(value);
    
    // Clear previous debounce timer
    if (dropdownDebounceTimer.current) {
      clearTimeout(dropdownDebounceTimer.current);
      dropdownDebounceTimer.current = null;
    }
    
    // Detect if this looks like scanner input
    const isScannerLike = detectScannerInput(value, timeSinceLastKeystroke);
    
    // For scanner input: DON'T open dropdown, wait for Enter key
    if (isScannerLike || (value.length >= 4 && timeSinceLastKeystroke < 50)) {
      setOpenProductSearch(false);
      setProductSearchResults([]);
      setIsProductSearchLoading(false);
      return;
    }
    
    if (value.length >= 2) {
      dropdownDebounceTimer.current = setTimeout(() => {
        const hasNonNumeric = /[a-zA-Z]/.test(value);
        const isShortNumeric = /^\d+$/.test(value) && value.length < 8;

        if (hasNonNumeric || isShortNumeric) {
          setOpenProductSearch(true);
        } else {
          setOpenProductSearch(false);
          setProductSearchResults([]);
        }
      }, 300);
    } else {
      setOpenProductSearch(false);
      setProductSearchResults([]);
      setIsProductSearchLoading(false);
    }
  }, [recordKeystroke, detectScannerInput]);

  const mobileERP = useMobileERP();

  useEffect(() => {
    const term = searchInput.trim();

    if (!openProductSearch || term.length < 2 || !currentOrganization?.id) {
      setProductSearchResults([]);
      setIsProductSearchLoading(false);
      return;
    }

    const requestSeq = ++productSearchSeqRef.current;
    setIsProductSearchLoading(true);

    const runSearch = async () => {
      let query = supabase
        .from('product_variants')
        .select('id, barcode, size, color, stock_qty, sale_price, mrp, pur_price, product_id, active, last_purchase_sale_price, last_purchase_mrp, last_purchase_date, is_dc_product, products!inner(id, product_name, brand, hsn_code, gst_per, sale_gst_percent, purchase_gst_percent, category, style, color, product_type, organization_id, sale_discount_type, sale_discount_value, status, deleted_at)')
        .eq('products.organization_id', currentOrganization.id)
        .eq('products.status', 'active')
        .eq('active', true)
        .is('deleted_at', null)
        .is('products.deleted_at', null)
        .limit(20);

      if (selectedProductType !== 'all') {
        query = query.eq('products.product_type', selectedProductType);
      }

      const escapedTerm = term.replace(/[%_,]/g, '');
      const isNumeric = /^\d+$/.test(term);

      if (isNumeric) {
        query = query.or(`barcode.eq.${escapedTerm},barcode.ilike.%${escapedTerm}%`);
      } else {
        query = query.or(`barcode.ilike.%${escapedTerm}%,size.ilike.%${escapedTerm}%,color.ilike.%${escapedTerm}%,products.product_name.ilike.%${escapedTerm}%,products.brand.ilike.%${escapedTerm}%,products.category.ilike.%${escapedTerm}%,products.style.ilike.%${escapedTerm}%`);
      }

      const { data, error } = await query.order('stock_qty', { ascending: false });
      if (requestSeq !== productSearchSeqRef.current) return;
      if (error) throw error;

      const formatted = (data || [])
        .filter((item: any) => {
          const product = item.products;
          return product?.product_type === 'service' || product?.product_type === 'combo' || (item.stock_qty || 0) > 0;
        })
        .map((item: any) => ({
          product: item.products,
          variant: item,
          searchText: `${item.products?.product_name || ''} ${item.size || ''} ${item.color || ''} ${item.barcode || ''} ${item.products?.brand || ''} ${item.products?.category || ''}`.toLowerCase(),
        }));

      setProductSearchResults(formatted);
      setIsProductSearchLoading(false);
    };

    runSearch().catch((error) => {
      if (requestSeq !== productSearchSeqRef.current) return;
      console.error('POS product search failed:', error);
      setProductSearchResults([]);
      setIsProductSearchLoading(false);
    });
  }, [openProductSearch, searchInput, selectedProductType, currentOrganization?.id]);

  const searchAndAddProduct = useCallback(async (searchTerm: string) => {
    // Quick service shortcodes (1-9) ALWAYS open the dialog, even if a product has that barcode
    if (/^[1-9]$/.test(searchTerm)) {
      setQuickServiceCode(searchTerm);
      setShowQuickServiceDialog(true);
      setSearchInput("");
      return;
    }

    // Mobile ERP IMEI enforcement: validate IMEI format before allowing scan
    if (mobileERP.enabled && mobileERP.imei_scan_enforcement) {
      if (!validateIMEI(searchTerm, mobileERP.imei_min_length, mobileERP.imei_max_length)) {
        toast({
          title: "Invalid IMEI",
          description: `Please scan a valid IMEI number (${mobileERP.imei_min_length}-${mobileERP.imei_max_length} digits)`,
          variant: "destructive",
        });
        setSearchInput("");
        return;
      }
    }

    // Search by barcode first (exact match for speed)
    let foundVariant: any = null;
    let foundProduct: any = null;

    // Try local cache first if available
    if (productsData) {
      // Priority 1: Exact barcode match (most common for scanners)
      for (const product of productsData) {
        const variantMatch = product.product_variants?.find((v: any) => 
          v.barcode?.toLowerCase() === searchTerm.toLowerCase()
        );
        
        if (variantMatch) {
          foundVariant = variantMatch;
          foundProduct = product;
          break;
        }
      }

      // Priority 2: Product name match (for manual search) — blocked in IMEI mode
      if (!foundVariant && !(mobileERP.enabled && mobileERP.imei_scan_enforcement)) {
        for (const product of productsData) {
          if (product.product_name.toLowerCase().includes(searchTerm.toLowerCase())) {
            foundVariant = product.product_variants?.[0];
            foundProduct = product;
            break;
          }
        }
      }
    }

    if (foundVariant && foundProduct) {
      // Clear input immediately for fast scanning UX
      setSearchInput("");
      // Await stock check before adding - prevents out-of-stock items from being added
      await addItemToCart(foundProduct, foundVariant);
    } else {
      // Not found in local cache (or cache not loaded yet) — search DB directly
      if (currentOrganization?.id) {
        // Try exact barcode match first
        const { data: dbVariant } = await supabase
          .from('product_variants')
          .select('id, barcode, size, color, stock_qty, sale_price, mrp, pur_price, product_id, active, last_purchase_sale_price, last_purchase_mrp, last_purchase_date, is_dc_product, products!inner(id, product_name, brand, hsn_code, gst_per, sale_gst_percent, purchase_gst_percent, category, style, color, product_type, organization_id, sale_discount_type, sale_discount_value, status)')
          .eq('products.organization_id', currentOrganization.id)
          .eq('barcode', searchTerm)
          .is('deleted_at', null)
          .is('products.deleted_at', null)
          .eq('products.status', 'active')
          .maybeSingle();

        if (dbVariant && (dbVariant as any).products) {
          const prod = (dbVariant as any).products;
          const stockQty = dbVariant.stock_qty || 0;
          
          // If product has stock, add it to cart directly (cache miss recovery)
          if (stockQty > 0 || prod.product_type === 'service' || prod.product_type === 'combo') {
            setSearchInput("");
            await addItemToCart(prod, dbVariant);
            return;
          }
          
          // Zero stock — show out-of-stock dialog
          setSearchInput("");
          playErrorBeep();
          setOutOfStockProduct({ productId: prod.id, productName: prod.product_name });
          setStockNotAvailableMessage(`${prod.product_name} (Size: ${dbVariant.size}) — Stock: ${stockQty}`);
          setShowStockNotAvailableDialog(true);
          return;
        }

        // Try product name search via DB if not IMEI mode
        if (!(mobileERP.enabled && mobileERP.imei_scan_enforcement)) {
          const { data: nameResults } = await supabase
            .from('product_variants')
            .select('id, barcode, size, color, stock_qty, sale_price, mrp, pur_price, product_id, active, last_purchase_sale_price, last_purchase_mrp, last_purchase_date, is_dc_product, products!inner(id, product_name, brand, hsn_code, gst_per, sale_gst_percent, purchase_gst_percent, category, style, color, product_type, organization_id, sale_discount_type, sale_discount_value, status)')
            .eq('products.organization_id', currentOrganization.id)
            .ilike('products.product_name', `%${searchTerm}%`)
            .is('deleted_at', null)
            .is('products.deleted_at', null)
            .eq('products.status', 'active')
            .gt('stock_qty', 0)
            .limit(1);

          if (nameResults && nameResults.length > 0) {
            const match = nameResults[0];
            const prod = (match as any).products;
            setSearchInput("");
            await addItemToCart(prod, match);
            return;
          }
        }
      }

      // Clear input and show error for product not found
      setSearchInput("");
      setProductSearchResults([]);
      setIsProductSearchLoading(false);
      playErrorBeep();
      toast({
        title: "Product not found",
        description: `No product matches: ${searchTerm}`,
        variant: "destructive",
      });
    }
  }, [productsData, playErrorBeep, toast, currentOrganization?.id, mobileERP, addItemToCart]);

  const handleQuickServiceAdd = useCallback(({ code, quantity, mrp }: { code: string; quantity: number; mrp: number }) => {
    // Try to find actual product with matching barcode to get valid IDs
    let productName = `Service Item ${code}`;
    let productId = '';
    let variantId = '';
    if (productsData) {
      for (const product of productsData) {
        const variantMatch = product.product_variants?.find((v: any) => 
          v.barcode?.toLowerCase() === code.toLowerCase()
        );
        if (variantMatch) {
          productName = product.product_name;
          productId = product.id;
          variantId = variantMatch.id;
          break;
        }
      }
    }

    // If no matching product found, we cannot save to sale_items (product_id/variant_id are required UUID columns)
    if (!productId || !variantId) {
      toast({
        title: "Product not found",
        description: `Cannot add item: barcode "${code}" not found in products. Please create the product first.`,
        variant: "destructive",
      });
      setShowQuickServiceDialog(false);
      setQuickServiceCode("");
      return;
    }

    const newItem: CartItem = {
      id: `service-${code}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      barcode: code,
      productName,
      size: '-',
      color: '',
      quantity,
      mrp,
      originalMrp: null,
      gstPer: 0,
      discountPercent: 0,
      discountAmount: 0,
      unitCost: mrp,
      netAmount: quantity * mrp,
      productId,
      variantId,
      hsnCode: '',
      productType: 'service',
    };
    setItems(prev => [...prev, newItem]);
    playSuccessBeep();
    setShowQuickServiceDialog(false);
    setQuickServiceCode("");
    setTimeout(() => barcodeInputRef.current?.focus(), 100);
  }, [setItems, playSuccessBeep, productsData, toast]);

  const addItemToCart = async (product: any, variant: any, overridePrice?: { sale_price: number; mrp: number }) => {
    // Service products: NEVER merge - each scan is a unique item with manual price entry
    // This is essential for saree shops where each piece has different MRP
    const isServiceProduct = product.product_type === 'service';
    
    const existingItemIndex = isServiceProduct 
      ? -1  // Always treat as new item for service products
      : itemsRef.current.findIndex(item => item.barcode === variant.barcode);
    
    if (existingItemIndex >= 0) {
      // Real-time stock validation before incrementing
      const newQty = itemsRef.current[existingItemIndex].quantity + 1;
      const stockCheck = await checkStock(variant.id, newQty);
      
      if (!stockCheck.isAvailable) {
        playErrorBeep();
        setStockNotAvailableMessage(`${stockCheck.productName} (${stockCheck.size}) - Only ${stockCheck.availableStock} in stock, cannot add ${newQty}`);
        setShowStockNotAvailableDialog(true);
        setSearchInput("");
        return;
      }
      
      // Play success beep for quantity increment
      playSuccessBeep();
      
      // Increment quantity if already in cart - use functional update to prevent race conditions
      setItems(prev => {
        const updatedItems = [...prev];
        updatedItems[existingItemIndex].quantity = newQty;
        updatedItems[existingItemIndex].netAmount = calculateNetAmount(updatedItems[existingItemIndex]);
        return updatedItems;
      });
    } else {
      // Real-time stock validation before adding new item
      const stockCheck = await checkStock(variant.id, 1);
      
      if (!stockCheck.isAvailable) {
        playErrorBeep();
        setStockNotAvailableMessage(`${stockCheck.productName} (${stockCheck.size}) is out of stock`);
        setShowStockNotAvailableDialog(true);
        setSearchInput("");
        return;
      }
      
      // Check if last_purchase prices differ from master prices
      const masterSalePrice = parseFloat(variant.sale_price || 0);
      // Use sale_price as MRP fallback when MRP is 0 or null
      const rawMrp = variant.mrp ? parseFloat(variant.mrp) : 0;
      const masterMrp = rawMrp > 0 ? rawMrp : masterSalePrice;
      const lastPurchaseSalePrice = variant.last_purchase_sale_price ? parseFloat(variant.last_purchase_sale_price) : null;
      const lastPurchaseMrp = variant.last_purchase_mrp ? parseFloat(variant.last_purchase_mrp) : null;
      
      // If no override provided and last purchase prices differ, show dialog
      if (!overridePrice && lastPurchaseSalePrice !== null && lastPurchaseSalePrice !== masterSalePrice) {
        setPendingPriceSelection({
          product,
          variant,
          masterPrice: { sale_price: masterSalePrice, mrp: masterMrp },
          lastPurchasePrice: { 
            sale_price: lastPurchaseSalePrice, 
            mrp: lastPurchaseMrp || lastPurchaseSalePrice,
            date: variant.last_purchase_date ? new Date(variant.last_purchase_date) : undefined
          }
        });
        setShowPriceSelectionDialog(true);
        return;
      }
      
      // Use override price or master price
      const salePrice = overridePrice?.sale_price ?? masterSalePrice;
      const mrpToUse = overridePrice?.mrp ?? masterMrp;
      
      // Build product description: name-category-style,brand-color
      const descriptionParts = [product.product_name];
      if (product.category) descriptionParts.push(product.category);
      if (product.style) descriptionParts.push(product.style);
      
      let description = descriptionParts.join('-');
      
      const extraParts = [];
      if (product.brand) extraParts.push(product.brand);
      // Prioritize variant color over product color
      const displayColor = variant.color || product.color;
      if (displayColor) extraParts.push(displayColor);
      
      if (extraParts.length > 0) {
        description += '-' + extraParts.join('-');
      }
      
      // Ensure displayMrp is never 0 - always fall back to salePrice
      const displayMrp = (mrpToUse && mrpToUse > 0) ? (mrpToUse > salePrice ? mrpToUse : salePrice) : salePrice;
      
      // Mutually exclusive discount logic:
      // Only apply brand discount if customer has NO master discount
      // If customer has master discount, it's applied as flat discount instead
      const customer = customers?.find((c: any) => c.id === customerId);
      const customerHasMasterDiscount = customer?.discount_percent && customer.discount_percent > 0;
      const brandDiscount = customerHasMasterDiscount ? 0 : getBrandDiscount(product.brand);
      // Auto-apply product-level sale discount if no brand/customer discount
      const productSaleDiscount = (() => {
        const sdt = (product as any).sale_discount_type;
        const sdv = (product as any).sale_discount_value || 0;
        if (sdv > 0 && (!sdt || sdt === 'percent')) return sdv;
        return 0;
      })();
      const discountPercent = brandDiscount > 0 ? brandDiscount : (productSaleDiscount > 0 ? productSaleDiscount : 0);
      const discountAmount = 0;
      
      const newItem: CartItem = {
        // Generate unique ID for service products so each scan creates a distinct line item
        id: isServiceProduct ? `${variant.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` : variant.id,
        barcode: variant.barcode || '',
        productName: description,
        size: variant.size,
        color: variant.color || product.color || '',
        quantity: 1,
        mrp: displayMrp,
        originalMrp: mrpToUse,
        gstPer: product.sale_gst_percent || product.gst_per || 0,
        discountPercent,
        discountAmount,
        unitCost: salePrice,
        netAmount: displayMrp - (displayMrp * discountPercent / 100),
        productId: product.id,
        variantId: variant.id,
        hsnCode: product.hsn_code || '',
        productType: product.product_type,
        isDcProduct: variant.is_dc_product === true,
      };
      setItems(prev => [...prev, newItem]);
      
      // Play success beep for new item added
      playSuccessBeep();
      
      // Show toast if brand discount was applied
      if (brandDiscount > 0) {
        toast({
          title: `Brand discount applied: ${brandDiscount}%`,
          description: `${product.brand} discount for this customer`,
        });
      }
    }
    
    // Close search dropdown and clear input
    setOpenProductSearch(false);
    setSearchInput("");
  };

  // Handle price selection from dialog
  const handlePriceSelection = (source: "master" | "last_purchase", prices: { sale_price: number; mrp: number }) => {
    if (pendingPriceSelection) {
      addItemToCart(pendingPriceSelection.product, pendingPriceSelection.variant, prices);
      setPendingPriceSelection(null);
      setShowPriceSelectionDialog(false);
    }
  };

  const calculateNetAmount = (item: CartItem) => {
    const baseAmount = item.mrp * item.quantity;
    const percentDiscount = (baseAmount * item.discountPercent) / 100;
    const totalDiscount = percentDiscount + item.discountAmount;
    return baseAmount - totalDiscount;
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
    // Keep focus on barcode search bar
    setTimeout(() => barcodeInputRef.current?.focus(), 50);
  };

  const updateQuantity = async (index: number, newQty: number) => {
    if (newQty < 1) return;
    
    // Real-time stock validation before updating quantity
    const item = items[index];
    const stockCheck = await checkStock(item.variantId, newQty);
    
    if (!stockCheck.isAvailable) {
      showStockError(
        item.productName,
        item.size,
        newQty,
        stockCheck.availableStock
      );
      return;
    }
    
    setItems(prev => {
      const updatedItems = [...prev];
      updatedItems[index].quantity = newQty;
      updatedItems[index].netAmount = calculateNetAmount(updatedItems[index]);
      return updatedItems;
    });
  };

  const updateDiscountPercent = (index: number, discountPercent: number) => {
    if (discountPercent < 0 || discountPercent > 100) return;
    setItems(prev => {
      const updatedItems = [...prev];
      updatedItems[index].discountPercent = discountPercent;
      updatedItems[index].netAmount = calculateNetAmount(updatedItems[index]);
      return updatedItems;
    });
  };

  const updateDiscountAmount = (index: number, discountAmount: number) => {
    if (discountAmount < 0) return;
    setItems(prev => {
      const updatedItems = [...prev];
      updatedItems[index].discountAmount = discountAmount;
      updatedItems[index].netAmount = calculateNetAmount(updatedItems[index]);
      return updatedItems;
    });
  };

  const updateMrp = (index: number, newMrp: number) => {
    if (newMrp < 0) return;
    setItems(prev => {
      const updatedItems = [...prev];
      updatedItems[index].mrp = newMrp;
      // CRITICAL: Sync unitCost with MRP to ensure correct unit_price is saved to database
      updatedItems[index].unitCost = newMrp;
      updatedItems[index].netAmount = calculateNetAmount(updatedItems[index]);
      return updatedItems;
    });
  };

  const updateGstPer = (index: number, newGstPer: number) => {
    setItems(prev => {
      const updatedItems = [...prev];
      updatedItems[index].gstPer = newGstPer;
      updatedItems[index].netAmount = calculateNetAmount(updatedItems[index]);
      return updatedItems;
    });
  };

  // Calculate totals
  const totals = {
    quantity: items.reduce((sum, item) => sum + item.quantity, 0),
    mrp: items.reduce((sum, item) => sum + (item.mrp * item.quantity), 0),
    discount: items.reduce((sum, item) => {
      const baseAmount = item.mrp * item.quantity;
      const percentDiscount = (baseAmount * item.discountPercent) / 100;
      return sum + percentDiscount + item.discountAmount;
    }, 0),
    subtotal: items.reduce((sum, item) => sum + item.netAmount, 0),
    // Calculate savings from MRP (originalMrp - unitCost) * quantity
    savings: items.reduce((sum, item) => {
      if (item.originalMrp && item.originalMrp > item.unitCost) {
        return sum + (item.originalMrp - item.unitCost) * item.quantity;
      }
      return sum;
    }, 0),
  };

  const flatDiscountAmount = flatDiscountMode === 'percent' 
    ? (totals.subtotal * flatDiscountValue) / 100 
    : flatDiscountValue;
  const flatDiscountPercent = flatDiscountMode === 'percent' 
    ? flatDiscountValue 
    : totals.subtotal > 0 ? (flatDiscountValue / totals.subtotal) * 100 : 0;
  
  // Calculate amount before round-off (without roundOff in calculation)
  const amountBeforeRoundOff = totals.subtotal - flatDiscountAmount - saleReturnAdjust - creditApplied;
  
  // Auto-calculate round-off to make final amount a whole number
  const calculatedRoundOff = Math.round(amountBeforeRoundOff) - amountBeforeRoundOff;
  
  // Auto-update roundOff state when calculation changes (only if not manual)
  useEffect(() => {
    if (!isManualRoundOff) {
      if (items.length > 0) {
        const newRoundOff = parseFloat(calculatedRoundOff.toFixed(2));
        if (Math.abs(newRoundOff - roundOff) > 0.001) {
          setRoundOff(newRoundOff);
        }
      } else if (roundOff !== 0) {
        setRoundOff(0);
      }
    }
  }, [amountBeforeRoundOff, items.length, isManualRoundOff]);
  
  // Handle manual round-off change - no limit for full flexibility
  const handleRoundOffChange = (value: number) => {
    setRoundOff(parseFloat(value.toFixed(2)));
    setIsManualRoundOff(true);
  };
  
  // Handle final amount change - reverse calculate round-off (no limit)
  const handleFinalAmountChange = (enteredAmount: number) => {
    const newRoundOff = enteredAmount - amountBeforeRoundOff;
    setRoundOff(parseFloat(newRoundOff.toFixed(2)));
    setIsManualRoundOff(true);
  };
  
  // Reset to auto-calculated round-off
  const handleResetRoundOff = () => {
    setIsManualRoundOff(false);
    setRoundOff(parseFloat(calculatedRoundOff.toFixed(2)));
  };
  
  // Calculate points redemption value
  const pointsRedemptionValue = calculateRedemptionValue(pointsToRedeem);
  
  const amountBeforeCredit = totals.subtotal - flatDiscountAmount - saleReturnAdjust + roundOff - pointsRedemptionValue;
  const finalAmount = amountBeforeCredit - creditApplied;
  
  // Calculate effective discount percentage for customer display (after final amount adjustment)
  const effectiveDiscountPercent = totals.mrp > 0 ? ((totals.mrp - finalAmount) / totals.mrp) * 100 : 0;

  // Handle Estimate Print (no save, cart stays intact)
  const handleEstimatePrint = useCallback(() => {
    if (items.length === 0) return;
    
    const estimateData = {
      invoiceNumber: "ESTIMATE",
      saleId: null,
      items: items,
      totals: totals,
      flatDiscountAmount: flatDiscountAmount,
      saleReturnAdjust: saleReturnAdjust,
      finalAmount: finalAmount,
      method: 'estimate',
      customerName: customerName || "Walk-in Customer",
      customerPhone: customerPhone,
      customerId: customerId,
      roundOff: roundOff,
      creditApplied: creditApplied,
      notes: saleNotes || null,
      paidAmount: 0,
      previousBalance: customerBalance || 0,
      isEstimate: true,
    };
    
    setSavedInvoiceData(estimateData);
    
    // Wait for invoice to render, then directly open print dialog (no preview)
    const waitForContent = () => {
      const el = invoicePrintRef.current;
      if (!el) return false;
      const text = (el.textContent || '').trim();
      if (!text || text.length < 30) return false;
      if (/^loading\.?\.?\.?$/i.test(text) || /loading preview/i.test(text)) return false;
      return true;
    };

    const startedAt = Date.now();
    const pollInterval = setInterval(async () => {
      if (waitForContent() || Date.now() - startedAt > 5000) {
        clearInterval(pollInterval);
        if (isDirectPrintEnabled) {
          const paperSize = posBillFormat === 'thermal' ? '80mm' : posBillFormat === 'a5' || posBillFormat === 'a5-horizontal' ? 'A5' : 'A4';
          await directPrint(invoicePrintRef.current, {
            context: 'pos',
            paperSize,
            onFallback: () => {
              handlePrintRef.current?.();
            },
            onSuccess: () => {
              setSavedInvoiceData(null);
              setTimeout(() => barcodeInputRef.current?.focus(), 100);
            },
          });
        } else {
          // Directly trigger browser print dialog without showing preview
          handlePrintRef.current?.();
        }
      }
    }, 150);
  }, [items, totals, flatDiscountAmount, saleReturnAdjust, finalAmount, customerName, customerPhone, customerId, roundOff, creditApplied, saleNotes, customerBalance, isDirectPrintEnabled, posBillFormat, directPrint]);

  // Register estimate print in POS header and ref for keyboard shortcut
  useEffect(() => {
    handleEstimatePrintRef.current = handleEstimatePrint;
    setOnEstimatePrint(() => handleEstimatePrint);
    return () => { setOnEstimatePrint(null); };
  }, [setOnEstimatePrint, handleEstimatePrint]);
  const handleApplyCredit = (amount: number) => {
    if (!customerId) {
      toast({
        title: "Customer Required",
        description: "Please select a customer to apply credit",
        variant: "destructive",
      });
      return;
    }
    
    const maxApplicable = Math.min(amount, availableCreditBalance, amountBeforeCredit);
    if (maxApplicable <= 0) {
      toast({
        title: "Cannot Apply Credit",
        description: "No credit available or bill amount is too low",
        variant: "destructive",
      });
      return;
    }
    setCreditApplied(maxApplicable);
  };

  // Handle save sale
  const handleSaveSale = async (forcePaymentMethod?: 'cash' | 'card' | 'upi' | 'multiple' | 'pay_later') => {
    if (items.length === 0) {
      toast({
        title: "No Items",
        description: "Please add items to the cart before saving",
        variant: "destructive",
      });
      return;
    }

    // Validate no items have 0 or negative quantity
    const zeroQtyItems = items.filter(item => !item.quantity || item.quantity <= 0);
    if (zeroQtyItems.length > 0) {
      toast({
        title: "Invalid Quantity",
        description: `${zeroQtyItems.length} item(s) have zero or invalid quantity. Please fix before saving.`,
        variant: "destructive",
      });
      return;
    }

    // Check if payment method is pay_later and customer mobile is missing
    if ((forcePaymentMethod || paymentMethod) === 'pay_later' && !customerPhone?.trim()) {
      toast({
        title: "Customer Details Required",
        description: "Please enter customer details first for balance invoice. Mobile number is mandatory for credit sales.",
        variant: "destructive",
      });
      return;
    }

    const saleData = {
      customerId: customerId || null,
      customerName,
      customerPhone: customerPhone || null,
      items,
      grossAmount: totals.mrp,
      discountAmount: totals.discount,
      flatDiscountPercent,
      flatDiscountAmount,
      saleReturnAdjust,
      roundOff,
      netAmount: finalAmount,
      creditApplied,
      salesman: selectedSalesman || null,
      notes: saleNotes || null,
      pointsRedeemedAmount: pointsRedemptionValue,
    };

    // Use updateSale if editing existing sale, otherwise create new
    const result = currentSaleId 
      ? await updateSale(currentSaleId, saleData, forcePaymentMethod || paymentMethod)
      : await saveSale(saleData, forcePaymentMethod || paymentMethod);
    
    if (result) {
      // Save financer details if provided (Mobile ERP)
      if (mobileERP.enabled && mobileERP.financer_billing && financerDetails?.financer_name) {
        await saveFinancerDetails(result.id, currentOrganization?.id || '', financerDetails);
      }
      // Store invoice number for printing
      setCurrentInvoiceNumber(result.sale_number);
      
      // Refetch today's sales to include the new/updated invoice
      await queryClient.invalidateQueries({ queryKey: ['todays-sales', currentOrganization?.id] });
      
      // Reset to show the newly saved invoice (index 0, as sales are sorted by created_at desc)
      setCurrentInvoiceIndex(0);
      setCurrentSaleId(result.id);
      
      toast({
        title: currentSaleId ? "Sale Updated" : "Sale Saved",
        description: `Invoice ${result.sale_number} ${currentSaleId ? 'updated' : 'saved'} successfully`,
      });
      
      // Apply credit if any
      if (creditApplied > 0 && customerId) {
        await applyCredit(customerId, creditApplied);
      }
      
      // Check for DC items — offer transfer to delivery challan for cash sales
      const effectivePayment = forcePaymentMethod || paymentMethod;
      const dcCartItems = items.filter(i => i.isDcProduct);
      if (dcCartItems.length > 0 && effectivePayment === 'cash' && !currentSaleId) {
        // Fetch the saved sale_items to get their IDs
        const { data: savedSaleItems } = await supabase
          .from('sale_items')
          .select('id, variant_id, product_name, size, quantity, line_total, product_id, barcode')
          .eq('sale_id', result.id)
          .eq('is_dc_item', true);
        
        if (savedSaleItems && savedSaleItems.length > 0) {
          setDcTransferSaleId(result.id);
          setDcTransferItems(savedSaleItems.map(si => ({
            saleItemId: si.id,
            productName: si.product_name,
            size: si.size,
            quantity: si.quantity,
            netAmount: si.line_total,
            variantId: si.variant_id,
            productId: si.product_id,
            barcode: si.barcode,
          })));
          setShowDcTransferDialog(true);
        }
      }
      
      // Clear cart on success
      setItems([]);
      setCustomerId("");
      setCustomerName("");
      setCustomerPhone("");
      setFlatDiscountValue(0);
      setFlatDiscountMode('percent');
      setSaleReturnAdjust(0);
      setRoundOff(0);
      setIsManualRoundOff(false);
      setCreditApplied(0);
      setAvailableCreditBalance(0);
      setSearchInput("");
      setCurrentSaleId(null); // Reset edit mode
      setOriginalItemsForEdit([]); // Clear original items for edit
      setSaleNotes("");
      setFinancerDetails(null);
    }
  };

  const handlePaymentMethodChange = (method: 'cash' | 'card' | 'upi') => {
    setPaymentMethod(method);
    toast({
      title: "Payment Method Selected",
      description: `${method.toUpperCase()} payment selected`,
    });
  };

  const handlePaymentAndPrint = async (method: 'cash' | 'card' | 'upi' | 'pay_later') => {
    // Prevent duplicate saves from rapid clicks or keyboard shortcuts
    if (isSaving) {
      console.log('Payment already in progress, skipping duplicate call');
      return;
    }

    if (items.length === 0) {
      toast({
        title: "No Items",
        description: "Please add items to the cart before processing payment",
        variant: "destructive",
      });
      return;
    }

    // Real-time stock validation before saving
    // When editing, pass original items so their stock is considered "freed"
    const cartItemsForValidation = items.map(item => ({
      variantId: item.variantId,
      quantity: item.quantity,
      productName: item.productName,
      size: item.size,
    }));

    const insufficientItems = await validateCartStock(
      cartItemsForValidation,
      currentSaleId ? originalItemsForEdit : undefined
    );
    
    if (insufficientItems.length > 0) {
      showMultipleStockErrors(insufficientItems);
      return;
    }

    // Save the sale with the selected payment method
    const saleData = {
      customerId: customerId || null,
      customerName,
      customerPhone: customerPhone || null,
      items,
      grossAmount: totals.mrp,
      discountAmount: totals.discount,
      flatDiscountPercent,
      flatDiscountAmount,
      saleReturnAdjust,
      roundOff,
      netAmount: finalAmount,
      creditApplied,
      salesman: selectedSalesman || null,
      notes: saleNotes || null,
      pointsRedeemedAmount: pointsRedemptionValue,
    };

    // Use resumeHeldSale if this is a held sale, updateSale if editing, otherwise create new
    let result;
    if (isHeldSale && currentSaleId) {
      result = await resumeHeldSale(currentSaleId, saleData, method);
    } else if (currentSaleId) {
      result = await updateSale(currentSaleId, saleData, method);
    } else {
      result = await saveSale(saleData, method);
    }
    
    if (result) {
      // Save financer details if provided (Mobile ERP)
      if (mobileERP.enabled && mobileERP.financer_billing && financerDetails?.financer_name) {
        await saveFinancerDetails(result.id, currentOrganization?.id || '', financerDetails);
      }
      // Store invoice number and sale ID for printing
      setCurrentInvoiceNumber(result.sale_number);
      const wasEditing = !!currentSaleId;
      setCurrentSaleId(result.id);
      
      toast({
        title: wasEditing ? "Sale Updated" : "Sale Saved",
        description: `Invoice ${result.sale_number} ${wasEditing ? 'updated' : 'saved'} with ${method.toUpperCase()} payment`,
      });
      
      // Store invoice data for print dialog BEFORE clearing the form
      const invoiceDataForPrint = {
        invoiceNumber: result.sale_number,
        saleId: result.id,
        items: items,
        totals: totals,
        flatDiscountAmount: flatDiscountAmount,
        saleReturnAdjust: saleReturnAdjust,
        finalAmount: finalAmount,
        method: method,
        customerName: customerName,
        customerPhone: customerPhone,
        customerId: customerId,
        roundOff: roundOff,
        creditApplied: creditApplied,
        notes: saleNotes || null,
        paidAmount: method === 'pay_later' ? 0 : finalAmount,
        previousBalance: customerBalance || 0,
        pointsRedeemed: pointsToRedeem,
        pointsRedemptionValue: pointsRedemptionValue,
        pointsBalance: (customerPointsData?.balance || 0) - pointsToRedeem,
        cashAmount: result.cash_amount || 0,
        upiAmount: result.upi_amount || 0,
        cardAmount: result.card_amount || 0,
      };
      
      // Clear the form immediately after successful save (reset to new blank invoice)
      setItems([]);
      setCustomerId("");
      setCustomerName("");
      setCustomerPhone("");
      setFlatDiscountValue(0);
      setFlatDiscountMode('percent');
      setSaleReturnAdjust(0);
      setRoundOff(0);
      setIsManualRoundOff(false);
      setCreditApplied(0);
      setAvailableCreditBalance(0);
      setSearchInput("");
      setCurrentSaleId(null);
      setOriginalItemsForEdit([]);
      setSelectedSalesman("");
      setSaleNotes("");
      setFinancerDetails(null);
      setIsHeldSale(false);
      setPointsToRedeem(0);
      
      // Now show print dialog with saved data
      setSavedInvoiceData(invoiceDataForPrint);
      
      // If auto-print via QZ Tray is enabled, skip dialog and print directly
      if (isDirectPrintEnabled && isAutoPrintEnabled) {
        // Set data first, then trigger print after render
        setTimeout(async () => {
          console.log('Direct print: auto-print triggered, invoicePrintRef:', !!invoicePrintRef.current, 'innerHTML length:', invoicePrintRef.current?.innerHTML?.length || 0);
          const paperSize = posBillFormat === 'thermal' ? '80mm' : posBillFormat === 'a5' || posBillFormat === 'a5-horizontal' ? 'A5' : 'A4';
          await directPrint(invoicePrintRef.current, {
            context: 'pos',
            paperSize,
            onFallback: () => {
              setShowPrintConfirmDialog(true);
            },
            onSuccess: async () => {
              setSavedInvoiceData(null);
              const billBarcodeSettings = (settingsData as any)?.bill_barcode_settings;
              if (billBarcodeSettings?.enable_cash_drawer) {
                const drawerPin = billBarcodeSettings?.cash_drawer_pin || 'pin2';
                await openCashDrawer(undefined, { pin: drawerPin, showToast: false });
              }
              setTimeout(() => barcodeInputRef.current?.focus(), 100);
            },
          });
        }, 500);
      } else {
        setShowPrintConfirmDialog(true);
      }
      
      // Focus on barcode input for next sale
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    }
  };

  const handleMixPayment = () => {
    if (items.length === 0) {
      toast({
        title: "No Items",
        description: "Please add items to the cart before processing payment",
        variant: "destructive",
      });
      return;
    }
    // Auto-set refund if final amount is negative
    if (finalAmount < 0) {
      setRefundAmount(Math.abs(finalAmount));
    }
    setShowMixPaymentDialog(true);
  };

  const handleMixPaymentSave = async (paymentData: {
    cashAmount: number;
    cardAmount: number;
    upiAmount: number;
    creditAmount: number;
    totalPaid: number;
    refundAmount: number;
    issueCreditNote?: boolean;
  }) => {
    // Check if there's a balance and customer mobile is missing
    const balanceAmount = finalAmount - paymentData.totalPaid;
    if (balanceAmount > 0 && !customerPhone?.trim()) {
      toast({
        title: "Customer Details Required",
        description: "Please enter customer details first for balance invoice. Mobile number is mandatory for partial payments.",
        variant: "destructive",
      });
      return;
    }

    // Real-time stock validation before saving
    // When editing, pass original items so their stock is considered "freed"
    const cartItemsForValidation = items.map(item => ({
      variantId: item.variantId,
      quantity: item.quantity,
      productName: item.productName,
      size: item.size,
    }));

    const insufficientItems = await validateCartStock(
      cartItemsForValidation,
      currentSaleId ? originalItemsForEdit : undefined
    );
    
    if (insufficientItems.length > 0) {
      showMultipleStockErrors(insufficientItems);
      return;
    }

    // Save the sale with mix payment, refund, or credit note
    const saleData = {
      customerId: customerId || null,
      customerName,
      customerPhone: customerPhone || null,
      items,
      grossAmount: totals.mrp,
      discountAmount: totals.discount,
      flatDiscountPercent,
      flatDiscountAmount,
      saleReturnAdjust,
      roundOff,
      netAmount: finalAmount,
      refundAmount: paymentData.issueCreditNote ? 0 : paymentData.refundAmount,
      creditApplied,
      salesman: selectedSalesman || null,
      notes: saleNotes || null,
      pointsRedeemedAmount: pointsRedemptionValue,
    };

    const paymentMethodType = paymentData.refundAmount > 0 ? (paymentData.issueCreditNote ? 'credit_note' : 'refund') : 'multiple';
    
    // Use updateSale if editing existing sale, otherwise create new
    const result = currentSaleId 
      ? await updateSale(currentSaleId, saleData, paymentMethodType as any, paymentData)
      : await saveSale(saleData, paymentMethodType as any, paymentData);
    
    if (result) {
      // Save financer details if provided (Mobile ERP)
      if (mobileERP.enabled && mobileERP.financer_billing && financerDetails?.financer_name) {
        await saveFinancerDetails(result.id, currentOrganization?.id || '', financerDetails);
      }
      // Store invoice number and sale ID for printing
      setCurrentInvoiceNumber(result.sale_number);
      const wasEditing = !!currentSaleId;
      setCurrentSaleId(result.id);
      
      const isRefund = paymentData.refundAmount > 0 && !paymentData.issueCreditNote;
      const isCreditNote = paymentData.issueCreditNote && paymentData.refundAmount > 0;
      
      // If issuing credit note, create it
      if (isCreditNote) {
        const creditNote = await createCreditNote({
          saleId: result.id,
          customerId: customerId || null,
          customerName: customerName || 'Walk in Customer',
          customerPhone: customerPhone || null,
          creditAmount: paymentData.refundAmount,
          notes: `Credit note issued against invoice ${result.sale_number}`,
        });
        
        if (creditNote) {
          setCreditNoteData(creditNote);
          setShowCreditNoteDialog(true);
        }
      }
      
      toast({
        title: wasEditing ? "Sale Updated" : "Sale Saved",
        description: isCreditNote 
          ? `Invoice ${result.sale_number} saved with Credit Note of ₹${paymentData.refundAmount.toFixed(2)}`
          : isRefund 
            ? `Invoice ${result.sale_number} ${wasEditing ? 'updated' : 'saved'} with refund of ₹${paymentData.refundAmount.toFixed(2)}`
            : `Invoice ${result.sale_number} ${wasEditing ? 'updated' : 'saved'} with mixed payment${balanceAmount > 0 ? ` (Balance: ₹${balanceAmount.toFixed(2)})` : ''}`,
      });
      
      // Credit and points operations moved to after print dialog (non-blocking, see below)
      
      // Store invoice data BEFORE clearing the form (only for non-credit note cases)
      const invoiceDataForPrint = !isCreditNote ? {
        invoiceNumber: result.sale_number,
        saleId: result.id,
        items: items,
        totals: totals,
        flatDiscountAmount: flatDiscountAmount,
        saleReturnAdjust: saleReturnAdjust,
        finalAmount: finalAmount,
        method: isRefund ? 'refund' : 'multiple',
        customerName: customerName,
        customerPhone: customerPhone,
        customerId: customerId,
        roundOff: roundOff,
        paymentBreakdown: paymentData,
        refundAmount: paymentData.refundAmount,
        creditApplied: creditApplied,
        notes: saleNotes || null,
        paidAmount: paymentData.totalPaid,
        previousBalance: customerBalance || 0,
        pointsRedeemed: pointsToRedeem,
        pointsRedemptionValue: pointsRedemptionValue,
        pointsBalance: (customerPointsData?.balance || 0) - pointsToRedeem,
        cashAmount: result.cash_amount || 0,
        upiAmount: result.upi_amount || 0,
        cardAmount: result.card_amount || 0,
        creditAmount: paymentData.creditAmount || 0,
      } : null;
      
      // Clear the form immediately after successful save (reset to new blank invoice)
      setItems([]);
      setCustomerId("");
      setCustomerName("");
      setCustomerPhone("");
      setFlatDiscountValue(0);
      setFlatDiscountMode('percent');
      setSaleReturnAdjust(0);
      setRoundOff(0);
      setIsManualRoundOff(false);
      setCreditApplied(0);
      setAvailableCreditBalance(0);
      setSearchInput("");
      setCurrentSaleId(null);
      setOriginalItemsForEdit([]);
      setSelectedSalesman("");
      setSaleNotes("");
      setFinancerDetails(null);
      setIsHeldSale(false);
      setPointsToRedeem(0);
      
      // Show print dialog with saved data (only for non-credit note cases)
      if (invoiceDataForPrint) {
        setSavedInvoiceData(invoiceDataForPrint);
        setShowPrintConfirmDialog(true);
      }
      
      // Focus on barcode input for next sale
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
      
      // Non-blocking background operations
      queryClient.invalidateQueries({ queryKey: ['todays-sales', currentOrganization?.id] });
      queryClient.invalidateQueries({ queryKey: ['pos-dashboard'] });
      
      if (!isCreditNote && creditApplied > 0 && customerId) {
        applyCredit(customerId, creditApplied);
      }
      if (!isCreditNote && pointsToRedeem > 0 && customerId) {
        redeemPoints(customerId, result.id, pointsToRedeem, result.sale_number).then(() => {
          queryClient.invalidateQueries({ queryKey: ['customer-points', customerId] });
        });
      }
    }
  };

  // Setup print handler using react-to-print
  const getPageStyle = () => {
    const format = posBillFormat;
    let size = 'A5 portrait';
    let margin = '5mm';
    
    switch (format) {
      case 'a5-horizontal':
        size = 'A5 landscape';
        break;
      case 'a4':
        size = 'A4 portrait';
        margin = '10mm';
        break;
      case 'thermal':
        size = '80mm auto';
        margin = '3mm';
        break;
      default: // a5-vertical
        size = 'A5 portrait';
        break;
    }
    
    return `
      @page {
        size: ${size};
        margin: ${margin};
      }
      @media print {
        html, body {
          width: 100%;
          margin: 0;
          padding: 0;
        }
      }
    `;
  };

  const handlePrint = useReactToPrint({
    contentRef: invoicePrintRef,
    documentTitle: savedInvoiceData?.invoiceNumber || "Invoice",
    pageStyle: getPageStyle(),
    onAfterPrint: async () => {
      toast({
        title: "Success",
        description: "Invoice printed successfully",
      });

      // Clear saved invoice data so screen is ready for new invoice
      setSavedInvoiceData(null);
      setShowPrintPreview(false);

      // Open cash drawer if enabled in settings
      const billBarcodeSettings = (settingsData as any)?.bill_barcode_settings;
      if (billBarcodeSettings?.enable_cash_drawer) {
        const drawerPin = billBarcodeSettings?.cash_drawer_pin || 'pin2';
        await openCashDrawer(undefined, { pin: drawerPin, showToast: false });
      }

      // Focus barcode input for next sale
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    },
  });

  // Keep ref in sync for estimate print (handlePrint defined after estimate handler)
  handlePrintRef.current = handlePrint;

  const handlePrintFromDialog = async () => {

    setShowPrintConfirmDialog(false);

    // Try QZ Tray direct print first
    if (isDirectPrintEnabled) {
      // Wait a tick for the invoice to render
      setTimeout(async () => {
        const paperSize = posBillFormat === 'thermal' ? '80mm' : posBillFormat === 'a5' || posBillFormat === 'a5-horizontal' ? 'A5' : 'A4';
        const success = await directPrint(invoicePrintRef.current, {
          context: 'pos',
          paperSize,
          onFallback: () => {
            // Fallback to browser print
            if (showInvoicePreviewSetting) {
              setShowPrintPreview(true);
            } else {
              handlePrint();
            }
          },
          onSuccess: async () => {
            setSavedInvoiceData(null);
            setShowPrintPreview(false);
            // Open cash drawer if enabled
            const billBarcodeSettings = (settingsData as any)?.bill_barcode_settings;
            if (billBarcodeSettings?.enable_cash_drawer) {
              const drawerPin = billBarcodeSettings?.cash_drawer_pin || 'pin2';
              await openCashDrawer(undefined, { pin: drawerPin, showToast: false });
            }
            setTimeout(() => barcodeInputRef.current?.focus(), 100);
          },
        });
      }, 150);
      return;
    }
    
    if (showInvoicePreviewSetting) {
      // Show preview dialog
      setShowPrintPreview(true);
    } else {
      // Direct print without preview
      setTimeout(() => {
        handlePrint();
      }, 100);
    }
  };

  const handleClosePrintConfirmDialog = () => {
    setShowPrintConfirmDialog(false);
    setSavedInvoiceData(null);
    
    // Focus on barcode input for next sale
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 100);
  };

  const { sendWhatsApp } = useWhatsAppSend();

  const handleWhatsAppShare = async (useCurrentData: boolean = false) => {
    const phone = useCurrentData ? customerPhone : savedInvoiceData?.customerPhone;
    const invoiceNo = useCurrentData ? currentInvoiceNumber : savedInvoiceData?.invoiceNumber;
    const name = useCurrentData ? customerName : savedInvoiceData?.customerName;
    const itemsToUse = useCurrentData ? items : savedInvoiceData?.items;
    const totalAmount = useCurrentData ? finalAmount : savedInvoiceData?.finalAmount;
    const discountAmount = useCurrentData ? (totals.discount + flatDiscountAmount) : ((savedInvoiceData?.totals?.discount || 0) + (savedInvoiceData?.flatDiscountAmount || 0));
    const grossAmount = useCurrentData ? totals.mrp : (savedInvoiceData?.totals?.mrp || 0);
    const method = useCurrentData ? paymentMethod : savedInvoiceData?.method;
    const srAdjust = useCurrentData ? saleReturnAdjust : (savedInvoiceData?.saleReturnAdjust || 0);
    const roundOffAmount = useCurrentData ? roundOff : (savedInvoiceData?.roundOff || 0);
    const custId = useCurrentData ? customerId : savedInvoiceData?.customerId;
    
    // Points data
    const pointsRedeemedAmt = useCurrentData ? pointsToRedeem : (savedInvoiceData?.pointsRedeemed || 0);
    const pointsRedemptionVal = useCurrentData ? pointsRedemptionValue : (savedInvoiceData?.pointsRedemptionValue || 0);
    
    // Get payment breakdown from savedInvoiceData (already saved)
    const cashAmt = savedInvoiceData?.cashAmount || 0;
    const cardAmt = savedInvoiceData?.cardAmount || 0;
    const upiAmt = savedInvoiceData?.upiAmount || 0;
    const creditAmt = savedInvoiceData?.creditAmount || 0;
    
    if (!phone) {
      toast({
        title: "No Phone Number",
        description: "Customer phone number is required to send WhatsApp message",
        variant: "destructive",
      });
      return;
    }

    const itemsList = itemsToUse?.map((item: any, index: number) =>
      `${index + 1}. ${item.productName} (${item.size}) - Qty: ${item.quantity} - ₹${(item.netAmount || 0).toFixed(2)}`
    ).join('\n') || '';

    // Get invoice URL if we have a sale ID - include org slug for branding
    const saleId = useCurrentData ? currentSaleId : savedInvoiceData?.saleId;
    const orgSlug = currentOrganization?.slug || localStorage.getItem("selectedOrgSlug") || '';
    const invoiceUrl = saleId ? `${window.location.origin}/${orgSlug}/invoice/view/${saleId}` : '';
    
    // Build payment breakdown
    const paymentParts: string[] = [];
    if (cashAmt > 0) paymentParts.push(`Cash: ₹${Number(cashAmt).toLocaleString("en-IN")}`);
    if (cardAmt > 0) paymentParts.push(`Card: ₹${Number(cardAmt).toLocaleString("en-IN")}`);
    if (upiAmt > 0) paymentParts.push(`UPI: ₹${Number(upiAmt).toLocaleString("en-IN")}`);
    if (creditAmt > 0) paymentParts.push(`Credit: ₹${Number(creditAmt).toLocaleString("en-IN")}`);
    const paymentBreakdown = paymentParts.length > 0 ? paymentParts.join(" | ") : (method || 'cash').toUpperCase();
    
    // Fetch customer outstanding and points if customer exists
    let outstandingText = '';
    let pointsText = '';
    if (custId) {
      const { data: customer } = await supabase
        .from('customers')
        .select('opening_balance, points_balance, total_points_earned')
        .eq('id', custId)
        .single();
      
      const openingBalance = customer?.opening_balance || 0;
      const pointsBalance = customer?.points_balance || 0;
      
      const { data: salesData } = await supabase
        .from('sales')
        .select('net_amount, paid_amount')
        .eq('customer_id', custId)
        .eq('organization_id', currentOrganization?.id);
      
      const totalSales = salesData?.reduce((sum, s) => sum + (s.net_amount || 0), 0) || 0;
      const totalPaid = salesData?.reduce((sum, s) => sum + (s.paid_amount || 0), 0) || 0;
      const customerBalance = openingBalance + totalSales - totalPaid;
      
      if (customerBalance > 0) {
        outstandingText = `\n💰 *Outstanding Balance: ₹${Number(customerBalance).toLocaleString("en-IN")}*`;
      }
      
      // Add points info
      if (isPointsEnabled) {
        if (pointsRedeemedAmt > 0) {
          pointsText = `\n\n🎁 *Loyalty Points*\nPoints Redeemed: ${pointsRedeemedAmt} pts (₹${pointsRedemptionVal.toFixed(0)} discount)\nPoints Balance: ${pointsBalance} pts`;
        } else if (pointsBalance > 0) {
          pointsText = `\n\n🎁 *Loyalty Points*\nPoints Balance: ${pointsBalance} pts`;
        }
      }
    }
    
    const message = `*Invoice Details*\n\nInvoice No: ${invoiceNo}\nDate: ${format(new Date(), 'dd/MM/yyyy')}\nCustomer: ${name || 'Walk in Customer'}\n\n*Items:*\n${itemsList}\n\nGross Amount: ₹${(grossAmount || 0).toFixed(2)}\nDiscount: ₹${(discountAmount || 0).toFixed(2)}${pointsRedeemedAmt > 0 ? `\nPoints Redeemed: ${pointsRedeemedAmt} pts (-₹${pointsRedemptionVal.toFixed(0)})` : ''}${srAdjust > 0 ? `\nS/R Adjust: -₹${srAdjust.toFixed(2)}` : ''}\nRound Off: ₹${(roundOffAmount || 0).toFixed(2)}\n*Net Amount: ₹${(totalAmount || 0).toFixed(2)}*\n\nPayment: ${paymentBreakdown}${outstandingText}${pointsText}${invoiceUrl ? `\n\n📄 View Invoice Online:\n${invoiceUrl}` : ''}\n\nThank you for your business!`;

    sendWhatsApp(phone, message);
  };

  const handlePrintInvoice = async () => {
    if (!currentSaleId) {
      toast({
        title: "Error",
        description: "Please save the sale first",
        variant: "destructive",
      });
      return;
    }

    try {
      // Trigger print using react-to-print
      handlePrint();
      
      // Close dialog after initiating print
      setShowPrintDialog(false);
    } catch (error: any) {
      console.error('Error printing invoice:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to print invoice",
        variant: "destructive",
      });
    }
  };

  const loadInvoice = (sale: any) => {
    if (!sale || !sale.sale_items) return;

    // Load customer info
    setCustomerName(sale.customer_name || "");
    setCustomerPhone(sale.customer_phone || "");
    setCustomerId(sale.customer_id || "");
    
    // Load items from sale_items
    const loadedItems: CartItem[] = sale.sale_items.map((item: any) => ({
      id: item.variant_id,
      barcode: item.barcode || '',
      productName: item.product_name,
      size: item.size,
      quantity: item.quantity,
      mrp: Number(item.mrp),
      gstPer: item.gst_percent,
      discountPercent: Number(item.discount_percent),
      discountAmount: 0,
      unitCost: Number(item.unit_price),
      netAmount: Number(item.line_total),
      productId: item.product_id,
      variantId: item.variant_id,
    }));

    setItems(loadedItems);
    
    // Restore flat discount - detect if it was saved as amount or percent mode
    const savedFlatPercent = Number(sale.flat_discount_percent) || 0;
    const savedFlatAmount = Number(sale.flat_discount_amount) || 0;
    if (savedFlatPercent > 0) {
      setFlatDiscountValue(savedFlatPercent);
      setFlatDiscountMode('percent');
    } else if (savedFlatAmount > 0) {
      setFlatDiscountValue(savedFlatAmount);
      setFlatDiscountMode('amount');
    } else {
      setFlatDiscountValue(0);
      setFlatDiscountMode('percent');
    }
    
    setSaleReturnAdjust(Number(sale.sale_return_adjust) || 0);
    
    // Set round-off as manual to prevent auto-recalculation from overwriting saved value
    const savedRoundOff = Number(sale.round_off) || 0;
    setRoundOff(savedRoundOff);
    setIsManualRoundOff(true);
    
    setCurrentSaleId(sale.id);
    setCurrentInvoiceNumber(sale.sale_number);

    // Set saved invoice data using actual stored values from DB
    setSavedInvoiceData({
      invoiceNumber: sale.sale_number,
      saleId: sale.id,
      items: loadedItems,
      totals: {
        quantity: loadedItems.reduce((sum, item) => sum + item.quantity, 0),
        mrp: Number(sale.gross_amount),
        discount: Number(sale.discount_amount),
        subtotal: Number(sale.gross_amount) - Number(sale.discount_amount),
      },
      flatDiscountAmount: savedFlatAmount,
      saleReturnAdjust: Number(sale.sale_return_adjust) || 0,
      finalAmount: Number(sale.net_amount),
      method: sale.payment_method,
      customerName: sale.customer_name,
      customerPhone: sale.customer_phone,
      paidAmount: Number(sale.paid_amount) || 0,
      previousBalance: 0,
      cashAmount: Number(sale.cash_amount) || 0,
      upiAmount: Number(sale.upi_amount) || 0,
      cardAmount: Number(sale.card_amount) || 0,
    });

    sonnerToast.success(`Invoice #${sale.sale_number} loaded successfully`);
  };

  const handleDeleteInvoice = async () => {
    if (!currentSaleId) {
      toast({
        title: "No Invoice Selected",
        description: "Please load an invoice to delete.",
        variant: "destructive",
      });
      return;
    }

    if (!confirm("Are you sure you want to delete this invoice? It will be moved to the recycle bin.")) {
      return;
    }

    try {
      const success = await softDelete('sales', currentSaleId);
      if (success) {
        toast({
          title: "Success",
          description: "Invoice moved to recycle bin",
        });
        setSavedInvoiceData(null);
        queryClient.invalidateQueries({ queryKey: ["today-sales"] });
        handleNewInvoice();
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleInvoiceSearch = async () => {
    if (!invoiceSearchInput.trim()) {
      toast({
        title: "Enter Invoice Number",
        description: "Please enter an invoice number to search.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: sale, error } = await supabase
        .from("sales")
        .select("*, sale_items(*)")
        .eq("organization_id", currentOrganization?.id)
        .eq("sale_number", invoiceSearchInput.trim())
        .maybeSingle();

      if (error) throw error;

      if (!sale) {
        toast({
          title: "Invoice Not Found",
          description: `No invoice found with number: ${invoiceSearchInput}`,
          variant: "destructive",
        });
        return;
      }

      // Load the found invoice
      loadInvoice(sale);
      setInvoiceSearchInput("");
      
      sonnerToast.success(`Invoice ${sale.sale_number} loaded successfully`);
    } catch (error: any) {
      toast({
        title: "Search Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handlePreviousInvoice = async () => {
    if (!todaysSales || todaysSales.length === 0) {
      toast({
        title: "No Invoices",
        description: "No invoices found for today",
        variant: "destructive",
      });
      return;
    }

    // Sales are ordered DESC (newest at index 0), so Previous goes to higher index (older invoice)
    const newIndex = currentInvoiceIndex < todaysSales.length - 1 ? currentInvoiceIndex + 1 : currentInvoiceIndex;
    if (newIndex === currentInvoiceIndex && currentInvoiceIndex === todaysSales.length - 1) {
      toast({
        title: "First Invoice",
        description: "This is the oldest invoice for today",
      });
      return;
    }
    setCurrentInvoiceIndex(newIndex);
    await loadSaleForEdit(todaysSales[newIndex].id);
  };

  const handleNextInvoice = async () => {
    if (!todaysSales || todaysSales.length === 0) {
      toast({
        title: "No Invoices",
        description: "No invoices found for today",
        variant: "destructive",
      });
      return;
    }

    // Sales are ordered DESC (newest at index 0), so Next goes to lower index (newer invoice)
    const newIndex = currentInvoiceIndex > 0 ? currentInvoiceIndex - 1 : currentInvoiceIndex;
    if (newIndex === currentInvoiceIndex && currentInvoiceIndex === 0) {
      toast({
        title: "Last Invoice",
        description: "This is the latest invoice for today",
      });
      return;
    }
    setCurrentInvoiceIndex(newIndex);
    await loadSaleForEdit(todaysSales[newIndex].id);
  };

  const handleLastInvoice = async () => {
    if (!todaysSales || todaysSales.length === 0) {
      toast({
        title: "No Invoices",
        description: "No invoices found for today",
        variant: "destructive",
      });
      return;
    }

    setCurrentInvoiceIndex(0);
    await loadSaleForEdit(todaysSales[0].id);
  };

  const handleClearAll = () => {
    if (items.length === 0) {
      toast({
        title: "Cart is already empty",
        variant: "default",
      });
      return;
    }
    
    setItems([]);
    setCustomerName("");
    setCustomerId("");
    setCustomerPhone("");
    setFlatDiscountValue(0);
    setFlatDiscountMode('percent');
    setSaleReturnAdjust(0);
    setRoundOff(0);
    setRefundAmount(0);
    setCreditApplied(0);
    setAvailableCreditBalance(0);
    setSearchInput("");
    setCurrentSaleId(null);
    setOriginalItemsForEdit([]);
    setSaleNotes("");
    
    toast({
      title: "Cart Cleared",
      description: "All items removed from cart",
    });
  };

  const handleNewInvoice = () => {
    setItems([]);
    setCustomerName("");
    setCustomerId("");
    setCustomerPhone("");
    setFlatDiscountValue(0);
    setFlatDiscountMode('percent');
    setSaleReturnAdjust(0);
    setRoundOff(0);
    setRefundAmount(0);
    setCreditApplied(0);
    setAvailableCreditBalance(0);
    setSearchInput("");
    setCurrentInvoiceIndex(0);
    setCurrentSaleId(null);
    setOriginalItemsForEdit([]);
    setCurrentInvoiceNumber("");
    setIsHeldSale(false);
    setSaleNotes("");
    
    toast({
      title: "New Invoice",
      description: "Cart cleared. Ready for new sale.",
    });
    
    // Focus on barcode input for next scan
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 100);
  };

  // Handle putting bill on hold
  const handleHoldBill = async () => {
    if (items.length === 0) {
      toast({
        title: "No Items",
        description: "Please add items to the cart before holding",
        variant: "destructive",
      });
      return;
    }

    const saleData = {
      customerId: customerId || null,
      customerName: customerName || "Walk in Customer",
      customerPhone: customerPhone || null,
      items,
      grossAmount: totals.mrp,
      discountAmount: totals.discount,
      flatDiscountPercent,
      flatDiscountAmount,
      saleReturnAdjust,
      roundOff,
      netAmount: finalAmount,
      notes: saleNotes || null,
    };

    const result = await holdSale(saleData);
    
    if (result) {
      // Clear cart after holding
      setItems([]);
      setCustomerId("");
      setCustomerName("");
      setCustomerPhone("");
      setFlatDiscountValue(0);
      setFlatDiscountMode('percent');
      setSaleReturnAdjust(0);
      setRoundOff(0);
      setSearchInput("");
      setCurrentSaleId(null);
      setCurrentInvoiceNumber("");
      setIsHeldSale(false);
      setSaleNotes("");
      
      // Refetch today's sales and dashboard data
      await queryClient.invalidateQueries({ queryKey: ['todays-sales', currentOrganization?.id] });
      await queryClient.invalidateQueries({ queryKey: ['pos-dashboard'] });
      await queryClient.refetchQueries({ queryKey: ['todays-sales', currentOrganization?.id] });
    }
  };

  const createCustomer = useMutation({
    mutationFn: async (data: typeof newCustomerForm) => {
      if (!currentOrganization?.id) throw new Error("No organization selected");
      
      const { createOrGetCustomer } = await import("@/utils/customerUtils");
      
      const result = await createOrGetCustomer({
        customer_name: data.customer_name,
        phone: data.phone,
        email: data.email,
        address: data.address,
        gst_number: data.gst_number,
        organization_id: currentOrganization.id,
      });
      
      return { ...result.customer, isExisting: result.isExisting };
    },
    onSuccess: (newCustomer) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: "Customer added successfully" });
      setCustomerId(newCustomer.id);
      setCustomerName(newCustomer.customer_name);
      setCustomerPhone(newCustomer.phone || "");
      setNewCustomerForm({
        customer_name: "",
        phone: "",
        email: "",
        address: "",
        gst_number: "",
      });
      setShowAddCustomerDialog(false);
      
      // Focus on barcode input for scanning
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    },
    onError: (error: any) => {
      toast({ title: "Error adding customer", description: error.message, variant: "destructive" });
    },
  });

  // Filter products for POS suggestions: prefer fast server results, fall back to local cache
  const filteredProducts = useMemo(() => {
    if (productSearchResults.length > 0) return productSearchResults;
    if (!productsData || !searchInput.trim()) return [];

    const term = searchInput.toLowerCase();
    return productsData.flatMap(product => {
      if (selectedProductType !== 'all' && product.product_type !== selectedProductType) return [];
      return product.product_variants?.map((variant: any) => ({
        product,
        variant,
        searchText: `${product.product_name} ${variant.size} ${variant.color || ''} ${variant.barcode || ''} ${product.brand || ''} ${product.category || ''}`.toLowerCase()
      })).filter((item: any) => item.searchText.includes(term)) || [];
    });
  }, [productSearchResults, productsData, searchInput, selectedProductType]);

  // Mobile POS Layout
  if (isMobile) {
    return (
      <>
        <MobilePOSLayout
          items={items}
          totals={totals}
          finalAmount={finalAmount}
          updateQuantity={updateQuantity}
          removeItem={removeItem}
          invoiceNumber={currentInvoiceNumber || nextInvoicePreview}
          customerId={customerId}
          customerName={customerName}
          customerPhone={customerPhone}
          customers={customers || []}
          customerSearchInput={customerName}
          onCustomerSearchChange={(value) => {
            setCustomerName(value);
            setOpenCustomerSearch(true);
          }}
          openCustomerSearch={openCustomerSearch}
          setOpenCustomerSearch={setOpenCustomerSearch}
          onCustomerSelect={(customer) => {
            if (customer) {
              setCustomerId(customer.id);
              setCustomerName(customer.customer_name);
              setCustomerPhone(customer.phone || "");
            } else {
              setCustomerId("");
              setCustomerName("");
              setCustomerPhone("");
            }
          }}
          onAddCustomer={() => setShowAddCustomerDialog(true)}
          searchInput={searchInput}
          onSearchInputChange={(value) => {
            setSearchInput(value);
            // Open product search if typing
            if (value.length > 0) {
              setOpenProductSearch(true);
            }
          }}
          onBarcodeSubmit={() => {
            if (searchInput.trim()) {
              searchAndAddProduct(searchInput.trim());
              setSearchInput("");
            }
          }}
          barcodeInputRef={barcodeInputRef}
          isSaving={isSaving}
          onPaymentAndPrint={handlePaymentAndPrint}
          onMixPayment={handleMixPayment}
          onHoldBill={handleHoldBill}
          showMobilePaymentSheet={showMobilePaymentSheet}
          setShowMobilePaymentSheet={setShowMobilePaymentSheet}
          selectedProductType={selectedProductType}
          onProductTypeChange={setSelectedProductType}
          hasMoreCustomers={hasMoreCustomers}
          flatDiscountValue={flatDiscountValue}
          flatDiscountMode={flatDiscountMode}
          onFlatDiscountValueChange={setFlatDiscountValue}
          onFlatDiscountModeChange={setFlatDiscountMode}
          onSaleReturn={() => setShowFloatingSaleReturn(true)}
          filteredProducts={filteredProducts}
          onProductSelect={(product, variant) => addItemToCart(product, variant)}
          openProductSearch={openProductSearch}
        />

        {/* Dialogs needed for mobile too */}
        <MixPaymentDialog
          open={showMixPaymentDialog}
          onOpenChange={setShowMixPaymentDialog}
          billAmount={finalAmount}
          creditApplied={creditApplied}
          onSave={handleMixPaymentSave}
        />

        {/* Floating Sale Return for mobile */}
        <FloatingSaleReturn
          open={showFloatingSaleReturn}
          onOpenChange={setShowFloatingSaleReturn}
          organizationId={currentOrganization?.id || ""}
          customerId={customerId}
          customerName={customerName || undefined}
          onReturnSaved={(amount, returnNumber) => {
            setSaleReturnAdjust(amount);
            toast({ title: "Sale Return Applied", description: `Return ${returnNumber} — ₹${Math.round(amount)} adjusted` });
          }}
        />

        {/* Add Customer Dialog */}
        <Dialog open={showAddCustomerDialog} onOpenChange={setShowAddCustomerDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Add New Customer
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="customer_name">Name *</Label>
                <Input
                  id="customer_name"
                  value={newCustomerForm.customer_name}
                  onChange={(e) => setNewCustomerForm(prev => ({ ...prev, customer_name: e.target.value }))}
                  placeholder="Customer name"
                  autoFocus
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Mobile *</Label>
                <Input
                  id="phone"
                  value={newCustomerForm.phone}
                  onChange={(e) => setNewCustomerForm(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="Mobile number"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={newCustomerForm.address}
                  onChange={(e) => setNewCustomerForm(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="Address (optional)"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddCustomerDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => createCustomer.mutate(newCustomerForm)}
                disabled={!newCustomerForm.customer_name || !newCustomerForm.phone}
              >
                Add Customer
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Print Confirmation Dialog */}
        <AlertDialog open={showPrintConfirmDialog} onOpenChange={setShowPrintConfirmDialog}>
          <AlertDialogContent onOpenAutoFocus={(e) => { e.preventDefault(); setTimeout(() => printBtnRef.current?.focus(), 50); }}>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-600" />
                Invoice Saved!
              </AlertDialogTitle>
              <AlertDialogDescription>
                Invoice {savedInvoiceData?.invoiceNumber} saved successfully.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row gap-2">
              <AlertDialogCancel onClick={() => {
                setShowPrintConfirmDialog(false);
                setSavedInvoiceData(null);
                barcodeInputRef.current?.focus();
              }}>
                New Bill
              </AlertDialogCancel>
              <Button 
                variant="outline" 
                className="flex items-center gap-2"
                onClick={() => {
                  handleWhatsAppShare();
                  setShowPrintConfirmDialog(false);
                  setSavedInvoiceData(null);
                }}
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </Button>
              <AlertDialogAction ref={printBtnRef} onClick={handlePrintFromDialog}>
                <Printer className="h-4 w-4 mr-2" />
                Print
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Hidden Invoice for Printing */}
        <div style={{ position: 'fixed', top: 0, left: 0, opacity: 0, pointerEvents: 'none', zIndex: -9999 }}>
          <InvoiceWrapper
            ref={invoicePrintRef}
            template={posInvoiceTemplate}
            format={posBillFormat || 'thermal'}
            billNo={savedInvoiceData?.invoiceNumber || currentInvoiceNumber}
            date={currentDateTime}
            customerName={savedInvoiceData?.customerName || customerName || "Walk in Customer"}
            customerMobile={savedInvoiceData?.customerPhone || customerPhone}
            items={savedInvoiceData ? savedInvoiceData.items.map((item: any, index: number) => ({
              sr: index + 1,
              particulars: item.productName,
              size: item.size,
              barcode: item.barcode || "",
              hsn: item.hsnCode || "",
              color: item.color || "",
              sp: item.unitCost,
              mrp: item.originalMrp || item.mrp,
              qty: item.quantity,
              rate: item.unitCost,
              total: item.netAmount,
              gstPercent: item.gstPer || 0,
              discountPercent: item.discountPercent || 0,
            })) : items.map((item, index) => ({
              sr: index + 1,
              particulars: item.productName,
              size: item.size,
              barcode: item.barcode || "",
              hsn: item.hsnCode || "",
              color: item.color || "",
              sp: item.unitCost,
              mrp: item.originalMrp || item.mrp,
              qty: item.quantity,
              rate: item.unitCost,
              total: item.netAmount,
              gstPercent: item.gstPer || 0,
              discountPercent: item.discountPercent || 0,
            }))}
            subTotal={savedInvoiceData?.totals.subtotal || totals.subtotal}
            discount={savedInvoiceData ? (savedInvoiceData.totals.discount + savedInvoiceData.flatDiscountAmount) : (totals.discount + flatDiscountAmount)}
            saleReturnAdjust={savedInvoiceData?.saleReturnAdjust || saleReturnAdjust || 0}
            grandTotal={savedInvoiceData?.finalAmount || finalAmount}
            cashPaid={savedInvoiceData?.method === 'cash' ? savedInvoiceData.finalAmount : paymentMethod === 'cash' ? finalAmount : 0}
            upiPaid={savedInvoiceData?.method === 'upi' ? savedInvoiceData.finalAmount : paymentMethod === 'upi' ? finalAmount : 0}
            paymentMethod={savedInvoiceData?.method || paymentMethod}
            cashAmount={savedInvoiceData?.cashAmount || 0}
            upiAmount={savedInvoiceData?.upiAmount || 0}
            cardAmount={savedInvoiceData?.cardAmount || 0}
            creditAmount={savedInvoiceData?.creditAmount || 0}
            notes={savedInvoiceData?.notes || saleNotes}
            paidAmount={savedInvoiceData?.paidAmount ?? (paymentMethod === 'pay_later' ? 0 : finalAmount)}
            previousBalance={savedInvoiceData?.previousBalance ?? customerBalance ?? 0}
            roundOff={savedInvoiceData?.roundOff ?? roundOff}
          />
        </div>
      </>
    );
  }

  // Desktop POS Layout
  return (
    <div className="min-h-screen w-full bg-background flex">
      {/* Left Action Button Bar */}
      <div className="w-[72px] bg-slate-50 dark:bg-slate-900 border-r border-border/60 flex flex-col gap-1.5 p-1.5 pb-32 z-30 relative overflow-y-auto">
        {/* Buttons in sequence: Cash, UPI, Card, Credit, Mix, Hold, New, Last, Print, Clear, WhatsApp */}
        <div className="space-y-1.5">
          {/* 1. Cash F1 */}
          <Button
            onClick={() => handlePaymentAndPrint('cash')}
            disabled={items.length === 0 || isSaving}
            className="h-[52px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold relative w-full rounded-lg bg-green-500 hover:bg-green-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40"
            title="Cash Payment - Save & Print (F1)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[14px] px-1 text-[8px] leading-[14px] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">F1</Badge>
            <Banknote className="h-4 w-4" />
            <span>Cash</span>
          </Button>
          
          {/* 2. UPI F2 */}
          <Button
            onClick={() => handlePaymentAndPrint('upi')}
            disabled={items.length === 0 || isSaving}
            className="h-[52px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold relative w-full rounded-lg bg-purple-500 hover:bg-purple-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40"
            title="UPI Payment - Save & Print (F2)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[14px] px-1 text-[8px] leading-[14px] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">F2</Badge>
            <Smartphone className="h-4 w-4" />
            <span>UPI</span>
          </Button>
          
          {/* 3. Card F3 */}
          <Button
            onClick={() => handlePaymentAndPrint('card')}
            disabled={items.length === 0 || isSaving}
            className="h-[52px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold relative w-full rounded-lg bg-cyan-500 hover:bg-cyan-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40"
            title="Card Payment - Save & Print (F3)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[14px] px-1 text-[8px] leading-[14px] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">F3</Badge>
            <CreditCard className="h-4 w-4" />
            <span>Card</span>
          </Button>
          
          {/* 4. Credit F4 */}
          <Button
            onClick={() => handlePaymentAndPrint('pay_later')}
            disabled={items.length === 0 || isSaving}
            className="h-[52px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold relative w-full rounded-lg bg-orange-500 hover:bg-orange-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40"
            title="Credit - Pay Later (F4)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[14px] px-1 text-[8px] leading-[14px] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">F4</Badge>
            <Clock className="h-4 w-4" />
            <span>Credit</span>
          </Button>
          
          {/* 5. Sale Return F5 */}
          <Button
            onClick={() => setShowFloatingSaleReturn(true)}
            className="h-[52px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold relative w-full rounded-lg bg-red-500 hover:bg-red-600 active:scale-95 text-white shadow-sm transition-all duration-150"
            title="Sale Return (F5)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[14px] px-1 text-[8px] leading-[14px] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">F5</Badge>
            <RotateCcw className="h-4 w-4" />
            <span>S/R</span>
          </Button>
          
          {/* 6. Mix F6 */}
          <Button
            onClick={handleMixPayment}
            disabled={items.length === 0 || isSaving}
            className="h-[52px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold relative w-full rounded-lg bg-violet-500 hover:bg-violet-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40"
            title="Mix Payment - Save & Print (F6)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[14px] px-1 text-[8px] leading-[14px] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">F6</Badge>
            <Wallet className="h-4 w-4" />
            <span>Mix</span>
          </Button>
          
          {/* 7. Hold F7 */}
          <Button
            onClick={handleHoldBill}
            disabled={items.length === 0 || isSaving || isHeldSale}
            className="h-[52px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold relative w-full rounded-lg bg-amber-500 hover:bg-amber-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40"
            title="Hold Bill (F7)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[14px] px-1 text-[8px] leading-[14px] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">F7</Badge>
            <Pause className="h-4 w-4" />
            <span>Hold</span>
          </Button>
          
          {/* 8. Cashier Report F8 */}
          <Button
            onClick={() => setShowFloatingCashierReport(true)}
            className="h-[52px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold relative w-full rounded-lg bg-teal-500 hover:bg-teal-600 active:scale-95 text-white shadow-sm transition-all duration-150"
            title="Daily Cashier Report (F8)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[14px] px-1 text-[8px] leading-[14px] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">F8</Badge>
            <BarChart3 className="h-4 w-4" />
            <span>Cashier</span>
          </Button>
          
          {/* 9. Estimate F9 */}
          <Button
            onClick={handleEstimatePrint}
            disabled={items.length === 0}
            className="h-[52px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold relative w-full rounded-lg bg-sky-500 hover:bg-sky-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40"
            title="Print Estimate - No Save (F9)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[14px] px-1 text-[8px] leading-[14px] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">F9</Badge>
            <FileText className="h-4 w-4" />
            <span>Estimate</span>
          </Button>
          
          <Button
            onClick={handleNewInvoice}
            className="h-[52px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold w-full rounded-lg bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white shadow-sm transition-all duration-150"
            title="New Invoice"
          >
            <FileText className="h-4 w-4" />
            <span>New</span>
          </Button>
          
          {/* 8. Last - matches Dashboard "Total Bills" blue-500 */}
          <Button
            onClick={handleLastInvoice}
            disabled={!todaysSales || todaysSales.length === 0}
            className="h-[52px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold w-full rounded-lg bg-blue-500 hover:bg-blue-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40"
            title="Last Invoice"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Last</span>
          </Button>
          
          {/* 9. Print - matches Dashboard "Credit Notes" indigo-500 */}
          <Button
            onClick={handlePrint}
            disabled={items.length === 0}
            className="h-[52px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold w-full rounded-lg bg-indigo-500 hover:bg-indigo-600 active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-40"
            title="Print"
          >
            <Printer className="h-4 w-4" />
            <span>Print</span>
          </Button>
          
          {/* 10. Clear - matches Dashboard "With Refunds" rose-500 */}
          <Button
            onClick={handleClearAll}
            className="h-[52px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold relative w-full rounded-lg bg-rose-500 hover:bg-rose-600 active:scale-95 text-white shadow-sm transition-all duration-150"
            title="Clear (Esc)"
          >
            <Badge className="absolute top-0.5 right-0.5 h-[14px] px-1 text-[8px] leading-[14px] bg-black/50 hover:bg-black/50 text-white/90 rounded-sm">ESC</Badge>
            <X className="h-4 w-4" />
            <span>Clear</span>
          </Button>
          
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Sticky Header Section - Barcode scanning bar stays fixed */}
        <div className="sticky top-0 z-20 bg-background border-b border-border/60 shadow-sm px-3 md:px-4 py-2.5">
          <div className="max-w-[1800px] w-full pl-2">
            <div className="flex flex-wrap items-end gap-3">
          <Popover open={openProductSearch} onOpenChange={setOpenProductSearch}>
            <PopoverTrigger asChild>
              <div className="relative w-60">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Barcode</Label>
                <Input
                  ref={barcodeInputRef}
                  placeholder={mobileERP.enabled && mobileERP.imei_scan_enforcement ? "Scan IMEI Number" : "Scan Barcode/Enter Product Name"}
                  value={searchInput}
                  onChange={handleBarcodeInputChange}
                  onKeyDown={handleSearch}
                  className="h-10 text-base pr-10 border-border/80 focus:border-primary"
                  autoFocus
                />
                <Scan className="absolute right-3 top-[calc(50%+10px)] -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
              </div>
            </PopoverTrigger>
            <PopoverContent 
              className="w-[400px] p-0 z-50" 
              align="start"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <Command shouldFilter={false}>
                {/* Hidden input to satisfy cmdk internals - main input is outside popover */}
                <div className="hidden">
                  <CommandInput value={searchInput} onValueChange={() => {}} />
                </div>
                <CommandList>
                  {isProductSearchLoading ? (
                    <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Searching products...
                    </div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">No products found.</div>
                  ) : (
                    <CommandGroup heading="Products">
                      {filteredProducts.slice(0, 10).map((item: any, index: number) => {
                        const product = item.product;
                        const descriptionParts = [product.product_name];
                        if (product.category) descriptionParts.push(product.category);
                        if (product.style) descriptionParts.push(product.style);
                        
                        let displayName = descriptionParts.join('-');
                        
                        const extraParts = [];
                        if (product.brand) extraParts.push(product.brand);
                        if (item.variant.color && item.variant.color !== '-') extraParts.push(item.variant.color);
                        
                        if (extraParts.length > 0) {
                          displayName += ',' + extraParts.join('-');
                        }
                        
                        return (
                          <CommandItem
                            key={`${product.id}-${item.variant.id}-${index}`}
                            value={item.searchText}
                            onSelect={() => {
                              addItemToCart(product, item.variant);
                            }}
                            className="cursor-pointer group"
                          >
                             <Check className="mr-2 h-4 w-4 opacity-0" />
                            <div className="flex flex-col flex-1">
                              <span className="font-medium">{displayName}</span>
                              <span className="text-sm text-foreground/70 group-data-[selected=true]:text-accent-foreground/80">
                                Size: {item.variant.size} | 
                                {item.variant.barcode && ` Barcode: ${item.variant.barcode} | `}
                                Price: ₹{item.variant.sale_price} | 
                                Stock: {item.variant.stock_qty}
                              </span>
                              {item.variant.batch_stock && item.variant.batch_stock.length > 0 && (
                                <span className="text-xs text-foreground/60 group-data-[selected=true]:text-accent-foreground/70 mt-1">
                                  <span className="font-semibold">Bills: </span>
                                  {item.variant.batch_stock
                                    .slice(0, 3)
                                    .map((batch: any, idx: number) => (
                                      <span key={batch.bill_number} className="font-mono">
                                        {batch.bill_number}({batch.quantity})
                                        {idx < Math.min(item.variant.batch_stock.length - 1, 2) ? ', ' : ''}
                                      </span>
                                    ))}
                                  {item.variant.batch_stock.length > 3 && (
                                    <span> +{item.variant.batch_stock.length - 3} more</span>
                                  )}
                                </span>
                              )}
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          
          <Popover open={openCustomerSearch} onOpenChange={setOpenCustomerSearch}>
            <PopoverTrigger asChild>
              <div className="relative w-72">
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer Name</Label>
                  {/* Customer Balance Display - on top of label */}
                  <div className="flex items-center gap-2">
                    {/* Credit Note Balance */}
                    {customerId && availableCreditBalance > 0 && (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-purple-500/10 text-purple-600 border border-purple-500/30">
                        <Wallet className="h-3 w-3" />
                        <span>₹{availableCreditBalance.toLocaleString('en-IN')}</span>
                        <span className="text-[10px]">C/Note</span>
                      </div>
                    )}
                    {/* Outstanding Balance */}
                    {customerId && (
                      <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                        customerBalance > 0 
                          ? 'bg-destructive/10 text-destructive border border-destructive/30' 
                          : customerBalance < 0 
                            ? 'bg-green-500/10 text-green-600 border border-green-500/30' 
                            : 'bg-muted text-muted-foreground border border-border'
                      }`}>
                        <IndianRupee className="h-3 w-3" />
                        <span>
                          {isBalanceLoading ? '...' : `₹${Math.abs(customerBalance).toLocaleString('en-IN')}`}
                        </span>
                        <span className="text-[10px]">
                          {customerBalance > 0 ? 'Due' : customerBalance < 0 ? 'Credit' : ''}
                          {customerOpeningBalance > 0 && ` (Op: ₹${customerOpeningBalance.toLocaleString('en-IN')})`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <Input
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    setOpenCustomerSearch(true);
                  }}
                  className="h-10 text-base pr-20 border-border/80 focus:border-primary"
                  placeholder="Enter customer name or phone"
                />
                {customerName && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute right-8 top-1/2 translate-y-0.5 h-8 w-8"
                    onClick={() => {
                      setCustomerName("");
                      setCustomerId("");
                      setCustomerPhone("");
                    }}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute right-1 top-1/2 translate-y-0.5 h-8 w-8"
                  onClick={() => setShowAddCustomerDialog(true)}
                  title="Add New Customer"
                >
                  <UserPlus className="h-5 w-5" />
                </Button>
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0 z-50" align="start">
              <Command shouldFilter={false}>
                <CommandInput 
                  placeholder="Search by name, phone, or email..." 
                  value={customerName}
                  onValueChange={setCustomerName}
                />
                <CommandList>
                  {isCustomersLoading ? (
                    <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Loading customers...
                    </div>
                  ) : isCustomersError ? (
                    <div className="flex flex-col items-center justify-center p-4 text-sm">
                      <div className="flex items-center text-destructive mb-2">
                        <AlertCircle className="h-4 w-4 mr-2" />
                        Error loading customers
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => refetchCustomers()}
                        className="text-xs"
                      >
                        Retry
                      </Button>
                    </div>
                  ) : (
                    <>
                      <CommandEmpty>No customers found.</CommandEmpty>
                      <CommandGroup heading={`Customers (${customers?.length || 0})${hasMoreCustomers ? ' - refine search for more' : ''}`}>
                        {filteredCustomers.map((customer: any) => {
                          const balance = getCustomerBalance(customer);
                          const advanceAmt = getCustomerAdvance(customer.id);
                          return (
                            <CommandItem
                              key={customer.id}
                              value={`${customer.customer_name} ${customer.phone || ''} ${customer.email || ''}`}
                            onSelect={() => {
                                customerJustSelected.current = true;
                                setCustomerId(customer.id);
                                setCustomerName(customer.customer_name);
                                setCustomerPhone(customer.phone || "");
                                setOpenCustomerSearch(false);
                                setTimeout(() => { customerJustSelected.current = false; }, 500);
                              }}
                              className="cursor-pointer"
                            >
                              <Check className="mr-2 h-4 w-4 opacity-0" />
                              <div className="flex flex-col flex-1">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium">{customer.customer_name}</span>
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
          
          {/* Customer Discount & Points moved to bottom after Note section */}

          {/* Salesperson Search - After Customer Name */}
          <Popover open={openSalesmanSearch} onOpenChange={setOpenSalesmanSearch}>
            <PopoverTrigger asChild>
              <div className="relative w-36">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Salesperson</Label>
                <Input
                  value={selectedSalesman}
                  onChange={(e) => {
                    setSelectedSalesman(e.target.value);
                    setOpenSalesmanSearch(true);
                  }}
                  className="h-10 text-sm pr-8 border-border/80 focus:border-primary"
                  placeholder="Select..."
                />
                {selectedSalesman && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute right-1 top-1/2 translate-y-0.5 h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSalesman("");
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-[250px] p-0 z-50" align="start">
              <Command shouldFilter={false}>
                <CommandInput 
                  placeholder="Search employee..." 
                  value={salesmanSearchInput}
                  onValueChange={setSalesmanSearchInput}
                />
                <CommandList>
                  <CommandEmpty>No employees found.</CommandEmpty>
                  <CommandGroup heading="Employees">
                    {filteredEmployees.map((emp: any) => (
                      <CommandItem
                        key={emp.id}
                        value={emp.employee_name}
                        onSelect={() => {
                          setSelectedSalesman(emp.employee_name);
                          setOpenSalesmanSearch(false);
                          setSalesmanSearchInput("");
                        }}
                        className="cursor-pointer"
                      >
                        <Check className={`mr-2 h-4 w-4 ${selectedSalesman === emp.employee_name ? 'opacity-100' : 'opacity-0'}`} />
                        <div className="flex flex-col">
                          <span className="font-medium">{emp.employee_name}</span>
                          {emp.designation && (
                            <span className="text-xs text-muted-foreground">{emp.designation}</span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Invoice Number Display */}
          <div className="relative w-40">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Invoice No</Label>
            <Input
              value={currentInvoiceNumber || nextInvoicePreview || "NEW"}
              readOnly
              className="h-10 text-sm font-semibold text-center bg-muted/50 border-border/80"
              placeholder="Invoice #"
            />
          </div>
          
          {/* Running Total Display */}
          <div className="h-10 bg-gradient-to-r from-green-600 to-emerald-600 rounded-md px-5 flex items-center justify-center min-w-[160px] shadow-sm">
            <div className="text-white font-bold text-lg tracking-tight">
              ₹{Math.round(finalAmount).toLocaleString('en-IN')}
            </div>
          </div>
              
              <div className="relative h-10 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-md px-3 flex items-center justify-center min-w-[90px] shadow-sm">
                <div className="text-white font-semibold text-sm">
                  {items.length} {items.length === 1 ? 'Item' : 'Items'}
                </div>
              </div>
              
              <TooltipProvider>
                <div className="flex gap-2 items-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={handlePreviousInvoice}
                        variant="outline"
                        size="sm"
                        className="h-10"
                        disabled={!todaysSales || todaysSales.length === 0 || currentInvoiceIndex >= todaysSales.length - 1}
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        <div className="flex flex-col items-start">
                          <span className="text-xs">Previous</span>
                          {todaysSales && todaysSales.length > 0 && currentInvoiceIndex < todaysSales.length - 1 && (
                            <span className="text-[10px] text-muted-foreground">
                              {todaysSales[currentInvoiceIndex + 1]?.sale_number}
                            </span>
                          )}
                        </div>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Page Up</p>
                    </TooltipContent>
                  </Tooltip>
                  {/* Position Indicator - Always visible */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="h-10 px-3 bg-muted/60 rounded-md flex flex-col items-center justify-center min-w-[52px] cursor-pointer border border-border/50" onClick={handleLastInvoice}>
                        <span className="text-sm font-semibold text-foreground">
                          {todaysSales && todaysSales.length > 0 && currentSaleId 
                            ? todaysSales.length - currentInvoiceIndex 
                            : 1}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          of {todaysSales && todaysSales.length > 0 ? todaysSales.length : 1}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>End - Go to Latest</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={handleNextInvoice}
                        variant="outline"
                        size="sm"
                        className="h-10"
                        disabled={!todaysSales || todaysSales.length === 0 || currentInvoiceIndex <= 0}
                      >
                        <div className="flex flex-col items-end">
                          <span className="text-xs">Next</span>
                          {todaysSales && todaysSales.length > 0 && currentInvoiceIndex > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              {todaysSales[currentInvoiceIndex - 1]?.sale_number}
                            </span>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Page Down</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
              
              {/* Date & Time Display + EMI Button Row */}
              <div className="flex items-center gap-2">
                <div className="relative h-10 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-md px-3 flex flex-col items-center justify-center shadow-sm">
                  <div className="text-white font-semibold text-xs">
                    {currentDateTime.toLocaleDateString('en-GB')}
                  </div>
                  <div className="text-white/80 text-[10px]">
                    {currentDateTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                </div>

                {/* Financer / EMI Button (Mobile ERP only) */}
                {mobileERP.enabled && mobileERP.financer_billing && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={() => setShowFinancerDialog(true)}
                          className={`h-10 px-3 flex items-center gap-1.5 text-xs font-semibold rounded-md shadow-sm transition-all ${
                            financerDetails?.financer_name
                              ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white'
                              : 'bg-muted/60 hover:bg-muted text-foreground border border-border/50'
                          }`}
                        >
                          <CreditCard className="h-4 w-4" />
                          <span className="hidden lg:inline">EMI</span>
                          {financerDetails?.financer_name && (
                            <Badge className="h-4 px-1 text-[9px] bg-white/20 hover:bg-white/20 text-white">
                              {financerDetails.financer_name.split(' ')[0]}
                            </Badge>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Financer / EMI Details</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
        </div>
      </div>

        {/* Items Table - Scrollable Section */}
        <div className="flex-1 overflow-hidden flex flex-col px-2 md:px-4 pb-36 mt-2">
          <div className="max-w-[1800px] w-full flex-1 flex flex-col overflow-hidden">
          <Card className="flex-1 overflow-hidden flex flex-col border-border/60 shadow-sm">
            <div className="bg-slate-900 text-white overflow-x-auto">
              <div className="min-w-[1200px] grid gap-2 px-4 py-3 text-[13px] font-semibold uppercase tracking-wider" style={{ gridTemplateColumns: '50px 130px 1fr 70px 65px 95px 65px 80px 75px 95px 120px' }}>
                <div className="text-center">Sr No</div>
                <div>Barcode</div>
                <div>Product</div>
                <div className="text-center">Size</div>
                <div className="text-center">Qty</div>
                <div className="text-right">MRP</div>
                <div className="text-center">Tax%</div>
                <div className="text-center">Disc%</div>
                <div className="text-right">Disc Rs</div>
                <div className="text-right">Unit Price</div>
                <div className="text-right">Net Amount</div>
              </div>
            </div>
            
            <div 
              ref={itemsContainerRef} 
              className="flex-1 overflow-y-auto relative"
              onScroll={(e) => {
                const target = e.target as HTMLDivElement;
                setShowScrollTop(target.scrollTop > 100);
              }}
            >
              {/* Scroll to Top Button with Item Count Badge */}
              {showScrollTop && items.length > 3 && (
                <Button
                  size="icon"
                  variant="secondary"
                  className="fixed bottom-40 right-8 z-30 rounded-full shadow-lg h-12 w-12 relative"
                  onClick={() => {
                    if (itemsContainerRef.current) {
                      itemsContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                >
                  <ArrowUp className="h-5 w-5" />
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                    {items.length}
                  </span>
                </Button>
              )}
              <div className="overflow-x-auto">
                {items.length === 0 ? (
                  // Show 5 blank rows with serial numbers
                  Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className={`min-w-[1200px] grid gap-2 px-4 py-3 border-b border-border/40 text-sm ${index % 2 === 1 ? 'bg-muted/20' : ''}`} style={{ gridTemplateColumns: '50px 130px 1fr 70px 65px 95px 65px 80px 75px 95px 120px' }}>
                      <div className="flex items-center justify-center text-muted-foreground/50 font-medium">{index + 1}</div>
                      <div className="flex items-center text-muted-foreground/30">—</div>
                      <div className="flex items-center text-muted-foreground/30">—</div>
                      <div className="flex items-center justify-center text-muted-foreground/30">—</div>
                      <div className="flex items-center justify-center text-muted-foreground/30">—</div>
                      <div className="flex items-center justify-end text-muted-foreground/30">—</div>
                      <div className="flex items-center justify-center text-muted-foreground/30">—</div>
                      <div className="flex items-center justify-center text-muted-foreground/30">—</div>
                      <div className="flex items-center justify-end text-muted-foreground/30">—</div>
                      <div className="flex items-center justify-end text-muted-foreground/30">—</div>
                      <div className="flex items-center justify-end text-muted-foreground/30">—</div>
                    </div>
                  ))
                ) : (
                  items.map((item, index) => (
                    <div key={index} className={`min-w-[1200px] grid gap-2 px-4 py-2.5 border-b border-border/40 hover:bg-accent/30 text-sm transition-colors ${index % 2 === 1 ? 'bg-muted/20' : ''}`} style={{ gridTemplateColumns: '50px 130px 1fr 70px 65px 95px 65px 80px 75px 95px 120px' }}>
                      <div className="flex items-center justify-center font-semibold text-foreground/80">{index + 1}</div>
                      <div className="flex items-center text-sm font-mono text-foreground/80">{item.barcode}</div>
                      <div className="flex items-center font-medium text-sm truncate gap-1">
                        {item.productName}
                        {item.isDcProduct && (
                          <span className="px-1 py-0.5 text-[9px] font-bold bg-orange-100 text-orange-700 border border-orange-300 rounded flex-shrink-0">DC</span>
                        )}
                      </div>
                      <div className="flex items-center justify-center text-sm font-medium">{item.size}</div>
                      <div>
                        <Input
                          type="number"
                          value={item.quantity || ""}
                          onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)}
                          placeholder="1"
                          className="h-8 text-sm w-full text-center bg-muted/30 border-border/60"
                          min="1"
                        />
                      </div>
                      <div>
                        <Input
                          type="number"
                          value={item.mrp || ""}
                          onChange={(e) => updateMrp(index, parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="h-8 text-sm w-full text-right bg-muted/30 border-border/60"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <select
                          value={item.gstPer}
                          onChange={(e) => updateGstPer(index, parseInt(e.target.value))}
                          className="h-8 w-full rounded-md border border-border/60 bg-muted/30 px-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="0">0%</option>
                          <option value="5">5%</option>
                          <option value="12">12%</option>
                          <option value="18">18%</option>
                          <option value="28">28%</option>
                        </select>
                      </div>
                      <div>
                        <Input
                          type="number"
                          value={item.discountPercent || ""}
                          onChange={(e) => updateDiscountPercent(index, parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="h-8 text-sm w-full text-center bg-muted/30 border-border/60"
                          min="0"
                          max="100"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <Input
                          type="number"
                          value={item.discountAmount || ""}
                          onChange={(e) => updateDiscountAmount(index, parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="h-8 text-sm w-full text-right bg-muted/30 border-border/60"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div className="flex items-center justify-end text-sm text-muted-foreground">₹{Math.round(item.unitCost).toLocaleString('en-IN')}</div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm">₹{Math.round(item.netAmount).toLocaleString('en-IN')}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeItem(index)}
                          className="h-7 w-7 text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
                {/* Notes Section - Always visible after items */}
                <div className="min-w-[1200px] p-4 border-t bg-muted/30">
                  <div className="flex items-center gap-3">
                    <Label className="text-sm font-medium whitespace-nowrap">
                      <FileText className="h-4 w-4 inline mr-1" />
                      Note:
                    </Label>
                    <Input
                      placeholder="Add note (e.g., Pico Fall Details, Alterations, etc.)"
                      value={saleNotes}
                      onChange={(e) => setSaleNotes(e.target.value)}
                      className="flex-1 h-9"
                    />
                  </div>
                </div>
                
                {/* Customer Discount & Points Section - After Notes */}
                {customerId && (() => {
                  const customer = customers?.find((c: any) => c.id === customerId);
                  const customerMasterDiscount = customer?.discount_percent || 0;
                  const hasDiscountInfo = (hasBrandDiscounts && brandDiscounts.length > 0) || customerMasterDiscount > 0;
                  const showPointsSection = isPointsEnabled;
                  
                  if (!hasDiscountInfo && !showPointsSection) return null;
                  
                  return (
                    <div className="min-w-[1200px] p-3 border-t bg-amber-50/50 dark:bg-amber-950/20 flex items-center gap-4">
                      {/* Discount Indicator */}
                      {hasBrandDiscounts && brandDiscounts.length > 0 ? (
                        <div className="flex items-center gap-2 bg-primary/5 px-3 py-2 rounded-lg">
                          <span className="text-sm text-muted-foreground font-medium">Brand Discounts:</span>
                          {brandDiscounts.slice(0, 5).map((bd, idx) => (
                            <span 
                              key={idx} 
                              className="text-sm bg-primary/10 text-primary px-2 py-1 rounded font-semibold"
                            >
                              {bd.brand}: {bd.discount_percent}%
                            </span>
                          ))}
                          {brandDiscounts.length > 5 && (
                            <span className="text-sm text-muted-foreground">+{brandDiscounts.length - 5} more</span>
                          )}
                        </div>
                      ) : customerMasterDiscount > 0 ? (
                        <div className="flex items-center gap-2 bg-green-500/10 px-3 py-2 rounded-lg">
                          <span className="text-sm text-muted-foreground font-medium">Master Discount:</span>
                          <span className="text-sm bg-green-500/20 text-green-600 px-2 py-1 rounded font-semibold">
                            {customerMasterDiscount}%
                          </span>
                        </div>
                      ) : null}
                      
                      {/* Points Display & Redeem */}
                      {showPointsSection && (
                        <div className="flex items-center gap-3 ml-auto">
                          <div className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-lg">
                            <Coins className="h-4 w-4" />
                            <span className="font-bold">{customerPointsData?.balance || 0} pts</span>
                            {items.length > 0 && (
                              <span className="text-amber-100 text-sm">+{calculatePoints(items.reduce((sum, item) => sum + item.netAmount, 0))}</span>
                            )}
                          </div>
                          
                          {/* Redeem Section */}
                          {isRedemptionEnabled && (customerPointsData?.balance || 0) >= (pointsSettings?.min_points_for_redemption || 10) && (
                            <div className="flex items-center bg-green-600 px-3 py-2 gap-2 rounded-lg">
                              <span className="text-white text-sm font-medium">Redeem:</span>
                              <Input 
                                type="number"
                                className="w-16 h-8 bg-white text-green-700 text-center text-sm font-semibold rounded border-0" 
                                value={pointsToRedeem || ""}
                                placeholder="0"
                                onChange={(e) => {
                                  const value = parseInt(e.target.value) || 0;
                                  const maxPoints = calculateMaxRedeemablePoints(totals.subtotal - flatDiscountAmount, customerPointsData?.balance || 0);
                                  setPointsToRedeem(Math.min(Math.max(0, value), maxPoints));
                                }}
                                min={0}
                                max={calculateMaxRedeemablePoints(totals.subtotal - flatDiscountAmount, customerPointsData?.balance || 0)}
                                disabled={!customerId}
                              />
                              <span className="text-white text-sm font-medium whitespace-nowrap">
                                pts = ₹{calculateRedemptionValue(pointsToRedeem).toFixed(0)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </Card>
          </div>
        </div>

        {/* Totals Section - Fixed at Bottom, above keyboard shortcut bar */}
        <div className="fixed bottom-0 md:bottom-[52px] left-[72px] right-0 bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-[0_-4px_20px_rgba(0,0,0,0.15)] z-20">
          {/* Top Info Bar — Qty, Savings, Charges, Discount with vertical dividers */}
          <div className="flex items-center px-4 py-1.5 gap-0 border-b border-white/10">
            {/* Qty */}
            <div className="text-center px-3">
              <div className="text-lg font-bold leading-tight">{totals.quantity}</div>
              <div className="text-[9px] text-white/60 uppercase tracking-wider font-medium">Qty</div>
            </div>
            
            <div className="w-px h-8 bg-white/20 shrink-0" />
            
            {/* MRP Total */}
            <div className="text-center px-3">
              <div className="text-sm font-bold leading-tight">₹{Math.round(totals.mrp).toLocaleString('en-IN')}</div>
              <div className="text-[9px] text-white/60 uppercase font-medium">MRP Total</div>
            </div>
            
            {/* Savings */}
            {(totals.mrp > totals.subtotal || totals.savings > 0) && (
              <>
                <div className="w-px h-8 bg-white/20 shrink-0" />
                <div className="text-center bg-green-500/90 rounded-md py-1 px-3 mx-2 shrink-0">
                  <div className="text-sm font-bold leading-tight">
                    ₹{Math.round(totals.mrp - totals.subtotal > 0 ? totals.mrp - totals.subtotal : totals.savings).toLocaleString('en-IN')} · Saves {totals.mrp > 0 ? `${(((totals.mrp - totals.subtotal) / totals.mrp) * 100).toFixed(0)}%` : ''}
                  </div>
                  <div className="text-[9px] font-medium uppercase">Savings</div>
                </div>
              </>
            )}
            
            <div className="w-px h-8 bg-white/20 shrink-0" />
            
            {/* Charges */}
            <div className="text-center px-3">
              <div className="text-sm font-bold leading-tight">₹0</div>
              <div className="text-[9px] text-white/60 uppercase font-medium">Charges</div>
            </div>
            
            <div className="w-px h-8 bg-white/20 shrink-0" />
            
            {/* Discount */}
            <div className="text-center px-3">
              <div className="text-sm font-bold leading-tight">₹{Math.round(totals.discount).toLocaleString('en-IN')}</div>
              <div className="text-[9px] text-white/60 uppercase font-medium">Discount</div>
            </div>
            
            {/* Spacer */}
            <div className="flex-1" />
            
            {/* Middle Fields — Flat Disc, S/R Adj, Round */}
            <div className="flex items-end gap-3">
              {/* Flat Disc */}
              <div className="text-center">
                <div className="text-[11px] text-white/80 uppercase font-bold mb-0.5 tracking-wide">Flat Disc</div>
                <div className="flex items-center">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="bg-white/20 text-white px-1.5 py-0.5 text-xs rounded-l-md h-7 hover:bg-white/30 border-0 font-bold min-w-[22px]"
                    onClick={() => setFlatDiscountMode(flatDiscountMode === 'percent' ? 'amount' : 'percent')}
                  >
                    {flatDiscountMode === 'percent' ? '%' : '₹'}
                  </Button>
                  <Input 
                    type="number"
                    className="w-20 h-7 bg-white text-foreground text-center text-sm font-semibold rounded-l-none border-0" 
                    value={flatDiscountValue || ""}
                    placeholder="0"
                    onChange={(e) => setFlatDiscountValue(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
              
              {/* S/R Adj */}
              <div className="text-center">
                <div className="text-[11px] text-white/80 uppercase font-bold mb-0.5 tracking-wide">
                  S/R Adj{customerId && pendingSaleReturnCredits.length > 0 ? ` (${pendingSaleReturnCredits.length})` : ''}
                </div>
                <div className="flex items-center">
                  <Input 
                    type="number"
                    className="w-20 h-7 bg-white text-foreground text-center text-sm font-semibold border-0 rounded-md" 
                    value={saleReturnAdjust || ""}
                    placeholder="0"
                    onChange={(e) => setSaleReturnAdjust(parseFloat(e.target.value) || 0)}
                    step="0.01"
                  />
                  {customerId && pendingSaleReturnCredits.length > 0 && (
                    <Popover open={showSRCreditDropdown} onOpenChange={setShowSRCreditDropdown}>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20 p-0 ml-0.5">
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2" align="center" side="top">
                        <div className="text-xs font-semibold text-muted-foreground mb-1.5">Pending Credit Notes</div>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {pendingSaleReturnCredits.map((sr) => (
                            <button
                              key={sr.id}
                              className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-accent text-sm text-left"
                              onClick={() => {
                                setSaleReturnAdjust(sr.net_amount);
                                setShowSRCreditDropdown(false);
                              }}
                            >
                              <span className="font-medium truncate">{sr.return_number || "S/R"}</span>
                              <Badge variant="secondary" className="ml-2 shrink-0">₹{sr.net_amount.toLocaleString('en-IN')}</Badge>
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>
              
              {/* Round */}
              <div className="text-center">
                <div className="text-[11px] text-white/80 uppercase font-bold mb-0.5 tracking-wide">
                  Round{isManualRoundOff && <span className="text-yellow-300 normal-case"> (M)</span>}
                </div>
                <div className="flex items-center gap-0.5">
                  {isManualRoundOff && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="bg-white/20 text-white px-1 py-0.5 text-xs rounded h-5 hover:bg-white/30"
                            onClick={handleResetRoundOff}
                          >
                            <RotateCcw className="h-2.5 w-2.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Reset to auto round-off</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <Input 
                    type="number"
                    className={`w-20 h-7 text-center text-sm font-semibold border-0 rounded-md ${roundOff >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                    value={roundOff || ""}
                    placeholder="0"
                    onChange={(e) => handleRoundOffChange(parseFloat(e.target.value) || 0)}
                    step="1"
                  />
                </div>
              </div>

              {/* Credit Applied */}
              {(availableCreditBalance > 0 || creditApplied > 0) && (
                <div className="text-center">
                  <div className="text-[11px] text-white/80 uppercase font-bold mb-0.5 tracking-wide">Cr ₹{availableCreditBalance.toFixed(0)}</div>
                  <Input 
                    type="number"
                    className="w-20 h-7 bg-purple-100 text-purple-700 text-center text-sm font-semibold border-0 rounded-md" 
                    value={creditApplied || ""}
                    placeholder="0"
                    onChange={(e) => {
                      const value = parseFloat(e.target.value) || 0;
                      const maxApplicable = Math.min(value, availableCreditBalance, amountBeforeCredit);
                      handleApplyCredit(maxApplicable > 0 ? maxApplicable : value);
                    }}
                    max={Math.min(availableCreditBalance, amountBeforeCredit)}
                    step="0.01"
                    disabled={!customerId || availableCreditBalance <= 0 || isApplyingCredit}
                  />
                </div>
              )}
            </div>
            
            <div className="w-px h-8 bg-white/20 mx-3 shrink-0" />
            
            {/* Right Summary — MRP (strikethrough), Net Amount, discount badge */}
            <div className="text-right min-w-[130px]">
              {totals.mrp > 0 && totals.mrp !== finalAmount && (
                <div className="text-[10px] text-white/50 line-through leading-tight">
                  MRP ₹{Math.round(totals.mrp).toLocaleString('en-IN')}
                </div>
              )}
              <div className="flex items-center justify-end gap-1">
                <span className="text-[10px] text-white/60 uppercase font-medium">Net Amount</span>
              </div>
              <Input 
                type="number"
                className={`w-full h-9 text-right text-xl font-black bg-white border-0 rounded-md shadow-sm tabular-nums ${finalAmount < 0 ? 'text-orange-600' : 'text-emerald-700'}`}
                value={Math.round(finalAmount)}
                onChange={(e) => handleFinalAmountChange(parseFloat(e.target.value) || 0)}
                step="1"
              />
              {effectiveDiscountPercent > 0 && (
                <div className="text-[10px] font-bold text-green-300 mt-0.5">
                  ↓ {effectiveDiscountPercent.toFixed(1)}% off
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Keyboard Shortcut Bar - Desktop only, redesigned with columns */}
        <div className="hidden md:flex fixed bottom-0 left-[72px] right-0 h-[52px] bg-slate-800 dark:bg-slate-950 text-white items-center justify-center gap-1 z-40 border-t border-slate-700/50 select-none px-2">
          {/* Payment methods - amber/yellow */}
          {[
            { key: 'F1', label: 'Cash' },
            { key: 'F2', label: 'UPI' },
            { key: 'F3', label: 'Card' },
            { key: 'F4', label: 'Credit' },
          ].map(({ key, label }) => (
            <div key={key} className="flex flex-col items-center justify-center px-3 py-1 rounded-md hover:bg-amber-600/20 cursor-pointer transition-colors min-w-[60px]">
              <kbd className="text-[10px] font-mono text-amber-400/80 font-bold leading-tight">{key}</kbd>
              <span className="text-[13px] font-extrabold text-amber-400 leading-tight">{label}</span>
            </div>
          ))}
          
          <div className="w-px h-7 bg-slate-600 mx-1 shrink-0" />
          
          {/* Actions - blue */}
          {[
            { key: 'F5', label: 'Return' },
            { key: 'F6', label: 'Mix Pay' },
            { key: 'F7', label: 'Hold' },
          ].map(({ key, label }) => (
            <div key={key} className="flex flex-col items-center justify-center px-3 py-1 rounded-md hover:bg-blue-600/20 cursor-pointer transition-colors min-w-[60px]">
              <kbd className="text-[10px] font-mono text-blue-400/80 font-bold leading-tight">{key}</kbd>
              <span className="text-[13px] font-extrabold text-blue-400 leading-tight">{label}</span>
            </div>
          ))}
          
          <div className="w-px h-7 bg-slate-600 mx-1 shrink-0" />
          
          {/* Reports/actions - blue */}
          {[
            { key: 'F8', label: 'Report' },
            { key: 'F9', label: 'Estimate' },
          ].map(({ key, label }) => (
            <div key={key} className="flex flex-col items-center justify-center px-3 py-1 rounded-md hover:bg-blue-600/20 cursor-pointer transition-colors min-w-[60px]">
              <kbd className="text-[10px] font-mono text-blue-400/80 font-bold leading-tight">{key}</kbd>
              <span className="text-[13px] font-extrabold text-blue-400 leading-tight">{label}</span>
            </div>
          ))}
          
          <div className="w-px h-7 bg-slate-600 mx-1 shrink-0" />
          
          {/* Clear - red */}
          <div className="flex flex-col items-center justify-center px-3 py-1 rounded-md hover:bg-red-600/20 cursor-pointer transition-colors min-w-[60px]">
            <kbd className="text-[10px] font-mono text-red-400/80 font-bold leading-tight">ESC</kbd>
            <span className="text-[13px] font-extrabold text-red-400 leading-tight">Clear</span>
          </div>
          
          {/* Print - white/neutral */}
          <div className="flex flex-col items-center justify-center px-3 py-1 rounded-md hover:bg-slate-600/40 cursor-pointer transition-colors min-w-[60px]">
            <kbd className="text-[10px] font-mono text-slate-400/80 font-bold leading-tight">CTRL+P</kbd>
            <span className="text-[13px] font-extrabold text-slate-300 leading-tight">Print</span>
          </div>
        </div>
        </div>

        {/* Print Dialog */}
        <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
          <DialogContent className="max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Invoice Preview</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <InvoiceWrapper
                ref={printRef}
                billNo={currentInvoiceNumber || "DRAFT"}
                date={new Date()}
                customerName={customerName}
                customerAddress={customers.find(c => c.id === customerId)?.address || ""}
                customerMobile={customerPhone}
                customerGSTIN={customers.find(c => c.id === customerId)?.gst_number || ""}
                items={items.map((item, index) => ({
                  sr: index + 1,
                  particulars: item.productName,
                  size: item.size,
                  barcode: item.barcode,
                  hsn: item.hsnCode || "",
                  sp: item.unitCost,
                  mrp: item.originalMrp || item.mrp,
                  qty: item.quantity,
                  rate: item.unitCost,
                  total: item.netAmount,
                  gstPercent: item.gstPer || 0,
                  discountPercent: item.discountPercent || 0,
                }))}
                subTotal={totals.subtotal}
                discount={totals.discount + flatDiscountAmount}
                saleReturnAdjust={saleReturnAdjust}
                grandTotal={finalAmount}
                cashPaid={paymentMethod === 'cash' ? finalAmount : 0}
                upiPaid={paymentMethod === 'upi' ? finalAmount : 0}
                paymentMethod={paymentMethod}
                cashAmount={savedInvoiceData?.cashAmount || 0}
                upiAmount={savedInvoiceData?.upiAmount || 0}
                cardAmount={savedInvoiceData?.cardAmount || 0}
                creditAmount={savedInvoiceData?.creditAmount || 0}
                paidAmount={paymentMethod === 'pay_later' ? 0 : finalAmount}
                previousBalance={customerBalance || 0}
                roundOff={roundOff}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowPrintDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handlePrintInvoice} className="bg-primary">
                  <Printer className="mr-2 h-4 w-4" />
                  Download Invoice PDF
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Customer Dialog */}
        <Dialog open={showAddCustomerDialog} onOpenChange={setShowAddCustomerDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Customer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Mobile Number *</Label>
                <Input
                  id="phone"
                  value={newCustomerForm.phone}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                  placeholder="Enter mobile number"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer_name">Customer Name</Label>
                <Input
                  id="customer_name"
                  value={newCustomerForm.customer_name}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, customer_name: e.target.value })}
                  placeholder="Enter customer name (optional)"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={newCustomerForm.email}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                  placeholder="Enter email address"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  value={newCustomerForm.address}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, address: e.target.value })}
                  placeholder="Enter address"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gst_number">GST Number</Label>
                <Input
                  id="gst_number"
                  value={newCustomerForm.gst_number}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, gst_number: e.target.value })}
                  placeholder="Enter GST number"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowAddCustomerDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => createCustomer.mutate(newCustomerForm)}
                disabled={!newCustomerForm.phone || createCustomer.isPending}
              >
                {createCustomer.isPending ? "Adding..." : "Add Customer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Print Confirmation Dialog */}
        <AlertDialog open={showPrintConfirmDialog} onOpenChange={setShowPrintConfirmDialog}>
          <AlertDialogContent className="sm:max-w-md" onOpenAutoFocus={(e) => { e.preventDefault(); setTimeout(() => printBtnRef.current?.focus(), 50); }}>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" />
                Invoice Saved!
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div>
                  <p>Invoice {savedInvoiceData?.invoiceNumber} has been saved successfully.</p>
                  {savedInvoiceData?.notes && (
                    <div className="mt-2 p-2 bg-amber-50 rounded-md border border-amber-200">
                      <span className="font-medium text-amber-800">Note:</span>{' '}
                      <span className="text-amber-700">{savedInvoiceData.notes}</span>
                    </div>
                  )}
                  <p className="mt-2">What would you like to do next?</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex flex-col gap-3 py-4">
              <Button 
                ref={printBtnRef}
                onClick={handlePrintFromDialog}
                className="w-full flex items-center justify-center gap-2"
              >
                <Printer className="h-4 w-4" />
                Print Invoice
              </Button>
              {savedInvoiceData?.customerPhone && (
                <Button 
                  variant="outline"
                  onClick={() => handleWhatsAppShare(false)}
                  className="w-full flex items-center justify-center gap-2 text-green-600 border-green-600 hover:bg-green-50 hover:text-green-700"
                >
                  <MessageCircle className="h-4 w-4" />
                  Send via WhatsApp
                </Button>
              )}
              {!savedInvoiceData?.customerPhone && (
                <p className="text-xs text-muted-foreground text-center">
                  Add customer phone number to enable WhatsApp sharing
                </p>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleClosePrintConfirmDialog}>
                Done
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Print Preview Dialog */}
        {savedInvoiceData && (
          <PrintPreviewDialog
            open={showPrintPreview}
            onOpenChange={(open) => {
              setShowPrintPreview(open);
              if (!open) {
                handleClosePrintConfirmDialog();
              }
            }}
            defaultFormat={posBillFormat || 'thermal'}
            renderInvoice={(format) => (
              <InvoiceWrapper
                format={format}
                billNo={savedInvoiceData.invoiceNumber}
                date={new Date()}
                customerName={savedInvoiceData.customerName || "Walk-in Customer"}
                customerAddress=""
                customerMobile={savedInvoiceData.customerPhone || ""}
                template={posInvoiceTemplate}
              items={savedInvoiceData.items.map((item: any, index: number) => ({
                sr: index + 1,
                particulars: item.productName,
                size: item.size,
                barcode: item.barcode || "",
                hsn: item.hsnCode || "",
                color: item.color || "",
                sp: item.unitCost,
                mrp: item.originalMrp || item.mrp,
                qty: item.quantity,
                rate: item.unitCost,
                total: item.netAmount,
                gstPercent: item.gstPer || 0,
                discountPercent: item.discountPercent || 0,
              }))}
                subTotal={savedInvoiceData.totals.subtotal}
                discount={savedInvoiceData.totals.discount + savedInvoiceData.flatDiscountAmount}
                saleReturnAdjust={savedInvoiceData.saleReturnAdjust || 0}
                grandTotal={savedInvoiceData.finalAmount}
                cashPaid={savedInvoiceData.method === 'cash' ? savedInvoiceData.finalAmount : 0}
                upiPaid={savedInvoiceData.method === 'upi' ? savedInvoiceData.finalAmount : 0}
                paymentMethod={savedInvoiceData.method}
                cashAmount={savedInvoiceData.cashAmount || 0}
                upiAmount={savedInvoiceData.upiAmount || 0}
                cardAmount={savedInvoiceData.cardAmount || 0}
                creditAmount={savedInvoiceData.creditAmount || 0}
                notes={savedInvoiceData.notes}
                paidAmount={savedInvoiceData.paidAmount ?? savedInvoiceData.finalAmount}
                previousBalance={savedInvoiceData.previousBalance ?? 0}
                roundOff={savedInvoiceData.roundOff ?? 0}
              />
            )}
            onPrint={handleClosePrintConfirmDialog}
          />
        )}

        {/* Hidden Invoice for Printing */}
        <div style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0,
          width: posBillFormat === 'a4' ? '210mm' : 
                 posBillFormat === 'a5-horizontal' ? '210mm' : 
                 posBillFormat === 'thermal' ? '80mm' : '148mm',
          minHeight: posBillFormat === 'a4' ? '297mm' : 
                     posBillFormat === 'a5-horizontal' ? '148mm' : 
                     posBillFormat === 'thermal' ? 'auto' : '210mm',
          maxHeight: posBillFormat === 'thermal' ? 'none' : 
                     posBillFormat === 'a4' ? '297mm' : 
                     posBillFormat === 'a5-horizontal' ? '148mm' : '210mm',
          opacity: 0, 
          pointerEvents: 'none',
          zIndex: -9999,
          overflow: 'hidden'
        }}>
          {(items.length > 0 || savedInvoiceData) && (
            <div ref={invoicePrintRef} style={{ position: 'relative' }}>
              {savedInvoiceData?.isEstimate && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%) rotate(-30deg)',
                  fontSize: posBillFormat === 'thermal' ? '28px' : '60px',
                  fontWeight: 'bold',
                  color: 'rgba(0, 0, 0, 0.08)',
                  letterSpacing: '8px',
                  pointerEvents: 'none',
                  zIndex: 10,
                  whiteSpace: 'nowrap',
                }}>
                  ESTIMATE
                </div>
              )}
              <InvoiceWrapper
                format={posBillFormat}
                billNo={savedInvoiceData?.invoiceNumber || currentInvoiceNumber || nextInvoicePreview || "DRAFT"}
                date={new Date()}
                customerName={savedInvoiceData?.customerName || customerName || "Walk-in Customer"}
                customerAddress=""
                customerMobile={savedInvoiceData?.customerPhone || customerPhone || ""}
                template={posInvoiceTemplate}
                items={savedInvoiceData ? savedInvoiceData.items.map((item: any, index: number) => ({
                  sr: index + 1,
                  particulars: item.productName,
                  size: item.size,
                  barcode: item.barcode || "",
                  hsn: item.hsnCode || "",
                  color: item.color || "",
                  sp: item.unitCost,
                  mrp: item.originalMrp || item.mrp,
                  qty: item.quantity,
                  rate: item.unitCost,
                  total: item.netAmount,
                  gstPercent: item.gstPer || 0,
                  discountPercent: item.discountPercent || 0,
                })) : items.map((item, index) => ({
                  sr: index + 1,
                  particulars: item.productName,
                  size: item.size,
                  barcode: item.barcode || "",
                  hsn: item.hsnCode || "",
                  color: item.color || "",
                  sp: item.unitCost,
                  mrp: item.originalMrp || item.mrp,
                  qty: item.quantity,
                  rate: item.unitCost,
                  total: item.netAmount,
                  gstPercent: item.gstPer || 0,
                  discountPercent: item.discountPercent || 0,
                }))}
                subTotal={savedInvoiceData?.totals.subtotal || totals.subtotal}
                discount={savedInvoiceData ? (savedInvoiceData.totals.discount + savedInvoiceData.flatDiscountAmount) : (totals.discount + flatDiscountAmount)}
                saleReturnAdjust={savedInvoiceData?.saleReturnAdjust || saleReturnAdjust || 0}
                grandTotal={savedInvoiceData?.finalAmount || finalAmount}
                cashPaid={savedInvoiceData?.method === 'cash' ? savedInvoiceData.finalAmount : paymentMethod === 'cash' ? finalAmount : 0}
                upiPaid={savedInvoiceData?.method === 'upi' ? savedInvoiceData.finalAmount : paymentMethod === 'upi' ? finalAmount : 0}
                paymentMethod={savedInvoiceData?.method || paymentMethod}
                cashAmount={savedInvoiceData?.cashAmount || 0}
                upiAmount={savedInvoiceData?.upiAmount || 0}
                cardAmount={savedInvoiceData?.cardAmount || 0}
                creditAmount={savedInvoiceData?.creditAmount || 0}
                notes={savedInvoiceData?.isEstimate ? `** ESTIMATE - NOT A FINAL INVOICE **${savedInvoiceData?.notes ? '\n' + savedInvoiceData.notes : ''}` : (savedInvoiceData?.notes || saleNotes)}
                paidAmount={savedInvoiceData?.paidAmount ?? (paymentMethod === 'pay_later' ? 0 : finalAmount)}
                previousBalance={savedInvoiceData?.previousBalance ?? customerBalance ?? 0}
                roundOff={savedInvoiceData?.roundOff ?? roundOff}
              />
            </div>
          )}
        </div>

        {/* Mix Payment Dialog */}
        <MixPaymentDialog
          open={showMixPaymentDialog}
          onOpenChange={setShowMixPaymentDialog}
          billAmount={finalAmount}
          creditApplied={creditApplied}
          onSave={handleMixPaymentSave}
        />

        {/* Credit Note Dialog */}
        <Dialog open={showCreditNoteDialog} onOpenChange={setShowCreditNoteDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-purple-600">Credit Note Issued</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-4">
              {creditNoteData && (
                <div className="bg-purple-50 p-4 rounded-lg text-center">
                  <p className="text-sm text-gray-600">Credit Note Number</p>
                  <p className="text-lg font-bold text-purple-700">{creditNoteData.credit_note_number}</p>
                  <p className="text-2xl font-bold text-purple-700 mt-2">₹{creditNoteData.credit_amount?.toFixed(2)}</p>
                  <p className="text-sm text-gray-600 mt-2">Customer: {creditNoteData.customer_name}</p>
                </div>
              )}
              <Button 
                onClick={() => {
                  if (creditNotePrintRef.current) {
                    const printWindow = window.open('', '_blank');
                    if (printWindow) {
                      printWindow.document.write('<html><head><title>Credit Note</title>');
                      printWindow.document.write('<style>body{margin:0;padding:20px;font-family:Arial,sans-serif;}</style>');
                      printWindow.document.write('</head><body>');
                      printWindow.document.write(creditNotePrintRef.current.innerHTML);
                      printWindow.document.write('</body></html>');
                      printWindow.document.close();
                      printWindow.print();
                    }
                  }
                }}
                className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700"
              >
                <Printer className="h-4 w-4" />
                Print Credit Note
              </Button>
              {creditNoteData?.customer_phone && (
                <Button 
                  variant="outline"
                  onClick={() => {
                    const message = `*CREDIT NOTE ISSUED*\n\nC/Note No: ${creditNoteData.credit_note_number}\nDate: ${format(new Date(), 'dd/MM/yyyy')}\n\nCustomer: ${creditNoteData.customer_name}\nCredit Amount: ₹${creditNoteData.credit_amount?.toFixed(2)}\n\nThis credit can be used for your next purchase.\n\nThank you for your business!`;
                    sendWhatsApp(creditNoteData.customer_phone, message);
                  }}
                  className="w-full flex items-center justify-center gap-2 text-green-600 border-green-600 hover:bg-green-50 hover:text-green-700"
                >
                  <MessageCircle className="h-4 w-4" />
                  Send via WhatsApp
                </Button>
              )}
            </div>
            <div className="flex justify-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowCreditNoteDialog(false);
                  setCreditNoteData(null);
                  // Clear cart
                  setItems([]);
                  setCustomerId("");
                  setCustomerName("");
                  setCustomerPhone("");
                  setFlatDiscountValue(0);
                  setFlatDiscountMode('percent');
                  setSaleReturnAdjust(0);
                  setRoundOff(0);
                  setSearchInput("");
                }}
              >
                Done
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Price Selection Dialog */}
        {pendingPriceSelection && (
          <PriceSelectionDialog
            open={showPriceSelectionDialog}
            onOpenChange={(open) => {
              setShowPriceSelectionDialog(open);
              if (!open) setPendingPriceSelection(null);
            }}
            productName={pendingPriceSelection.product.product_name}
            size={pendingPriceSelection.variant.size}
            masterPrice={pendingPriceSelection.masterPrice}
            lastPurchasePrice={pendingPriceSelection.lastPurchasePrice}
            onSelect={handlePriceSelection}
          />
        )}

        {/* Hidden Credit Note for Printing */}
        {creditNoteData && (
          <div style={{ position: 'fixed', top: 0, left: 0, opacity: 0, pointerEvents: 'none', zIndex: -9999 }}>
            <CreditNotePrint 
              ref={creditNotePrintRef}
              creditNote={creditNoteData}
              settings={null}
            />
          </div>
        )}

        {/* Stock Not Available Dialog */}
        <AlertDialog open={showStockNotAvailableDialog} onOpenChange={setShowStockNotAvailableDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Stock Not Available</AlertDialogTitle>
              <AlertDialogDescription>
                {stockNotAvailableMessage}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              {outOfStockProduct && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowStockNotAvailableDialog(false);
                    setShowOutOfStockHistory(true);
                  }}
                >
                  <History className="h-4 w-4 mr-1" />
                  View History
                </Button>
              )}
              <AlertDialogAction onClick={() => {
                setShowStockNotAvailableDialog(false);
                setOutOfStockProduct(null);
                barcodeInputRef.current?.focus();
              }}>
                OK
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Floating Reports */}
        <FloatingPOSReports
          showCashierReport={showFloatingCashierReport}
          onCloseCashierReport={() => setShowFloatingCashierReport(false)}
          showStockReport={showFloatingStockReport}
          onCloseStockReport={() => setShowFloatingStockReport(false)}
        />

        {/* Floating Sale Return */}
        <FloatingSaleReturn
          open={showFloatingSaleReturn}
          onOpenChange={setShowFloatingSaleReturn}
          organizationId={currentOrganization?.id || ""}
          customerId={customerId}
          customerName={customerName || undefined}
          onReturnSaved={(amount, returnNumber) => {
            setSaleReturnAdjust(amount);
            toast({ title: "Sale Return Applied", description: `Return ${returnNumber} — ₹${Math.round(amount)} adjusted` });
          }}
        />

        {/* Quick Service Product Dialog */}
        <QuickServiceProductDialog
          open={showQuickServiceDialog}
          onOpenChange={setShowQuickServiceDialog}
          serviceCode={quickServiceCode}
          onAdd={handleQuickServiceAdd}
        />

        {/* Out-of-Stock Product History Dialog */}
        {outOfStockProduct && (
          <ProductHistoryDialog
            isOpen={showOutOfStockHistory}
            onClose={() => {
              setShowOutOfStockHistory(false);
              setOutOfStockProduct(null);
              barcodeInputRef.current?.focus();
            }}
            productId={outOfStockProduct.productId}
            productName={outOfStockProduct.productName}
            organizationId={currentOrganization?.id || ""}
          />
        )}

      </div>

      {/* DC Sale Transfer Dialog */}
      <DcSaleTransferDialog
        open={showDcTransferDialog}
        onOpenChange={setShowDcTransferDialog}
        saleId={dcTransferSaleId}
        customerId={customerId || null}
        customerName={customerName || "Walk-in"}
        dcItems={dcTransferItems}
      />

      {/* Financer / EMI Floating Dialog (Mobile ERP) */}
      <Dialog open={showFinancerDialog} onOpenChange={setShowFinancerDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Financer / EMI Details
            </DialogTitle>
          </DialogHeader>
          <FinancerDetailsForm
            value={financerDetails}
            onChange={(details) => setFinancerDetails(details)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowFinancerDialog(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
