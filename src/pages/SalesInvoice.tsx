import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useCustomerBalance } from "@/hooks/useCustomerBalance";
import { useCustomerSearch, useCustomerBalances } from "@/hooks/useCustomerSearch";
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
import { CalendarIcon, Home, Plus, X, Search, Eye, Check, Loader2, AlertCircle, Scan } from "lucide-react";
import { SizeGridDialog } from "@/components/SizeGridDialog";
import { format } from "date-fns";
import { cn, sortSearchResults } from "@/lib/utils";
import { BackToDashboard } from "@/components/BackToDashboard";
import { InvoiceWrapper } from "@/components/InvoiceWrapper";
import { PriceSelectionDialog } from "@/components/PriceSelectionDialog";
import { useReactToPrint } from "react-to-print";
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
import { DraftResumeDialog } from "@/components/DraftResumeDialog";
import { useCustomerBrandDiscounts } from "@/hooks/useCustomerBrandDiscounts";

interface LineItem {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  size: string;
  barcode: string;
  color: string;
  quantity: number;
  mrp: number;
  salePrice: number;
  discountPercent: number;
  discountAmount: number;
  gstPercent: number;
  lineTotal: number;
  hsnCode: string;
}

const customerSchema = z.object({
  customer_name: z.string().trim().max(100).optional().or(z.literal("")),
  phone: z.string().trim().min(1, "Mobile number is required").max(20, "Mobile number must be less than 20 characters"),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional(),
  gst_number: z.string().trim().max(15).optional(),
});

export default function SalesInvoice() {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { checkStock, validateCartStock, showStockError, showMultipleStockErrors } = useStockValidation();
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
  const [invoiceDate, setInvoiceDate] = useState<Date>(new Date());
  const [dueDate, setDueDate] = useState<Date>(new Date());
  const invoiceSavedRef = useRef(false); // Track if invoice was saved to prevent draft re-save
  const printRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  // Initialize 5 empty rows for predefined table
  const [lineItems, setLineItems] = useState<LineItem[]>(
    Array(5).fill(null).map((_, i) => ({
      id: `row-${i}`,
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
    }))
  );
  const [openProductSearch, setOpenProductSearch] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [productSearchResults, setProductSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [openCustomerSearch, setOpenCustomerSearch] = useState(false);
  const [openCustomerDialog, setOpenCustomerDialog] = useState(false);
  const [paymentTerm, setPaymentTerm] = useState<string>("");
  const [termsConditions, setTermsConditions] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [shippingAddress, setShippingAddress] = useState<string>("");
  const [shippingInstructions, setShippingInstructions] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [originalItemsForEdit, setOriginalItemsForEdit] = useState<Array<{ variantId: string; quantity: number }>>([]);
  const [taxType, setTaxType] = useState<"exclusive" | "inclusive">("inclusive");
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [savedInvoiceData, setSavedInvoiceData] = useState<any>(null);
  const [salesman, setSalesman] = useState<string>("");
  const [flatDiscountPercent, setFlatDiscountPercent] = useState<number>(0);
  const [flatDiscountRupees, setFlatDiscountRupees] = useState<number>(0);
  const [roundOff, setRoundOff] = useState<number>(0);
  const [nextInvoicePreview, setNextInvoicePreview] = useState<string>("");
  
  // Size grid entry mode
  const [entryMode, setEntryMode] = useState<"grid" | "inline">("inline");
  const [showSizeGrid, setShowSizeGrid] = useState(false);
  const [sizeGridProduct, setSizeGridProduct] = useState<any>(null);
  const [sizeGridVariants, setSizeGridVariants] = useState<any[]>([]);
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  
  // Price selection dialog state
  const [showPriceSelectionDialog, setShowPriceSelectionDialog] = useState(false);
  const [pendingPriceSelection, setPendingPriceSelection] = useState<{
    product: any;
    variant: any;
    masterPrice: { sale_price: number; mrp: number };
    lastPurchasePrice: { sale_price: number; mrp: number; date?: Date };
  } | null>(null);

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
    setLineItems(data.lineItems || Array(5).fill(null).map((_, i) => ({
      id: `row-${i}`, productId: '', variantId: '', productName: '', size: '', barcode: '', color: '',
      quantity: 0, mrp: 0, salePrice: 0, discountPercent: 0, discountAmount: 0, gstPercent: 0, lineTotal: 0, hsnCode: '',
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
    setRoundOff(data.roundOff || 0);
    toast({
      title: "Draft Loaded",
      description: "Your previous work has been restored",
    });
  }, [toast]);

  // Check for draft on mount (only if not in edit mode)
  useEffect(() => {
    if (!location.state?.editInvoiceId && hasDraft && draftData) {
      setShowDraftDialog(true);
    }
  }, [hasDraft, draftData, location.state?.editInvoiceId]);

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
        roundOff,
      });
    }
  }, [invoiceDate, dueDate, lineItems, selectedCustomerId, selectedCustomer, paymentTerm, termsConditions, notes, shippingAddress, shippingInstructions, taxType, salesman, flatDiscountPercent, flatDiscountRupees, roundOff, editingInvoiceId, savedInvoiceData, updateCurrentData]);

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
  } = useCustomerSearch(customerSearchInput);
  
  const { getCustomerBalance } = useCustomerBalances();

  // Fetch settings
  const { data: settingsData } = useQuery({
    queryKey: ['settings', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;
      
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

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
            *,
            product_variants (*),
            size_groups (id, group_name, sizes)
          `)
          .eq('organization_id', currentOrganization.id)
          .eq('status', 'active')
          .is('deleted_at', null)
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
  });

  // Fetch employees for Salesman dropdown
  const { data: employeesData } = useQuery({
    queryKey: ['employees', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .eq('status', 'active')
        .order('employee_name');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
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

  // Generate next invoice number preview
  useEffect(() => {
    const previewNextInvoice = async () => {
      if (!currentOrganization?.id || editingInvoiceId) return;
      
      try {
        const settings = settingsData?.sale_settings as any;
        if (settings?.invoice_numbering_format) {
          // Use custom format from settings
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const fyStart = now.getMonth() >= 3 ? year : year - 1;
          const fyEnd = fyStart + 1;
          const fyShort = `${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`;
          
          let preview = settings.invoice_numbering_format
            .replace('{FY}', fyShort)
            .replace('{YYYY}', String(year))
            .replace('{MM}', month)
            .replace('{N}', '?');
          
          setNextInvoicePreview(preview);
        } else {
          // Use database function for default format - always fetch fresh
          const { data: nextNumber, error } = await supabase.rpc('generate_sale_number', {
            p_organization_id: currentOrganization.id
          });
          
          if (error) throw error;
          if (nextNumber) {
            setNextInvoicePreview(nextNumber);
          }
        }
      } catch (error) {
        console.error('Error previewing next invoice:', error);
        setNextInvoicePreview('INV/??-??/?');
      }
    };
    
    previewNextInvoice();
  }, [currentOrganization?.id, editingInvoiceId, settingsData]);

  // Pre-populate form if editing existing invoice
  useState(() => {
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
        setOriginalItemsForEdit(invoiceData.sale_items.map((item: any) => ({
          variantId: item.variant_id,
          quantity: item.quantity,
        })));
      }
    }
  });

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
        
        // Search products by name, brand, style
        const { data: matchingProducts } = await supabase
          .from("products")
          .select("id, size_group_id")
          .eq("organization_id", currentOrganization.id)
          .eq("status", "active")
          .is("deleted_at", null)
          .or(`product_name.ilike.%${query}%,brand.ilike.%${query}%,style.ilike.%${query}%`);

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
            products (id, product_name, brand, category, style, color, hsn_code, gst_per, size_group_id)
          `)
          .eq("organization_id", currentOrganization.id)
          .eq("active", true)
          .is("deleted_at", null)
          .gt("stock_qty", 0);

        if (productIds.length > 0) {
          variantsQuery = variantsQuery.or(`barcode.ilike.%${query}%,product_id.in.(${productIds.join(",")})`);
        } else {
          variantsQuery = variantsQuery.ilike("barcode", `%${query}%`);
        }

        const { data, error } = await variantsQuery.limit(50);

        if (error) throw error;

        // Map results
        const results = (data || []).map((v: any) => {
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
  // Open size grid modal for a product
  const openSizeGridForProduct = (product: any) => {
    const variants = product.product_variants || [];
    if (variants.length === 0) return;
    
    setSizeGridProduct(product);
    setSizeGridVariants(variants.map((v: any) => ({
      id: v.id,
      size: v.size,
      stock_qty: v.stock_qty || 0,
      sale_price: v.sale_price,
      color: v.color || product.color,
      barcode: v.barcode,
    })));
    setShowSizeGrid(true);
  };

  // Handle size grid confirmation
  const handleSizeGridConfirm = async (items: Array<{ variant: any; qty: number }>) => {
    const product = sizeGridProduct;
    if (!product) return;

    // Build all new items first, then update state once
    let updatedItems = [...lineItems];
    let addedCount = 0;

    for (const { variant, qty } of items) {
      // Stock validation
      const stockCheck = await checkStock(variant.id, qty);
      if (!stockCheck.isAvailable) {
        showStockError(product.product_name, variant.size, qty, stockCheck.availableStock);
        continue;
      }

      // Check if already exists in current working array
      const existingIndex = updatedItems.findIndex(item => item.variantId === variant.id && item.productId !== '');
      
      if (existingIndex >= 0) {
        const newQty = updatedItems[existingIndex].quantity + qty;
        const stockCheckIncrease = await checkStock(variant.id, newQty);
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
          productName: product.product_name,
          size: variant.size,
          barcode: variant.barcode || '',
          color: variant.color || product.color || '',
          quantity: qty,
          mrp: variant.mrp || variant.sale_price || 0,
          salePrice: variant.sale_price || 0,
          discountPercent,
          discountAmount: 0,
          gstPercent: product.gst_per || 0,
          lineTotal: 0,
          hsnCode: product.hsn_code || '',
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
    
    if (addedCount > 0) {
      toast({
        title: "Products Added",
        description: `${addedCount} size(s) added to invoice`,
      });
    }
    
    setTimeout(() => {
      tableContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  // Handle barcode/product search on Enter (like POS)
  const handleBarcodeSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchInput.trim()) {
      searchAndAddProduct(searchInput.trim());
    }
  };

  const searchAndAddProduct = async (searchTerm: string) => {
    if (!productsData) return;

    // Search by barcode first (exact match)
    let foundVariant: any = null;
    let foundProduct: any = null;

    for (const product of productsData) {
      const variantMatch = product.product_variants?.find((v: any) => 
        v.barcode?.toLowerCase() === searchTerm.toLowerCase() && v.stock_qty > 0
      );
      
      if (variantMatch) {
        foundVariant = variantMatch;
        foundProduct = product;
        break;
      }
    }

    if (foundVariant && foundProduct) {
      // If in grid mode, open size grid dialog
      if (entryMode === "grid") {
        openSizeGridForProduct(foundProduct);
        setSearchInput("");
        barcodeInputRef.current?.focus();
        return;
      }
      
      await addProductToInvoice(foundProduct, foundVariant);
      setSearchInput("");
      // Keep focus on barcode input for continuous scanning
      setTimeout(() => barcodeInputRef.current?.focus(), 50);
    } else {
      toast({
        title: "Product not found",
        description: "No product matches the scanned barcode.",
        variant: "destructive",
      });
      setSearchInput("");
      barcodeInputRef.current?.focus();
    }
  };

  const addProductToInvoice = async (product: any, variant: any, overridePrice?: { sale_price: number; mrp: number }) => {
    // If in grid mode, open size grid dialog
    if (entryMode === "grid") {
      openSizeGridForProduct(product);
      setOpenProductSearch(false);
      setSearchInput("");
      return;
    }

    // Real-time stock validation
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

    // Check if product already exists in filled rows
    const existingIndex = lineItems.findIndex(item => item.variantId === variant.id && item.productId !== '');
    
    if (existingIndex >= 0) {
      // Real-time stock validation for increased quantity
      const newQty = lineItems[existingIndex].quantity + 1;
      const stockCheckIncrease = await checkStock(variant.id, newQty);
      
      if (!stockCheckIncrease.isAvailable) {
        showStockError(
          stockCheckIncrease.productName,
          stockCheckIncrease.size,
          newQty,
          stockCheckIncrease.availableStock
        );
        return;
      }
      
      // Increase quantity if already exists
      const updatedItems = [...lineItems];
      updatedItems[existingIndex].quantity = newQty;
      updatedItems[existingIndex] = calculateLineTotal(updatedItems[existingIndex]);
      setLineItems(updatedItems);
    } else {
      // Check if last_purchase prices differ from master prices (for new items only)
      const masterSalePrice = parseFloat(variant.sale_price || 0);
      const masterMrp = variant.mrp ? parseFloat(variant.mrp) : masterSalePrice;
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
      
      // Mutually exclusive discount logic:
      // Only apply brand discount if customer has NO master discount
      // If customer has master discount, it's applied as flat discount instead
      const customerHasMasterDiscount = selectedCustomer?.discount_percent && selectedCustomer.discount_percent > 0;
      const brandDiscount = customerHasMasterDiscount ? 0 : getBrandDiscount(product.brand);
      const discountPercent = brandDiscount > 0 ? brandDiscount : 0;
      
      // Find first empty row and fill it
      const emptyRowIndex = lineItems.findIndex(item => item.productId === '');
      
      if (emptyRowIndex === -1) {
        // Add new row instead of blocking
        const newItem: LineItem = calculateLineTotal({
          id: `row-${lineItems.length}`,
          productId: product.id,
          variantId: variant.id,
          productName: product.product_name,
          size: variant.size,
          barcode: variant.barcode || '',
          color: variant.color || product.color || '',
          quantity: 1,
          mrp: mrpToUse,
          salePrice: salePrice,
          discountPercent,
          discountAmount: 0,
          gstPercent: product.gst_per || 0,
          lineTotal: 0,
          hsnCode: product.hsn_code || '',
        });
        setLineItems(prev => [...prev, newItem]);
        
        // Show toast if brand discount was applied
        if (brandDiscount > 0) {
          toast({
            title: `Brand discount applied: ${brandDiscount}%`,
            description: `${product.brand} discount for this customer`,
          });
        }
      } else {
        const updatedItems = [...lineItems];
        const newItem: LineItem = {
          id: updatedItems[emptyRowIndex].id,
          productId: product.id,
          variantId: variant.id,
          productName: product.product_name,
          size: variant.size,
          barcode: variant.barcode || '',
          color: variant.color || product.color || '',
          quantity: 1,
          mrp: mrpToUse,
          salePrice: salePrice,
          discountPercent,
          discountAmount: 0,
          gstPercent: product.gst_per || 0,
          lineTotal: 0,
          hsnCode: product.hsn_code || '',
        };
        updatedItems[emptyRowIndex] = calculateLineTotal(newItem);
        setLineItems(updatedItems);
        
        // Show toast if brand discount was applied
        if (brandDiscount > 0) {
          toast({
            title: `Brand discount applied: ${brandDiscount}%`,
            description: `${product.brand} discount for this customer`,
          });
        }
      }
    }
    
    setOpenProductSearch(false);
    setSearchInput("");
    
    // Auto-scroll to the table after product is added
    setTimeout(() => {
      tableContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    
    // Return focus to barcode input for continuous scanning
    setTimeout(() => barcodeInputRef.current?.focus(), 50);
    
    toast({
      title: "Product Added",
      description: `${product.product_name} (${variant.size}) added to invoice`,
    });
  };

  // Handle price selection from dialog
  const handlePriceSelection = (source: "master" | "last_purchase", prices: { sale_price: number; mrp: number }) => {
    if (pendingPriceSelection) {
      addProductToInvoice(pendingPriceSelection.product, pendingPriceSelection.variant, prices);
      setPendingPriceSelection(null);
      setShowPriceSelectionDialog(false);
    }
  };

  const calculateLineTotal = (item: LineItem): LineItem => {
    const baseAmount = item.salePrice * item.quantity;
    const discountAmount = item.discountPercent > 0 
      ? (baseAmount * item.discountPercent) / 100 
      : item.discountAmount;
    const amountAfterDiscount = baseAmount - discountAmount;
    
    let lineTotal: number;
    if (taxType === "inclusive") {
      // For inclusive GST, the price already includes tax
      lineTotal = amountAfterDiscount;
    } else {
      // For exclusive GST, add tax on top
      const gstAmount = (amountAfterDiscount * item.gstPercent) / 100;
      lineTotal = amountAfterDiscount + gstAmount;
    }
    
    return {
      ...item,
      discountAmount,
      lineTotal,
    };
  };

  const updateQuantity = async (id: string, quantity: number) => {
    if (quantity < 1) return;
    
    // Find the item being updated
    const item = lineItems.find(i => i.id === id);
    if (!item || !item.variantId) return;
    
    // Real-time stock validation
    const stockCheck = await checkStock(item.variantId, quantity);
    
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
      item.id === id ? calculateLineTotal({ ...item, gstPercent }) : item
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
      item.id === id ? calculateLineTotal({ ...item, salePrice }) : item
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
      // Use phone as customer name if name is empty
      const customerName = values.customer_name?.trim() || values.phone;
      
      const { data, error } = await supabase
        .from('customers')
        .insert([{
          customer_name: customerName,
          phone: values.phone,
          email: values.email || null,
          address: values.address || null,
          gst_number: values.gst_number || null,
          organization_id: currentOrganization?.id,
        }])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Customer Created",
        description: `${customerName} has been added successfully`,
      });

      // Auto-select the new customer
      setSelectedCustomerId(data.id);
      setSelectedCustomer(data);
      
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
      return;
    }

    // Real-time stock validation before saving
    // When editing, pass original items so their stock is considered "freed"
    const invoiceItems = filledItems.map(item => ({
      variantId: item.variantId,
      quantity: item.quantity,
      productName: item.productName,
      size: item.size,
    }));

    const insufficientItems = await validateCartStock(
      invoiceItems,
      editingInvoiceId ? originalItemsForEdit : undefined
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
            round_off: roundOff,
            net_amount: netAmount,
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

        toast({
          title: "Invoice Updated",
          description: "Invoice has been updated successfully",
        });

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

        // Auto-send WhatsApp invoice notification on update (does not block saving)
        if (selectedCustomer?.phone && currentOrganization?.id && invoiceData?.sale_number) {
          try {
            const { data: whatsappSettings } = await (supabase as any)
              .from('whatsapp_api_settings')
              .select('is_active, auto_send_invoice, invoice_template_name')
              .eq('organization_id', currentOrganization.id)
              .maybeSingle();

            if (whatsappSettings?.is_active && whatsappSettings?.auto_send_invoice) {
              const { data: companySettings } = await supabase
                .from('settings')
                .select('business_name, mobile_number')
                .eq('organization_id', currentOrganization.id)
                .maybeSingle();

              const companyName = companySettings?.business_name || currentOrganization.name || 'Our Company';
              const contactNumber = companySettings?.mobile_number || 'N/A';

              const formattedDate = new Date(invoiceDate).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              });
              const formattedAmount = `${Number(netAmount).toLocaleString('en-IN')}`;
              const paymentStatus = 'Pending';

              const templateParams = [
                selectedCustomer.customer_name,
                invoiceData.sale_number,
                formattedDate,
                formattedAmount,
                paymentStatus,
                companyName,
                contactNumber,
              ];

              const messageText = `Hello ${selectedCustomer.customer_name},\n\nYour invoice ${invoiceData.sale_number} has been updated.\nAmount: ₹${formattedAmount}\nDate: ${formattedDate}\nStatus: ${paymentStatus}\n\nThank you for your business!\n${companyName}`;

              await supabase.functions.invoke('send-whatsapp', {
                body: {
                  organizationId: currentOrganization.id,
                  phone: selectedCustomer.phone,
                  message: messageText,
                  templateType: 'sales_invoice',
                  templateName: whatsappSettings.invoice_template_name || null,
                  templateParams,
                  referenceId: editingInvoiceId,
                  referenceType: 'sale',
                },
              });
            }
          } catch (e) {
            console.error('WhatsApp auto-send failed (SalesInvoice update):', e);
          }
        }

        // Store invoice data and show print dialog
        setSavedInvoiceData({
          invoiceNumber: invoiceData?.sale_number,
          filledItems,
          netAmount,
          customer: selectedCustomer,
        });
        setShowPrintDialog(true);
      } else {
        // Create new invoice
        const { data: saleNumber, error: saleNumError } = await supabase
          .rpc('generate_sale_number', { p_organization_id: currentOrganization?.id });

        if (saleNumError) throw saleNumError;

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
            round_off: roundOff,
            net_amount: netAmount,
            payment_method: 'pay_later',
            payment_status: 'pending',
            organization_id: currentOrganization?.id,
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

        // Auto-send WhatsApp invoice notification (does not block saving)
        if (selectedCustomer?.phone && currentOrganization?.id) {
          try {
            const { data: whatsappSettings } = await (supabase as any)
              .from('whatsapp_api_settings')
              .select('is_active, auto_send_invoice, invoice_template_name')
              .eq('organization_id', currentOrganization.id)
              .maybeSingle();

            if (whatsappSettings?.is_active && whatsappSettings?.auto_send_invoice) {
              const { data: companySettings } = await supabase
                .from('settings')
                .select('business_name, mobile_number')
                .eq('organization_id', currentOrganization.id)
                .maybeSingle();

              const companyName = companySettings?.business_name || currentOrganization.name || 'Our Company';
              const contactNumber = companySettings?.mobile_number || 'N/A';

              const formattedDate = new Date(invoiceDate).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              });
              const formattedAmount = `${Number(netAmount).toLocaleString('en-IN')}`;
              const paymentStatus = 'Pending';

              const templateParams = [
                selectedCustomer.customer_name,
                saleNumber,
                formattedDate,
                formattedAmount,
                paymentStatus,
                companyName,
                contactNumber,
              ];

              const messageText = `Hello ${selectedCustomer.customer_name},\n\nYour invoice ${saleNumber} has been created.\nAmount: ₹${formattedAmount}\nDate: ${formattedDate}\nStatus: ${paymentStatus}\n\nThank you for your business!\n${companyName}`;

              await supabase.functions.invoke('send-whatsapp', {
                body: {
                  organizationId: currentOrganization.id,
                  phone: selectedCustomer.phone,
                  message: messageText,
                  templateType: 'sales_invoice',
                  templateName: whatsappSettings.invoice_template_name || null,
                  templateParams,
                  referenceId: saleData.id,
                  referenceType: 'sale',
                },
              });
            }
          } catch (e) {
            console.error('WhatsApp auto-send failed (SalesInvoice):', e);
          }
        }

        toast({
          title: "Invoice Saved",
          description: `Invoice ${saleNumber} has been created successfully`,
        });

        // Mark invoice as saved to prevent draft re-save on unmount
        invoiceSavedRef.current = true;
        // Clear any existing draft after successful save
        await deleteDraft();
        stopAutoSave();
        updateCurrentData(null);

        // Store invoice data and show print dialog
        setSavedInvoiceData({
          invoiceNumber: saleNumber,
          filledItems,
          netAmount,
          customer: selectedCustomer,
        });
        setShowPrintDialog(true);

        // Reset form after user closes print dialog (will be handled in dialog onClose)
        // Don't reset immediately to allow printing
      }
    } catch (error: any) {
      console.error('Error saving invoice:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save invoice",
      });
    } finally {
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
    },
  });

  const handlePrintInvoice = async () => {
    if (!savedInvoiceData || !currentOrganization?.id) return;
    
    // Trigger print
    setTimeout(() => {
      handlePrint();
    }, 100);
  };

  const handleClosePrintDialog = () => {
    setShowPrintDialog(false);
    
    // Reset form if it was a new invoice
    if (!editingInvoiceId) {
      setLineItems(
        Array(5).fill(null).map((_, i) => ({
          id: `row-${i}`,
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
        }))
      );
      setSelectedCustomerId("");
      setSelectedCustomer(null);
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
      setRoundOff(0);
    } else {
      // Navigate back to dashboard if editing
      navigate('/sales-invoice-dashboard');
    }
    
    setEditingInvoiceId(null);
    setOriginalItemsForEdit([]);
    setSavedInvoiceData(null);
  };

  // Calculate totals
  const grossAmount = lineItems.reduce((sum, item) => sum + (item.salePrice * item.quantity), 0);
  const lineItemDiscount = lineItems.reduce((sum, item) => sum + item.discountAmount, 0);
  // Flat discount: Stack both percent and rupees discounts together
  const flatDiscountPercentAmount = (grossAmount * flatDiscountPercent) / 100;
  const flatDiscountAmount = flatDiscountPercentAmount + flatDiscountRupees;
  const totalDiscount = lineItemDiscount + flatDiscountAmount;
  const amountAfterDiscount = grossAmount - totalDiscount;
  
  const totalGST = lineItems.reduce((sum, item) => {
    const baseAmount = item.salePrice * item.quantity - item.discountAmount;
    // Apply flat discount proportionally
    const proportionalFlatDiscount = grossAmount > 0 ? (baseAmount / grossAmount) * flatDiscountAmount : 0;
    const adjustedBase = baseAmount - proportionalFlatDiscount;
    if (taxType === "inclusive") {
      // Extract GST from inclusive price
      return sum + (adjustedBase - (adjustedBase / (1 + item.gstPercent / 100)));
    } else {
      // Calculate GST on exclusive price
      return sum + (adjustedBase * item.gstPercent) / 100;
    }
  }, 0);
  
  const netBeforeRoundOff = taxType === "inclusive" ? amountAfterDiscount : amountAfterDiscount + totalGST;
  const netAmount = netBeforeRoundOff + roundOff;

  return (
    <div className="p-4 space-y-4">
      <BackToDashboard label="Back to Sales Dashboard" to="/sales-invoice-dashboard" />
      
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Home className="h-6 w-6" />
            {editingInvoiceId ? 'Edit Invoice' : 'New Invoice'}
          </h1>
          {/* Last Invoice Info at Top */}
          {lastInvoice && !editingInvoiceId && (
            <div className="bg-muted/50 border rounded-lg px-3 py-1.5 text-sm">
              <span className="text-muted-foreground">Last: </span>
              <span className="font-semibold">{lastInvoice.sale_number}</span>
              <span className="text-muted-foreground"> | Qty: </span>
              <span className="font-semibold">{lastInvoice.total_qty}</span>
              <span className="text-muted-foreground"> | Amt: </span>
              <span className="font-semibold">₹{lastInvoice.net_amount?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}</span>
              <span className="text-muted-foreground"> | </span>
              <span className="font-semibold">{lastInvoice.customer_name}</span>
            </div>
          )}
        </div>

        {/* Simplified Form - matching Quotation/Sale Order layout */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          {/* Customer Selection */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Customer<span className="text-destructive">*</span></Label>
              <div className="flex items-center gap-2">
                {selectedCustomer?.discount_percent > 0 && (
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600">
                    {selectedCustomer.discount_percent}% Disc
                  </span>
                )}
                {selectedCustomerId && (
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                    customerBalance > 0 
                      ? 'bg-destructive/10 text-destructive' 
                      : customerBalance < 0 
                        ? 'bg-green-500/10 text-green-600' 
                        : 'bg-muted text-muted-foreground'
                  }`}>
                    {isBalanceLoading ? '...' : `₹${Math.abs(customerBalance).toLocaleString('en-IN')} ${customerBalance > 0 ? 'Due' : customerBalance < 0 ? 'Cr' : ''}`}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Popover open={openCustomerSearch} onOpenChange={setOpenCustomerSearch}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openCustomerSearch}
                    className="flex-1 justify-between"
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
                      placeholder="Search by name, phone, or email..." 
                      value={customerSearchInput}
                      onValueChange={setCustomerSearchInput}
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
                          {/* Create New Customer Option */}
                          <CommandGroup>
                            <CommandItem
                              onSelect={() => {
                                setOpenCustomerSearch(false);
                                setOpenCustomerDialog(true);
                                // Pre-fill phone if search looks like a phone number
                                const searchVal = customerSearchInput.trim();
                                if (/^\d{6,}$/.test(searchVal.replace(/\D/g, ''))) {
                                  customerForm.setValue('phone', searchVal);
                                } else if (searchVal && !searchVal.includes('@')) {
                                  customerForm.setValue('customer_name', searchVal);
                                }
                              }}
                              className="cursor-pointer text-primary"
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              <span className="font-medium">Create New Customer</span>
                              {customerSearchInput && (
                                <span className="ml-1 text-muted-foreground">"{customerSearchInput}"</span>
                              )}
                            </CommandItem>
                          </CommandGroup>
                          <CommandGroup heading={`Customers (${customersData?.length || 0})`}>
                            {filteredCustomers.map((customer: any) => {
                              const balance = getCustomerBalance(customer);
                              return (
                                <CommandItem
                                  key={customer.id}
                                  value={`${customer.customer_name} ${customer.phone || ''} ${customer.email || ''}`}
                                onSelect={() => {
                                    setSelectedCustomerId(customer.id);
                                    setSelectedCustomer(customer);
                                    setCustomerSearchInput("");
                                    // Mutually exclusive discount logic:
                                    // If customer has master discount AND no brand discounts, apply master discount
                                    // If customer has brand discounts, those will be applied per-item instead
                                    // Note: hasBrandDiscounts will update when selectedCustomerId changes
                                    setOpenCustomerSearch(false);
                                  }}
                                  className="cursor-pointer"
                                >
                                  <Check className={cn("mr-2 h-4 w-4", selectedCustomerId === customer.id ? "opacity-100" : "opacity-0")} />
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
              <Button variant="outline" size="icon" onClick={() => setOpenCustomerDialog(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {/* Customer Discount Indicator */}
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
          </div>

          {/* Invoice No */}
          <div>
            <Label>Invoice No</Label>
            <Input 
              value={editingInvoiceId ? (savedInvoiceData?.sale_number || '') : nextInvoicePreview} 
              readOnly 
              className="bg-muted font-mono"
              placeholder="Auto-generated"
            />
          </div>

          {/* Invoice Date */}
          <div>
            <Label>Invoice Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(invoiceDate, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={invoiceDate} onSelect={(d) => d && setInvoiceDate(d)} />
              </PopoverContent>
            </Popover>
          </div>

          {/* Due Date */}
          <div>
            <Label>Due Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(dueDate, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={dueDate} onSelect={(d) => d && setDueDate(d)} />
              </PopoverContent>
            </Popover>
          </div>

          {/* Tax Type */}
          <div>
            <Label>Tax Type</Label>
            <Select value={taxType} onValueChange={(v: "exclusive" | "inclusive") => setTaxType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exclusive">Exclusive GST</SelectItem>
                <SelectItem value="inclusive">Inclusive GST</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Salesman */}
          <div>
            <Label>Salesman</Label>
            <Select value={salesman || "none"} onValueChange={(v) => setSalesman(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select salesman" />
              </SelectTrigger>
              <SelectContent>
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

        {/* Product Search with Barcode Scan */}
        <div className="mb-4 flex items-center gap-4 flex-wrap">
          {/* Entry Mode Toggle */}
          <div className="flex items-center gap-2">
            <Label className="text-sm">Entry Mode:</Label>
            <div className="flex items-center gap-2">
              <span className={`text-sm ${entryMode === "grid" ? "font-semibold" : "text-muted-foreground"}`}>
                Size Grid
              </span>
              <Switch
                checked={entryMode === "inline"}
                onCheckedChange={(checked) => setEntryMode(checked ? "inline" : "grid")}
              />
              <span className={`text-sm ${entryMode === "inline" ? "font-semibold" : "text-muted-foreground"}`}>
                Inline
              </span>
            </div>
          </div>

          {/* Barcode Scan Input - Direct scan like POS */}
          <div className="relative w-[200px]">
            <Scan className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={barcodeInputRef}
              placeholder="Scan barcode..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleBarcodeSearch}
              className="pl-10 pr-4"
              autoFocus
            />
          </div>

          {/* Browse Products Search Bar */}
          <Popover open={openProductSearch} onOpenChange={setOpenProductSearch}>
            <PopoverTrigger asChild>
              <div className="relative flex-1 min-w-[250px] cursor-pointer">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Browse Products..."
                  className="pl-10 pr-4 cursor-pointer"
                  readOnly
                  onClick={() => setOpenProductSearch(true)}
                />
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-[600px] p-0" align="start">
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
                    <CommandGroup>
                      {productSearchResults.map(({ product, variant }) => (
                        <CommandItem
                          key={variant.id}
                          value={variant.id}
                          onSelect={() => addProductToInvoice(product, variant)}
                          className="cursor-pointer py-2"
                        >
                          <div className="flex flex-col w-full gap-1">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{product.product_name}</span>
                                {product.size_range && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold">
                                    {product.size_range}
                                  </span>
                                )}
                              </div>
                              <span className="font-semibold text-primary">₹{variant.sale_price}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs text-muted-foreground">
                              <div className="flex gap-2 flex-wrap">
                                {product.brand && <span className="bg-muted px-1.5 py-0.5 rounded">{product.brand}</span>}
                                {product.category && <span className="bg-muted px-1.5 py-0.5 rounded">{product.category}</span>}
                                {product.style && <span className="bg-muted px-1.5 py-0.5 rounded">{product.style}</span>}
                                {(variant.color || product.color) && (
                                  <span className="bg-muted px-1.5 py-0.5 rounded">{variant.color || product.color}</span>
                                )}
                                <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">Size: {variant.size}</span>
                              </div>
                              <div className="flex gap-2 items-center">
                                {variant.mrp && variant.mrp !== variant.sale_price && (
                                  <span className="line-through">MRP: ₹{variant.mrp}</span>
                                )}
                                <span className={variant.stock_qty > 5 ? 'text-green-600' : 'text-orange-500'}>
                                  Stock: {variant.stock_qty}
                                </span>
                              </div>
                            </div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Live Total Qty Badge */}
          <div className="flex items-center gap-2 bg-primary/10 px-3 py-2 rounded-lg border border-primary/20">
            <span className="text-sm font-medium text-muted-foreground">Total Qty:</span>
            <span className="text-xl font-bold text-primary">
              {lineItems.reduce((sum, item) => sum + (item.productId ? item.quantity : 0), 0)}
            </span>
          </div>
        </div>

        {/* Line Items Table */}
        <div ref={tableContainerRef}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead>HSN</TableHead>
                <TableHead className="w-20">Qty</TableHead>
                <TableHead className="w-20">MRP</TableHead>
                <TableHead className="w-24">Price</TableHead>
                <TableHead className="w-16">Disc %</TableHead>
                <TableHead className="w-20">Disc ₹</TableHead>
                <TableHead className="w-16">GST %</TableHead>
                <TableHead className="w-24 text-right">Total</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                // Separate filled and empty items
                const filledItems = lineItems.filter(item => item.productId !== '');
                const emptyItems = lineItems.filter(item => item.productId === '');
                
                // Reverse filled items so newest appears first, keep empty rows at bottom
                const displayItems = [...filledItems.slice().reverse(), ...emptyItems];
                
                return displayItems.map((item) => {
                  // Calculate original SR number (1 = first added)
                  const originalIndex = lineItems.findIndex(li => li.id === item.id);
                  const srNo = item.productId ? originalIndex + 1 : '-';
                  
                  return (
                    <TableRow key={item.id} className={item.productId ? '' : 'opacity-50'}>
                      <TableCell>{srNo}</TableCell>
                      <TableCell>{item.productName || '-'}</TableCell>
                      <TableCell>{item.size || '-'}</TableCell>
                      <TableCell>{item.color || '-'}</TableCell>
                      <TableCell className="text-xs">{item.barcode || '-'}</TableCell>
                      <TableCell className="text-xs">{item.hsnCode || '-'}</TableCell>
                      <TableCell>
                        {item.productId && (
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 1)}
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            className="w-16 h-8"
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        {item.productId ? (
                          <Input
                            type="number"
                            min="0"
                            value={item.mrp}
                            onChange={(e) => updateMRP(item.id, parseFloat(e.target.value) || 0)}
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            className="w-20 h-8"
                          />
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {item.productId ? (
                          <Input
                            type="number"
                            min="0"
                            value={item.salePrice}
                            onChange={(e) => updateSalePrice(item.id, parseFloat(e.target.value) || 0)}
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            className="w-20 h-8"
                          />
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {item.productId && (
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={item.discountPercent}
                            onChange={(e) => updateDiscountPercent(item.id, parseFloat(e.target.value) || 0)}
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            className="w-14 h-8"
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        {item.productId && (
                          <Input
                            type="number"
                            min="0"
                            value={item.discountAmount}
                            onChange={(e) => updateDiscountAmount(item.id, parseFloat(e.target.value) || 0)}
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            className="w-20 h-8"
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        {item.productId ? (
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={item.gstPercent}
                            onChange={(e) => updateGSTPercent(item.id, parseFloat(e.target.value) || 0)}
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            className="w-16 h-8"
                          />
                        ) : `${item.gstPercent}%`}
                      </TableCell>
                      <TableCell className="text-right font-medium">₹{item.lineTotal.toFixed(2)}</TableCell>
                      <TableCell>
                        {item.productId && (
                          <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)}>
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                });
              })()}
            </TableBody>
          </Table>
        </div>

        {/* Summary */}
        <div className="mt-4 flex justify-end">
          <div className="w-80 space-y-2">
            <div className="flex justify-between"><span>Gross Amount:</span><span>₹{grossAmount.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Line Discount:</span><span>-₹{lineItemDiscount.toFixed(2)}</span></div>
            <div className="flex justify-between items-center">
              <span>Flat Disc %:</span>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={flatDiscountPercent}
                  onChange={(e) => setFlatDiscountPercent(parseFloat(e.target.value) || 0)}
                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                  className="w-20 h-8"
                />
                {flatDiscountPercent > 0 && (
                  <span className="text-xs text-muted-foreground">(-₹{flatDiscountPercentAmount.toFixed(2)})</span>
                )}
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span>Flat Disc ₹:</span>
              <Input
                type="number"
                min="0"
                value={flatDiscountRupees}
                onChange={(e) => setFlatDiscountRupees(parseFloat(e.target.value) || 0)}
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                className="w-20 h-8"
              />
            </div>
            {(flatDiscountPercent > 0 || flatDiscountRupees > 0) && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Flat Discount:</span>
                <span className="font-medium text-destructive">-₹{flatDiscountAmount.toFixed(2)}</span>
              </div>
            )}
            {taxType === "exclusive" && (
              <div className="flex justify-between"><span>GST:</span><span>₹{totalGST.toFixed(2)}</span></div>
            )}
            <div className="flex justify-between items-center">
              <span>Round Off:</span>
              <Input
                type="number"
                step="0.01"
                value={roundOff}
                onChange={(e) => setRoundOff(parseFloat(e.target.value) || 0)}
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                className="w-24 h-8"
              />
            </div>
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>Net Amount:</span><span>₹{netAmount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="mt-6">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="max-w-md" />
        </div>

        {/* Actions - simplified */}
        <div className="mt-6 flex gap-4">
          <Button onClick={handleSaveInvoice} disabled={isSaving} className="flex-1">
            <Eye className="mr-2 h-4 w-4" />
            {isSaving ? 'Saving...' : editingInvoiceId ? 'Update Invoice' : 'Save Invoice'}
          </Button>
          <Button 
            onClick={() => {
              handleSaveInvoice().then(() => {
                if (savedInvoiceData) handlePrint();
              });
            }} 
            disabled={isSaving} 
            variant="outline" 
            className="flex-1"
          >
            <Search className="mr-2 h-4 w-4" />
            Save & Print
          </Button>
        </div>
      </Card>

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

      {/* Draft Resume Dialog */}
      <DraftResumeDialog
        open={showDraftDialog}
        onOpenChange={setShowDraftDialog}
        draftType="sale_invoice"
        onResume={() => {
          loadDraftData(draftData);
          setShowDraftDialog(false);
        }}
        onStartFresh={async () => {
          await deleteDraft();
          setShowDraftDialog(false);
        }}
      />

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
            }))}
            subTotal={grossAmount}
            discount={totalDiscount}
            grandTotal={netAmount}
            paymentMethod="Cash"
          />
        </div>
    </div>
  );
}
