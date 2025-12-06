import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { usePOS } from "@/contexts/POSContext";
import { useCustomerBalance } from "@/hooks/useCustomerBalance";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Scan, X, Plus, Trash2, Banknote, CreditCard, Smartphone, Printer, ChevronLeft, ChevronRight, FileText, RotateCcw, Check, UserPlus, MessageCircle, Link2, Wallet, IndianRupee } from "lucide-react";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useToast } from "@/hooks/use-toast";
import { useSaveSale } from "@/hooks/useSaveSale";
import { useStockValidation } from "@/hooks/useStockValidation";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
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
import { printInvoicePDF, generateInvoiceFromHTML, printInvoiceDirectly, printA5BillFormat } from "@/utils/pdfGenerator";
import { format } from "date-fns";
import { useReactToPrint } from "react-to-print";

interface CartItem {
  id: string;
  barcode: string;
  productName: string;
  size: string;
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
  const { saveSale, updateSale, isSaving } = useSaveSale();
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
  const [items, setItems] = useState<CartItem[]>([]);
  const [flatDiscountPercent, setFlatDiscountPercent] = useState(0);
  const [saleReturnAdjust, setSaleReturnAdjust] = useState(0);
  const [roundOff, setRoundOff] = useState(0);
  const [currentInvoiceIndex, setCurrentInvoiceIndex] = useState(0);
  const [openProductSearch, setOpenProductSearch] = useState(false);
  const [openCustomerSearch, setOpenCustomerSearch] = useState(false);
  const [currentSaleId, setCurrentSaleId] = useState<string | null>(null);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [showPrintConfirmDialog, setShowPrintConfirmDialog] = useState(false);
  const [savedInvoiceData, setSavedInvoiceData] = useState<any>(null);
  const [currentInvoiceNumber, setCurrentInvoiceNumber] = useState("");
  const [nextInvoicePreview, setNextInvoicePreview] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'upi' | 'multiple' | 'pay_later'>('cash');
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [posBillFormat, setPosBillFormat] = useState<'a4' | 'a5' | 'a5-horizontal' | 'thermal'>('thermal');
  const [posInvoiceTemplate, setPosInvoiceTemplate] = useState<'professional' | 'modern' | 'classic' | 'compact'>('professional');
  const [showInvoicePreviewSetting, setShowInvoicePreviewSetting] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);
  const invoicePrintRef = useRef<HTMLDivElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [showAddCustomerDialog, setShowAddCustomerDialog] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [invoiceSearchInput, setInvoiceSearchInput] = useState("");
  const [showMixPaymentDialog, setShowMixPaymentDialog] = useState(false);
  const [refundAmount, setRefundAmount] = useState(0);
  const [newCustomerForm, setNewCustomerForm] = useState({
    customer_name: "",
    phone: "",
    email: "",
    address: "",
    gst_number: "",
  });

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

      // Fetch sale items
      const { data: saleItems, error: itemsError } = await supabase
        .from('sale_items')
        .select('*')
        .eq('sale_id', saleId);

      if (itemsError) throw itemsError;

      // Populate form with sale data
      setCurrentSaleId(saleId);
      setCurrentInvoiceNumber(sale.sale_number);
      setCustomerId(sale.customer_id || "");
      setCustomerName(sale.customer_name);
      setCustomerPhone(sale.customer_phone || "");
      setFlatDiscountPercent(sale.flat_discount_percent);
      setSaleReturnAdjust(sale.sale_return_adjust || 0);
      setRoundOff(sale.round_off);
      setPaymentMethod(sale.payment_method as any);

      // Convert sale items to cart items
      const cartItems: CartItem[] = saleItems.map(item => ({
        id: item.id,
        barcode: item.barcode || '',
        productName: item.product_name,
        size: item.size,
        quantity: item.quantity,
        mrp: item.mrp,
        originalMrp: item.mrp > item.unit_price ? item.mrp : null, // Infer originalMrp
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

      toast({
        title: "Invoice Loaded",
        description: `Invoice ${sale.sale_number} loaded for editing`,
      });
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
  }, [items, customerName, flatDiscountPercent, roundOff, paymentMethod, savedInvoiceData]);

  // Apply defaults when settings are loaded
  useEffect(() => {
    if (settingsData && (settingsData as any).sale_settings) {
      const saleSettings = (settingsData as any).sale_settings;
      if (saleSettings.default_discount) {
        setFlatDiscountPercent(saleSettings.default_discount);
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
      setFlatDiscountPercent(0);
      setSaleReturnAdjust(0);
      setRoundOff(0);
      setRefundAmount(0);
      setSearchInput("");
      setCurrentInvoiceIndex(0);
      setCurrentSaleId(null);
      setCurrentInvoiceNumber("");
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

  // Keyboard shortcuts for invoice navigation (needs todaysSales to be defined)
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

  // Fetch customers
  const { data: customers = [] } = useQuery({
    queryKey: ["customers", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .order("customer_name");
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
    staleTime: 60000, // Cache for 60 seconds
  });

  // Fetch customer balances for dropdown display
  const { data: customerBalances = {} } = useQuery({
    queryKey: ["customer-balances", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return {};
      const { data: sales, error } = await supabase
        .from("sales")
        .select("customer_id, net_amount, paid_amount")
        .eq("organization_id", currentOrganization.id)
        .not("customer_id", "is", null);
      if (error) throw error;
      
      // Aggregate by customer_id
      const balanceMap: Record<string, { totalSales: number; totalPaid: number }> = {};
      sales?.forEach((sale) => {
        if (!sale.customer_id) return;
        if (!balanceMap[sale.customer_id]) {
          balanceMap[sale.customer_id] = { totalSales: 0, totalPaid: 0 };
        }
        balanceMap[sale.customer_id].totalSales += sale.net_amount || 0;
        balanceMap[sale.customer_id].totalPaid += sale.paid_amount || 0;
      });
      return balanceMap;
    },
    enabled: !!currentOrganization?.id,
    staleTime: 60000,
  });

  // Helper to calculate customer balance
  const getCustomerBalance = (customer: any) => {
    const openingBalance = customer.opening_balance || 0;
    const salesData = customerBalances[customer.id] || { totalSales: 0, totalPaid: 0 };
    return openingBalance + salesData.totalSales - salesData.totalPaid;
  };

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

  const addItemToCart = async (product: any, variant: any) => {
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
      
      // Increment quantity if already in cart
      const updatedItems = [...items];
      updatedItems[existingItemIndex].quantity = newQty;
      updatedItems[existingItemIndex].netAmount = calculateNetAmount(updatedItems[existingItemIndex]);
      setItems(updatedItems);
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
      
      // Add new item - use MRP from variant if available, otherwise sale_price
      const variantMrp = variant.mrp ? parseFloat(variant.mrp) : null;
      const salePrice = parseFloat(variant.sale_price || 0);
      const displayMrp = variantMrp && variantMrp > salePrice ? variantMrp : salePrice;
      
      const newItem: CartItem = {
        id: variant.id,
        barcode: variant.barcode || '',
        productName: description,
        size: variant.size,
        quantity: 1,
        mrp: displayMrp,
        originalMrp: variantMrp,
        gstPer: product.gst_per || 0,
        discountPercent: 0,
        discountAmount: 0,
        unitCost: salePrice,
        netAmount: salePrice,
        productId: product.id,
        variantId: variant.id,
        hsnCode: product.hsn_code || '',
      };
      setItems([...items, newItem]);
    }
    
    // Close search dropdown and clear input
    setOpenProductSearch(false);
    setSearchInput("");
    
    // Refocus on barcode input for next scan
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 100);
  };

  const calculateNetAmount = (item: CartItem) => {
    const baseAmount = item.mrp * item.quantity;
    const percentDiscount = (baseAmount * item.discountPercent) / 100;
    const totalDiscount = percentDiscount + item.discountAmount;
    return baseAmount - totalDiscount;
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
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
    
    const updatedItems = [...items];
    updatedItems[index].quantity = newQty;
    updatedItems[index].netAmount = calculateNetAmount(updatedItems[index]);
    setItems(updatedItems);
  };

  const updateDiscountPercent = (index: number, discountPercent: number) => {
    if (discountPercent < 0 || discountPercent > 100) return;
    const updatedItems = [...items];
    updatedItems[index].discountPercent = discountPercent;
    updatedItems[index].netAmount = calculateNetAmount(updatedItems[index]);
    setItems(updatedItems);
  };

  const updateDiscountAmount = (index: number, discountAmount: number) => {
    if (discountAmount < 0) return;
    const updatedItems = [...items];
    updatedItems[index].discountAmount = discountAmount;
    updatedItems[index].netAmount = calculateNetAmount(updatedItems[index]);
    setItems(updatedItems);
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

  const flatDiscountAmount = (totals.subtotal * flatDiscountPercent) / 100;
  const finalAmount = totals.subtotal - flatDiscountAmount - saleReturnAdjust + roundOff;

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
      
      // Clear cart on success
      setItems([]);
      setCustomerId("");
      setCustomerName("");
      setCustomerPhone("");
      setFlatDiscountPercent(0);
      setSaleReturnAdjust(0);
      setRoundOff(0);
      setSearchInput("");
      setCurrentSaleId(null); // Reset edit mode
    }
  };

  const handlePaymentMethodChange = (method: 'cash' | 'card' | 'upi') => {
    setPaymentMethod(method);
    toast({
      title: "Payment Method Selected",
      description: `${method.toUpperCase()} payment selected`,
    });
  };

  const handlePaymentAndPrint = async (method: 'cash' | 'card' | 'upi') => {
    if (items.length === 0) {
      toast({
        title: "No Items",
        description: "Please add items to the cart before processing payment",
        variant: "destructive",
      });
      return;
    }

    // Real-time stock validation before saving
    const cartItems = items.map(item => ({
      variantId: item.variantId,
      quantity: item.quantity,
      productName: item.productName,
      size: item.size,
    }));

    const insufficientItems = await validateCartStock(cartItems);
    
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
    };

    // Use updateSale if editing existing sale, otherwise create new
    const result = currentSaleId 
      ? await updateSale(currentSaleId, saleData, method)
      : await saveSale(saleData, method);
    
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
      
      // Store invoice data and show print dialog
      setSavedInvoiceData({
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
      });
      setShowPrintConfirmDialog(true);
      
      // Reset edit mode after successful save
      if (wasEditing) {
        setCurrentSaleId(null);
      }
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
    const cartItems = items.map(item => ({
      variantId: item.variantId,
      quantity: item.quantity,
      productName: item.productName,
      size: item.size,
    }));

    const insufficientItems = await validateCartStock(cartItems);
    
    if (insufficientItems.length > 0) {
      showMultipleStockErrors(insufficientItems);
      return;
    }

    // Save the sale with mix payment or refund
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
      refundAmount: paymentData.refundAmount,
    };

    const paymentMethodType = paymentData.refundAmount > 0 ? 'refund' : 'multiple';
    
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
      
      const isRefund = paymentData.refundAmount > 0;
      const balanceAmount = isRefund ? 0 : finalAmount - paymentData.totalPaid;
      
      toast({
        title: wasEditing ? "Sale Updated" : "Sale Saved",
        description: isRefund 
          ? `Invoice ${result.sale_number} ${wasEditing ? 'updated' : 'saved'} with refund of ₹${paymentData.refundAmount.toFixed(2)}`
          : `Invoice ${result.sale_number} ${wasEditing ? 'updated' : 'saved'} with mixed payment${balanceAmount > 0 ? ` (Balance: ₹${balanceAmount.toFixed(2)})` : ''}`,
      });
      
      // Store invoice data and show print dialog
      setSavedInvoiceData({
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
      });
      setShowPrintConfirmDialog(true);
      
      // Reset edit mode after successful save
      if (wasEditing) {
        setCurrentSaleId(null);
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
    
    // Clear cart
    setItems([]);
    setCustomerId("");
    setCustomerName("");
    setCustomerPhone("");
    setFlatDiscountPercent(0);
    setSaleReturnAdjust(0);
    setRoundOff(0);
    setSearchInput("");
    setCurrentInvoiceIndex(0);
    
    setSavedInvoiceData(null);
  };

  const { sendWhatsApp } = useWhatsAppSend();

  const handleWhatsAppShare = (useCurrentData: boolean = false) => {
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

    // Get invoice URL if we have a sale ID
    const saleId = useCurrentData ? currentSaleId : savedInvoiceData?.saleId;
    const invoiceUrl = saleId ? `${window.location.origin}/invoice/view/${saleId}` : '';
    
    const message = `*Invoice Details*\n\nInvoice No: ${invoiceNo}\nDate: ${format(new Date(), 'dd/MM/yyyy')}\nCustomer: ${name || 'Walk in Customer'}\n\n*Items:*\n${itemsList}\n\nGross Amount: ₹${(grossAmount || 0).toFixed(2)}\nDiscount: ₹${(discountAmount || 0).toFixed(2)}${srAdjust > 0 ? `\nS/R Adjust: -₹${srAdjust.toFixed(2)}` : ''}\nRound Off: ₹${(roundOffAmount || 0).toFixed(2)}\n*Net Amount: ₹${(totalAmount || 0).toFixed(2)}*\n\nPayment Method: ${(method || 'cash').toUpperCase()}${invoiceUrl ? `\n\n📄 View Invoice Online:\n${invoiceUrl}` : ''}\n\nThank you for your business!`;

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
    setFlatDiscountPercent(Number(sale.flat_discount_percent) || 0);
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
    setFlatDiscountPercent(0);
    setSaleReturnAdjust(0);
    setRoundOff(0);
    setRefundAmount(0);
    setSearchInput("");
    
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
    setFlatDiscountPercent(0);
    setSaleReturnAdjust(0);
    setRoundOff(0);
    setRefundAmount(0);
    setSearchInput("");
    setCurrentInvoiceIndex(0);
    setCurrentSaleId(null);
    setCurrentInvoiceNumber("");
    
    toast({
      title: "New Invoice",
      description: "Cart cleared. Ready for new sale.",
    });
    
    // Focus on barcode input for next scan
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 100);
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
      <div className="w-20 bg-gradient-to-b from-primary/10 to-secondary/10 border-r flex flex-col gap-2 p-2 pb-32 z-30 relative">
        <Button
          onClick={handleNewInvoice}
          className="h-16 flex flex-col items-center justify-center gap-1 bg-cyan-600 hover:bg-cyan-700 text-white text-xs"
          title="New Invoice"
        >
          <FileText className="h-5 w-5" />
          <span>New</span>
        </Button>
        
        <Button
          onClick={() => handleSaveSale('pay_later')}
          disabled={items.length === 0 || isSaving}
          className="h-16 flex flex-col items-center justify-center gap-1 bg-amber-600 hover:bg-amber-700 text-white text-xs disabled:opacity-50"
          title="Credit Sale"
        >
          <Check className="h-5 w-5" />
          <span>Credit</span>
        </Button>

        <Button
          onClick={handleLastInvoice}
          disabled={!todaysSales || todaysSales.length === 0}
          className="h-16 flex flex-col items-center justify-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs disabled:opacity-50"
          title="Last Invoice"
        >
          <RotateCcw className="h-5 w-5" />
          <span>Last</span>
        </Button>

        <Button
          onClick={handleDeleteInvoice}
          disabled={!currentSaleId}
          className="h-16 flex flex-col items-center justify-center gap-1 bg-red-600 hover:bg-red-700 text-white text-xs disabled:opacity-50"
          title="Delete Invoice"
        >
          <Trash2 className="h-5 w-5" />
          <span>Delete</span>
        </Button>

        <Button
          onClick={handlePrint}
          disabled={items.length === 0}
          className="h-16 flex flex-col items-center justify-center gap-1 bg-gray-600 hover:bg-gray-700 text-white text-xs disabled:opacity-50"
          title="Print"
        >
          <Printer className="h-5 w-5" />
          <span>Print</span>
        </Button>
        
        <Button
          onClick={handleClearAll}
          className="h-16 flex flex-col items-center justify-center gap-1 bg-orange-600 hover:bg-orange-700 text-white text-xs relative"
          title="Clear (Esc)"
        >
          <Badge className="absolute top-1 right-1 h-4 px-1 text-[9px] bg-black/40 hover:bg-black/40">ESC</Badge>
          <X className="h-5 w-5" />
          <span>Clear</span>
        </Button>
        
        {/* WhatsApp Share Button */}
        <Button
          onClick={() => handleWhatsAppShare(true)}
          disabled={!customerPhone || items.length === 0}
          className="h-16 flex flex-col items-center justify-center gap-1 text-xs relative w-full bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
          title="Share on WhatsApp"
        >
          <MessageCircle className="h-5 w-5" />
          <span>WhatsApp</span>
        </Button>
        
        {/* Payment Method Buttons */}
        <div className="mt-auto space-y-2">
          <div className="text-[10px] text-center text-muted-foreground px-1 mb-1">Payment</div>
          <Button
            onClick={() => handlePaymentAndPrint('cash')}
            disabled={items.length === 0 || isSaving}
            className="h-14 flex flex-col items-center justify-center gap-1 text-xs relative w-full bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
            title="Cash Payment - Save & Print (F1)"
          >
            <Badge className="absolute top-1 right-1 h-4 px-1 text-[9px] bg-black/40 hover:bg-black/40">F1</Badge>
            <Banknote className="h-4 w-4" />
            <span>Cash</span>
          </Button>
          <Button
            onClick={() => handlePaymentAndPrint('card')}
            disabled={items.length === 0 || isSaving}
            className="h-14 flex flex-col items-center justify-center gap-1 text-xs relative w-full bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            title="Card Payment - Save & Print (F2)"
          >
            <Badge className="absolute top-1 right-1 h-4 px-1 text-[9px] bg-black/40 hover:bg-black/40">F2</Badge>
            <CreditCard className="h-4 w-4" />
            <span>Card</span>
          </Button>
          <Button
            onClick={() => handlePaymentAndPrint('upi')}
            disabled={items.length === 0 || isSaving}
            className="h-14 flex flex-col items-center justify-center gap-1 text-xs relative w-full bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50"
            title="UPI Payment - Save & Print (F3)"
          >
            <Badge className="absolute top-1 right-1 h-4 px-1 text-[9px] bg-black/40 hover:bg-black/40">F3</Badge>
            <Smartphone className="h-4 w-4" />
            <span>UPI</span>
          </Button>
          <Button
            onClick={handleMixPayment}
            disabled={items.length === 0 || isSaving}
            className="h-14 flex flex-col items-center justify-center gap-1 text-xs relative w-full bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50"
            title="Mix Payment - Save & Print (F4)"
          >
            <Badge className="absolute top-1 right-1 h-4 px-1 text-[9px] bg-black/40 hover:bg-black/40">F4</Badge>
            <Wallet className="h-4 w-4" />
            <span>Mix</span>
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-2 md:p-4">
        <BackToDashboard label="Back to POS Dashboard" to="/pos-dashboard" />
        
        <div className="max-w-[1800px] mx-auto space-y-3">
          {/* Header Section with Invoice Number */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Popover open={openProductSearch} onOpenChange={setOpenProductSearch}>
            <PopoverTrigger asChild>
              <div className="relative">
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
                          className="cursor-pointer"
                        >
                           <Check className="mr-2 h-4 w-4 opacity-0" />
                          <div className="flex flex-col flex-1">
                            <span className="font-medium">{displayName}</span>
                            <span className="text-sm text-muted-foreground">
                              Size: {item.variant.size} | 
                              {item.variant.barcode && ` Barcode: ${item.variant.barcode} | `}
                              Price: ₹{item.variant.sale_price} | 
                              Stock: {item.variant.stock_qty}
                            </span>
                            {item.variant.batch_stock && item.variant.batch_stock.length > 0 && (
                              <span className="text-xs text-muted-foreground mt-1">
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
              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-sm font-medium">Customer Name</Label>
                  {/* Customer Balance Display - on top of label */}
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
                    className="absolute right-20 top-1/2 translate-y-0.5 h-9 w-9"
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
                  className="absolute right-10 top-1/2 translate-y-0.5 h-9 w-9"
                  onClick={() => setShowAddCustomerDialog(true)}
                  title="Add New Customer"
                >
                  <UserPlus className="h-5 w-5" />
                </Button>
                <Plus className="absolute right-3 top-1/2 translate-y-0.5 h-6 w-6 text-muted-foreground" />
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0 z-50" align="start">
              <Command>
                <CommandInput 
                  placeholder="Search by name, phone, or email..." 
                  value={customerName}
                  onValueChange={setCustomerName}
                />
                <CommandList>
                  <CommandEmpty>No customers found.</CommandEmpty>
                  <CommandGroup heading="Customers">
                    {customers
                      .filter(c => 
                        c.customer_name.toLowerCase().includes(customerName.toLowerCase()) ||
                        c.phone?.toLowerCase().includes(customerName.toLowerCase()) ||
                        c.email?.toLowerCase().includes(customerName.toLowerCase())
                      )
                      .slice(0, 10)
                      .map((customer) => {
                        const balance = getCustomerBalance(customer);
                        return (
                          <CommandItem
                            key={customer.id}
                            value={customer.customer_name}
                            onSelect={() => {
                              setCustomerId(customer.id);
                              setCustomerName(customer.customer_name);
                              setCustomerPhone(customer.phone || "");
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
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          
          {/* Invoice Number Display */}
          <div className="relative">
            <Label className="text-sm font-medium mb-1 block">Invoice No</Label>
            <Input
              value={currentInvoiceNumber || nextInvoicePreview || "NEW"}
              readOnly
              className="h-12 text-lg font-semibold text-center bg-gradient-to-r from-primary/10 to-secondary/10"
              placeholder="Invoice #"
            />
          </div>
          
          {/* Invoice Search */}
          <div className="relative">
            <Label className="text-sm font-medium mb-1 block">Search Invoice</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Enter bill number..."
                value={invoiceSearchInput}
                onChange={(e) => setInvoiceSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleInvoiceSearch();
                  }
                }}
                className="h-12"
              />
              <Button 
                onClick={handleInvoiceSearch}
                className="h-12 px-4"
                size="sm"
              >
                Go
              </Button>
            </div>
          </div>
          
          {/* Running Total Display */}
          <div className="h-12 bg-gradient-to-r from-green-600 to-emerald-600 rounded-md px-4 flex items-center justify-center">
            <div className="text-white font-bold text-xl">
              ₹{finalAmount.toFixed(2)}
            </div>
          </div>
          
          <div className="relative h-12 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-md px-4 flex items-center justify-center">
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
                    className="h-12 flex-1"
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
              {/* Position Indicator */}
              {todaysSales && todaysSales.length > 0 && currentSaleId && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="h-12 px-3 bg-muted rounded-md flex flex-col items-center justify-center min-w-[60px] cursor-pointer" onClick={handleLastInvoice}>
                      <span className="text-sm font-semibold text-foreground">
                        {todaysSales.length - currentInvoiceIndex}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        of {todaysSales.length}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>End - Go to Latest</p>
                  </TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleNextInvoice}
                    variant="outline"
                    size="sm"
                    className="h-12 flex-1"
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

        {/* Items Table */}
        <div className="flex-1 overflow-hidden flex flex-col p-4 pb-0">
          <Card className="flex-1 overflow-hidden flex flex-col mb-32">
            <div className="bg-black text-white overflow-x-auto">
              <div className="min-w-[1100px] grid grid-cols-13 gap-2 p-4 text-base font-medium">
                <div className="col-span-1">Sr No</div>
                <div className="col-span-1">Barcode</div>
                <div className="col-span-3">Product</div>
                <div className="col-span-1">Qty</div>
                <div className="col-span-1">MRP</div>
                <div className="col-span-1">Tax%</div>
                <div className="col-span-1">Disc%</div>
                <div className="col-span-1">Disc Rs</div>
                <div className="col-span-1">Unit Price</div>
                <div className="col-span-2">Net Amount</div>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              <div className="overflow-x-auto">
                {items.length === 0 ? (
                  // Show 6 blank rows with serial numbers
                  Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="min-w-[1100px] grid grid-cols-13 gap-2 p-4 border-b text-base">
                      <div className="col-span-1 flex items-center text-muted-foreground">{index + 1}</div>
                      <div className="col-span-1 flex items-center text-muted-foreground">-</div>
                      <div className="col-span-3 flex items-center text-muted-foreground">-</div>
                      <div className="col-span-1 flex items-center text-muted-foreground">-</div>
                      <div className="col-span-1 flex items-center text-muted-foreground">-</div>
                      <div className="col-span-1 flex items-center text-muted-foreground">-</div>
                      <div className="col-span-1 flex items-center text-muted-foreground">-</div>
                      <div className="col-span-1 flex items-center text-muted-foreground">-</div>
                      <div className="col-span-1 flex items-center text-muted-foreground">-</div>
                      <div className="col-span-2 flex items-center text-muted-foreground">-</div>
                    </div>
                  ))
                ) : (
                  items.map((item, index) => (
                    <div key={index} className="min-w-[1100px] grid grid-cols-13 gap-2 p-4 border-b hover:bg-muted/50 text-base">
                      <div className="col-span-1 flex items-center font-semibold">{index + 1}</div>
                      <div className="col-span-1 flex items-center">{item.barcode}</div>
                      <div className="col-span-3 flex items-center font-medium">{item.productName}</div>
                      <div className="col-span-1">
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)}
                          className="h-9 text-base"
                          min="1"
                        />
                      </div>
                      <div className="col-span-1 flex items-center">₹{item.mrp.toFixed(2)}</div>
                      <div className="col-span-1 flex items-center">{item.gstPer}%</div>
                      <div className="col-span-1">
                        <Input
                          type="number"
                          value={item.discountPercent}
                          onChange={(e) => updateDiscountPercent(index, parseFloat(e.target.value) || 0)}
                          className="h-9 text-base"
                          min="0"
                          max="100"
                          step="0.01"
                        />
                      </div>
                      <div className="col-span-1">
                        <Input
                          type="number"
                          value={item.discountAmount}
                          onChange={(e) => updateDiscountAmount(index, parseFloat(e.target.value) || 0)}
                          className="h-9 text-base"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div className="col-span-1 flex items-center">₹{item.unitCost.toFixed(2)}</div>
                      <div className="col-span-2 flex items-center justify-between">
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
            </div>
          </div>
        </Card>
        </div>

        {/* Totals Section - Fixed at Bottom */}
        <div className="fixed bottom-0 left-20 right-0 bg-cyan-500 text-white p-2 md:p-4 shadow-lg z-20">
          <div className={`grid ${totals.savings > 0 ? 'grid-cols-4 md:grid-cols-9' : 'grid-cols-4 md:grid-cols-8'} gap-1 md:gap-3`}>
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
              <div className="flex items-center justify-center gap-2">
                <span className="bg-black text-white px-2 py-1 text-sm rounded">%</span>
                <Input 
                  type="number"
                  className="w-16 h-8 bg-white text-black text-center text-base font-semibold" 
                  value={flatDiscountPercent}
                  onChange={(e) => setFlatDiscountPercent(parseFloat(e.target.value) || 0)}
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
            <div className="text-center">
              <Input 
                type="number"
                className="w-20 h-8 bg-white text-black text-center text-base font-semibold mx-auto" 
                value={roundOff}
                onChange={(e) => setRoundOff(parseFloat(e.target.value) || 0)}
                step="0.01"
              />
              <div className="text-xs md:text-sm mt-1">Round OFF</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl md:text-3xl font-bold ${finalAmount < 0 ? 'text-orange-300' : ''}`}>
                ₹{finalAmount.toFixed(2)}
              </div>
              <div className="text-xs md:text-sm mt-1">
                {finalAmount < 0 ? "Refund" : "Amount"}
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
                  hsn: "",
                  sp: item.mrp,
                  qty: item.quantity,
                  rate: item.unitCost,
                  total: item.netAmount,
                }))}
                subTotal={totals.subtotal}
                discount={totals.discount + flatDiscountAmount}
                grandTotal={finalAmount}
                cashPaid={paymentMethod === 'cash' ? finalAmount : 0}
                upiPaid={paymentMethod === 'upi' ? finalAmount : 0}
                paymentMethod={paymentMethod}
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
              <AlertDialogDescription>
                Invoice {savedInvoiceData?.invoiceNumber} has been saved successfully.
                What would you like to do next?
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
            defaultFormat={posBillFormat}
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
                  hsn: "",
                  sp: item.mrp,
                  qty: item.quantity,
                  rate: item.unitCost,
                  total: item.netAmount,
                }))}
                subTotal={savedInvoiceData.totals.subtotal}
                discount={savedInvoiceData.totals.discount + savedInvoiceData.flatDiscountAmount}
                grandTotal={savedInvoiceData.finalAmount}
                cashPaid={savedInvoiceData.method === 'cash' ? savedInvoiceData.finalAmount : 0}
                upiPaid={savedInvoiceData.method === 'upi' ? savedInvoiceData.finalAmount : 0}
                paymentMethod={savedInvoiceData.method}
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
                hsn: "",
                sp: item.mrp,
                qty: item.quantity,
                rate: item.unitCost,
                total: item.netAmount,
              })) : items.map((item, index) => ({
                sr: index + 1,
                particulars: item.productName,
                size: item.size,
                barcode: item.barcode || "",
                hsn: "",
                sp: item.mrp,
                qty: item.quantity,
                rate: item.unitCost,
                total: item.netAmount,
              }))}
              subTotal={savedInvoiceData?.totals.subtotal || totals.subtotal}
              discount={savedInvoiceData ? (savedInvoiceData.totals.discount + savedInvoiceData.flatDiscountAmount) : (totals.discount + flatDiscountAmount)}
              grandTotal={savedInvoiceData?.finalAmount || finalAmount}
              cashPaid={savedInvoiceData?.method === 'cash' ? savedInvoiceData.finalAmount : paymentMethod === 'cash' ? finalAmount : 0}
              upiPaid={savedInvoiceData?.method === 'upi' ? savedInvoiceData.finalAmount : paymentMethod === 'upi' ? finalAmount : 0}
              paymentMethod={savedInvoiceData?.method || paymentMethod}
            />
          )}
        </div>

        {/* Mix Payment Dialog */}
        <MixPaymentDialog
          open={showMixPaymentDialog}
          onOpenChange={setShowMixPaymentDialog}
          billAmount={finalAmount}
          onSave={handleMixPaymentSave}
        />
      </div>
    </div>
  );
}
