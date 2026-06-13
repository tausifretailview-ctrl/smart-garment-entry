import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import { CalendarIcon, Plus, X, Search, Save, ClipboardList, AlertTriangle, CheckCircle, Printer, ChevronDown, Loader2, ChevronLeft, FileText } from "lucide-react";
import { format } from "date-fns";
import { UOM_OPTIONS, DEFAULT_UOM, UOMType } from "@/constants/uom";
import { cn, sortSearchResults, buildProductDisplayName } from "@/lib/utils";
import { entryPageMainClass, entryPageSectionX, entryPageShellClass } from "@/lib/entryPageLayout";
import { useEntryViewportSync } from "@/hooks/useEntryViewportSync";
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
  products (id, product_name, brand, category, style, color, hsn_code, gst_per, uom, size_group_id)
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
  size_range?: string | null;
};

function sizeRangeFromGroup(sizes: string[] | undefined | null): string | null {
  if (!sizes?.length) return null;
  return sizes.length > 1 ? `${sizes[0]}-${sizes[sizes.length - 1]}` : sizes[0];
}

function attachSizeRangesToResults(
  rows: any[],
  sizeGroupsMap: Record<string, { sizes: string[] }>,
): SaleOrderVariantSearchResult[] {
  return rows.map((v) => {
    const mapped = mapVariantSearchRow(v);
    const sizeGroupId = v.products?.size_group_id as string | undefined;
    const sizeGroup = sizeGroupId ? sizeGroupsMap[sizeGroupId] : null;
    return {
      ...mapped,
      size_range: sizeRangeFromGroup(sizeGroup?.sizes),
    };
  });
}

/** One row per product for size-grid search — highest-stock variant as representative. */
function pickProductLevelSearchRows(
  results: SaleOrderVariantSearchResult[],
): Array<SaleOrderVariantSearchResult & { total_stock: number }> {
  const groups = new Map<string, { rep: SaleOrderVariantSearchResult; totalStock: number }>();
  for (const r of results) {
    const existing = groups.get(r.product_id);
    if (!existing) {
      groups.set(r.product_id, { rep: r, totalStock: r.stock_qty || 0 });
      continue;
    }
    existing.totalStock += r.stock_qty || 0;
    if ((r.stock_qty || 0) > (existing.rep.stock_qty || 0)) {
      existing.rep = r;
    }
  }
  return Array.from(groups.values()).map(({ rep, totalStock }) => ({
    ...rep,
    total_stock: totalStock,
  }));
}

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

  const mergedRows = Array.from(uniqueMap.values());
  const sizeGroupIds = [
    ...new Set(mergedRows.map((v) => v.products?.size_group_id).filter(Boolean)),
  ] as string[];

  let sizeGroupsMap: Record<string, { sizes: string[] }> = {};
  if (sizeGroupIds.length > 0) {
    const { data: sizeGroups } = await supabase
      .from("size_groups")
      .select("id, sizes")
      .in("id", sizeGroupIds);
    sizeGroups?.forEach((sg: { id: string; sizes: string[] | null }) => {
      sizeGroupsMap[sg.id] = { sizes: sg.sizes || [] };
    });
  }

  let results = attachSizeRangesToResults(mergedRows, sizeGroupsMap);

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
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const tableEndRef = useRef<HTMLDivElement>(null);
  const skipDraftSaveOnUnmountRef = useRef(false);
  const [showNotesSection, setShowNotesSection] = useState(false);
  const [salesman, setSalesman] = useState<string>("");
  const [invoiceFormat, setInvoiceFormat] = useState<"standard" | "wholesale-size-grouping">("standard");
  const [flatDiscountPercent, setFlatDiscountPercent] = useState<number>(0);
  const [flatDiscountAmount, setFlatDiscountAmount] = useState<number>(0);
  const [roundOff, setRoundOff] = useState<number>(0);
  const initialDraftCheckDone = useRef(false);

  // Size grid entry mode - will be set from settings
  const [sizeGridEnabled, setSizeGridEnabled] = useState(true);
  const [entryMode, setEntryMode] = useState<"grid" | "inline">("grid");
  const [entryModeInitialized, setEntryModeInitialized] = useState(false);
  const [showSizeGrid, setShowSizeGrid] = useState(false);
  const [sizeGridProduct, setSizeGridProduct] = useState<any>(null);
  const [sizeGridVariants, setSizeGridVariants] = useState<any[]>([]);
  
  
  // Product history dialog state
  const [historyProduct, setHistoryProduct] = useState<{ id: string; name: string } | null>(null);


  // Inline search state for table row (legacy — browse bar is primary)
  const [inlineSearchQuery, setInlineSearchQuery] = useState("");
  const [inlineSearchResults, setInlineSearchResults] = useState<any[]>([]);
  const [showInlineSearch, setShowInlineSearch] = useState(false);
  const [selectedInlineIndex, setSelectedInlineIndex] = useState(0);
  const inlineSearchInputRef = useRef<HTMLInputElement>(null);

  useEntryViewportSync();

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
      const enabled = saleSettings?.enable_size_grid_sales !== false;
      setSizeGridEnabled(enabled);
      if (!enabled) {
        setEntryMode("inline");
      } else if (saleSettings?.defaultEntryMode) {
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

  // Open size grid — fetch all variants from DB (matches Sale Invoice / Purchase Entry).
  const openSizeGridForProductId = useCallback(async (productId: string, selectedSalePrice?: number) => {
    if (!currentOrganization?.id) return;

    const { data: productRow, error: productError } = await supabase
      .from("products")
      .select("id, product_name, brand, category, style, color, hsn_code, gst_per, uom")
      .eq("id", productId)
      .eq("organization_id", currentOrganization.id)
      .maybeSingle();

    if (productError || !productRow) {
      toast({
        title: "Product not found",
        variant: "destructive",
      });
      return;
    }

    const { data, error } = await supabase
      .from("product_variants")
      .select("id, size, color, barcode, sale_price, mrp, stock_qty, active, product_id")
      .eq("product_id", productId)
      .eq("organization_id", currentOrganization.id)
      .eq("active", true)
      .is("deleted_at", null);

    if (error || !data?.length) {
      toast({
        title: "No variants found",
        description: "This product has no active variants.",
        variant: "destructive",
      });
      return;
    }

    const uniqueMap = new Map<string, (typeof data)[0]>();
    for (const v of data) {
      const key = `${(v.size || "").toLowerCase()}_${(v.color || "").toLowerCase()}`;
      const existing = uniqueMap.get(key);
      if (!existing) {
        uniqueMap.set(key, v);
        continue;
      }
      const existingStock = existing.stock_qty || 0;
      const newStock = v.stock_qty || 0;
      if (selectedSalePrice) {
        const existingMatchesPrice =
          Math.round(existing.sale_price || 0) === Math.round(selectedSalePrice);
        const newMatchesPrice = Math.round(v.sale_price || 0) === Math.round(selectedSalePrice);
        if (newMatchesPrice && !existingMatchesPrice) {
          uniqueMap.set(key, v);
        } else if (!newMatchesPrice && existingMatchesPrice) {
          // keep existing
        } else if (newStock > existingStock) {
          uniqueMap.set(key, v);
        }
      } else if (newStock > existingStock) {
        uniqueMap.set(key, v);
      }
    }

    const cartQtyByVariant = new Map<string, number>();
    for (const item of lineItems) {
      if (item.variantId) {
        cartQtyByVariant.set(
          item.variantId,
          (cartQtyByVariant.get(item.variantId) || 0) + item.orderQty,
        );
      }
    }

    setSizeGridProduct(productRow);
    setSizeGridVariants(
      Array.from(uniqueMap.values()).map((v) => ({
        id: v.id,
        size: v.size,
        stock_qty: Math.max(0, (v.stock_qty || 0) - (cartQtyByVariant.get(v.id) || 0)),
        sale_price: v.sale_price || 0,
        mrp: v.mrp || 0,
        color: v.color || productRow.color || "",
        barcode: v.barcode,
      })),
    );
    setShowSizeGrid(true);
    setOpenProductSearch(false);
    setSearchInput("");
    setInlineSearchQuery("");
    setShowInlineSearch(false);
  }, [currentOrganization?.id, lineItems, toast]);

  // Handle size grid confirmation
  const handleSizeGridConfirm = (items: Array<{ variant: any; qty: number }>) => {
    const product = sizeGridProduct;
    if (!product) return;

    // Build all changes first, then update state once
    let updatedItems = [...lineItems];
    let addedCount = 0;

    for (const { variant, qty } of items) {
      if (qty <= 0) continue;
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

  const addProductToOrder = async (
    product: any,
    variant: any,
    overridePrice?: { sale_price: number; mrp: number },
    options?: { skipSizeGrid?: boolean },
  ) => {
    if (entryMode === "grid" && !options?.skipSizeGrid) {
      await openSizeGridForProductId(product.id, variant?.sale_price);
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

  const selectSearchResult = (result: SaleOrderVariantSearchResult, query?: string) => {
    const trimmedQuery = (query ?? searchInput).trim();
    const isBarcodeMatch =
      Boolean(result.barcode) &&
      trimmedQuery.length > 0 &&
      result.barcode.toLowerCase() === trimmedQuery.toLowerCase();

    if (entryMode === "grid" && !isBarcodeMatch) {
      void openSizeGridForProductId(result.product_id, result.sale_price);
      return;
    }

    const product = productsData?.find((p) => p.id === result.product_id);
    const variant = product?.product_variants?.find((v: any) => v.id === result.id);

    if (product && variant) {
      void addProductToOrder(product, variant, undefined, { skipSizeGrid: isBarcodeMatch });
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
    void addProductToOrder(fallbackProduct, fallbackProduct.product_variants[0], undefined, {
      skipSizeGrid: isBarcodeMatch,
    });
  };

  const handleInlineProductSelect = (result: SaleOrderVariantSearchResult) => {
    setInlineSearchQuery("");
    setShowInlineSearch(false);
    setInlineSearchResults([]);
    selectSearchResult(result, inlineSearchQuery);
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
  const productLevelSearchRows = useMemo(
    () => pickProductLevelSearchRows(popoverSearchResults),
    [popoverSearchResults],
  );
  const totalMatchingProducts = productLevelSearchRows.length;
  const visiblePopoverResults = popoverSearchResults.slice(0, displayLimit);
  const visibleProductLevelRows = useMemo(
    () => pickProductLevelSearchRows(visiblePopoverResults),
    [visiblePopoverResults],
  );
  const inlineDisplayRows = useMemo(
    () =>
      entryMode === "grid"
        ? pickProductLevelSearchRows(inlineSearchResults)
        : inlineSearchResults,
    [entryMode, inlineSearchResults],
  );
  const displaySearchCount = entryMode === "grid" ? totalMatchingProducts : totalMatchingVariants;

  // Reset display limit when search changes
  useEffect(() => {
    setDisplayLimit(100);
  }, [searchInput]);

  const filledOrderItems = lineItems.filter((item) => item.productId !== "");
  const totalOrderQty = filledOrderItems.reduce((sum, item) => sum + item.orderQty, 0);
  const showMrpCol = (settings?.sale_settings as any)?.showMRP !== false;

  return (
    <div className={cn(entryPageShellClass, "bg-white sale-order-readable min-h-0")} data-entry-form>
      <header className="bg-white border-b-2 border-black shrink-0 flex flex-col">
        <div className={cn("entry-page-header-row h-[52px] flex items-center gap-2", entryPageSectionX)}>
          <div className="entry-page-header-leading flex items-center gap-2 sm:gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/sale-order-dashboard")}
              className="h-8 shrink-0 text-black hover:text-black hover:bg-black/5 border border-black/20 text-xs gap-1.5 font-bold"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Button>
            <div className="w-px h-6 bg-black/15 shrink-0" />
            <ClipboardList className="h-5 w-5 text-black shrink-0" />
            <span className="text-black font-bold text-[15px] whitespace-nowrap hidden md:inline">
              {editingOrderId ? "Edit Sale Order" : "Sale Order"}
            </span>
            {quotationId && (
              <Badge variant="outline" className="border-black text-black font-bold">
                From Quotation
              </Badge>
            )}
            <span className="border-2 border-black text-black font-mono text-[11px] font-bold px-3 py-1 rounded-md shrink-0">
              {orderNumber || "NEW"}
            </span>
          </div>
          <div className="entry-page-header-actions flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setLineItems(
                  Array(7)
                    .fill(null)
                    .map((_, i) => ({
                      id: `row-${i}`,
                      productId: "",
                      variantId: "",
                      productName: "",
                      size: "",
                      barcode: "",
                      orderQty: 0,
                      box: "",
                      stockQty: 0,
                      mrp: 0,
                      salePrice: 0,
                      discountPercent: 0,
                      discountAmount: 0,
                      gstPercent: 0,
                      lineTotal: 0,
                      uom: DEFAULT_UOM,
                    })),
                );
                setSelectedCustomerId("");
                setSelectedCustomer(null);
                setTermsConditions("");
                setNotes("");
                setFlatDiscountPercent(0);
                setFlatDiscountAmount(0);
                setRoundOff(0);
                setSearchInput("");
                setPopoverSearchResults([]);
              }}
              className="h-8 text-black hover:bg-black/5 border border-black/20 text-xs gap-1 px-2.5 font-bold"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">New</span>
            </Button>
          </div>
        </div>
      </header>

      <main className={entryPageMainClass}>
      <section className={cn("bg-white border-b border-black/10 py-2 shrink-0 shadow-sm", entryPageSectionX)}>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-start">
          <div className="col-span-2 md:col-span-1 lg:col-span-2">
            <Label className="text-[13px] font-bold text-black">
              Customer <span className="text-red-600">*</span>
            </Label>
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
            <Label className="text-[13px] font-bold text-black mb-1 block">Order No</Label>
            <Input value={orderNumber} readOnly className="h-10 bg-neutral-50 font-mono font-bold text-sm border-black/20" />
          </div>

          <div>
            <Label className="text-[13px] font-bold text-black mb-1 block">Order Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal h-10 text-sm border-black/20">
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
            <Label className="text-[13px] font-bold text-black mb-1 block">Expected Delivery</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal h-10 text-sm border-black/20">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(expectedDelivery, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={expectedDelivery} onSelect={(d) => d && setExpectedDelivery(d)} />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label className="text-[13px] font-bold text-black mb-1 block">Tax Type</Label>
            <Select value={taxType} onValueChange={(v: "exclusive" | "inclusive") => setTaxType(v)}>
              <SelectTrigger className="h-10 text-sm border-black/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exclusive">Exclusive GST</SelectItem>
                <SelectItem value="inclusive">Inclusive GST</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[13px] font-bold text-black mb-1 block">Salesman</Label>
            <Select value={salesman || "none"} onValueChange={(v) => setSalesman(v === "none" ? "" : v)}>
              <SelectTrigger className="h-10 text-sm border-black/20">
                <SelectValue placeholder="Select Salesman" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {employeesData?.map((emp) => (
                  <SelectItem key={emp.id} value={emp.employee_name}>
                    {emp.employee_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 md:col-span-1">
            <Label className="text-[13px] font-bold text-black mb-1 block">Invoice Format</Label>
            <Select value={invoiceFormat} onValueChange={(v: "standard" | "wholesale-size-grouping") => setInvoiceFormat(v)}>
              <SelectTrigger className="h-10 text-sm border-black/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="wholesale-size-grouping">Modern Wholesale Size Grouping</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className={cn("bg-neutral-50 border-b border-black/10 py-3 shrink-0", entryPageSectionX)}>
        <div className="flex items-center gap-3 flex-wrap">
          {sizeGridEnabled && (
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-sm font-bold ${entryMode === "grid" ? "text-black" : "text-black/50"}`}>
                Size Grid
              </span>
              <Switch
                checked={entryMode === "inline"}
                onCheckedChange={(checked) => setEntryMode(checked ? "inline" : "grid")}
              />
              <span className={`text-sm font-bold ${entryMode === "inline" ? "text-black" : "text-black/50"}`}>
                Inline
              </span>
            </div>
          )}
          <div className="text-black/30 text-lg font-light select-none">|</div>
          <Popover open={openProductSearch} onOpenChange={setOpenProductSearch}>
            <PopoverTrigger asChild>
              <div className="relative flex-1 min-w-[280px] cursor-pointer">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black/40" />
                <Input
                  placeholder="Browse products by name, brand, category, size..."
                  className="pl-10 pr-4 h-10 bg-white border-black/20 cursor-pointer text-sm font-semibold"
                  readOnly
                  onClick={() => setOpenProductSearch(true)}
                />
              </div>
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
                  {displaySearchCount > displayLimit && (
                    <div className="px-3 py-2 text-sm text-muted-foreground bg-muted/50 border-b flex items-center justify-between">
                      <span>
                        Showing {Math.min(displayLimit, displaySearchCount)} of {displaySearchCount}{" "}
                        {entryMode === "grid" ? "products" : "results"}
                      </span>
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
                    {entryMode === "grid" ? (
                      visibleProductLevelRows.map((result) => (
                        <CommandItem
                          key={result.product_id}
                          onSelect={() => {
                            selectSearchResult(result);
                            setOpenProductSearch(false);
                            setSearchInput("");
                          }}
                          className="p-0 cursor-pointer"
                        >
                          <div className="flex w-full flex-col gap-1 px-4 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate font-medium">
                                  {buildProductDisplayName({
                                    product_name: result.product_name,
                                    brand: result.brand,
                                    style: result.style,
                                    category: result.category,
                                  })}
                                </span>
                                {result.size_range && (
                                  <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                                    {result.size_range}
                                  </span>
                                )}
                              </div>
                              <span className="shrink-0 font-semibold text-primary">
                                ₹{(result.sale_price || 0).toFixed(2)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <div className="flex flex-wrap gap-2">
                                {result.brand && <span>{result.brand}</span>}
                                {result.color && <span>{result.color}</span>}
                              </div>
                              <span className={result.total_stock > 0 ? "text-emerald-600" : "text-destructive"}>
                                Stock: {result.total_stock}
                              </span>
                            </div>
                          </div>
                        </CommandItem>
                      ))
                    ) : (
                      (() => {
                        const grouped = groupVariantsByProduct(visiblePopoverResults);
                        return grouped.flatMap((group) =>
                          group.variants.map((result) => (
                            <CommandItem
                              key={result.id}
                              onSelect={() => {
                                selectSearchResult(result as SaleOrderVariantSearchResult);
                                setOpenProductSearch(false);
                                setSearchInput("");
                              }}
                              className="p-0 cursor-pointer"
                            >
                              <ERPVariantRow
                                result={{
                                  id: result.id!,
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
                          )),
                        );
                      })()
                    )}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <div className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg ml-auto shrink-0">
            <span className="text-[12px] font-bold opacity-80">Total Qty</span>
            <span className="font-black tabular-nums text-[16px]">{totalOrderQty}</span>
          </div>
        </div>
      </section>

      <section className={cn("flex-1 min-h-0 pb-2 overflow-hidden bg-neutral-100 relative w-full min-w-0", entryPageSectionX)}>
        <div
          ref={tableContainerRef}
          className="h-full w-full min-w-0 overflow-x-auto overflow-y-auto isolate rounded-lg border border-black/15 shadow-sm bg-white"
        >
          <div className="bg-white min-h-full pb-4 w-full min-w-full">
            <table className="w-full min-w-[1200px] table-fixed border-separate border-spacing-0 erp-desktop-table erp-entry-lines-table">
              <thead className="sticky top-0 z-10">
                <tr className="bg-white border-b-2 border-black">
                  <th className="text-center text-[13px] uppercase tracking-wide font-bold h-11 text-black px-2 w-10">#</th>
                  <th className="text-left text-[13px] uppercase tracking-wide font-bold h-11 text-black px-2 min-w-[160px]">Product</th>
                  <th className="text-center text-[13px] uppercase tracking-wide font-bold h-11 text-black px-2 w-24">Barcode</th>
                  <th className="text-center text-[13px] uppercase tracking-wide font-bold h-11 text-black px-2 w-16">HSN</th>
                  <th className="text-center text-[13px] uppercase tracking-wide font-bold h-11 text-black px-2 w-16">Color</th>
                  <th className="text-center text-[13px] uppercase tracking-wide font-bold h-11 text-black px-2 w-16">Size</th>
                  <th className="text-center text-[13px] uppercase tracking-wide font-bold h-11 text-black px-2 w-20">Order Qty</th>
                  <th className="text-center text-[13px] uppercase tracking-wide font-bold h-11 text-black px-2 w-14">Box</th>
                  <th className="text-center text-[13px] uppercase tracking-wide font-bold h-11 text-black px-2 w-16">UOM</th>
                  <th className="text-center text-[13px] uppercase tracking-wide font-bold h-11 text-black px-2 w-16">Stock</th>
                  <th className="text-center text-[13px] uppercase tracking-wide font-bold h-11 text-black px-2 w-24">Diff</th>
                  {showMrpCol && <th className="text-right text-[13px] uppercase tracking-wide font-bold h-11 text-black px-2 w-20">MRP</th>}
                  <th className="text-right text-[13px] uppercase tracking-wide font-bold h-11 text-black px-2 w-20">Price</th>
                  <th className="text-right text-[13px] uppercase tracking-wide font-bold h-11 text-black px-2 w-16">Disc%</th>
                  <th className="text-center text-[13px] uppercase tracking-wide font-bold h-11 text-black px-2 w-14">GST%</th>
                  <th className="text-right text-[13px] uppercase tracking-wide font-bold h-11 text-black px-2 w-24 border-l-2 border-black">Total</th>
                  <th className="w-8 h-11 bg-white" aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {(() => {
                  if (filledOrderItems.length === 0) {
                    return Array.from({ length: 7 }, (_, i) => (
                      <tr key={`empty-${i}`} className="h-[38px] border-b border-black/10">
                        <td className="text-center text-[12px] text-black/30 px-2">{i + 1}</td>
                        {Array.from({ length: showMrpCol ? 15 : 14 }).map((_, j) => (
                          <td key={j} className="px-2" />
                        ))}
                      </tr>
                    ));
                  }
                  const displayItems = filledOrderItems.slice().reverse();
                  const padCount = Math.max(0, 7 - displayItems.length);
                  const itemRows = displayItems.map((item, displayIndex) => {
                    const originalIndex = lineItems.findIndex((li) => li.id === item.id);
                    const stockInfo = getStockDifference(item);
                    return (
                      <tr
                        key={item.id}
                        className={cn(
                          "group border-b border-black/10 transition-colors",
                          displayIndex % 2 === 0 ? "bg-white" : "bg-neutral-50",
                          "hover:bg-neutral-100",
                        )}
                      >
                        <td className="text-center text-[14px] font-bold text-black/70 px-2 py-2">{originalIndex + 1}</td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => setHistoryProduct({ id: item.productId, name: item.productName })}
                            className="text-black hover:underline text-left font-bold break-words text-[14px]"
                          >
                            {item.productName}
                          </button>
                        </td>
                        <td className="text-center font-mono text-[13px] px-2 py-2">{item.barcode || "—"}</td>
                        <td className="text-center text-[13px] px-2 py-2">{item.hsnCode || "—"}</td>
                        <td className="text-center text-[13px] font-semibold px-2 py-2">{item.color || "—"}</td>
                        <td className="text-center text-[13px] font-bold px-2 py-2">{item.size || "—"}</td>
                        <td className="text-center px-1 py-1">
                          <Input
                            type="number"
                            min="1"
                            value={item.orderQty || ""}
                            onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 1)}
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            className="w-16 h-9 text-center font-bold mx-auto border-black/20"
                          />
                        </td>
                        <td className="text-center px-1 py-1">
                          <Input
                            type="text"
                            value={item.box || ""}
                            onChange={(e) => updateBox(item.id, e.target.value)}
                            className="w-14 h-9 text-center mx-auto border-black/20"
                          />
                        </td>
                        <td className="text-center px-1 py-1">
                          <Select value={item.uom || DEFAULT_UOM} onValueChange={(v) => updateUom(item.id, v)}>
                            <SelectTrigger className="w-16 h-9 text-xs border-black/20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {UOM_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.value}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="text-center text-[13px] font-bold px-2 py-2">{item.stockQty}</td>
                        <td className="text-center px-2 py-2">
                          {stockInfo && (
                            <div className={cn("flex items-center justify-center gap-1 text-xs font-bold", stockInfo.color)}>
                              <stockInfo.icon className="h-3.5 w-3.5" />
                              {stockInfo.text}
                            </div>
                          )}
                        </td>
                        {showMrpCol && (
                          <td className="text-right px-1 py-1">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.mrp || ""}
                              onChange={(e) => updateMrp(item.id, parseFloat(e.target.value) || 0)}
                              onWheel={(e) => (e.target as HTMLInputElement).blur()}
                              className="w-20 h-9 text-right ml-auto border-black/20 font-semibold"
                            />
                          </td>
                        )}
                        <td className="text-right px-1 py-1">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.salePrice || ""}
                            onChange={(e) => updateSalePrice(item.id, parseFloat(e.target.value) || 0)}
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            className="w-20 h-9 text-right ml-auto border-black/20 font-semibold"
                          />
                        </td>
                        <td className="text-right px-1 py-1">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={item.discountPercent || ""}
                            onChange={(e) => updateDiscountPercent(item.id, parseFloat(e.target.value) || 0)}
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            className="w-14 h-9 text-right ml-auto border-black/20"
                          />
                        </td>
                        <td className="text-center px-1 py-1">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={item.gstPercent || ""}
                            onChange={(e) => updateGstPercent(item.id, parseFloat(e.target.value) || 0)}
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            className="w-14 h-9 text-center mx-auto border-black/20"
                          />
                        </td>
                        <td className="text-right px-2 py-2 border-l border-black/10 font-black font-mono tabular-nums">
                          ₹{item.lineTotal.toFixed(2)}
                        </td>
                        <td className="px-0 py-1 text-center">
                          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => removeItem(item.id)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  });
                  const padRows = Array.from({ length: padCount }, (_, i) => (
                    <tr key={`pad-${i}`} className="h-[38px] border-b border-black/10 bg-white">
                      <td className="text-center text-[12px] text-black/30 px-2">{displayItems.length + i + 1}</td>
                      {Array.from({ length: showMrpCol ? 15 : 14 }).map((_, j) => (
                        <td key={j} className="px-2" />
                      ))}
                    </tr>
                  ));
                  return [...itemRows, ...padRows];
                })()}
              </tbody>
            </table>
            <div ref={tableEndRef} />
          </div>
        </div>
      </section>

      {showNotesSection && (
        <div className={cn("shrink-0 py-3 bg-white border-t border-black/10 max-h-[30vh] overflow-y-auto", entryPageSectionX)}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px] font-bold text-black">Terms & Conditions</Label>
              <Textarea value={termsConditions} onChange={(e) => setTermsConditions(e.target.value)} rows={3} className="text-[13px] bg-white border-black/20 mt-1" />
            </div>
            <div>
              <Label className="text-[12px] font-bold text-black">Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="text-[13px] bg-white border-black/20 mt-1" />
            </div>
          </div>
        </div>
      )}

      </main>

      <footer className="entry-page-footer sale-order-footer shrink-0 relative z-40">
        <div className="bg-white text-black border-t-2 border-black w-full">
          <div className="flex items-center justify-between px-4 py-3 gap-4 w-full min-w-0 flex-wrap">
            <div className="flex items-center gap-0 shrink-0 overflow-x-auto flex-wrap">
              <span className="text-[14px] font-extrabold uppercase tracking-wide text-black mr-2 whitespace-nowrap">Flat Disc %</span>
              <Input
                type="number"
                min="0"
                max="100"
                value={flatDiscountPercent || ""}
                placeholder="0"
                onChange={(e) => {
                  setFlatDiscountPercent(parseFloat(e.target.value) || 0);
                  setFlatDiscountAmount(0);
                }}
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                className="w-[80px] h-10 text-[16px] text-right bg-white text-black font-extrabold font-mono border-2 border-black/20 rounded-sm"
              />
              <div className="w-px h-8 bg-black/15 mx-3 shrink-0" />
              <span className="text-[14px] font-extrabold uppercase tracking-wide text-black mr-2 whitespace-nowrap">Flat Disc ₹</span>
              <Input
                type="number"
                min="0"
                value={flatDiscountAmount || ""}
                placeholder="0"
                onChange={(e) => {
                  setFlatDiscountAmount(parseFloat(e.target.value) || 0);
                  setFlatDiscountPercent(0);
                }}
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                className="w-[90px] h-10 text-[16px] text-right bg-white text-black font-extrabold font-mono border-2 border-black/20 rounded-sm"
              />
              <div className="w-px h-8 bg-black/15 mx-3 shrink-0" />
              <span className="text-[14px] font-extrabold uppercase tracking-wide text-black mr-2 whitespace-nowrap">Round</span>
              <Input
                type="number"
                step="0.01"
                value={roundOff || ""}
                placeholder="0"
                onChange={(e) => setRoundOff(parseFloat(e.target.value) || 0)}
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                className="w-[100px] h-10 text-[16px] text-right bg-white text-black font-extrabold font-mono border-2 border-black/20 rounded-sm"
              />
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="hidden md:flex flex-col gap-0.5 pl-4 border-l border-black/15">
                <div className="flex items-center justify-between gap-3 min-w-[120px]">
                  <span className="text-[12px] uppercase tracking-wide font-extrabold text-black/70">Items</span>
                  <span className="text-[16px] font-extrabold tabular-nums">{filledOrderItems.length}</span>
                </div>
                <div className="flex items-center justify-between gap-3 min-w-[120px]">
                  <span className="text-[12px] uppercase tracking-wide font-extrabold text-black/70">Total Qty</span>
                  <span className="text-[16px] font-extrabold tabular-nums">{totalOrderQty}</span>
                </div>
              </div>
              <div className="hidden lg:flex flex-col gap-0.5 pl-4 border-l border-black/15">
                <div className="flex items-center justify-between gap-3 min-w-[140px]">
                  <span className="text-[12px] uppercase tracking-wide font-extrabold text-black/70">Gross</span>
                  <span className="text-[16px] font-extrabold tabular-nums">₹{grossAmount.toFixed(0)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 min-w-[140px]">
                  <span className="text-[12px] uppercase tracking-wide font-extrabold text-black/70">Discount</span>
                  <span className="text-[16px] font-extrabold tabular-nums">-₹{totalDiscount.toFixed(0)}</span>
                </div>
              </div>
              <div className="pl-4 border-l-2 border-black flex flex-col items-end shrink-0">
                <span className="text-[13px] font-extrabold uppercase tracking-wide text-black underline underline-offset-2">Net Amount</span>
                <span className="text-[36px] font-black font-mono tabular-nums leading-none text-black tracking-tighter">
                  ₹{netAmount.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-neutral-100 border-t border-black/10 flex flex-wrap items-center px-4 py-2 gap-x-3 gap-y-1.5">
          <div className="hidden xl:flex items-center gap-2 text-[14px] text-black font-mono flex-1 min-w-0 overflow-hidden whitespace-nowrap">
            <span>Subtotal <span className="font-extrabold">₹{grossAmount.toFixed(0)}</span></span>
            <span className="text-black/30">—</span>
            <span>Disc <span className="font-extrabold">₹{totalDiscount.toFixed(0)}</span></span>
            <span className="text-black/30">+</span>
            <span>GST <span className="font-extrabold">₹{taxType === "exclusive" ? totalGST.toFixed(0) : "0"}</span></span>
            <span className="text-black/30">=</span>
            <span>Net <span className="font-black">₹{netAmount.toLocaleString("en-IN")}</span></span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowNotesSection((prev) => !prev)}
              className="h-9 px-3 text-[13px] font-bold text-black hover:bg-black/5 gap-1.5 border border-black/15"
            >
              <FileText className="h-4 w-4" />
              Notes
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/sale-order-dashboard")}
              className="h-9 px-3 text-[13px] font-bold text-red-700 hover:bg-red-50 gap-1.5 border border-red-200"
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveAndPrint}
              disabled={isSaving}
              variant="outline"
              className="h-9 px-4 text-[13px] font-extrabold gap-1.5 border-2 border-black text-black hover:bg-black/5"
            >
              <Printer className="h-4 w-4" />
              Save & Print
            </Button>
            <Button
              size="sm"
              onClick={() => handleSaveOrder().then((r) => r.success && navigate("/sale-order-dashboard"))}
              disabled={isSaving}
              className="h-9 px-5 text-[14px] bg-black text-white hover:bg-black/90 font-extrabold gap-1.5"
            >
              <Save className="h-4 w-4" />
              {isSaving ? "Saving..." : "Book Sale Order"}
            </Button>
          </div>
        </div>
      </footer>

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
