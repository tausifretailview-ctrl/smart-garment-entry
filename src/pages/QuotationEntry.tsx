import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useSettings } from "@/hooks/useSettings";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerSearch } from "@/hooks/useCustomerSearch";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { CalendarIcon, Plus, X, Search, Save, FileText, Printer, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { BackToDashboard } from "@/components/BackToDashboard";
import { SizeGridDialog } from "@/components/SizeGridDialog";
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
import { useReactToPrint } from "react-to-print";
import { QuotationPrint } from "@/components/QuotationPrint";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDraftSave } from "@/hooks/useDraftSave";


interface LineItem {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  size: string;
  barcode: string;
  quantity: number;
  mrp: number;
  salePrice: number;
  discountPercent: number;
  discountAmount: number;
  gstPercent: number;
  lineTotal: number;
  hsnCode?: string;
  color?: string;
}

const customerSchema = z.object({
  customer_name: z.string().trim().max(100).optional().or(z.literal("")),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional(),
  gst_number: z.string().trim().max(15).optional(),
});

export default function QuotationEntry() {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const location = useLocation();
  const { navigate } = useOrgNavigation();
  const [openCustomerSearch, setOpenCustomerSearch] = useState(false);
  const [customerSearchInput, setCustomerSearchInput] = useState("");
  const [quotationDate, setQuotationDate] = useState<Date>(new Date());
  const [validUntil, setValidUntil] = useState<Date>(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const [quotationNumber, setQuotationNumber] = useState<string>("");
  const [lineItems, setLineItems] = useState<LineItem[]>(
    Array(5).fill(null).map((_, i) => ({
      id: `row-${i}`,
      productId: '',
      variantId: '',
      productName: '',
      size: '',
      barcode: '',
      quantity: 0,
      mrp: 0,
      salePrice: 0,
      discountPercent: 0,
      discountAmount: 0,
      gstPercent: 0,
      lineTotal: 0,
    }))
  );
  const [openProductSearch, setOpenProductSearch] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [displayLimit, setDisplayLimit] = useState(100);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [openCustomerDialog, setOpenCustomerDialog] = useState(false);
  const [termsConditions, setTermsConditions] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [shippingAddress, setShippingAddress] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const [editingQuotationId, setEditingQuotationId] = useState<string | null>(null);
  const [taxType, setTaxType] = useState<"exclusive" | "inclusive">("inclusive");
  const [printData, setPrintData] = useState<any>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const tableEndRef = useRef<HTMLDivElement>(null);
  const [salesman, setSalesman] = useState<string>("");
  const [flatDiscountPercent, setFlatDiscountPercent] = useState<number>(0);
  const [flatDiscountAmount, setFlatDiscountAmount] = useState<number>(0);
  const [roundOff, setRoundOff] = useState<number>(0);

  // Size grid entry mode
  const [entryMode, setEntryMode] = useState<"grid" | "inline">("inline");
  const [showSizeGrid, setShowSizeGrid] = useState(false);
  const [sizeGridProduct, setSizeGridProduct] = useState<any>(null);
  const [sizeGridVariants, setSizeGridVariants] = useState<any[]>([]);
  

  // Inline search state for table row
  const [inlineSearchQuery, setInlineSearchQuery] = useState("");
  const [inlineSearchResults, setInlineSearchResults] = useState<any[]>([]);
  const [showInlineSearch, setShowInlineSearch] = useState(false);
  const [selectedInlineIndex, setSelectedInlineIndex] = useState(0);
  const inlineSearchInputRef = useRef<HTMLInputElement>(null);

  // Draft save hook
  const {
    hasDraft,
    draftData,
    saveDraft,
    deleteDraft,
    updateCurrentData,
    startAutoSave,
    stopAutoSave,
  } = useDraftSave('quotation');

  // Load draft data
  const loadDraftData = useCallback((data: any) => {
    if (!data) return;
    setQuotationDate(data.quotationDate ? new Date(data.quotationDate) : new Date());
    setValidUntil(data.validUntil ? new Date(data.validUntil) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    setLineItems(data.lineItems || Array(5).fill(null).map((_, i) => ({
      id: `row-${i}`, productId: '', variantId: '', productName: '', size: '', barcode: '',
      quantity: 0, mrp: 0, salePrice: 0, discountPercent: 0, discountAmount: 0, gstPercent: 0, lineTotal: 0,
    })));
    setSelectedCustomerId(data.selectedCustomerId || "");
    setSelectedCustomer(data.selectedCustomer || null);
    setTermsConditions(data.termsConditions || "");
    setNotes(data.notes || "");
    setShippingAddress(data.shippingAddress || "");
    setTaxType(data.taxType || "inclusive");
    setSalesman(data.salesman || "");
    setFlatDiscountPercent(data.flatDiscountPercent || 0);
    setFlatDiscountAmount(data.flatDiscountAmount || 0);
    setRoundOff(data.roundOff || 0);
    // Silent restore - no toast to avoid disturbing user
  }, [toast]);

  // Auto-load draft if navigated with resumeDraft flag
  useEffect(() => {
    if (location.state?.resumeDraft && !editingQuotationId && hasDraft && draftData) {
      loadDraftData(draftData);
    }
  }, [location.state?.resumeDraft, hasDraft, draftData, editingQuotationId]);

  // Update current data for auto-save whenever form data changes
  useEffect(() => {
    const filledItems = lineItems.filter(item => item.productId !== '');
    if (!editingQuotationId && filledItems.length > 0) {
      updateCurrentData({
        quotationDate: quotationDate.toISOString(),
        validUntil: validUntil.toISOString(),
        lineItems,
        selectedCustomerId,
        selectedCustomer,
        termsConditions,
        notes,
        shippingAddress,
        taxType,
        salesman,
        flatDiscountPercent,
        flatDiscountAmount,
        roundOff,
      });
    }
  }, [quotationDate, validUntil, lineItems, selectedCustomerId, selectedCustomer, termsConditions, notes, shippingAddress, taxType, salesman, flatDiscountPercent, flatDiscountAmount, roundOff, editingQuotationId, updateCurrentData]);

  // Start auto-save when not in edit mode
  useEffect(() => {
    if (!editingQuotationId && !location.state?.editQuotationId) {
      startAutoSave();
    }
    return () => {
      // Save draft immediately when component unmounts (tab switch, navigation)
      const filledItems = lineItems.filter(item => item.productId !== '');
      if (!editingQuotationId && filledItems.length > 0) {
        saveDraft({
          quotationDate: quotationDate.toISOString(),
          validUntil: validUntil.toISOString(),
          lineItems,
          selectedCustomerId,
          selectedCustomer,
          termsConditions,
          notes,
          shippingAddress,
          taxType,
          salesman,
          flatDiscountPercent,
          flatDiscountAmount,
          roundOff,
        }, false);
      }
      stopAutoSave();
    };
  }, [editingQuotationId, startAutoSave, stopAutoSave, location.state?.editQuotationId, lineItems, quotationDate, validUntil, selectedCustomerId, selectedCustomer, termsConditions, notes, shippingAddress, taxType, salesman, flatDiscountPercent, flatDiscountAmount, roundOff, saveDraft]);

  // Fetch settings for print (centralized, cached 5min)
  const { data: settings } = useSettings();

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Quotation_${quotationNumber}`,
  });

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

  // Generate quotation number on load
  useEffect(() => {
    const generateQuotationNumber = async () => {
      if (!currentOrganization?.id || editingQuotationId) return;
      
      try {
        const { data, error } = await supabase.rpc('generate_quotation_number', {
          p_organization_id: currentOrganization.id
        });
        
        if (error) throw error;
        setQuotationNumber(data);
      } catch (error) {
        console.error('Error generating quotation number:', error);
      }
    };
    
    generateQuotationNumber();
  }, [currentOrganization?.id, editingQuotationId]);

  // Server-side customer search (replaces fetch-all loop)
  const { filteredCustomers, isLoading: isCustomersLoading } = useCustomerSearch(customerSearchInput);

  // Fetch products with pagination - NO stock filter for quotations
  const { data: productsData } = useQuery({
    queryKey: ['products-all', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const allProducts: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from('products')
          .select(`id, product_name, brand, hsn_code, gst_per, product_type, status, category, style, color, size_group_id, uom, product_variants (id, barcode, size, color, stock_qty, sale_price, mrp, pur_price, product_id, active, deleted_at, organization_id)`)
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
      // Filter out deleted variants
      return allProducts.map((product: any) => ({
        ...product,
        product_variants: product.product_variants?.filter((v: any) => !v.deleted_at)
      }));
    },
    enabled: !!currentOrganization?.id,
    staleTime: 300000,
    refetchOnWindowFocus: false,
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

  // Load edit data
  useEffect(() => {
    const quotationData = location.state?.quotationData;
    if (quotationData) {
      setEditingQuotationId(quotationData.id);
      setQuotationNumber(quotationData.quotation_number);
      setQuotationDate(new Date(quotationData.quotation_date));
      setValidUntil(quotationData.valid_until ? new Date(quotationData.valid_until) : new Date());
      setSelectedCustomerId(quotationData.customer_id || "");
      setTaxType(quotationData.tax_type || "inclusive");
      setTermsConditions(quotationData.terms_conditions || "");
      setNotes(quotationData.notes || "");
      setShippingAddress(quotationData.shipping_address || "");
      setSalesman(quotationData.salesman || "");
      
      if (quotationData.customer_id) {
        setSelectedCustomer({
          id: quotationData.customer_id,
          customer_name: quotationData.customer_name,
          phone: quotationData.customer_phone,
          email: quotationData.customer_email,
          address: quotationData.customer_address,
        });
      }
      
      if (quotationData.quotation_items?.length > 0) {
        const items = quotationData.quotation_items.map((item: any, i: number) => ({
          id: `row-${i}`,
          productId: item.product_id,
          variantId: item.variant_id,
          productName: item.product_name,
          size: item.size,
          barcode: item.barcode || '',
          quantity: item.quantity,
          mrp: item.mrp,
          salePrice: item.unit_price,
          discountPercent: item.discount_percent,
          discountAmount: 0,
          gstPercent: item.gst_percent,
          lineTotal: item.line_total,
          hsnCode: item.hsn_code || '',
        }));
        // Pad to 5 rows
        while (items.length < 5) {
          items.push({
            id: `row-${items.length}`,
            productId: '', variantId: '', productName: '', size: '', barcode: '',
            quantity: 0, mrp: 0, salePrice: 0, discountPercent: 0, discountAmount: 0, gstPercent: 0, lineTotal: 0, hsnCode: '',
          });
        }
        setLineItems(items);
      }
    }
  }, [location.state]);

  useEffect(() => {
    if (lineItems.length > 0) {
      setLineItems(prev => prev.map(item => calculateLineTotal(item)));
    }
  }, [taxType]);

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
  const handleSizeGridConfirm = (items: Array<{ variant: any; qty: number }>) => {
    const product = sizeGridProduct;
    if (!product) return;

    // Build all changes first, then update state once
    let updatedItems = [...lineItems];
    let addedCount = 0;

    for (const { variant, qty } of items) {
      // Check if already exists in working array
      const existingIndex = updatedItems.findIndex(item => item.variantId === variant.id && item.productId !== '');
      
      if (existingIndex >= 0) {
        updatedItems[existingIndex].quantity += qty;
        updatedItems[existingIndex] = calculateLineTotal(updatedItems[existingIndex]);
        addedCount++;
      } else {
        // Find empty row in working array or add new
        const emptyRowIndex = updatedItems.findIndex(item => item.productId === '');
        const newItem: LineItem = calculateLineTotal({
          id: emptyRowIndex >= 0 ? updatedItems[emptyRowIndex].id : `row-${updatedItems.length}`,
          productId: product.id,
          variantId: variant.id,
          productName: product.product_name,
          size: variant.size,
          barcode: variant.barcode || '',
          quantity: qty,
          mrp: variant.mrp || variant.sale_price || 0,
          salePrice: variant.sale_price || 0,
          discountPercent: 0,
          discountAmount: 0,
          gstPercent: product.gst_per || 0,
          lineTotal: 0,
          hsnCode: product.hsn_code || '',
          color: variant.color || product.color || '',
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
        description: `${addedCount} size(s) added to quotation`,
      });
    }
    
    setTimeout(() => {
      tableEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const addProductToQuotation = (product: any, variant: any) => {
    // If in grid mode, open size grid dialog
    if (entryMode === "grid") {
      openSizeGridForProduct(product);
      setOpenProductSearch(false);
      setSearchInput("");
      return;
    }

    const existingIndex = lineItems.findIndex(item => item.variantId === variant.id && item.productId !== '');
    
    if (existingIndex >= 0) {
      const updatedItems = [...lineItems];
      updatedItems[existingIndex].quantity += 1;
      updatedItems[existingIndex] = calculateLineTotal(updatedItems[existingIndex]);
      setLineItems(updatedItems);
    } else {
      const emptyRowIndex = lineItems.findIndex(item => item.productId === '');
      if (emptyRowIndex === -1) {
        // Add new row
        const newRow: LineItem = calculateLineTotal({
          id: `row-${lineItems.length}`,
          productId: product.id,
          variantId: variant.id,
          productName: product.product_name,
          size: variant.size,
          barcode: variant.barcode || '',
          quantity: 1,
          mrp: variant.mrp || variant.sale_price || 0,
          salePrice: variant.sale_price || 0,
          discountPercent: 0,
          discountAmount: 0,
          gstPercent: product.gst_per || 0,
          lineTotal: 0,
          hsnCode: product.hsn_code || '',
          color: variant.color || product.color || '',
        });
        setLineItems(prev => [...prev, newRow]);
      } else {
        const updatedItems = [...lineItems];
        updatedItems[emptyRowIndex] = calculateLineTotal({
          id: updatedItems[emptyRowIndex].id,
          productId: product.id,
          variantId: variant.id,
          productName: product.product_name,
          size: variant.size,
          barcode: variant.barcode || '',
          quantity: 1,
          mrp: variant.mrp || variant.sale_price || 0,
          salePrice: variant.sale_price || 0,
          discountPercent: 0,
          discountAmount: 0,
          gstPercent: product.gst_per || 0,
          lineTotal: 0,
          hsnCode: product.hsn_code || '',
          color: variant.color || product.color || '',
        });
        setLineItems(updatedItems);
      }
    }
    
    setOpenProductSearch(false);
    setSearchInput("");
    toast({ title: "Product Added", description: `${product.product_name} (${variant.size}) added` });
    
    // Auto scroll to bottom
    setTimeout(() => {
      tableEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const calculateLineTotal = (item: LineItem): LineItem => {
    const baseAmount = item.salePrice * item.quantity;
    const discountAmount = item.discountPercent > 0 
      ? (baseAmount * item.discountPercent) / 100 
      : item.discountAmount;
    const amountAfterDiscount = baseAmount - discountAmount;
    
    let lineTotal: number;
    if (taxType === "inclusive") {
      lineTotal = amountAfterDiscount;
    } else {
      const gstAmount = (amountAfterDiscount * item.gstPercent) / 100;
      lineTotal = amountAfterDiscount + gstAmount;
    }
    
    return { ...item, discountAmount, lineTotal };
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity < 1) return;
    setLineItems(prev => prev.map(item => 
      item.id === id ? calculateLineTotal({ ...item, quantity }) : item
    ));
  };

  const updateDiscountPercent = (id: string, discountPercent: number) => {
    setLineItems(prev => prev.map(item => 
      item.id === id ? calculateLineTotal({ ...item, discountPercent, discountAmount: 0 }) : item
    ));
  };

  const updateSalePrice = (id: string, salePrice: number) => {
    setLineItems(prev => prev.map(item => 
      item.id === id ? calculateLineTotal({ ...item, salePrice }) : item
    ));
  };

  const updateGstPercent = (id: string, gstPercent: number) => {
    setLineItems(prev => prev.map(item => 
      item.id === id ? calculateLineTotal({ ...item, gstPercent }) : item
    ));
  };

  const removeItem = (id: string) => {
    setLineItems(prev => prev.map(item => 
      item.id === id ? {
        ...item, productId: '', variantId: '', productName: '', size: '', barcode: '',
        quantity: 0, mrp: 0, salePrice: 0, discountPercent: 0, discountAmount: 0, gstPercent: 0, lineTotal: 0,
      } : item
    ));
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
        organization_id: currentOrganization.id,
      });
      
      setSelectedCustomerId(result.customer.id);
      setSelectedCustomer(result.customer);
      customerForm.reset();
      setOpenCustomerDialog(false);
      
      if (result.isExisting) {
        toast({ title: "Customer Found", description: `${result.customer.customer_name} already exists and has been selected` });
      } else {
        toast({ title: "Customer Created", description: `${result.customer.customer_name} has been added` });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  // Calculate totals
  const filledItems = lineItems.filter(item => item.productId !== '');
  const grossAmount = filledItems.reduce((sum, item) => sum + (item.salePrice * item.quantity), 0);
  const totalLineDiscount = filledItems.reduce((sum, item) => sum + item.discountAmount, 0);
  const amountAfterLineDiscount = grossAmount - totalLineDiscount;
  
  // Flat discount calculation
  const calculatedFlatDiscount = flatDiscountPercent > 0 
    ? (amountAfterLineDiscount * flatDiscountPercent) / 100 
    : flatDiscountAmount;
  const amountAfterFlatDiscount = amountAfterLineDiscount - calculatedFlatDiscount;
  
  const totalGST = taxType === "exclusive" 
    ? filledItems.reduce((sum, item) => sum + ((item.salePrice * item.quantity - item.discountAmount) * item.gstPercent / 100), 0)
    : 0;
  const subtotal = amountAfterFlatDiscount + totalGST;
  const netAmount = subtotal + roundOff;
  const totalDiscount = totalLineDiscount + calculatedFlatDiscount;

  // Inline search for product row - debounced
  useEffect(() => {
    if (!inlineSearchQuery || inlineSearchQuery.length < 1) {
      setInlineSearchResults([]);
      setShowInlineSearch(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const query = inlineSearchQuery.toLowerCase().replace(/[%_(),."']/g, '');
        if (!query) return;
        
        // Search products by name/brand/style
        const { data: matchingProducts } = await supabase
          .from("products")
          .select("id")
          .is("deleted_at", null)
          .eq("organization_id", currentOrganization?.id)
          .or(`product_name.ilike.%${query}%,brand.ilike.%${query}%,style.ilike.%${query}%`);

        const productIds = matchingProducts?.map(p => p.id) || [];

        // Search variants by barcode match
        const { data: barcodeVariants } = await supabase
          .from("product_variants")
          .select(`
            id, size, pur_price, sale_price, mrp, barcode, color, stock_qty, product_id,
            products (id, product_name, brand, category, style, color, hsn_code, gst_per)
          `)
          .eq("active", true)
          .is("deleted_at", null)
          .eq("organization_id", currentOrganization?.id)
          .ilike("barcode", `%${query}%`)
          .limit(50);

        // Search variants by matching product IDs
        let productVariants: any[] = [];
        if (productIds.length > 0) {
          const { data } = await supabase
            .from("product_variants")
            .select(`
              id, size, pur_price, sale_price, mrp, barcode, color, stock_qty, product_id,
              products (id, product_name, brand, category, style, color, hsn_code, gst_per)
            `)
            .eq("active", true)
            .is("deleted_at", null)
            .eq("organization_id", currentOrganization?.id)
            .in("product_id", productIds)
            .limit(100);
          productVariants = data || [];
        }

        // Merge and deduplicate
        const allVariants = [...(barcodeVariants || []), ...productVariants];
        const uniqueMap = new Map();
        allVariants.forEach(v => uniqueMap.set(v.id, v));
        const data = Array.from(uniqueMap.values());

        const results = (data || []).map((v: any) => ({
          id: v.id,
          product_id: v.products?.id || "",
          size: v.size,
          sale_price: v.sale_price,
          mrp: v.mrp || 0,
          barcode: v.barcode || "",
          stock_qty: v.stock_qty || 0,
          product_name: v.products?.product_name || "",
          brand: v.products?.brand || "",
          category: v.products?.category || "",
          color: v.color || v.products?.color || "",
          style: v.products?.style || "",
          gst_per: v.products?.gst_per || 0,
          hsn_code: v.products?.hsn_code || "",
        }));

        setInlineSearchResults(results);
        setSelectedInlineIndex(0);
        setShowInlineSearch(true);
      } catch (error) {
        console.error("Inline search error:", error);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [inlineSearchQuery, currentOrganization?.id]);

  const handleInlineProductSelect = (result: any) => {
    setInlineSearchQuery("");
    setShowInlineSearch(false);
    setInlineSearchResults([]);

    // Find the full product from productsData
    const product = productsData?.find(p => p.id === result.product_id);
    const variant = product?.product_variants?.find((v: any) => v.id === result.id);

    if (product && variant) {
      addProductToQuotation(product, variant);
    } else {
      // Fallback: create minimal product/variant from result
      const fallbackProduct = {
        id: result.product_id,
        product_name: result.product_name,
        brand: result.brand,
        category: result.category,
        style: result.style,
        color: result.color,
        gst_per: result.gst_per,
        hsn_code: result.hsn_code,
        product_variants: [result],
      };
      addProductToQuotation(fallbackProduct, result);
    }
  };

  const formatInlineProductDescription = (result: any) => {
    const parts = [result.product_name];
    if (result.brand) parts.push(result.brand);
    if (result.category) parts.push(result.category);
    if (result.style) parts.push(result.style);
    if (result.color) parts.push(result.color);
    parts.push(result.size);
    return parts.join(' | ');
  };

  const handleSaveQuotation = async () => {
    // PRIMARY GUARD: synchronous ref shared with handleSaveAndPrint (React state updates are async)
    if (savingRef.current) return { success: false };
    if (isSaving) return { success: false };
    savingRef.current = true;
    try {
      return await handleSaveQuotationInner();
    } finally {
      savingRef.current = false;
    }
  };

  const handleSaveQuotationInner = async () => {
    if (filledItems.length === 0) {
      toast({ title: "Error", description: "Add at least one item", variant: "destructive" });
      return { success: false };
    }

    setIsSaving(true);
    try {
      const quotationData = {
        organization_id: currentOrganization?.id,
        quotation_number: quotationNumber,
        quotation_date: quotationDate.toISOString(),
        valid_until: validUntil.toISOString().split('T')[0],
        customer_id: selectedCustomerId || null,
        customer_name: selectedCustomer?.customer_name || 'Walk in Customer',
        customer_phone: selectedCustomer?.phone || null,
        customer_email: selectedCustomer?.email || null,
        customer_address: selectedCustomer?.address || null,
        gross_amount: grossAmount,
        discount_amount: totalLineDiscount,
        flat_discount_percent: flatDiscountPercent,
        flat_discount_amount: calculatedFlatDiscount,
        gst_amount: totalGST,
        round_off: roundOff,
        net_amount: netAmount,
        status: 'draft',
        tax_type: taxType,
        notes,
        terms_conditions: termsConditions,
        shipping_address: shippingAddress,
        salesman: salesman || null,
      };

      let quotationId = editingQuotationId;

      if (editingQuotationId) {
        const { error } = await supabase
          .from('quotations')
          .update(quotationData)
          .eq('id', editingQuotationId);
        if (error) throw error;
        
        await supabase.from('quotation_items').delete().eq('quotation_id', editingQuotationId);
      } else {
        const { data, error } = await supabase
          .from('quotations')
          .insert([quotationData])
          .select()
          .single();
        if (error) throw error;
        quotationId = data.id;
      }

      const quotationItems = filledItems.map(item => ({
        quotation_id: quotationId,
        product_id: item.productId,
        variant_id: item.variantId,
        product_name: item.productName,
        size: item.size,
        barcode: item.barcode,
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
        .from('quotation_items')
        .insert(quotationItems);
      if (itemsError) throw itemsError;

      // Auto-send WhatsApp quotation notification (does not block saving)
      if (selectedCustomer?.phone && currentOrganization?.id && !editingQuotationId) {
        try {
          const { data: whatsappSettings } = await (supabase as any)
            .from('whatsapp_api_settings')
            .select('is_active, auto_send_quotation, quotation_template_name')
            .eq('organization_id', currentOrganization.id)
            .maybeSingle();

          if (whatsappSettings?.is_active && whatsappSettings?.auto_send_quotation) {
            const companyName = (settings as any)?.business_name || currentOrganization.name || 'Our Company';
            const contactNumber = (settings as any)?.mobile_number || 'N/A';

            const formattedDate = new Date(quotationDate).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            });
            const formattedValidUntil = new Date(validUntil).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            });
            const formattedAmount = `${Number(netAmount).toLocaleString('en-IN')}`;

            const templateParams = [
              selectedCustomer.customer_name || 'Valued Customer',
              quotationNumber,
              formattedDate,
              formattedAmount,
              formattedValidUntil,
              companyName,
              contactNumber,
            ];

            const messageText = `Hello ${selectedCustomer.customer_name || 'Valued Customer'},\n\nYour quotation ${quotationNumber} has been created.\nAmount: ₹${formattedAmount}\nDate: ${formattedDate}\nValid Until: ${formattedValidUntil}\n\nThank you for your interest!\n${companyName}\n${contactNumber}`;

            await supabase.functions.invoke('send-whatsapp', {
              body: {
                organizationId: currentOrganization.id,
                phone: selectedCustomer.phone,
                message: messageText,
                templateType: 'quotation',
                templateName: whatsappSettings.quotation_template_name || null,
                templateParams,
                referenceId: quotationId,
                referenceType: 'quotation',
              },
            });
          }
        } catch (e) {
          console.error('WhatsApp auto-send failed (QuotationEntry):', e);
        }
      }

      toast({ title: "Success", description: `Quotation ${quotationNumber} saved` });
      return { success: true, quotationId };
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
      return { success: false };
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndPrint = async () => {
    // PRIMARY GUARD: shares savingRef with handleSaveQuotation so rapid Save→Save&Print is blocked
    if (savingRef.current) return;
    if (isSaving) return;
    savingRef.current = true;
    try {
      await handleSaveAndPrintInner();
    } finally {
      savingRef.current = false;
    }
  };

  const handleSaveAndPrintInner = async () => {
    const result = await handleSaveQuotationInner();
    if (result.success) {
      // Prepare print data
      const printItems = filledItems.map((item, index) => ({
        sr: index + 1,
        particulars: item.productName,
        size: item.size,
        barcode: item.barcode,
        hsn: '',
        qty: item.quantity,
        rate: item.salePrice,
        mrp: item.mrp,
        discountPercent: item.discountPercent,
        total: item.lineTotal,
      }));

      setPrintData({
        items: printItems,
        grossAmount,
        discountAmount: totalDiscount,
        taxableAmount: grossAmount - totalDiscount,
        gstAmount: totalGST,
        roundOff: 0,
        netAmount,
      });

      setTimeout(() => {
        handlePrint();
        navigate('/quotation-dashboard');
      }, 100);
    }
  };

  const filteredProducts = productsData?.filter(product => {
    const searchLower = searchInput.toLowerCase();
    const matchesProduct = product.product_name?.toLowerCase().includes(searchLower) ||
      product.brand?.toLowerCase().includes(searchLower) ||
      product.category?.toLowerCase().includes(searchLower) ||
      product.style?.toLowerCase().includes(searchLower) ||
      product.color?.toLowerCase().includes(searchLower);
    const matchesVariant = product.product_variants?.some((v: any) => 
      v.barcode?.toLowerCase().includes(searchLower) ||
      v.color?.toLowerCase().includes(searchLower)
    );
    return matchesProduct || matchesVariant;
  }) || [];

  // Count total matching variants (not just products)
  const totalMatchingVariants = filteredProducts.reduce(
    (count, product) => count + (product.product_variants?.length || 0),
    0
  );

  // Reset display limit when search changes
  useEffect(() => {
    setDisplayLimit(100);
  }, [searchInput]);

  return (
    <div className="p-6 space-y-6">
      <BackToDashboard />
      
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            {editingQuotationId ? 'Edit Quotation' : 'New Quotation'}
          </h1>
          <div className="flex items-center gap-2">
            <Label>Quotation No:</Label>
            <Input value={quotationNumber} readOnly className="w-40 bg-muted" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div>
            <Label>Quotation Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(quotationDate, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={quotationDate} onSelect={(d) => d && setQuotationDate(d)} />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label>Valid Until</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(validUntil, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={validUntil} onSelect={(d) => d && setValidUntil(d)} />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label>Customer</Label>
            <div className="flex gap-2">
              <Popover open={openCustomerSearch} onOpenChange={setOpenCustomerSearch}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="flex-1 justify-between font-normal">
                    {selectedCustomer ? `${selectedCustomer.customer_name}${selectedCustomer.phone ? ` - ${selectedCustomer.phone}` : ''}` : "Select customer"}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[350px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput 
                      placeholder="Search by name or phone..." 
                      value={customerSearchInput}
                      onValueChange={setCustomerSearchInput}
                    />
                    <CommandList>
                      <CommandEmpty>{isCustomersLoading ? "Searching..." : "No customer found."}</CommandEmpty>
                      <CommandGroup>
                        {filteredCustomers.map(customer => (
                          <CommandItem
                            key={customer.id}
                            value={customer.id}
                            onSelect={() => {
                              setSelectedCustomerId(customer.id);
                              setSelectedCustomer(customer);
                              setOpenCustomerSearch(false);
                              setCustomerSearchInput("");
                            }}
                          >
                            <span className="font-medium">{customer.customer_name}</span>
                            {customer.phone && <span className="ml-2 text-muted-foreground text-xs">{customer.phone}</span>}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <Button variant="outline" size="icon" onClick={() => setOpenCustomerDialog(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

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

          <div>
            <Label>Salesman</Label>
            <Select value={salesman || "none"} onValueChange={(v) => setSalesman(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select Salesman" />
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

        {/* Product Search */}
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

          <Popover open={openProductSearch} onOpenChange={setOpenProductSearch}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="flex-1 justify-start min-w-[300px]">
                <Search className="mr-2 h-4 w-4" />
                Search Products (No Stock Restriction)
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[600px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search by name, barcode, brand, color, style..." value={searchInput} onValueChange={setSearchInput} />
                <CommandList className="max-h-[400px]">
                  <CommandEmpty>No products found</CommandEmpty>
                  {totalMatchingVariants > displayLimit && (
                    <div className="px-3 py-2 text-sm text-muted-foreground bg-muted/50 border-b flex items-center justify-between">
                      <span>Showing {displayLimit} of {totalMatchingVariants} results</span>
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-primary"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDisplayLimit(prev => prev + 100);
                        }}
                      >
                        Load More
                      </Button>
                    </div>
                  )}
                  <CommandGroup>
                    {(() => {
                      let variantCount = 0;
                      return filteredProducts.map(product => 
                        product.product_variants?.map((variant: any) => {
                          if (variantCount >= displayLimit) return null;
                          variantCount++;
                          return (
                            <CommandItem
                              key={variant.id}
                              onSelect={() => addProductToQuotation(product, variant)}
                              className="cursor-pointer py-2"
                            >
                              <div className="flex flex-col w-full gap-1">
                                <div className="flex justify-between items-center">
                                  <span className="font-medium">{product.product_name}</span>
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
                                    <span className={variant.stock_qty > 5 ? 'text-green-600' : variant.stock_qty > 0 ? 'text-orange-500' : 'text-destructive'}>
                                      Stock: {variant.stock_qty}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </CommandItem>
                          );
                        })
                      );
                    })()}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Line Items Table */}
        <div className="border rounded-md overflow-hidden relative">
          <ScrollArea className="h-[400px]" showScrollbar>
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead>HSN</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="w-20">Qty</TableHead>
                <TableHead className="w-24">Price</TableHead>
                <TableHead className="w-20">Disc %</TableHead>
                <TableHead className="w-20">GST %</TableHead>
                <TableHead className="w-24 text-right">Total</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map((item, index) => (
                <TableRow key={item.id} className={item.productId ? '' : 'opacity-50'}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>{item.productName || '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{item.barcode || '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{item.hsnCode || '-'}</TableCell>
                  <TableCell className="text-xs">{item.color || '-'}</TableCell>
                  <TableCell>{item.size || '-'}</TableCell>
                  <TableCell>
                    {item.productId && (
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 1)}
                        className="w-16 h-8"
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {item.productId && (
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.salePrice}
                        onChange={(e) => updateSalePrice(item.id, parseFloat(e.target.value) || 0)}
                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                        className="w-20 h-8"
                      />
                    )}
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
                        className="w-16 h-8"
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {item.productId && (
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={item.gstPercent}
                        onChange={(e) => updateGstPercent(item.id, parseFloat(e.target.value) || 0)}
                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                        className="w-16 h-8"
                      />
                    )}
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
              ))}
              
              {/* Inline Search Row - Always visible at bottom */}
              <TableRow className="bg-accent/30 relative" style={{ zIndex: 50 }}>
                <TableCell className="font-medium text-muted-foreground">
                  {lineItems.filter(item => item.productId).length + 1}
                </TableCell>
                <TableCell colSpan={2} className="relative overflow-visible" style={{ overflow: 'visible' }}>
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
                    
                    {/* Inline Search Dropdown - Using Portal */}
                    {showInlineSearch && inlineSearchInputRef.current && createPortal(
                      <div 
                        className="bg-popover border border-border rounded-md shadow-xl max-h-80 overflow-auto"
                        style={{ 
                          position: 'fixed',
                          top: inlineSearchInputRef.current.getBoundingClientRect().bottom + 4,
                          left: inlineSearchInputRef.current.getBoundingClientRect().left,
                          width: Math.max(450, inlineSearchInputRef.current.getBoundingClientRect().width),
                          zIndex: 9999,
                        }}
                      >
                        {inlineSearchResults.length > 0 ? (
                          inlineSearchResults.map((result, idx) => (
                            <button
                              key={result.id + idx}
                              onClick={() => handleInlineProductSelect(result)}
                              onMouseEnter={() => setSelectedInlineIndex(idx)}
                              className={cn(
                                "w-full text-left px-4 py-3 text-popover-foreground border-b border-border last:border-0 transition-colors",
                                idx === selectedInlineIndex ? "bg-accent" : "hover:bg-accent/50"
                              )}
                            >
                              <div className="font-medium">{formatInlineProductDescription(result)}</div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                {result.barcode && <span>Barcode: {result.barcode}</span>}
                                <span className="text-primary font-medium">₹{result.sale_price?.toFixed(2) || '0.00'}</span>
                                <span className={result.stock_qty > 5 ? 'text-green-600' : result.stock_qty > 0 ? 'text-orange-500' : 'text-destructive'}>
                                  Stock: {result.stock_qty}
                                </span>
                              </div>
                            </button>
                          ))
                        ) : inlineSearchQuery.length >= 1 ? (
                          <div className="px-4 py-3 text-sm text-muted-foreground">
                            No products found for "{inlineSearchQuery}"
                          </div>
                        ) : null}
                      </div>,
                      document.body
                    )}
                  </div>
                </TableCell>
                <TableCell colSpan={9} className="text-muted-foreground text-sm">
                  Type to search or use the search button above
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <div ref={tableEndRef} />
          </ScrollArea>
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          Total Items: {lineItems.filter(item => item.productId).length}
        </div>

        {/* Summary with Flat Discount & Round Off */}
        <div className="mt-4 flex justify-between items-start">
          <div className="grid grid-cols-2 gap-4 w-80">
            <div>
              <Label>Flat Discount %</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={flatDiscountPercent}
                onChange={(e) => {
                  setFlatDiscountPercent(parseFloat(e.target.value) || 0);
                  setFlatDiscountAmount(0);
                }}
                className="h-10"
              />
            </div>
            <div>
              <Label>Flat Discount ₹</Label>
              <Input
                type="number"
                min="0"
                value={flatDiscountAmount}
                onChange={(e) => {
                  setFlatDiscountAmount(parseFloat(e.target.value) || 0);
                  setFlatDiscountPercent(0);
                }}
                className="h-10"
              />
            </div>
            <div className="col-span-2">
              <Label>Round Off</Label>
              <Input
                type="number"
                step="0.01"
                value={roundOff}
                onChange={(e) => setRoundOff(parseFloat(e.target.value) || 0)}
                className="h-10"
              />
            </div>
          </div>
          <div className="w-72 space-y-2">
            <div className="flex justify-between"><span>Gross Amount:</span><span>₹{grossAmount.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Line Discount:</span><span>-₹{totalLineDiscount.toFixed(2)}</span></div>
            {calculatedFlatDiscount > 0 && (
              <div className="flex justify-between"><span>Flat Discount:</span><span>-₹{calculatedFlatDiscount.toFixed(2)}</span></div>
            )}
            {taxType === "exclusive" && (
              <div className="flex justify-between"><span>GST:</span><span>₹{totalGST.toFixed(2)}</span></div>
            )}
            {roundOff !== 0 && (
              <div className="flex justify-between"><span>Round Off:</span><span>₹{roundOff.toFixed(2)}</span></div>
            )}
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>Net Amount:</span><span>₹{netAmount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Notes & Terms */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Terms & Conditions</Label>
            <Textarea value={termsConditions} onChange={(e) => setTermsConditions(e.target.value)} rows={3} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-4">
          <Button onClick={() => handleSaveQuotation().then(r => r.success && navigate('/quotation-dashboard'))} disabled={isSaving} className="flex-1">
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save Quotation'}
          </Button>
          <Button onClick={handleSaveAndPrint} disabled={isSaving} variant="outline" className="flex-1">
            <Printer className="mr-2 h-4 w-4" />
            Save & Print
          </Button>
        </div>
      </Card>

      {/* Print Component (hidden) */}
      <div className="hidden">
        <QuotationPrint
          ref={printRef}
          businessName={settings?.business_name || ''}
          address={settings?.address || ''}
          mobile={settings?.mobile_number || ''}
          email={settings?.email_id || ''}
          gstNumber={settings?.gst_number || ''}
          logoUrl=""
          quotationNumber={quotationNumber}
          quotationDate={quotationDate}
          validUntil={validUntil}
          customerName={selectedCustomer?.customer_name || 'Walk in Customer'}
          customerAddress={selectedCustomer?.address}
          customerMobile={selectedCustomer?.phone}
          customerEmail={selectedCustomer?.email}
          customerGSTIN={selectedCustomer?.gst_number}
          items={printData?.items || []}
          grossAmount={printData?.grossAmount || 0}
          discountAmount={printData?.discountAmount || 0}
          taxableAmount={printData?.taxableAmount || 0}
          gstAmount={printData?.gstAmount || 0}
          roundOff={0}
          netAmount={printData?.netAmount || 0}
          termsConditions={termsConditions}
          notes={notes}
          taxType={taxType}
          salesman={salesman}
        />
      </div>

      {/* Create Customer Dialog */}
      <Dialog open={openCustomerDialog} onOpenChange={setOpenCustomerDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
          </DialogHeader>
          <Form {...customerForm}>
            <form onSubmit={customerForm.handleSubmit(handleCreateCustomer)} className="space-y-4">
              <FormField control={customerForm.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Mobile Number *</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={customerForm.control} name="customer_name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={customerForm.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={customerForm.control} name="address" render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl><Textarea {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" className="w-full">Create Customer</Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Size Grid Dialog */}
      <SizeGridDialog
        open={showSizeGrid}
        onClose={() => setShowSizeGrid(false)}
        product={sizeGridProduct}
        variants={sizeGridVariants}
        onConfirm={handleSizeGridConfirm}
        showStock={true}
        validateStock={false}
        title="Enter Size-wise Qty"
      />

    </div>
  );
}
