import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useSettings } from "@/hooks/useSettings";
import { useCustomerSearch } from "@/hooks/useCustomerSearch";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { CalendarIcon, Plus, X, Search, Save, ClipboardList, AlertTriangle, CheckCircle, Printer, ChevronDown, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { UOM_OPTIONS, DEFAULT_UOM, UOMType } from "@/constants/uom";
import { cn, sortSearchResults, buildProductDisplayName } from "@/lib/utils";
import { entryPageMainClass, entryPageSectionX, entryPageShellClass } from "@/lib/entryPageLayout";
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
import { Badge } from "@/components/ui/badge";
import { useReactToPrint } from "react-to-print";
import { SaleOrderPrint } from "@/components/SaleOrderPrint";
import { INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS } from "@/utils/thermalReceiptPrintDocument";
import { waitForPrintReady } from "@/utils/printReady";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDraftSave } from "@/hooks/useDraftSave";

import { fetchCustomerProductPrice } from "@/hooks/useCustomerProductPrice";
import { ProductHistoryDialog } from "@/components/ProductHistoryDialog";
import { ERPVariantRow, groupVariantsByProduct } from "@/components/ERPVariantSearchDropdown";

interface LineItem {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  size: string;
  barcode: string;
  orderQty: number;
  box: string;
  stockQty: number;
  mrp: number;
  salePrice: number;
  discountPercent: number;
  discountAmount: number;
  gstPercent: number;
  lineTotal: number;
  hsnCode?: string;
  color?: string;
  uom: string;
}

const customerSchema = z.object({
  customer_name: z.string().trim().max(100).optional().or(z.literal("")),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional(),
  gst_number: z.string().trim().max(15).optional(),
});

const VARIANT_SEARCH_SELECT = `
  id, size, pur_price, sale_price, mrp, barcode, color, stock_qty, product_id,
  products (id, product_name, brand, category, style, color, hsn_code, gst_per, uom)
`;

export type SaleOrderVariantSearchResult = {
  id: string;
  product_id: string;
  size: string;
  sale_price: number;
  mrp: number;
  barcode: string;
  stock_qty: number;
  product_name: string;
  brand: string;
  category: string;
  color: string;
  style: string;
  gst_per: number;
  hsn_code: string;
  uom?: string;
};

function mapVariantSearchRow(v: any): SaleOrderVariantSearchResult {
  return {
    id: v.id,
    product_id: v.products?.id || v.product_id || "",
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
    uom: v.products?.uom,
  };
}

/** Server-side variant search — avoids broken PostgREST `.or()` with `.in()` on one query. */
async function searchSaleOrderVariants(
  orgId: string,
  rawQuery: string,
): Promise<SaleOrderVariantSearchResult[]> {
  const normalized = rawQuery.trim().toLowerCase().replace(/[%_(),."']/g, "");
  if (!normalized) return [];

  const searchTerms = normalized.split(/\s+/).filter(Boolean);
  const primaryTerm = searchTerms[0] || normalized;

  const { data: matchingProducts } = await supabase
    .from("products")
    .select("id")
    .is("deleted_at", null)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .or(
      `product_name.ilike.%${primaryTerm}%,brand.ilike.%${primaryTerm}%,style.ilike.%${primaryTerm}%,category.ilike.%${primaryTerm}%`,
    );

  const productIds = matchingProducts?.map((p) => p.id) || [];

  const { data: barcodeVariants } = await supabase
    .from("product_variants")
    .select(VARIANT_SEARCH_SELECT)
    .eq("active", true)
    .is("deleted_at", null)
    .eq("organization_id", orgId)
    .ilike("barcode", `%${primaryTerm}%`)
    .limit(50);

  let productVariants: any[] = [];
  if (productIds.length > 0) {
    const { data } = await supabase
      .from("product_variants")
      .select(VARIANT_SEARCH_SELECT)
      .eq("active", true)
      .is("deleted_at", null)
      .eq("organization_id", orgId)
      .in("product_id", productIds)
      .limit(100);
    productVariants = data || [];
  }

  if (productIds.length === 0) {
    const { data: fuzzyVariants } = await supabase
      .from("product_variants")
      .select(VARIANT_SEARCH_SELECT)
      .eq("active", true)
      .is("deleted_at", null)
      .eq("organization_id", orgId)
      .or(`color.ilike.%${primaryTerm}%,size.ilike.%${primaryTerm}%`)
      .limit(50);
    productVariants = fuzzyVariants || [];
  }

  const uniqueMap = new Map<string, any>();
  [...(barcodeVariants || []), ...productVariants].forEach((v) => uniqueMap.set(v.id, v));

  let results = Array.from(uniqueMap.values()).map(mapVariantSearchRow);

  if (searchTerms.length > 1) {
    results = results.filter((r) => {
      const haystack =
        `${r.product_name} ${r.brand} ${r.color} ${r.size} ${r.barcode} ${r.style} ${r.category}`.toLowerCase();
      return searchTerms.every((term) => haystack.includes(term));
    });
  }

  return sortSearchResults(results, normalized, {
    barcode: "barcode",
    style: "style",
    productName: "product_name",
  });
}

export default function SaleOrderEntry() {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const location = useLocation();
  const { orgNavigate: navigate } = useOrgNavigation();
  const [orderDate, setOrderDate] = useState<Date>(new Date());
  const [expectedDelivery, setExpectedDelivery] = useState<Date>(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const [orderNumber, setOrderNumber] = useState<string>("");
  const [lineItems, setLineItems] = useState<LineItem[]>(
    Array(5).fill(null).map((_, i) => ({
      id: `row-${i}`,
      productId: '',
      variantId: '',
      productName: '',
      size: '',
      barcode: '',
      orderQty: 0,
      box: '',
      stockQty: 0,
      mrp: 0,
      salePrice: 0,
      discountPercent: 0,
      discountAmount: 0,
      gstPercent: 0,
      lineTotal: 0,
      uom: DEFAULT_UOM,
    }))
  );
  const [openProductSearch, setOpenProductSearch] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [popoverSearchResults, setPopoverSearchResults] = useState<SaleOrderVariantSearchResult[]>([]);
  const [isProductSearching, setIsProductSearching] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(100);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [openCustomerDialog, setOpenCustomerDialog] = useState(false);
  const [termsConditions, setTermsConditions] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [shippingAddress, setShippingAddress] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [quotationId, setQuotationId] = useState<string | null>(null);
  const [taxType, setTaxType] = useState<"exclusive" | "inclusive">("inclusive");
  const [printData, setPrintData] = useState<any>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const tableEndRef = useRef<HTMLDivElement>(null);
  const skipDraftSaveOnUnmountRef = useRef(false);
  const [salesman, setSalesman] = useState<string>("");
  const [invoiceFormat, setInvoiceFormat] = useState<"standard" | "wholesale-size-grouping">("standard");
  const [flatDiscountPercent, setFlatDiscountPercent] = useState<number>(0);
  const [flatDiscountAmount, setFlatDiscountAmount] = useState<number>(0);
  const [roundOff, setRoundOff] = useState<number>(0);
  const initialDraftCheckDone = useRef(false);

  // Size grid entry mode - will be set from settings
  const [entryMode, setEntryMode] = useState<"grid" | "inline">("inline");
  const [entryModeInitialized, setEntryModeInitialized] = useState(false);
  const [showSizeGrid, setShowSizeGrid] = useState(false);
  const [sizeGridProduct, setSizeGridProduct] = useState<any>(null);
  const [sizeGridVariants, setSizeGridVariants] = useState<any[]>([]);
  
  
  // Product history dialog state
  const [historyProduct, setHistoryProduct] = useState<{ id: string; name: string } | null>(null);


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
  } = useDraftSave('sale_order');

  // Load draft data
  const loadDraftData = useCallback((data: any) => {
    if (!data) return;
    setOrderDate(data.orderDate ? new Date(data.orderDate) : new Date());
    setExpectedDelivery(data.expectedDelivery ? new Date(data.expectedDelivery) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    setLineItems(data.lineItems || Array(5).fill(null).map((_, i) => ({
      id: `row-${i}`, productId: '', variantId: '', productName: '', size: '', barcode: '',
      orderQty: 0, box: '', stockQty: 0, mrp: 0, salePrice: 0, discountPercent: 0, discountAmount: 0, gstPercent: 0, lineTotal: 0, uom: DEFAULT_UOM,
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
    if (!editingOrderId && filledItems.length > 0) {
      updateCurrentData({
        orderDate: orderDate.toISOString(),
        expectedDelivery: expectedDelivery.toISOString(),
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
  }, [orderDate, expectedDelivery, lineItems, selectedCustomerId, selectedCustomer, termsConditions, notes, shippingAddress, taxType, salesman, flatDiscountPercent, flatDiscountAmount, roundOff, editingOrderId, updateCurrentData]);

  // Start auto-save when not in edit mode
  useEffect(() => {
    if (!editingOrderId && !location.state?.editOrderId) {
      startAutoSave();
    }
    return () => {
      // Save draft immediately when component unmounts (tab switch, navigation)
      const filledItems = lineItems.filter(item => item.productId !== '');
      if (!skipDraftSaveOnUnmountRef.current && !editingOrderId && filledItems.length > 0) {
        saveDraft({
          orderDate: orderDate.toISOString(),
          expectedDelivery: expectedDelivery.toISOString(),
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
  }, [editingOrderId, startAutoSave, stopAutoSave, location.state?.editOrderId, lineItems, orderDate, expectedDelivery, selectedCustomerId, selectedCustomer, termsConditions, notes, shippingAddress, taxType, salesman, flatDiscountPercent, flatDiscountAmount, roundOff, saveDraft]);

  // Fetch settings for print (centralized, cached 5min)
  const { data: settings } = useSettings();

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `SaleOrder_${orderNumber}`,
    pageStyle: `@page { size: A4 portrait; margin: 10mm; }
      ${INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS}`,
    onBeforePrint: () =>
      new Promise<void>((resolve) => {
        waitForPrintReady(printRef, resolve, { maxWait: 8000 });
      }),
  });

  const customerForm = useForm<z.infer<typeof customerSchema>>({
    resolver: zodResolver(customerSchema),
    defaultValues: { customer_name: "", phone: "", email: "", address: "", gst_number: "" },
  });

  // Generate order number
  useEffect(() => {
    const generateOrderNumber = async () => {
      if (!currentOrganization?.id || editingOrderId) return;
      try {
        const { data, error } = await supabase.rpc('generate_sale_order_number', {
          p_organization_id: currentOrganization.id
        });
        if (error) throw error;
        setOrderNumber(data);
      } catch (error) {
        console.error('Error generating order number:', error);
      }
    };
    generateOrderNumber();
  }, [currentOrganization?.id, editingOrderId]);

  // Server-side customer search (replaces fetch-all loop)
  const [customerSearchInput, setCustomerSearchInput] = useState("");
  const [openCustomerSearch, setOpenCustomerSearch] = useState(false);
  const { filteredCustomers, isLoading: isCustomersLoading } = useCustomerSearch(customerSearchInput);

  // Fetch products with pagination
  const { data: productsData } = useQuery({
    queryKey: ['products-with-stock', currentOrganization?.id],
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

  // Initialize entry mode from settings
  useEffect(() => {
    if (settings && !entryModeInitialized) {
      const saleSettings = settings.sale_settings as any;
      if (saleSettings?.defaultEntryMode) {
        setEntryMode(saleSettings.defaultEntryMode);
      }
      setEntryModeInitialized(true);
    }
  }, [settings, entryModeInitialized]);

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
  });

  // Load from quotation or edit
  useEffect(() => {
    const state = location.state;
    
    if (state?.fromQuotation && state?.quotationData) {
      const q = state.quotationData;
      setQuotationId(q.id);
      setSelectedCustomerId(q.customer_id || "");
      setTaxType(q.tax_type || "inclusive");
      setTermsConditions(q.terms_conditions || "");
      setNotes(q.notes || "");
      setShippingAddress(q.shipping_address || "");
      
      if (q.customer_id) {
        setSelectedCustomer({
          id: q.customer_id,
          customer_name: q.customer_name,
          phone: q.customer_phone,
          email: q.customer_email,
          address: q.customer_address,
        });
      }
      
      // Load items from quotation
      if (q.quotation_items?.length > 0) {
        const items = q.quotation_items.map((item: any, i: number) => {
          // Find stock qty for this variant
          const product = productsData?.find(p => p.id === item.product_id);
          const variant = product?.product_variants?.find((v: any) => v.id === item.variant_id);
          
           return {
             id: `row-${i}`,
             productId: item.product_id,
             variantId: item.variant_id,
             productName: item.product_name,
             size: item.size,
             barcode: item.barcode || '',
             orderQty: item.quantity,
             stockQty: variant?.stock_qty || 0,
             mrp: item.mrp,
             salePrice: item.unit_price,
             discountPercent: item.discount_percent,
             discountAmount: 0,
             gstPercent: item.gst_percent,
             lineTotal: item.line_total,
             hsnCode: item.hsn_code || '',
             color: item.color || variant?.color || product?.color || '',
             uom: item.uom || product?.uom || DEFAULT_UOM,
           };
        });
        while (items.length < 5) {
          items.push({
            id: `row-${items.length}`,
            productId: '', variantId: '', productName: '', size: '', barcode: '',
            orderQty: 0, stockQty: 0, mrp: 0, salePrice: 0, discountPercent: 0, discountAmount: 0, gstPercent: 0, lineTotal: 0, hsnCode: '', uom: DEFAULT_UOM,
          });
        }
        setLineItems(items);
      }
      
      // Update quotation status to confirmed
      supabase.from('quotations').update({ status: 'confirmed' }).eq('id', q.id);
    } else if (state?.orderData) {
      const o = state.orderData;
      setEditingOrderId(o.id);
      setOrderNumber(o.order_number);
      setOrderDate(new Date(o.order_date));
      setExpectedDelivery(o.expected_delivery_date ? new Date(o.expected_delivery_date) : new Date());
      setSelectedCustomerId(o.customer_id || "");
      setQuotationId(o.quotation_id);
      setTaxType(o.tax_type || "inclusive");
      setTermsConditions(o.terms_conditions || "");
      setNotes(o.notes || "");
      setShippingAddress(o.shipping_address || "");
      setSalesman(o.salesman || "");
      
      if (o.customer_id) {
        setSelectedCustomer({
          id: o.customer_id,
          customer_name: o.customer_name,
          phone: o.customer_phone,
          email: o.customer_email,
          address: o.customer_address,
        });
      }
      
      if (o.sale_order_items?.length > 0) {
        const items = o.sale_order_items.map((item: any, i: number) => {
          const product = productsData?.find(p => p.id === item.product_id);
          const variant = product?.product_variants?.find((v: any) => v.id === item.variant_id);
          
           return {
             id: `row-${i}`,
             productId: item.product_id,
             variantId: item.variant_id,
             productName: item.product_name,
             size: item.size,
             barcode: item.barcode || '',
             orderQty: item.order_qty,
             stockQty: variant?.stock_qty || 0,
             mrp: item.mrp,
             salePrice: item.unit_price,
             discountPercent: item.discount_percent,
             discountAmount: 0,
             gstPercent: item.gst_percent,
             lineTotal: item.line_total,
             hsnCode: item.hsn_code || '',
             color: item.color || variant?.color || product?.color || '',
             uom: item.uom || product?.uom || DEFAULT_UOM,
           };
        });
        while (items.length < 5) {
          items.push({
            id: `row-${items.length}`,
            productId: '', variantId: '', productName: '', size: '', barcode: '',
            orderQty: 0, stockQty: 0, mrp: 0, salePrice: 0, discountPercent: 0, discountAmount: 0, gstPercent: 0, lineTotal: 0, hsnCode: '', uom: DEFAULT_UOM,
          });
        }
        setLineItems(items);
      }
    }
  }, [location.state, productsData]);

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
      const existingIndex = updatedItems.findIndex(item => item.variantId === variant.id && item.productId !== '');
      
      if (existingIndex >= 0) {
        updatedItems[existingIndex].orderQty += qty;
        updatedItems[existingIndex] = calculateLineTotal(updatedItems[existingIndex]);
        addedCount++;
      } else {
        const emptyRowIndex = updatedItems.findIndex(item => item.productId === '');
        const newItem: LineItem = calculateLineTotal({
          id: emptyRowIndex >= 0 ? updatedItems[emptyRowIndex].id : `row-${updatedItems.length}`,
          productId: product.id,
          variantId: variant.id,
           productName: buildProductDisplayName(product),
          size: variant.size,
          barcode: variant.barcode || '',
          orderQty: qty,
          box: '',
          stockQty: variant.stock_qty || 0,
          mrp: variant.mrp || variant.sale_price || 0,
          salePrice: variant.sale_price || 0,
          discountPercent: 0,
          discountAmount: 0,
          gstPercent: product.gst_per || 0,
          lineTotal: 0,
          hsnCode: product.hsn_code || '',
          color: variant.color || product.color || '',
          uom: product.uom || DEFAULT_UOM,
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
      toast({ title: "Products Added", description: `${addedCount} size(s) added to order` });
    }
    setTimeout(() => tableEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const addProductToOrder = async (product: any, variant: any, overridePrice?: { sale_price: number; mrp: number }) => {
    if (entryMode === "grid") {
      openSizeGridForProduct(product);
      setOpenProductSearch(false);
      setSearchInput("");
      return;
    }

    const existingIndex = lineItems.findIndex(item => item.variantId === variant.id && item.productId !== '');
    
    if (existingIndex >= 0) {
      const updatedItems = [...lineItems];
      updatedItems[existingIndex].orderQty += 1;
      updatedItems[existingIndex] = calculateLineTotal(updatedItems[existingIndex]);
      setLineItems(updatedItems);
    } else {
      // Check for price differences before adding (for new items only)
      const masterSalePrice = parseFloat(variant.sale_price || 0);
      const masterMrp = variant.mrp ? parseFloat(variant.mrp) : masterSalePrice;
      const lastPurchaseSalePrice = variant.last_purchase_sale_price ? parseFloat(variant.last_purchase_sale_price) : null;
      const lastPurchaseMrp = variant.last_purchase_mrp ? parseFloat(variant.last_purchase_mrp) : null;
      
      // Check for customer-specific pricing (only if enabled in settings)
      let customerPrice = null;
      const isCustomerPriceMemoryEnabled = (settings?.sale_settings as any)?.enable_customer_price_memory ?? false;
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
      
      // Auto-apply customer price if available (no dialog)
      // Sale Price = customer's last sale price, MRP = actual product MRP
      if (!overridePrice && customerPrice !== null) {
        overridePrice = {
          sale_price: customerPrice.sale_price,  // Use customer's last sale price (e.g., ₹54)
          mrp: masterMrp,                        // MRP = actual product MRP (unchanged)
        };
      }
      
      // Use override price or master price
      const salePrice = overridePrice?.sale_price ?? masterSalePrice;
      const mrpToUse = overridePrice?.mrp ?? masterMrp;
      
      const emptyRowIndex = lineItems.findIndex(item => item.productId === '');
      if (emptyRowIndex === -1) {
        const newRow: LineItem = calculateLineTotal({
          id: `row-${lineItems.length}`,
          productId: product.id,
          variantId: variant.id,
           productName: buildProductDisplayName(product),
          size: variant.size,
          barcode: variant.barcode || '',
          orderQty: 1,
          box: '',
          stockQty: variant.stock_qty || 0,
          mrp: mrpToUse,
          salePrice: salePrice,
          discountPercent: 0,
          discountAmount: 0,
          gstPercent: product.gst_per || 0,
          lineTotal: 0,
          hsnCode: product.hsn_code || '',
          color: variant.color || product.color || '',
          uom: product.uom || DEFAULT_UOM,
        });
        setLineItems(prev => [...prev, newRow]);
      } else {
        const updatedItems = [...lineItems];
        updatedItems[emptyRowIndex] = calculateLineTotal({
          id: updatedItems[emptyRowIndex].id,
          productId: product.id,
          variantId: variant.id,
          productName: buildProductDisplayName(product),
          size: variant.size,
          barcode: variant.barcode || '',
          orderQty: 1,
          box: '',
          stockQty: variant.stock_qty || 0,
          mrp: mrpToUse,
          salePrice: salePrice,
          discountPercent: 0,
          discountAmount: 0,
          gstPercent: product.gst_per || 0,
          lineTotal: 0,
          hsnCode: product.hsn_code || '',
          color: variant.color || product.color || '',
          uom: product.uom || DEFAULT_UOM,
        });
        setLineItems(updatedItems);
      }
    }
    
    setOpenProductSearch(false);
    setSearchInput("");
    toast({ title: "Product Added", description: `${product.product_name} (${variant.size}) added` });
    setTimeout(() => tableEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };


  const calculateLineTotal = (item: LineItem): LineItem => {
    const baseAmount = item.salePrice * item.orderQty;
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

  const updateQuantity = (id: string, orderQty: number) => {
    if (orderQty < 1) return;
    setLineItems(prev => prev.map(item => 
      item.id === id ? calculateLineTotal({ ...item, orderQty }) : item
    ));
  };

  const updateBox = (id: string, box: string) => {
    setLineItems(prev => prev.map(item =>
      item.id === id ? { ...item, box } : item
    ));
  };

  const updateDiscountPercent = (id: string, discountPercent: number) => {
    setLineItems(prev => prev.map(item => 
      item.id === id ? calculateLineTotal({ ...item, discountPercent, discountAmount: 0 }) : item
    ));
  };

  const updateMrp = (id: string, mrp: number) => {
    setLineItems(prev => prev.map(item => 
      item.id === id ? { ...item, mrp } : item
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

  const updateUom = (id: string, uom: string) => {
    setLineItems(prev => prev.map(item => 
      item.id === id ? { ...item, uom } : item
    ));
  };

  const removeItem = (id: string) => {
    setLineItems(prev => prev.map(item => 
      item.id === id ? {
        ...item, productId: '', variantId: '', productName: '', size: '', barcode: '',
        orderQty: 0, stockQty: 0, mrp: 0, salePrice: 0, discountPercent: 0, discountAmount: 0, gstPercent: 0, lineTotal: 0, uom: DEFAULT_UOM,
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
  const grossAmount = filledItems.reduce((sum, item) => sum + (item.salePrice * item.orderQty), 0);
  const totalLineDiscount = filledItems.reduce((sum, item) => sum + item.discountAmount, 0);
  const amountAfterLineDiscount = grossAmount - totalLineDiscount;
  
  // Flat discount calculation
  const calculatedFlatDiscount = flatDiscountPercent > 0 
    ? (amountAfterLineDiscount * flatDiscountPercent) / 100 
    : flatDiscountAmount;
  const amountAfterFlatDiscount = amountAfterLineDiscount - calculatedFlatDiscount;
  
  const totalGST = taxType === "exclusive" 
    ? filledItems.reduce((sum, item) => sum + ((item.salePrice * item.orderQty - item.discountAmount) * item.gstPercent / 100), 0)
    : 0;
  const subtotal = amountAfterFlatDiscount + totalGST;
  const netAmount = subtotal + roundOff;
  const totalDiscount = totalLineDiscount + calculatedFlatDiscount;

  const getStockDifference = (item: LineItem) => {
    if (!item.productId) return null;
    const diff = item.stockQty - item.orderQty;
    if (diff >= 0) return { color: 'text-green-600', icon: CheckCircle, text: `+${diff} available` };
    return { color: 'text-red-600', icon: AlertTriangle, text: `${diff} short` };
  };

  // Inline search for product row - debounced server-side
  useEffect(() => {
    if (!inlineSearchQuery || inlineSearchQuery.length < 1 || !currentOrganization?.id) {
      setInlineSearchResults([]);
      setShowInlineSearch(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const results = await searchSaleOrderVariants(currentOrganization.id, inlineSearchQuery);
        setInlineSearchResults(results);
        setSelectedInlineIndex(0);
        setShowInlineSearch(true);
      } catch (error) {
        console.error("Inline search error:", error);
        setInlineSearchResults([]);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [inlineSearchQuery, currentOrganization?.id]);

  // Popover product search — server-side (client cache can miss variants)
  useEffect(() => {
    if (!searchInput || searchInput.length < 1 || !currentOrganization?.id) {
      setPopoverSearchResults([]);
      setIsProductSearching(false);
      return;
    }

    setIsProductSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchSaleOrderVariants(currentOrganization.id, searchInput);
        setPopoverSearchResults(results);
      } catch (error) {
        console.error("Product search error:", error);
        setPopoverSearchResults([]);
      } finally {
        setIsProductSearching(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [searchInput, currentOrganization?.id]);

  const selectSearchResult = (result: SaleOrderVariantSearchResult) => {
    const product = productsData?.find((p) => p.id === result.product_id);
    const variant = product?.product_variants?.find((v: any) => v.id === result.id);

    if (product && variant) {
      addProductToOrder(product, variant);
      return;
    }

    const fallbackProduct = {
      id: result.product_id,
      product_name: result.product_name,
      brand: result.brand,
      category: result.category,
      style: result.style,
      color: result.color,
      gst_per: result.gst_per,
      hsn_code: result.hsn_code,
      uom: result.uom || DEFAULT_UOM,
      product_variants: [
        {
          id: result.id,
          size: result.size,
          sale_price: result.sale_price,
          mrp: result.mrp,
          barcode: result.barcode,
          stock_qty: result.stock_qty,
          color: result.color,
        },
      ],
    };
    addProductToOrder(fallbackProduct, fallbackProduct.product_variants[0]);
  };

  const handleInlineProductSelect = (result: SaleOrderVariantSearchResult) => {
    setInlineSearchQuery("");
    setShowInlineSearch(false);
    setInlineSearchResults([]);
    selectSearchResult(result);
  };

  // formatInlineProductDescription removed - using ERPVariantRow component instead

  const handleSaveOrder = async (): Promise<{ success: boolean; orderId?: string }> => {
    // Capture items at save time to prevent race conditions
    const itemsToSave = lineItems.filter(item => item.productId !== '' && item.orderQty > 0);
    
    if (itemsToSave.length === 0) {
      toast({ title: "Error", description: "Add at least one item with quantity", variant: "destructive" });
      return { success: false };
    }
    
    

    setIsSaving(true);
    try {
      const orderData = {
        organization_id: currentOrganization?.id,
        order_number: orderNumber,
        order_date: orderDate.toISOString(),
        expected_delivery_date: expectedDelivery.toISOString().split('T')[0],
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
        status: 'pending',
        tax_type: taxType,
        quotation_id: quotationId,
        notes,
        terms_conditions: termsConditions,
        shipping_address: shippingAddress,
        salesman: salesman || null,
        invoice_format: invoiceFormat,
      };

      let orderId = editingOrderId;

      if (editingOrderId) {
        const { error } = await supabase
          .from('sale_orders')
          .update(orderData)
          .eq('id', editingOrderId);
        if (error) throw error;
        
        await supabase.from('sale_order_items').delete().eq('order_id', editingOrderId);
      } else {
        const { data, error } = await supabase
          .from('sale_orders')
          .insert([orderData])
          .select()
          .single();
        if (error) throw error;
        orderId = data.id;
      }

      const orderItems = itemsToSave.map(item => ({
        order_id: orderId,
        product_id: item.productId,
        variant_id: item.variantId,
        product_name: item.productName,
        size: item.size,
        barcode: item.barcode,
        color: item.color || null,
        order_qty: item.orderQty,
        fulfilled_qty: 0,
        pending_qty: item.orderQty,
        unit_price: item.salePrice,
        mrp: item.mrp,
        discount_percent: item.discountPercent,
        gst_percent: item.gstPercent,
        line_total: item.lineTotal,
        hsn_code: item.hsnCode || null,
        uom: item.uom || DEFAULT_UOM,
      }));
      
      

      const { error: itemsError } = await supabase
        .from('sale_order_items')
        .insert(orderItems);
      if (itemsError) throw itemsError;

      // Auto-send WhatsApp sale order notification (does not block saving)
      if (selectedCustomer?.phone && currentOrganization?.id && !editingOrderId) {
        try {
          const { data: whatsappSettings } = await (supabase as any)
            .from('whatsapp_api_settings')
            .select('is_active, auto_send_sale_order, sale_order_template_name')
            .eq('organization_id', currentOrganization.id)
            .maybeSingle();

          if (whatsappSettings?.is_active && whatsappSettings?.auto_send_sale_order) {
            const companyName = (settings as any)?.business_name || currentOrganization.name || 'Our Company';
            const contactNumber = (settings as any)?.mobile_number || 'N/A';

            const formattedDate = new Date(orderDate).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            });
            const formattedDelivery = new Date(expectedDelivery).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            });
            const formattedAmount = `${Number(netAmount).toLocaleString('en-IN')}`;

            const templateParams = [
              selectedCustomer.customer_name || 'Valued Customer',
              orderNumber,
              formattedDate,
              formattedAmount,
              formattedDelivery,
              companyName,
              contactNumber,
            ];

            // Build itemized list with color
            const itemLines = orderItems.map((item: any) => {
              const colorPart = item.color ? ` - ${item.color}` : '';
              return `• ${item.product_name}${colorPart} (${item.size}) x ${item.order_qty} = ₹${Number(item.line_total).toLocaleString('en-IN')}`;
            }).join('\n');

            const messageText = `🛒 *Sales Order Confirmation*\n\nOrder No: ${orderNumber}\nCustomer: ${selectedCustomer.customer_name || 'Valued Customer'}\n\n*Items:*\n${itemLines}\n\n*Total: ₹${formattedAmount}*\nOrder Date: ${formattedDate}\nExpected Delivery: ${formattedDelivery}\n\nThank you for your order!\n${companyName}\n${contactNumber}`;

            await supabase.functions.invoke('send-whatsapp', {
              body: {
                organizationId: currentOrganization.id,
                phone: selectedCustomer.phone,
                message: messageText,
                templateType: 'sale_order',
                templateName: whatsappSettings.sale_order_template_name || null,
                templateParams,
                referenceId: orderId,
                referenceType: 'sale_order',
              },
            });
          }
        } catch (e) {
          console.error('WhatsApp auto-send failed (SaleOrderEntry):', e);
        }
      }

      // Prevent auto-save cleanup from re-creating a draft after successful save
      skipDraftSaveOnUnmountRef.current = true;
      updateCurrentData(null);
      stopAutoSave();
      await deleteDraft();
      

      toast({ title: "Success", description: `Sale Order ${orderNumber} saved` });
      return { success: true, orderId };
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
      return { success: false };
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndPrint = async () => {
    const result = await handleSaveOrder();
    if (result.success) {
      // Prepare print data
      const printItems = filledItems.map((item, index) => ({
        sr: index + 1,
        particulars: item.productName,
        size: item.size,
        barcode: item.barcode,
        hsn: item.hsnCode || '',
        orderQty: item.orderQty,
        fulfilledQty: 0,
        pendingQty: item.orderQty,
        rate: item.salePrice,
        mrp: item.mrp,
        discountPercent: item.discountPercent,
        total: item.lineTotal,
        color: item.color || '',
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

      // Let React commit printData before cloning for react-to-print
      requestAnimationFrame(() => {
        waitForPrintReady(printRef, () => {
          handlePrint();
          navigate('/sale-order-dashboard');
        }, { maxWait: 8000 });
      });
    }
  };

  const totalMatchingVariants = popoverSearchResults.length;

  // Reset display limit when search changes
  useEffect(() => {
    setDisplayLimit(100);
  }, [searchInput]);

  const visiblePopoverResults = popoverSearchResults.slice(0, displayLimit);

  return (
    <div className={cn(entryPageShellClass, "bg-background min-h-0")} data-entry-form>
      <div className={cn("shrink-0 flex flex-col gap-2 py-2", entryPageSectionX)}>
      <BackToDashboard />
      
      {/* Section A: Header */}
      <div className="bg-card rounded-lg border shadow-sm p-3">
        <div className="flex items-center justify-between">
          <h1 className="text-[18px] font-semibold flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            {editingOrderId ? 'Edit Sale Order' : 'New Sale Order'}
            {quotationId && <Badge variant="outline">From Quotation</Badge>}
          </h1>
          <div className="flex items-center gap-3">
            <Label className="text-[13px] font-medium text-muted-foreground">Order No:</Label>
            <span className="font-mono bg-muted/40 px-3 py-1 rounded-md text-[15px] font-semibold">{orderNumber}</span>
          </div>
        </div>
      </div>

      {/* Section B: Customer & Order Details */}
      <div className="bg-secondary/50 dark:bg-muted/20 rounded-lg border shadow-sm p-3">
        <div className="erp-invoice-section-label">ORDER & CUSTOMER DETAILS</div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label>Order Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(orderDate, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={orderDate} onSelect={(d) => d && setOrderDate(d)} />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label>Expected Delivery</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(expectedDelivery, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={expectedDelivery} onSelect={(d) => d && setExpectedDelivery(d)} />
              </PopoverContent>
            </Popover>
          </div>

          <div className="md:col-span-2">
            <Label className="flex items-center gap-1">Customer <span className="ml-1 w-1.5 h-1.5 inline-block bg-destructive rounded-full"></span></Label>
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

          <div>
            <Label>Invoice Format</Label>
            <Select value={invoiceFormat} onValueChange={(v: "standard" | "wholesale-size-grouping") => setInvoiceFormat(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="wholesale-size-grouping">Modern Wholesale Size Grouping</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Section C: Entry Mode + Product Search */}
      <div className="bg-card rounded-lg border shadow-sm p-3">
        <div className="flex items-center gap-4">
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
        </div>
        <div className="mt-3">
          <Popover open={openProductSearch} onOpenChange={setOpenProductSearch}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start h-9">
                <Search className="mr-2 h-4 w-4" />
                Search Products (Shows Stock)
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[700px] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput placeholder="Search by name, barcode, brand, color, size... (e.g. 'Rolex Gray 7')" value={searchInput} onValueChange={setSearchInput} />
                <CommandList className="max-h-[320px]">
                  <CommandEmpty>
                    {isProductSearching ? (
                      <span className="flex items-center justify-center gap-2 py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Searching...
                      </span>
                    ) : searchInput.length < 1 ? (
                      "Type to search products..."
                    ) : (
                      "No products found"
                    )}
                  </CommandEmpty>
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
                      const grouped: Record<string, { productName: string; brand?: string; variants: SaleOrderVariantSearchResult[] }> = {};
                      visiblePopoverResults.forEach((result) => {
                        if (!grouped[result.product_id]) {
                          grouped[result.product_id] = {
                            productName: result.product_name,
                            brand: result.brand,
                            variants: [],
                          };
                        }
                        grouped[result.product_id].variants.push(result);
                      });

                      return Object.entries(grouped).map(([productId, group]) => (
                        <div key={productId}>
                          {group.variants.length > 1 && (
                            <div className="px-4 py-1.5 text-xs font-semibold text-foreground/70 bg-muted/40 border-b border-border sticky top-0">
                              {group.productName}
                              {group.brand && <span className="ml-2 font-normal text-muted-foreground">Brand: {group.brand}</span>}
                            </div>
                          )}
                          {group.variants.map((result) => (
                            <CommandItem
                              key={result.id}
                              onSelect={() => {
                                selectSearchResult(result);
                                setOpenProductSearch(false);
                                setSearchInput("");
                              }}
                              className="p-0 cursor-pointer"
                            >
                              <ERPVariantRow
                                result={{
                                  id: result.id,
                                  product_id: result.product_id,
                                  product_name: result.product_name,
                                  brand: result.brand,
                                  category: result.category,
                                  style: result.style,
                                  color: result.color || "",
                                  size: result.size,
                                  barcode: result.barcode,
                                  sale_price: result.sale_price,
                                  mrp: result.mrp,
                                  stock_qty: result.stock_qty || 0,
                                }}
                                showProductName={group.variants.length === 1}
                              />
                            </CommandItem>
                          ))}
                        </div>
                      ));
                    })()}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      </div>

      <main className={cn(entryPageMainClass, "flex flex-col gap-2 min-h-0", entryPageSectionX, "pb-2")}>
      {/* Section D: Line Items Table */}
      <div className="bg-card rounded-lg border shadow-sm p-3 flex flex-1 flex-col min-h-0">
        <div className="erp-invoice-section-label">LINE ITEMS</div>
        <div className="border rounded-md overflow-hidden relative flex flex-1 flex-col min-h-0">
          <Table>
            <TableHeader className="erp-invoice-table-header">
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead className="min-w-[180px] max-w-[280px]">Product</TableHead>
                <TableHead className="w-28">Barcode</TableHead>
                <TableHead className="w-16">HSN</TableHead>
                <TableHead className="w-16">Color</TableHead>
                <TableHead className="w-16">Size</TableHead>
                <TableHead className="w-20">Order Qty</TableHead>
                <TableHead className="w-16">Box</TableHead>
                <TableHead className="w-20">UOM</TableHead>
                <TableHead className="w-20">Stock</TableHead>
                <TableHead className="w-28">Difference</TableHead>
                {(settings?.sale_settings as any)?.showMRP !== false && (
                  <TableHead className="w-24">MRP</TableHead>
                )}
                <TableHead className="w-24">Price</TableHead>
                <TableHead className="w-20">Disc %</TableHead>
                <TableHead className="w-20">GST %</TableHead>
                <TableHead className="w-24 text-right">Total</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
          </Table>
          <ScrollArea className="flex-1 min-h-[160px] isolate" showScrollbar>
            <Table>
            <TableBody>
              {lineItems.map((item, index) => {
                const stockInfo = getStockDifference(item);
                return (
                  <TableRow key={item.id} className={cn("h-14 border-b border-border/50 hover:bg-primary/[0.03] transition-colors", !item.productId && 'opacity-50')}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="min-w-[180px] max-w-[280px]">
                      {item.productId ? (
                        <button
                          type="button"
                          onClick={() => setHistoryProduct({ id: item.productId, name: item.productName })}
                          className="text-primary hover:underline text-left font-medium break-words whitespace-normal leading-tight"
                        >
                          {item.productName}
                        </button>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.barcode || '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.hsnCode || '-'}</TableCell>
                    <TableCell className="text-xs">{item.color || '-'}</TableCell>
                    <TableCell>{item.size || '-'}</TableCell>
                    <TableCell>
                      {item.productId && (
                        <Input
                          type="number"
                          min="1"
                          value={item.orderQty}
                          onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 1)}
                          className="w-16 h-8"
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {item.productId && (
                        <Input
                          type="text"
                          value={item.box || ''}
                          onChange={(e) => updateBox(item.id, e.target.value)}
                          placeholder=""
                          className="w-14 h-8"
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {item.productId ? (
                        <Select value={item.uom || DEFAULT_UOM} onValueChange={(v) => updateUom(item.id, v)}>
                          <SelectTrigger className="w-20 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {UOM_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.value}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : '-'}
                    </TableCell>
                    <TableCell>{item.productId ? item.stockQty : '-'}</TableCell>
                    <TableCell>
                      {stockInfo && (
                        <div className={cn("flex items-center gap-1 text-sm", stockInfo.color)}>
                          <stockInfo.icon className="h-4 w-4" />
                          {stockInfo.text}
                        </div>
                      )}
                    </TableCell>
                    {(settings?.sale_settings as any)?.showMRP !== false && (
                      <TableCell>
                        {item.productId && (
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.mrp}
                            onChange={(e) => updateMrp(item.id, parseFloat(e.target.value) || 0)}
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            className="w-20 h-8"
                          />
                        )}
                      </TableCell>
                    )}
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
                    <TableCell className="text-right font-medium tabular-nums">₹{item.lineTotal.toFixed(2)}</TableCell>
                    <TableCell>
                      {item.productId && (
                        <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              
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
                          width: Math.max(600, inlineSearchInputRef.current.getBoundingClientRect().width),
                          zIndex: 9999,
                        }}
                      >
                        {inlineSearchResults.length > 0 ? (
                          inlineSearchResults.map((result, idx) => (
                            <ERPVariantRow
                              key={result.id + idx}
                              result={result}
                              isSelected={idx === selectedInlineIndex}
                              onClick={() => handleInlineProductSelect(result)}
                              onMouseEnter={() => setSelectedInlineIndex(idx)}
                            />
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
                <TableCell colSpan={13} className="text-muted-foreground text-sm">
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
      </div>

      {/* Section E: Order Summary + Notes — single compact row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 shrink-0">
        <div className="bg-card rounded-lg border shadow-sm p-3 xl:col-span-1">
          <div className="erp-invoice-section-label">DISCOUNTS & ADJUSTMENTS</div>
          <div className="grid grid-cols-2 gap-3">
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
                className="h-9"
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
                className="h-9"
              />
            </div>
            <div className="col-span-2">
              <Label>Round Off</Label>
              <Input
                type="number"
                step="0.01"
                value={roundOff}
                onChange={(e) => setRoundOff(parseFloat(e.target.value) || 0)}
                className="h-9"
              />
            </div>
          </div>
        </div>
        <div className="erp-invoice-summary-card xl:col-span-1">
          <div className="erp-invoice-section-label">ORDER SUMMARY</div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[13px] font-medium"><span>Gross Amount:</span><span className="tabular-nums">₹{grossAmount.toFixed(2)}</span></div>
            <div className="flex justify-between text-[13px] font-medium"><span>Line Discount:</span><span className="tabular-nums">-₹{totalLineDiscount.toFixed(2)}</span></div>
            {calculatedFlatDiscount > 0 && (
              <div className="flex justify-between text-[13px] font-medium"><span>Flat Discount:</span><span className="tabular-nums">-₹{calculatedFlatDiscount.toFixed(2)}</span></div>
            )}
            {taxType === "exclusive" && (
              <div className="flex justify-between text-[13px] font-medium"><span>GST:</span><span className="tabular-nums">₹{totalGST.toFixed(2)}</span></div>
            )}
            {roundOff !== 0 && (
              <div className="flex justify-between text-[13px] font-medium"><span>Round Off:</span><span className="tabular-nums">₹{roundOff.toFixed(2)}</span></div>
            )}
            <div className="border-t mt-2 pt-2 flex justify-between">
              <span className="text-[15px] font-bold">Net Amount:</span>
              <span className="text-[20px] font-extrabold text-primary tabular-nums">₹{netAmount.toFixed(2)}</span>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-lg border shadow-sm p-3 xl:col-span-1">
          <div className="erp-invoice-section-label">NOTES & TERMS</div>
          <div className="grid grid-cols-1 gap-2">
            <div>
              <Label className="text-xs">Terms & Conditions</Label>
              <Textarea value={termsConditions} onChange={(e) => setTermsConditions(e.target.value)} rows={2} className="min-h-[52px] text-sm" />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="min-h-[52px] text-sm" />
            </div>
          </div>
        </div>
      </div>
      </main>

      {/* Section G: Sticky Action Footer */}
      <div className="erp-invoice-sticky-actions shrink-0">
        <div className="flex gap-4 justify-end">
          <Button variant="outline" onClick={() => navigate('/sale-order-dashboard')} className="h-11 rounded-lg px-6">
            Cancel
          </Button>
          <Button onClick={handleSaveAndPrint} disabled={isSaving} variant="secondary" className="h-11 rounded-lg px-6">
            <Printer className="mr-2 h-4 w-4" />
            Save & Print
          </Button>
          <Button onClick={() => handleSaveOrder().then(r => r.success && navigate('/sale-order-dashboard'))} disabled={isSaving} className="h-11 rounded-lg px-6 shadow-sm">
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Saving...' : 'Book Sale Order'}
          </Button>
        </div>
      </div>

      {/* Off-screen print source — do not use Tailwind hidden (blanks react-to-print) */}
      <div className="invoice-print-source-screen">
        <SaleOrderPrint
          ref={printRef}
          businessName={settings?.business_name || ''}
          address={settings?.address || ''}
          mobile={settings?.mobile_number || ''}
          email={settings?.email_id || ''}
          gstNumber={settings?.gst_number || ''}
          logoUrl=""
          orderNumber={orderNumber}
          orderDate={orderDate}
          expectedDeliveryDate={expectedDelivery}
          status="pending"
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
          showMRP={true}
          showColor={true}
          showHSN={false}
          invoiceFormat={invoiceFormat}
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
    </div>
  );
}
