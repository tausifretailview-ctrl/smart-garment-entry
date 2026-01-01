import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { usePOS } from "@/contexts/POSContext";
import { useCustomerBalance } from "@/hooks/useCustomerBalance";
import { useCustomerSearch, useCustomerBalances } from "@/hooks/useCustomerSearch";
import { useCreditNotes } from "@/hooks/useCreditNotes";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Scan, X, Plus, Trash2, Banknote, CreditCard, Smartphone, Printer, ChevronLeft, ChevronRight, FileText, RotateCcw, Check, UserPlus, MessageCircle, Link2, Wallet, IndianRupee, ArrowUp, Pause, Loader2, AlertCircle, Clock, Coins } from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { useSaveSale } from "@/hooks/useSaveSale";
import { useStockValidation } from "@/hooks/useStockValidation";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { useCustomerPoints, useCustomerPointsBalance } from "@/hooks/useCustomerPoints";
import { useCustomerBrandDiscounts } from "@/hooks/useCustomerBrandDiscounts";
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
import { printInvoicePDF, generateInvoiceFromHTML, printInvoiceDirectly, printA5BillFormat } from "@/utils/pdfGenerator";
import { format } from "date-fns";
import { useReactToPrint } from "react-to-print";

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
}

export default function POSSales() {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { setOnNewSale, setOnClearCart, setHasItems } = usePOS();
  const { saveSale, updateSale, holdSale, resumeHeldSale, isSaving } = useSaveSale();
  const { createCreditNote, getAvailableCreditBalance, applyCredit, isCreating: isCreatingCreditNote, isApplying: isApplyingCredit } = useCreditNotes();
  const [isHeldSale, setIsHeldSale] = useState(false);
  const [availableCreditBalance, setAvailableCreditBalance] = useState(0);
  const [creditApplied, setCreditApplied] = useState(0);
  const { checkStock, validateCartStock, showStockError, showMultipleStockErrors } = useStockValidation();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [customerId, setCustomerId] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [searchInput, setSearchInput] = useState("");
  
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
  const [items, setItems] = useState<CartItem[]>([]);
  const [flatDiscountValue, setFlatDiscountValue] = useState(0);
  const [flatDiscountMode, setFlatDiscountMode] = useState<'percent' | 'amount'>('percent');
  const [saleReturnAdjust, setSaleReturnAdjust] = useState(0);
  const [roundOff, setRoundOff] = useState(0);
  const [isManualRoundOff, setIsManualRoundOff] = useState(false);
  const [currentInvoiceIndex, setCurrentInvoiceIndex] = useState(0);
  const [openProductSearch, setOpenProductSearch] = useState(false);
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
  const [saleNotes, setSaleNotes] = useState("");
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
      setFlatDiscountValue(sale.flat_discount_percent);
      setFlatDiscountMode('percent');
      setSaleReturnAdjust(sale.sale_return_adjust || 0);
      setRoundOff(sale.round_off);
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

        toast({
          title: "Invoice Loaded",
          description: `Invoice ${sale.sale_number} loaded for editing`,
        });
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

  // Fetch settings to apply defaults
  const { data: settingsData } = useQuery({
    queryKey: ['pos-settings', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;
      const { data, error } = await supabase
        .from('settings' as any)
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Keyboard shortcuts for POS actions
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // F1 - Cash Payment (Save & Print)
      if (e.key === 'F1') {
        e.preventDefault();
        handlePaymentAndPrint('cash');
      }
      // F2 - Card Payment (Save & Print)
      else if (e.key === 'F2') {
        e.preventDefault();
        handlePaymentAndPrint('card');
      }
      // F3 - UPI Payment (Save & Print)
      else if (e.key === 'F3') {
        e.preventDefault();
        handlePaymentAndPrint('upi');
      }
      // F4 - Mix Payment
      else if (e.key === 'F4') {
        e.preventDefault();
        handleMixPayment();
      }
      // F5 - Hold Bill
      else if (e.key === 'F5') {
        e.preventDefault();
        handleHoldBill();
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
  }, [items, customerName, flatDiscountValue, roundOff, paymentMethod, savedInvoiceData]);

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

    return () => {
      setOnNewSale(null);
      setOnClearCart(null);
    };
  }, [setOnNewSale, setOnClearCart, toast]);

  // Update hasItems in header
  useEffect(() => {
    setHasItems(items.length > 0);
  }, [items.length, setHasItems]);

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
        .select(`
          *,
          sale_items (*)
        `)
        .eq('organization_id', currentOrganization.id)
        .gte('sale_date', today.toISOString())
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
    staleTime: 10000, // Cache for 10 seconds
    refetchInterval: 30000, // Auto-refetch every 30 seconds
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


  const { data: productsData } = useQuery({
    queryKey: ['pos-products', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select(`
          *,
          product_variants (
            *,
            batch_stock (
              bill_number,
              quantity,
              purchase_date
            )
          )
        `)
        .eq('organization_id', currentOrganization.id)
        .eq('status', 'active');
      
      if (productsError) throw productsError;
      
      // Filter products: service/combo always shown, goods only with available stock
      return products?.filter((product: any) => {
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
    staleTime: 30000, // Cache for 30 seconds
    refetchInterval: 60000, // Auto-refetch every 60 seconds
  });

  // Use reliable customer search hook - pass customerName directly as search term
  const { 
    customers = [], 
    filteredCustomers,
    isLoading: isCustomersLoading,
    isError: isCustomersError,
    refetch: refetchCustomers,
  } = useCustomerSearch(customerName);
  
  const { getCustomerBalance } = useCustomerBalances();

  // Fetch credit balance when customer changes
  useEffect(() => {
    const fetchCreditBalance = async () => {
      if (customerId) {
        const balance = await getAvailableCreditBalance(customerId);
        setAvailableCreditBalance(balance);
      } else {
        setAvailableCreditBalance(0);
        setCreditApplied(0);
      }
    };
    fetchCreditBalance();
  }, [customerId]);

  // Mutually exclusive discount: Apply customer master discount ONLY if no brand discounts exist
  useEffect(() => {
    if (customerId && customers) {
      const customer = customers.find((c: any) => c.id === customerId);
      if (customer && !hasBrandDiscounts) {
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

  // Handle barcode/product search on Enter
  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchInput.trim()) {
      searchAndAddProduct(searchInput.trim());
    }
  };

  const searchAndAddProduct = (searchTerm: string) => {
    if (!productsData) return;

    // Search by barcode or product name
    let foundVariant: any = null;
    let foundProduct: any = null;

    for (const product of productsData) {
      // Check variants for barcode match
      const variantMatch = product.product_variants?.find((v: any) => 
        v.barcode?.toLowerCase() === searchTerm.toLowerCase()
      );
      
      if (variantMatch) {
        foundVariant = variantMatch;
        foundProduct = product;
        break;
      }

      // Check product name match
      if (product.product_name.toLowerCase().includes(searchTerm.toLowerCase())) {
        // Get first available variant
        foundVariant = product.product_variants?.[0];
        foundProduct = product;
        break;
      }
    }

    if (foundVariant && foundProduct) {
      addItemToCart(foundProduct, foundVariant);
      setSearchInput("");
    } else {
      toast({
        title: "Product not found",
        description: "No product matches your search.",
        variant: "destructive",
      });
    }
  };

  const addItemToCart = async (product: any, variant: any, overridePrice?: { sale_price: number; mrp: number }) => {
    const existingItemIndex = items.findIndex(item => item.barcode === variant.barcode);
    
    if (existingItemIndex >= 0) {
      // Real-time stock validation before incrementing
      const newQty = items[existingItemIndex].quantity + 1;
      const stockCheck = await checkStock(variant.id, newQty);
      
      if (!stockCheck.isAvailable) {
        showStockError(
          stockCheck.productName,
          stockCheck.size,
          newQty,
          stockCheck.availableStock
        );
        return;
      }
      
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
        showStockError(
          stockCheck.productName,
          stockCheck.size,
          1,
          stockCheck.availableStock
        );
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
      if (product.color) extraParts.push(product.color);
      
      if (extraParts.length > 0) {
        description += ',' + extraParts.join('-');
      }
      
      // Ensure displayMrp is never 0 - always fall back to salePrice
      const displayMrp = (mrpToUse && mrpToUse > 0) ? (mrpToUse > salePrice ? mrpToUse : salePrice) : salePrice;
      
      // Mutually exclusive discount logic:
      // Only apply brand discount if customer has NO master discount
      // If customer has master discount, it's applied as flat discount instead
      const customer = customers?.find((c: any) => c.id === customerId);
      const customerHasMasterDiscount = customer?.discount_percent && customer.discount_percent > 0;
      const brandDiscount = customerHasMasterDiscount ? 0 : getBrandDiscount(product.brand);
      const discountPercent = brandDiscount > 0 ? brandDiscount : 0;
      const discountAmount = 0;
      
      const newItem: CartItem = {
        id: variant.id,
        barcode: variant.barcode || '',
        productName: description,
        size: variant.size,
        color: variant.color || product.color || '',
        quantity: 1,
        mrp: displayMrp,
        originalMrp: mrpToUse,
        gstPer: product.gst_per || 0,
        discountPercent,
        discountAmount,
        unitCost: salePrice,
        netAmount: displayMrp - (displayMrp * discountPercent / 100),
        productId: product.id,
        variantId: variant.id,
        hsnCode: product.hsn_code || '',
      };
      setItems(prev => [...prev, newItem]);
      
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
  
  const amountBeforeCredit = totals.subtotal - flatDiscountAmount - saleReturnAdjust + roundOff;
  const finalAmount = amountBeforeCredit - creditApplied;
  
  // Calculate effective discount percentage for customer display (after final amount adjustment)
  const effectiveDiscountPercent = totals.mrp > 0 ? ((totals.mrp - finalAmount) / totals.mrp) * 100 : 0;

  // Handle applying credit from credit notes
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
    };

    // Use updateSale if editing existing sale, otherwise create new
    const result = currentSaleId 
      ? await updateSale(currentSaleId, saleData, forcePaymentMethod || paymentMethod)
      : await saveSale(saleData, forcePaymentMethod || paymentMethod);
    
    if (result) {
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
      // Store invoice number and sale ID for printing
      setCurrentInvoiceNumber(result.sale_number);
      const wasEditing = !!currentSaleId;
      setCurrentSaleId(result.id);
      
      // Refetch today's sales
      await queryClient.invalidateQueries({ queryKey: ['todays-sales', currentOrganization?.id] });
      
      toast({
        title: wasEditing ? "Sale Updated" : "Sale Saved",
        description: `Invoice ${result.sale_number} ${wasEditing ? 'updated' : 'saved'} with ${method.toUpperCase()} payment`,
      });
      
      // Apply credit if any
      if (creditApplied > 0 && customerId) {
        await applyCredit(customerId, creditApplied);
      }
      
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
        roundOff: roundOff,
        creditApplied: creditApplied,
        notes: saleNotes || null,
        paidAmount: method === 'pay_later' ? 0 : finalAmount,
        previousBalance: customerBalance || 0,
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
      setIsHeldSale(false);
      setPointsToRedeem(0);
      
      // Now show print dialog with saved data
      setSavedInvoiceData(invoiceDataForPrint);
      setShowPrintConfirmDialog(true);
      
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
    };

    const paymentMethodType = paymentData.refundAmount > 0 ? (paymentData.issueCreditNote ? 'credit_note' : 'refund') : 'multiple';
    
    // Use updateSale if editing existing sale, otherwise create new
    const result = currentSaleId 
      ? await updateSale(currentSaleId, saleData, paymentMethodType as any, paymentData)
      : await saveSale(saleData, paymentMethodType as any, paymentData);
    
    if (result) {
      // Store invoice number and sale ID for printing
      setCurrentInvoiceNumber(result.sale_number);
      const wasEditing = !!currentSaleId;
      setCurrentSaleId(result.id);
      
      // Refetch today's sales
      await queryClient.invalidateQueries({ queryKey: ['todays-sales', currentOrganization?.id] });
      
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
      
      // Apply credit if any (for non-credit note cases)
      if (!isCreditNote && creditApplied > 0 && customerId) {
        await applyCredit(customerId, creditApplied);
      }
      
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
        roundOff: roundOff,
        paymentBreakdown: paymentData,
        refundAmount: paymentData.refundAmount,
        creditApplied: creditApplied,
        notes: saleNotes || null,
        paidAmount: paymentData.totalPaid,
        previousBalance: customerBalance || 0,
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
          height: 100%;
          margin: 0;
          padding: 0;
          overflow: hidden;
        }
        * {
          page-break-after: avoid !important;
          page-break-inside: avoid !important;
        }
      }
    `;
  };

  const handlePrint = useReactToPrint({
    contentRef: invoicePrintRef,
    documentTitle: savedInvoiceData?.invoiceNumber || "Invoice",
    pageStyle: getPageStyle(),
    onAfterPrint: () => {
      toast({
        title: "Success",
        description: "Invoice printed successfully",
      });
    },
  });

  const handlePrintFromDialog = async () => {
    if (!savedInvoiceData) return;

    setShowPrintConfirmDialog(false);
    
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
    
    // Get payment breakdown from savedInvoiceData (already saved)
    const cashAmt = savedInvoiceData?.cashAmount || 0;
    const cardAmt = savedInvoiceData?.cardAmount || 0;
    const upiAmt = savedInvoiceData?.upiAmount || 0;
    
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
    const paymentBreakdown = paymentParts.length > 0 ? paymentParts.join(" | ") : (method || 'cash').toUpperCase();
    
    // Fetch customer outstanding if customer exists
    let outstandingText = '';
    if (custId) {
      const { data: customer } = await supabase
        .from('customers')
        .select('opening_balance')
        .eq('id', custId)
        .single();
      
      const openingBalance = customer?.opening_balance || 0;
      
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
    }
    
    const message = `*Invoice Details*\n\nInvoice No: ${invoiceNo}\nDate: ${format(new Date(), 'dd/MM/yyyy')}\nCustomer: ${name || 'Walk in Customer'}\n\n*Items:*\n${itemsList}\n\nGross Amount: ₹${(grossAmount || 0).toFixed(2)}\nDiscount: ₹${(discountAmount || 0).toFixed(2)}${srAdjust > 0 ? `\nS/R Adjust: -₹${srAdjust.toFixed(2)}` : ''}\nRound Off: ₹${(roundOffAmount || 0).toFixed(2)}\n*Net Amount: ₹${(totalAmount || 0).toFixed(2)}*\n\nPayment: ${paymentBreakdown}${outstandingText}${invoiceUrl ? `\n\n📄 View Invoice Online:\n${invoiceUrl}` : ''}\n\nThank you for your business!`;

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
    setFlatDiscountValue(Number(sale.flat_discount_percent) || 0);
    setFlatDiscountMode('percent');
    setSaleReturnAdjust(Number(sale.sale_return_adjust) || 0);
    setRoundOff(Number(sale.round_off) || 0);
    setCurrentSaleId(sale.id);
    setCurrentInvoiceNumber(sale.sale_number);

    // Set saved invoice data to enable print button
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
      flatDiscountAmount: (Number(sale.flat_discount_percent) / 100) * Number(sale.gross_amount),
      saleReturnAdjust: Number(sale.sale_return_adjust) || 0,
      finalAmount: Number(sale.net_amount),
      method: sale.payment_method,
      customerName: sale.customer_name,
      customerPhone: sale.customer_phone,
      paidAmount: Number(sale.paid_amount) || 0,
      previousBalance: 0, // Will be refreshed when customer balance hook updates
    });

    toast({
      title: "Invoice Loaded",
      description: `Invoice #${sale.sale_number} loaded successfully`,
    });
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

    if (!confirm("Are you sure you want to delete this invoice? This action cannot be undone.")) {
      return;
    }

    try {
      // First, delete all sale items
      const { error: itemsError } = await supabase
        .from("sale_items")
        .delete()
        .eq("sale_id", currentSaleId);

      if (itemsError) throw itemsError;

      // Then delete the sale
      const { error: saleError } = await supabase
        .from("sales")
        .delete()
        .eq("id", currentSaleId);

      if (saleError) throw saleError;

      toast({
        title: "Success",
        description: "Invoice deleted successfully",
      });

      setSavedInvoiceData(null);
      queryClient.invalidateQueries({ queryKey: ["today-sales"] });
      handleNewInvoice();
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
      
      toast({
        title: "Invoice Loaded",
        description: `Invoice ${sale.sale_number} loaded successfully`,
      });
    } catch (error: any) {
      toast({
        title: "Search Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handlePreviousInvoice = () => {
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
    loadInvoice(todaysSales[newIndex]);
  };

  const handleNextInvoice = () => {
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
    loadInvoice(todaysSales[newIndex]);
  };

  const handleLastInvoice = () => {
    if (!todaysSales || todaysSales.length === 0) {
      toast({
        title: "No Invoices",
        description: "No invoices found for today",
        variant: "destructive",
      });
      return;
    }

    setCurrentInvoiceIndex(0);
    loadInvoice(todaysSales[0]);
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
      
      // Refetch today's sales
      await queryClient.invalidateQueries({ queryKey: ['todays-sales', currentOrganization?.id] });
    }
  };

  const createCustomer = useMutation({
    mutationFn: async (data: typeof newCustomerForm) => {
      if (!currentOrganization?.id) throw new Error("No organization selected");
      // Use phone as customer name if name is empty
      const customerData = {
        ...data,
        customer_name: data.customer_name.trim() || data.phone,
        organization_id: currentOrganization.id
      };
      const { data: newCustomer, error } = await supabase.from("customers").insert([customerData]).select().single();
      if (error) throw error;
      return newCustomer;
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

  // Filter products based on search input
  const filteredProducts = productsData?.flatMap(product => 
    product.product_variants?.map((variant: any) => ({
      product,
      variant,
      searchText: `${product.product_name} ${variant.size} ${variant.barcode || ''} ${product.brand || ''} ${product.category || ''}`.toLowerCase()
    })).filter((item: any) => 
      item.searchText.includes(searchInput.toLowerCase())
    ) || []
  ) || [];

  return (
    <div className="min-h-screen w-full bg-background flex">
      {/* Left Action Button Bar */}
      <div className="w-20 bg-muted/50 dark:bg-gradient-to-b dark:from-primary/10 dark:to-secondary/10 border-r flex flex-col gap-2 p-2 pb-32 z-30 relative overflow-y-auto">
        {/* Buttons in sequence: Cash, UPI, Card, Credit, Mix, Hold, New, Last, Print, Clear, WhatsApp */}
        <div className="space-y-2">
          {/* 1. Cash */}
          <Button
            onClick={() => handlePaymentAndPrint('cash')}
            disabled={items.length === 0 || isSaving}
            className="h-14 flex flex-col items-center justify-center gap-1 text-xs relative w-full bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
            title="Cash Payment - Save & Print (F1)"
          >
            <Badge className="absolute top-1 right-1 h-4 px-1 text-[9px] bg-black/40 hover:bg-black/40">F1</Badge>
            <Banknote className="h-4 w-4" />
            <span>Cash</span>
          </Button>
          
          {/* 2. UPI */}
          <Button
            onClick={() => handlePaymentAndPrint('upi')}
            disabled={items.length === 0 || isSaving}
            className="h-14 flex flex-col items-center justify-center gap-1 text-xs relative w-full bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
            title="UPI Payment - Save & Print (F3)"
          >
            <Badge className="absolute top-1 right-1 h-4 px-1 text-[9px] bg-black/40 hover:bg-black/40">F3</Badge>
            <Smartphone className="h-4 w-4" />
            <span>UPI</span>
          </Button>
          
          {/* 3. Card */}
          <Button
            onClick={() => handlePaymentAndPrint('card')}
            disabled={items.length === 0 || isSaving}
            className="h-14 flex flex-col items-center justify-center gap-1 text-xs relative w-full bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
            title="Card Payment - Save & Print (F2)"
          >
            <Badge className="absolute top-1 right-1 h-4 px-1 text-[9px] bg-black/40 hover:bg-black/40">F2</Badge>
            <CreditCard className="h-4 w-4" />
            <span>Card</span>
          </Button>
          
          {/* 4. Credit */}
          <Button
            onClick={() => handlePaymentAndPrint('pay_later')}
            disabled={items.length === 0 || isSaving}
            className="h-14 flex flex-col items-center justify-center gap-1 text-xs relative w-full bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
            title="Credit - Pay Later"
          >
            <Clock className="h-4 w-4" />
            <span>Credit</span>
          </Button>
          
          {/* 5. Mix */}
          <Button
            onClick={handleMixPayment}
            disabled={items.length === 0 || isSaving}
            className="h-14 flex flex-col items-center justify-center gap-1 text-xs relative w-full bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
            title="Mix Payment - Save & Print (F4)"
          >
            <Badge className="absolute top-1 right-1 h-4 px-1 text-[9px] bg-black/40 hover:bg-black/40">F4</Badge>
            <Wallet className="h-4 w-4" />
            <span>Mix</span>
          </Button>
          
          {/* 6. Hold */}
          <Button
            onClick={handleHoldBill}
            disabled={items.length === 0 || isSaving || isHeldSale}
            className="h-14 flex flex-col items-center justify-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs disabled:opacity-50 w-full relative"
            title="Hold Bill (F5)"
          >
            <Badge className="absolute top-1 right-1 h-4 px-1 text-[9px] bg-black/40 hover:bg-black/40">F5</Badge>
            <Pause className="h-4 w-4" />
            <span>Hold</span>
          </Button>
          
          {/* 7. New */}
          <Button
            onClick={handleNewInvoice}
            className="h-14 flex flex-col items-center justify-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs w-full"
            title="New Invoice"
          >
            <FileText className="h-4 w-4" />
            <span>New</span>
          </Button>
          
          {/* 8. Last */}
          <Button
            onClick={handleLastInvoice}
            disabled={!todaysSales || todaysSales.length === 0}
            className="h-14 flex flex-col items-center justify-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs disabled:opacity-50 w-full"
            title="Last Invoice"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Last</span>
          </Button>
          
          {/* 9. Print */}
          <Button
            onClick={handlePrint}
            disabled={items.length === 0}
            className="h-14 flex flex-col items-center justify-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs disabled:opacity-50 w-full"
            title="Print"
          >
            <Printer className="h-4 w-4" />
            <span>Print</span>
          </Button>
          
          {/* 10. Clear */}
          <Button
            onClick={handleClearAll}
            className="h-14 flex flex-col items-center justify-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs relative w-full"
            title="Clear (Esc)"
          >
            <Badge className="absolute top-1 right-1 h-4 px-1 text-[9px] bg-black/40 hover:bg-black/40">ESC</Badge>
            <X className="h-4 w-4" />
            <span>Clear</span>
          </Button>
          
          {/* 11. WhatsApp */}
          <Button
            onClick={() => handleWhatsAppShare(true)}
            disabled={items.length === 0}
            className="h-14 flex flex-col items-center justify-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs disabled:opacity-50 w-full"
            title="Send via WhatsApp"
          >
            <MessageCircle className="h-4 w-4" />
            <span>WhatsApp</span>
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Sticky Header Section - Barcode scanning bar stays fixed */}
        <div className="sticky top-0 z-20 bg-background border-b shadow-sm px-2 md:px-4 py-2">
          <div className="max-w-[1800px] w-full pl-4">
            <div className="flex flex-wrap items-end gap-4">
          <Popover open={openProductSearch} onOpenChange={setOpenProductSearch}>
            <PopoverTrigger asChild>
              <div className="relative w-56">
                <Label className="text-sm font-medium mb-1 block">Barcode</Label>
                <Input
                  ref={barcodeInputRef}
                  placeholder="Scan Barcode/Enter Product Name"
                  value={searchInput}
                  onChange={(e) => {
                    setSearchInput(e.target.value);
                    setOpenProductSearch(true);
                  }}
                  onKeyDown={handleSearch}
                  className="h-12 text-lg pr-12"
                  autoFocus
                />
                <Scan className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground" />
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0 z-50" align="start">
              <Command>
                <CommandInput 
                  placeholder="Search by name, barcode, brand..." 
                  value={searchInput}
                  onValueChange={setSearchInput}
                />
                <CommandList>
                  <CommandEmpty>No products found.</CommandEmpty>
                  <CommandGroup heading="Products">
                    {filteredProducts.slice(0, 10).map((item: any, index: number) => {
                      const product = item.product;
                      const descriptionParts = [product.product_name];
                      if (product.category) descriptionParts.push(product.category);
                      if (product.style) descriptionParts.push(product.style);
                      
                      let displayName = descriptionParts.join('-');
                      
                      const extraParts = [];
                      if (product.brand) extraParts.push(product.brand);
                      if (product.color) extraParts.push(product.color);
                      
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
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          
          <Popover open={openCustomerSearch} onOpenChange={setOpenCustomerSearch}>
            <PopoverTrigger asChild>
              <div className="relative w-52">
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-sm font-medium">Customer Name</Label>
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
                    {/* Points Display */}
                    {isPointsEnabled && customerId && (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/30">
                        <Coins className="h-3 w-3" />
                        <span>{customerPointsData?.balance || 0} pts</span>
                        {items.length > 0 && (
                          <span className="text-green-600">+{calculatePoints(items.reduce((sum, item) => sum + item.netAmount, 0))}</span>
                        )}
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
                  className="h-12 text-lg pr-32"
                  placeholder="Enter customer name or phone"
                />
                {customerName && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute right-10 top-1/2 translate-y-0.5 h-9 w-9"
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
                  className="absolute right-2 top-1/2 translate-y-0.5 h-9 w-9"
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
                      <CommandGroup heading={`Customers (${customers?.length || 0})`}>
                        {filteredCustomers.map((customer: any) => {
                          const balance = getCustomerBalance(customer);
                          return (
                            <CommandItem
                              key={customer.id}
                              value={`${customer.customer_name} ${customer.phone || ''} ${customer.email || ''}`}
                            onSelect={() => {
                                setCustomerId(customer.id);
                                setCustomerName(customer.customer_name);
                                setCustomerPhone(customer.phone || "");
                                // Mutually exclusive discount logic:
                                // If customer has master discount AND no brand discounts, apply master discount
                                // If customer has brand discounts, those will be applied per-item instead
                                // Note: hasBrandDiscounts will update when customerId changes
                                setOpenCustomerSearch(false);
                              }}
                              className="cursor-pointer"
                            >
                              <Check className="mr-2 h-4 w-4 opacity-0" />
                              <div className="flex flex-col flex-1">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium">{customer.customer_name}</span>
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
          
          {/* Customer Discount Indicator */}
          {customerId && (() => {
            const customer = customers?.find((c: any) => c.id === customerId);
            const customerMasterDiscount = customer?.discount_percent || 0;
            return (
              <div className="flex items-center gap-1 self-end pb-3">
                {hasBrandDiscounts && brandDiscounts.length > 0 ? (
                  <>
                    <span className="text-xs text-muted-foreground">Brand:</span>
                    {brandDiscounts.slice(0, 3).map((bd, idx) => (
                      <span 
                        key={idx} 
                        className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium"
                      >
                        {bd.brand}: {bd.discount_percent}%
                      </span>
                    ))}
                    {brandDiscounts.length > 3 && (
                      <span className="text-xs text-muted-foreground">+{brandDiscounts.length - 3} more</span>
                    )}
                  </>
                ) : customerMasterDiscount > 0 ? (
                  <>
                    <span className="text-xs text-muted-foreground">Discount:</span>
                    <span className="text-xs bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded font-medium">
                      {customerMasterDiscount}%
                    </span>
                  </>
                ) : null}
              </div>
            );
          })()}
          
          {/* Salesperson Search - After Customer Name */}
          <Popover open={openSalesmanSearch} onOpenChange={setOpenSalesmanSearch}>
            <PopoverTrigger asChild>
              <div className="relative w-36">
                <Label className="text-sm font-medium mb-1 block">Salesperson</Label>
                <Input
                  value={selectedSalesman}
                  onChange={(e) => {
                    setSelectedSalesman(e.target.value);
                    setOpenSalesmanSearch(true);
                  }}
                  className="h-12 text-sm pr-8"
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
            <Label className="text-sm font-medium mb-1 block">Invoice No</Label>
            <Input
              value={currentInvoiceNumber || nextInvoicePreview || "NEW"}
              readOnly
              className="h-12 text-sm font-semibold text-center bg-gradient-to-r from-primary/10 to-secondary/10"
              placeholder="Invoice #"
            />
          </div>
          
          {/* Running Total Display */}
          <div className="h-12 bg-gradient-to-r from-green-600 to-emerald-600 rounded-md px-4 flex items-center justify-center min-w-[180px]">
            <div className="text-white font-bold text-xl">
              ₹{finalAmount.toFixed(2)}
            </div>
          </div>
              
              <div className="relative h-12 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-md px-4 flex items-center justify-center min-w-[100px]">
                <div className="text-white font-semibold text-base">
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
                        className="h-12"
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
                      <div className="h-12 px-3 bg-muted rounded-md flex flex-col items-center justify-center min-w-[60px] cursor-pointer" onClick={handleLastInvoice}>
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
                        className="h-12"
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
              
              {/* Date & Time Display */}
              <div className="relative h-12 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-md px-4 flex flex-col items-center justify-center">
                <div className="text-white font-semibold text-sm">
                  {currentDateTime.toLocaleDateString('en-GB')}
                </div>
                <div className="text-white text-xs">
                  {currentDateTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
            </div>
          </div>
        </div>

        {/* Items Table - Scrollable Section */}
        <div className="flex-1 overflow-hidden flex flex-col px-2 md:px-4 pb-36 mt-3">
          <div className="max-w-[1800px] w-full flex-1 flex flex-col overflow-hidden">
          <Card className="flex-1 overflow-hidden flex flex-col">
            <div className="bg-black text-white overflow-x-auto">
              <div className="min-w-[1200px] grid gap-3 p-4 text-base font-medium" style={{ gridTemplateColumns: '60px 140px 1fr 80px 70px 100px 60px 70px 80px 100px 130px' }}>
                <div>Sr No</div>
                <div>Barcode</div>
                <div>Product</div>
                <div>Size</div>
                <div>Qty</div>
                <div>MRP</div>
                <div>Tax%</div>
                <div>Disc%</div>
                <div>Disc Rs</div>
                <div>Unit Price</div>
                <div>Net Amount</div>
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
                  // Show 6 blank rows with serial numbers
                  Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="min-w-[1200px] grid gap-3 p-4 border-b text-base" style={{ gridTemplateColumns: '60px 140px 1fr 80px 70px 100px 60px 70px 80px 100px 130px' }}>
                      <div className="flex items-center text-muted-foreground">{index + 1}</div>
                      <div className="flex items-center text-muted-foreground">-</div>
                      <div className="flex items-center text-muted-foreground">-</div>
                      <div className="flex items-center text-muted-foreground">-</div>
                      <div className="flex items-center text-muted-foreground">-</div>
                      <div className="flex items-center text-muted-foreground">-</div>
                      <div className="flex items-center text-muted-foreground">-</div>
                      <div className="flex items-center text-muted-foreground">-</div>
                      <div className="flex items-center text-muted-foreground">-</div>
                      <div className="flex items-center text-muted-foreground">-</div>
                      <div className="flex items-center text-muted-foreground">-</div>
                    </div>
                  ))
                ) : (
                  items.map((item, index) => (
                    <div key={index} className="min-w-[1200px] grid gap-3 p-4 border-b hover:bg-muted/50 text-base" style={{ gridTemplateColumns: '60px 140px 1fr 80px 70px 100px 60px 70px 80px 100px 130px' }}>
                      <div className="flex items-center font-semibold">{index + 1}</div>
                      <div className="flex items-center text-sm">{item.barcode}</div>
                      <div className="flex items-center font-medium truncate">{item.productName}</div>
                      <div className="flex items-center text-sm font-medium">{item.size}</div>
                      <div>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)}
                          className="h-9 text-base w-full"
                          min="1"
                        />
                      </div>
                      <div>
                        <Input
                          type="number"
                          value={item.mrp}
                          onChange={(e) => updateMrp(index, parseFloat(e.target.value) || 0)}
                          className="h-9 text-base w-full"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <select
                          value={item.gstPer}
                          onChange={(e) => updateGstPer(index, parseInt(e.target.value))}
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-base focus:outline-none focus:ring-2 focus:ring-ring"
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
                          value={item.discountPercent}
                          onChange={(e) => updateDiscountPercent(index, parseFloat(e.target.value) || 0)}
                          className="h-9 text-base w-full"
                          min="0"
                          max="100"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <Input
                          type="number"
                          value={item.discountAmount}
                          onChange={(e) => updateDiscountAmount(index, parseFloat(e.target.value) || 0)}
                          className="h-9 text-base w-full"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div className="flex items-center">₹{item.unitCost.toFixed(2)}</div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">₹{item.netAmount.toFixed(2)}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeItem(index)}
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
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
              </div>
            </div>
          </Card>
          </div>
        </div>

        {/* Totals Section - Fixed at Bottom */}
        <div className="fixed bottom-0 left-20 right-0 bg-cyan-500 text-white p-2 md:p-4 shadow-lg z-20">
          <div className={`grid ${totals.savings > 0 || creditApplied > 0 || availableCreditBalance > 0 ? 'grid-cols-5 md:grid-cols-10' : 'grid-cols-4 md:grid-cols-8'} gap-1 md:gap-3`}>
            <div className="text-center">
              <div className="text-xl md:text-2xl font-bold">{totals.quantity}</div>
              <div className="text-xs md:text-sm mt-1">Quantity</div>
            </div>
            <div className="text-center">
              <div className="text-xl md:text-2xl font-bold">₹{totals.mrp.toFixed(2)}</div>
              <div className="text-xs md:text-sm mt-1">MRP</div>
            </div>
            {totals.savings > 0 && (
              <div className="text-center bg-green-600 rounded-md py-1">
                <div className="text-xl md:text-2xl font-bold">₹{totals.savings.toFixed(0)}</div>
                <div className="text-xs md:text-sm mt-1">You Save!</div>
              </div>
            )}
            <div className="text-center">
              <div className="text-xl md:text-2xl font-bold">₹0.00</div>
              <div className="text-xs md:text-sm mt-1">Add. Charges</div>
            </div>
            <div className="text-center">
              <div className="text-xl md:text-2xl font-bold">₹{totals.discount.toFixed(2)}</div>
              <div className="text-xs md:text-sm mt-1">Discount</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="bg-black text-white px-2 py-1 text-sm rounded h-8 hover:bg-gray-800"
                  onClick={() => setFlatDiscountMode(flatDiscountMode === 'percent' ? 'amount' : 'percent')}
                >
                  {flatDiscountMode === 'percent' ? '%' : '₹'}
                </Button>
                <Input 
                  type="number"
                  className="w-16 h-8 bg-white text-black text-center text-base font-semibold" 
                  value={flatDiscountValue}
                  onChange={(e) => setFlatDiscountValue(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="text-xs md:text-sm mt-1">Flat Discount</div>
            </div>
            <div className="text-center">
              <Input 
                type="number"
                className="w-20 h-8 bg-white text-black text-center text-base font-semibold mx-auto" 
                value={saleReturnAdjust}
                onChange={(e) => setSaleReturnAdjust(parseFloat(e.target.value) || 0)}
                step="0.01"
              />
              <div className="text-xs md:text-sm mt-1">S/R Adjust</div>
            </div>
            {/* Points Redemption Field */}
            {isRedemptionEnabled && customerId && (customerPointsData?.balance || 0) >= (pointsSettings?.min_points_for_redemption || 10) && (
              <div className="text-center bg-amber-600 rounded-md py-1">
                <Input 
                  type="number"
                  className="w-20 h-8 bg-white text-amber-700 text-center text-base font-semibold mx-auto" 
                  value={pointsToRedeem}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 0;
                    const maxPoints = calculateMaxRedeemablePoints(totals.subtotal - flatDiscountAmount, customerPointsData?.balance || 0);
                    setPointsToRedeem(Math.min(Math.max(0, value), maxPoints));
                  }}
                  min={0}
                  max={calculateMaxRedeemablePoints(totals.subtotal - flatDiscountAmount, customerPointsData?.balance || 0)}
                  disabled={!customerId}
                />
                <div className="text-xs md:text-sm mt-1">
                  Pts (₹{calculateRedemptionValue(pointsToRedeem).toFixed(0)})
                </div>
              </div>
            )}
            {/* Credit Applied Field - Only show if customer has credit balance */}
            {(availableCreditBalance > 0 || creditApplied > 0) && (
              <div className="text-center bg-purple-600 rounded-md py-1">
                <Input 
                  type="number"
                  className="w-20 h-8 bg-white text-purple-700 text-center text-base font-semibold mx-auto" 
                  value={creditApplied}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value) || 0;
                    const maxApplicable = Math.min(value, availableCreditBalance, amountBeforeCredit);
                    handleApplyCredit(maxApplicable > 0 ? maxApplicable : value);
                  }}
                  max={Math.min(availableCreditBalance, amountBeforeCredit)}
                  step="0.01"
                  disabled={!customerId || availableCreditBalance <= 0 || isApplyingCredit}
                />
                <div className="text-xs md:text-sm mt-1">Credit (₹{availableCreditBalance.toFixed(0)})</div>
              </div>
            )}
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                {isManualRoundOff && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="bg-white text-cyan-600 px-1 py-0.5 text-xs rounded h-6 hover:bg-cyan-50"
                          onClick={handleResetRoundOff}
                        >
                          <RotateCcw className="h-3 w-3" />
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
                  className={`w-20 h-8 text-center text-base font-semibold ${roundOff >= 0 ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-100 text-red-700 border-red-300'}`}
                  value={roundOff}
                  onChange={(e) => handleRoundOffChange(parseFloat(e.target.value) || 0)}
                  step="1"
                />
              </div>
              <div className="text-xs md:text-sm mt-1">
                Round OFF {isManualRoundOff && <span className="text-yellow-300">(Manual)</span>}
              </div>
            </div>
            <div className="text-center">
              <Input 
                type="number"
                className={`w-28 h-10 text-center text-xl md:text-2xl font-bold bg-white text-cyan-700 border-white mx-auto ${finalAmount < 0 ? 'text-orange-600' : ''}`}
                value={Math.round(finalAmount)}
                onChange={(e) => handleFinalAmountChange(parseFloat(e.target.value) || 0)}
                step="1"
              />
              <div className="text-xs md:text-sm mt-1">
                {finalAmount < 0 ? "Refund" : "Amount"}
                {effectiveDiscountPercent > 0 && (
                  <span className="block text-yellow-200 font-semibold">
                    ({effectiveDiscountPercent.toFixed(1)}% off)
                  </span>
                )}
              </div>
            </div>
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
                }))}
                subTotal={totals.subtotal}
                discount={totals.discount + flatDiscountAmount}
                grandTotal={finalAmount}
                cashPaid={paymentMethod === 'cash' ? finalAmount : 0}
                upiPaid={paymentMethod === 'upi' ? finalAmount : 0}
                paymentMethod={paymentMethod}
                paidAmount={paymentMethod === 'pay_later' ? 0 : finalAmount}
                previousBalance={customerBalance || 0}
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
          <AlertDialogContent className="sm:max-w-md">
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
              }))}
                subTotal={savedInvoiceData.totals.subtotal}
                discount={savedInvoiceData.totals.discount + savedInvoiceData.flatDiscountAmount}
                grandTotal={savedInvoiceData.finalAmount}
                cashPaid={savedInvoiceData.method === 'cash' ? savedInvoiceData.finalAmount : 0}
                upiPaid={savedInvoiceData.method === 'upi' ? savedInvoiceData.finalAmount : 0}
                paymentMethod={savedInvoiceData.method}
                notes={savedInvoiceData.notes}
                paidAmount={savedInvoiceData.paidAmount ?? savedInvoiceData.finalAmount}
                previousBalance={savedInvoiceData.previousBalance ?? 0}
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
            <InvoiceWrapper
              ref={invoicePrintRef}
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
              }))}
              subTotal={savedInvoiceData?.totals.subtotal || totals.subtotal}
              discount={savedInvoiceData ? (savedInvoiceData.totals.discount + savedInvoiceData.flatDiscountAmount) : (totals.discount + flatDiscountAmount)}
              grandTotal={savedInvoiceData?.finalAmount || finalAmount}
              cashPaid={savedInvoiceData?.method === 'cash' ? savedInvoiceData.finalAmount : paymentMethod === 'cash' ? finalAmount : 0}
              upiPaid={savedInvoiceData?.method === 'upi' ? savedInvoiceData.finalAmount : paymentMethod === 'upi' ? finalAmount : 0}
              paymentMethod={savedInvoiceData?.method || paymentMethod}
              notes={savedInvoiceData?.notes || saleNotes}
              paidAmount={savedInvoiceData?.paidAmount ?? (paymentMethod === 'pay_later' ? 0 : finalAmount)}
              previousBalance={savedInvoiceData?.previousBalance ?? customerBalance ?? 0}
            />
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
      </div>
    </div>
  );
}
