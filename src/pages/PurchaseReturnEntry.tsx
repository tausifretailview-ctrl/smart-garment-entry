import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useSearchParams, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useSettings } from "@/hooks/useSettings";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, CalendarIcon, Trash2, Search, Barcode, ChevronLeft, Save, X, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { cn, sortSearchResults } from "@/lib/utils";
import { getUOMLabel, isDecimalUOM } from "@/constants/uom";
import { entryPageMainClass, entryPageSectionX, entryPageShellClass } from "@/lib/entryPageLayout";
import { useEntryViewportSync } from "@/hooks/useEntryViewportSync";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { CameraScanButton } from "@/components/CameraBarcodeScannerDialog";
import { useDraftSave } from "@/hooks/useDraftSave";
import { DraftResumeDialog } from "@/components/DraftResumeDialog";
import {
  buildPurchaseReturnItemPayload,
  calculatePurchaseReturnTotals,
} from "@/utils/purchaseReturnDc";
import {
  deleteJournalEntryByReference,
  recordPurchaseReturnJournalEntry,
} from "@/utils/accounting/journalService";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";
import { coerceToMap } from "@/lib/coerceToMap";

function parseReturnQty(uom: string | undefined, raw: string): number {
  if (isDecimalUOM(uom)) {
    const n = parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) / 1000 : 0.001;
  }
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function nextReturnQty(current: number, uom: string | undefined): number {
  const step = isDecimalUOM(uom) ? 0.001 : 1;
  const next = current + step;
  return isDecimalUOM(uom) ? Math.round(next * 1000) / 1000 : next;
}

function defaultReturnQty(_uom: string | undefined): number {
  return 1;
}

interface ProductVariant {
  id: string;
  product_id: string;
  product_name: string;
  brand: string;
  category?: string;
  style?: string;
  color?: string;
  size: string;
  barcode: string;
  pur_price: number;
  gst_per: number;
  hsn_code: string;
  stock_qty: number;
  mrp?: number;
  uom?: string;
}

interface LineItem {
  temp_id: string;
  product_id: string;
  sku_id: string;
  product_name: string;
  size: string;
  color?: string;
  uom?: string;
  qty: number;
  pur_price: number;
  gst_per: number;
  hsn_code: string;
  barcode: string;
  line_total: number;
  brand?: string;
  discount_percent: number;
  discount_amount: number;
  mrp?: number;
}

/** AP = reduce supplier payable; immediate = cash/bank received from supplier (GL 1000/1010 vs 2000). */
type PurchaseReturnRefundSettlement = "ap_adjustment" | "immediate_refund";
type PurchaseReturnRefundPm = "cash" | "upi" | "card" | "bank_transfer";

type PurchaseReturnRouteState = {
  editReturnId?: string;
  loadDraft?: boolean;
  returnPreview?: {
    id?: string;
    return_number?: string;
    return_date?: string;
    supplier_id?: string;
    supplier_name?: string;
    original_bill_number?: string;
    notes?: string;
    gross_amount?: number;
    gst_amount?: number;
    net_amount?: number;
    discount_percent?: number;
    discount_amount?: number;
    linked_bill_id?: string | null;
    is_dc?: boolean | null;
    payment_method?: string | null;
  };
};

type PurchaseReturnProductLookup = {
  id: string;
  product_name?: string | null;
  brand?: string | null;
  uom?: string | null;
};

async function fetchPurchaseReturnProductsByIds(
  organizationId: string,
  productIds: string[],
  selectFields = "id, product_name, brand, uom",
): Promise<PurchaseReturnProductLookup[]> {
  if (!organizationId || productIds.length === 0) return [];

  const allRows: PurchaseReturnProductLookup[] = [];
  const batchSize = 500;
  for (let i = 0; i < productIds.length; i += batchSize) {
    const batchIds = productIds.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from("products")
      .select(selectFields)
      .eq("organization_id", organizationId)
      .in("id", batchIds);
    if (error) throw error;
    if (data) allRows.push(...(data as unknown as PurchaseReturnProductLookup[]));
  }
  return allRows;
}

const PurchaseReturnEntry = () => {
  useEntryViewportSync();
  const { toast } = useToast();
  const { orgNavigate: navigate } = useOrgNavigation();
  const { currentOrganization, loading: orgLoading } = useOrganization();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const routeState = location.state as PurchaseReturnRouteState | null;
  const editId =
    (typeof searchParams?.get === "function" ? searchParams.get("edit") : null) ||
    routeState?.editReturnId ||
    null;
  const returnPreview = routeState?.returnPreview;
  const isEditMode = !!editId;
  
  const [loading, setLoading] = useState(false);
  const savingRef = useRef(false);
  const [loadingReturn, setLoadingReturn] = useState(() => !!editId);
  const [returnLoadError, setReturnLoadError] = useState<string | null>(null);
  const [returnLoadRetryKey, setReturnLoadRetryKey] = useState(0);
  const loadReturnGenRef = useRef(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductVariant[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [returnDate, setReturnDate] = useState<Date>(new Date());
  const [grossAmount, setGrossAmount] = useState(0);
  const [gstAmount, setGstAmount] = useState(0);
  const [netAmount, setNetAmount] = useState(0);
  const [returnNumber, setReturnNumber] = useState("");
  // taxType: GST handling mode.
  // 'dc' means Delivery Challan (no GST) — force GST to 0 and hide GST fields in UI.
  const [taxType, setTaxType] = useState<"exclusive" | "inclusive" | "dc">("exclusive");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lineItemsRef = useRef<LineItem[]>([]);
  const initialDraftCheckDone = useRef(false);
  const [stockAlertOpen, setStockAlertOpen] = useState(false);
  const [stockAlertMessage, setStockAlertMessage] = useState("");
  const [loadingBill, setLoadingBill] = useState(false);
  const [billLoaded, setBillLoaded] = useState(false);
  const [originalBillId, setOriginalBillId] = useState('');

  const { data: settings } = useSettings();
  const showMrp = (settings?.purchase_settings as any)?.show_mrp || false;
  const autoFocusSearch = (settings?.purchase_settings as any)?.auto_focus_search || false;
  const defaultTaxRate = (settings?.purchase_settings as any)?.default_tax_rate;
  const isDC = taxType === "dc";

  // Auto-focus search input on mount when setting is enabled
  useEffect(() => {
    if (!autoFocusSearch) return;
    const t = setTimeout(() => searchInputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [autoFocusSearch]);

  const [returnData, setReturnData] = useState({
    supplier_id: "",
    supplier_name: "",
    original_bill_number: "",
    notes: "",
  });

  const [refundSettlement, setRefundSettlement] = useState<PurchaseReturnRefundSettlement>("ap_adjustment");
  const [refundPaymentMethod, setRefundPaymentMethod] = useState<PurchaseReturnRefundPm>("cash");

  const hydrateReturnHeader = useCallback((typedReturn: PurchaseReturnRouteState["returnPreview"]) => {
    if (!typedReturn) return;

    setReturnNumber(typedReturn.return_number || "");
    setReturnDate(typedReturn.return_date ? new Date(typedReturn.return_date) : new Date());

    const inferredDcMode =
      typedReturn.is_dc === true ||
      (typedReturn.is_dc == null && Number(typedReturn.gst_amount || 0) === 0);
    setTaxType(inferredDcMode ? "dc" : "exclusive");

    setDiscountPercent(Number(typedReturn.discount_percent || 0));
    setDiscountAmount(Number(typedReturn.discount_amount || 0));
    setGrossAmount(Number(typedReturn.gross_amount || 0));
    setGstAmount(Number(typedReturn.gst_amount || 0));
    setNetAmount(Number(typedReturn.net_amount || 0));
    setOriginalBillId(typedReturn.linked_bill_id || "");

    setReturnData({
      supplier_id: typedReturn.supplier_id || "",
      supplier_name: typedReturn.supplier_name || "",
      original_bill_number: typedReturn.original_bill_number || "",
      notes: typedReturn.notes || "",
    });

    const pm = typedReturn.payment_method;
    if (pm === "cash" || pm === "upi" || pm === "card" || pm === "bank_transfer") {
      setRefundSettlement("immediate_refund");
      setRefundPaymentMethod(pm);
    } else {
      setRefundSettlement("ap_adjustment");
      setRefundPaymentMethod("cash");
    }
  }, []);

  // Draft save hook
  const {
    hasDraft,
    draftData,
    saveDraft,
    deleteDraft,
    updateCurrentData,
    lastSaved,
    startAutoSave,
    stopAutoSave,
  } = useDraftSave('purchase_return');

  // Load draft data callback
  const loadDraftData = useCallback((data: any) => {
    if (!data) return;
    setReturnData(data.returnData || { supplier_id: "", supplier_name: "", original_bill_number: "", notes: "" });
    setReturnNumber(data.returnNumber || "");
    setReturnDate(data.returnDate ? new Date(data.returnDate) : new Date());
    setLineItems(data.lineItems || []);
    setTaxType(data.taxType || "exclusive");
    setDiscountPercent(data.discountPercent || 0);
    setDiscountAmount(data.discountAmount || 0);
    // Silent restore - no toast to avoid disturbing user
  }, [toast]);

  // Load draft automatically if navigated from dashboard with loadDraft flag
  useEffect(() => {
    if (location.state?.loadDraft && hasDraft && draftData && !initialDraftCheckDone.current) {
      initialDraftCheckDone.current = true;
      loadDraftData(draftData);
      deleteDraft();
    }
  }, [location.state?.loadDraft, hasDraft, draftData, loadDraftData, deleteDraft]);

  // Show draft dialog on mount if draft exists and not loading from dashboard
  useEffect(() => {
    if (hasDraft && draftData && !isEditMode && !location.state?.loadDraft && !initialDraftCheckDone.current) {
      initialDraftCheckDone.current = true;
      setShowDraftDialog(true);
    }
  }, [hasDraft, draftData, isEditMode, location.state?.loadDraft]);

  // Update current data for auto-save whenever form data changes
  useEffect(() => {
    if (lineItems.length > 0) {
      updateCurrentData({
        returnData,
        returnNumber,
        returnDate: returnDate.toISOString(),
        lineItems,
        taxType,
        discountPercent,
        discountAmount,
        isEditMode,
        editId,
      });
    } else {
      updateCurrentData(null);
    }
  }, [returnData, returnNumber, returnDate, lineItems, taxType, discountPercent, discountAmount, isEditMode, editId, updateCurrentData]);

  // Start auto-save
  useEffect(() => {
    startAutoSave();
    return () => stopAutoSave();
  }, [startAutoSave, stopAutoSave]);

  // Generate return number on mount (only for new returns)
  useEffect(() => {
    const generateReturnNumber = async () => {
      if (!currentOrganization?.id || isEditMode) return;
      try {
        const { data, error } = await supabase.rpc("generate_purchase_return_number", {
          p_organization_id: currentOrganization.id,
        });
        if (error) throw error;
        setReturnNumber(data || "");
      } catch (error) {
        console.error("Error generating return number:", error);
      }
    };
    generateReturnNumber();
  }, [currentOrganization?.id, isEditMode]);

  // Load existing return data in edit mode
  useEffect(() => {
    if (!editId) {
      setLoadingReturn(false);
      setReturnLoadError(null);
      return;
    }

    if (orgLoading) {
      setLoadingReturn(true);
      setReturnLoadError(null);
      return;
    }

    if (!currentOrganization?.id) {
      setLoadingReturn(false);
      setReturnLoadError("Organization not loaded. Please refresh and try again.");
      toast({
        title: "Error",
        description: "Organization not loaded. Please refresh and try again.",
        variant: "destructive",
      });
      return;
    }

    const orgId = currentOrganization.id;
    const loadGen = ++loadReturnGenRef.current;
    let cancelled = false;

    if (returnPreview?.id === editId) {
      hydrateReturnHeader(returnPreview);
    }

    const loadReturnData = async () => {
      setLoadingReturn(true);
      setReturnLoadError(null);
      const loadTimeoutMs = 30_000;

      try {
        const fetchVariantColorsByIds = async (skuIds: string[]) => {
          if (skuIds.length === 0) return new Map<string, { color?: string }>();
          const map = new Map<string, { color?: string }>();
          const batchSize = 200;
          for (let i = 0; i < skuIds.length; i += batchSize) {
            const batch = skuIds.slice(i, i + batchSize);
            const { data, error } = await supabase
              .from("product_variants")
              .select("id, color")
              .eq("organization_id", orgId)
              .in("id", batch);
            if (error) throw error;
            (data || []).forEach((v: { id: string; color?: string | null }) => {
              map.set(v.id, { color: v.color || "" });
            });
          }
          return map;
        };

        const loadWork = async () => {
          const { data: returnRecord, error: returnError } = await supabase
            .from("purchase_returns" as any)
            .select("*")
            .eq("id", editId)
            .eq("organization_id", orgId)
            .is("deleted_at", null)
            .single();

          if (returnError) throw returnError;
          if (!returnRecord) throw new Error("Return not found");

          const typedReturn = returnRecord as any;
          hydrateReturnHeader(typedReturn);

          const { data: items, error: itemsError } = await supabase
            .from("purchase_return_items" as any)
            .select("*")
            .eq("return_id", editId)
            .is("deleted_at", null);

          if (itemsError) throw itemsError;

          const productIds = [
            ...new Set((items || []).map((item: any) => item.product_id).filter(Boolean)),
          ] as string[];
          const skuIds = [
            ...new Set((items || []).map((item: any) => item.sku_id).filter(Boolean)),
          ] as string[];

          const [productsData, variantMapRaw] = await Promise.all([
            fetchPurchaseReturnProductsByIds(orgId, productIds, "id, product_name, brand, uom"),
            fetchVariantColorsByIds(skuIds),
          ]);

          const productRows = Array.isArray(productsData) ? productsData : [];
          const productMap = new Map(productRows.map((p) => [p.id, p]));
          const variantMap = coerceToMap<string, { color?: string }>(variantMapRaw);

          const loadedItems: LineItem[] = (items || []).map((item: any) => {
            const product = productMap.get(item.product_id);
            const variant = variantMap.get(item.sku_id);
            return {
              temp_id: item.id,
              product_id: item.product_id,
              sku_id: item.sku_id,
              product_name: product?.product_name || "Unknown",
              size: item.size,
              color: item.color || variant?.color || "",
              uom: product?.uom || "NOS",
              qty: Number(item.qty) || 0,
              pur_price: item.pur_price,
              gst_per: item.gst_per,
              hsn_code: item.hsn_code || "",
              barcode: item.barcode || "",
              line_total: item.line_total,
              brand: product?.brand || "",
              discount_percent: Number((item as any).discount_percent || 0),
              discount_amount: Number((item as any).discount_amount || 0),
            };
          });

          if (cancelled || loadGen !== loadReturnGenRef.current) return;
          setLineItems(loadedItems);
        };

        await Promise.race([
          loadWork(),
          new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error("Loading timed out. Check your connection and try again.")),
              loadTimeoutMs
            );
          }),
        ]);
      } catch (error) {
        if (cancelled || loadGen !== loadReturnGenRef.current) return;
        console.error("Error loading return:", error);
        const message =
          error instanceof Error ? error.message : "Failed to load purchase return";
        setReturnLoadError(message);
        toast({
          title: "Error",
          description: message,
          variant: "destructive",
        });
      } finally {
        if (!cancelled && loadGen === loadReturnGenRef.current) {
          setLoadingReturn(false);
        }
      }
    };

    loadReturnData();

    return () => {
      cancelled = true;
    };
  }, [
    editId,
    currentOrganization?.id,
    orgLoading,
    returnPreview,
    returnLoadRetryKey,
    hydrateReturnHeader,
    toast,
  ]);

  // Fetch suppliers
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("organization_id", currentOrganization?.id)
        .order("supplier_name");
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Keep lineItemsRef in sync
  useEffect(() => {
    lineItemsRef.current = lineItems;
  }, [lineItems]);

  const lastInputTimeRef = useRef(0);
  const processingBarcodeRef = useRef(false);

  const barcodeScanner = useBarcodeScanner({
    minBarcodeLength: 4,
    maxKeystrokeInterval: 50,
    autoSubmitDelay: 120,
  });

  useEffect(() => {
    const totals = calculatePurchaseReturnTotals(lineItems, taxType, discountAmount);
    setGrossAmount(totals.grossAmount);
    setGstAmount(totals.gstAmount);
    setNetAmount(totals.netAmount);
  }, [lineItems, taxType, discountAmount]);

  // If DC mode is enabled, force per-line GST% to 0 so save/print are consistent.
  useEffect(() => {
    if (!isDC) return;
    setLineItems((prev) => {
      const needsUpdate = prev.some((it) => (it.gst_per || 0) !== 0);
      if (!needsUpdate) return prev;
      return prev.map((it) => ({ ...it, gst_per: 0 }));
    });
  }, [isDC, lineItems]);

  // Sync discount percent and amount
  const handleDiscountPercentChange = (percent: number) => {
    setDiscountPercent(percent);
    const gross = lineItems.reduce((sum, r) => sum + r.line_total, 0);
    setDiscountAmount(gross * percent / 100);
  };

  const handleDiscountAmountChange = (amount: number) => {
    setDiscountAmount(amount);
    const gross = lineItems.reduce((sum, r) => sum + r.line_total, 0);
    setDiscountPercent(gross > 0 ? (amount / gross) * 100 : 0);
  };

  // Get price from a specific purchase bill's items for a given variant
  const getPriceFromBill = async (skuId: string, specificBillId?: string): Promise<number | null> => {
    try {
      let query = supabase
        .from('purchase_items')
        .select('pur_price, line_total, qty')
        .eq('sku_id', skuId)
        .is('deleted_at', null);

      if (specificBillId) {
        query = query.eq('bill_id', specificBillId);
      } else {
        query = query.order('created_at', { ascending: false }).limit(1);
      }

      const { data } = await query.maybeSingle();
      if (!data) return null;
      if (data.pur_price && data.pur_price > 0) return data.pur_price;
      if (data.line_total && data.qty) return data.line_total / data.qty;
      return null;
    } catch {
      return null;
    }
  };

  const VARIANT_SELECT = `
    id,
    size,
    color,
    pur_price,
    mrp,
    barcode,
    stock_qty,
    active,
    deleted_at,
    product_id,
    products (
      id,
      product_name,
      brand,
      hsn_code,
      gst_per,
      purchase_gst_percent,
      uom,
      organization_id,
      deleted_at
    )
  `;

  const mapVariantFromDbRow = useCallback((v: Record<string, unknown>): ProductVariant | null => {
    const products = v.products as Record<string, unknown> | null;
    if (!products || products.deleted_at) return null;
    if (products.organization_id !== currentOrganization?.id) return null;
    return {
      id: String(v.id),
      product_id: String(products.id || ""),
      size: String(v.size || ""),
      color: String(v.color || ""),
      pur_price: Number(v.pur_price || 0),
      barcode: String(v.barcode || ""),
      product_name: String(products.product_name || ""),
      brand: String(products.brand || ""),
      gst_per: Number(products.purchase_gst_percent || products.gst_per || 0),
      hsn_code: String(products.hsn_code || ""),
      stock_qty: Number(v.stock_qty || 0),
      mrp: Number(v.mrp ?? 0),
      uom: String(products.uom || "NOS"),
    };
  }, [currentOrganization?.id]);

  const lookupVariantByBarcode = useCallback(
    async (raw: string): Promise<ProductVariant | null> => {
      const barcode = raw.trim();
      if (!barcode || !currentOrganization?.id) return null;

      const base = () =>
        supabase
          .from("product_variants")
          .select(VARIANT_SELECT)
          .eq("organization_id", currentOrganization.id)
          .eq("active", true)
          .is("deleted_at", null);

      const { data: exactRows, error: exactErr } = await base().eq("barcode", barcode).limit(5);
      if (!exactErr && exactRows?.length) {
        const mapped = exactRows.map((r) => mapVariantFromDbRow(r as Record<string, unknown>)).filter(Boolean);
        if (mapped.length === 1) return mapped[0] as ProductVariant;
        const ci = mapped.find((m) => m!.barcode.trim().toLowerCase() === barcode.toLowerCase());
        if (ci) return ci;
      }

      const { data: ilikeRows, error: ilikeErr } = await base().ilike("barcode", barcode).limit(5);
      if (!ilikeErr && ilikeRows?.length) {
        const mapped = ilikeRows
          .map((r) => mapVariantFromDbRow(r as Record<string, unknown>))
          .filter(Boolean) as ProductVariant[];
        const ci = mapped.find((m) => m.barcode.trim().toLowerCase() === barcode.toLowerCase());
        return ci || (mapped.length === 1 ? mapped[0] : null);
      }

      return null;
    },
    [currentOrganization?.id, mapVariantFromDbRow],
  );

  const fetchSearchVariants = useCallback(
    async (query: string): Promise<ProductVariant[]> => {
      if (!query || !currentOrganization?.id) return [];

      const { data: matchingProducts } = await supabase
        .from("products")
        .select("id")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .or(`product_name.ilike.%${query}%,brand.ilike.%${query}%`);

      const productIds = matchingProducts?.map((p) => p.id) || [];

      let variantsQuery = supabase
        .from("product_variants")
        .select(VARIANT_SELECT)
        .eq("organization_id", currentOrganization.id)
        .eq("active", true)
        .is("deleted_at", null);

      if (productIds.length > 0) {
        variantsQuery = variantsQuery.or(`barcode.ilike.%${query}%,product_id.in.(${productIds.join(",")})`);
      } else {
        variantsQuery = variantsQuery.ilike("barcode", `%${query}%`);
      }

      const { data, error } = await variantsQuery.limit(50);
      if (error) throw error;

      const results = (data || [])
        .map((v) => mapVariantFromDbRow(v as Record<string, unknown>))
        .filter(Boolean) as ProductVariant[];

      return sortSearchResults(results, query, {
        barcode: "barcode",
        productName: "product_name",
      });
    },
    [currentOrganization?.id, mapVariantFromDbRow],
  );

  const searchProducts = useCallback(
    async (query: string) => {
      if (!query || query.length < 1 || !currentOrganization?.id) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const sortedResults = await fetchSearchVariants(query);
        setSearchResults(sortedResults);
        setShowSearch(sortedResults.length > 0);
      } catch (error: unknown) {
        console.error(error);
        toast({
          title: "Error",
          description: "Failed to search products",
          variant: "destructive",
        });
      } finally {
        setIsSearching(false);
      }
    },
    [currentOrganization?.id, fetchSearchVariants, toast],
  );

  const addVariantToReturn = useCallback(
    async (variant: ProductVariant) => {
      const currentItems = lineItemsRef.current;
      const existingItem = currentItems.find((item) => item.sku_id === variant.id);

      if (existingItem) {
        const lineUom = existingItem.uom || variant.uom || "NOS";
        const nextQty = nextReturnQty(existingItem.qty, lineUom);
        if (nextQty > (variant.stock_qty || 0)) {
          toast({
            title: "Stock Warning",
            description: `${variant.product_name}: Qty ${nextQty} exceeds current stock ${variant.stock_qty || 0}. System will validate on save.`,
            variant: "default",
          });
        }
        setLineItems((prev) =>
          prev.map((item) => {
            if (item.temp_id !== existingItem.temp_id) return item;
            const updated = { ...item, qty: nextQty };
            const baseAmount = updated.qty * updated.pur_price;
            updated.discount_amount = baseAmount * (updated.discount_percent / 100);
            updated.line_total = baseAmount - updated.discount_amount;
            return updated;
          }),
        );
        toast({
          title: "Quantity Updated",
          description: `${variant.product_name} - ${variant.size} (Qty: ${nextQty})`,
        });
        return;
      }

      if ((variant.stock_qty || 0) <= 0) {
        toast({
          title: "Low Stock Warning",
          description: `${variant.product_name} - ${variant.size} has 0 stock. Return will be blocked by system if insufficient.`,
          variant: "default",
        });
      }

      const fetchedPrice = await getPriceFromBill(variant.id, originalBillId || undefined);
      const unitPrice = fetchedPrice ?? variant.pur_price;
      const lineUom = variant.uom || "NOS";
      const initialQty = defaultReturnQty(lineUom);
      const newItem: LineItem = {
        temp_id: `${Date.now()}-${Math.random()}`,
        product_id: variant.product_id,
        sku_id: variant.id,
        product_name: variant.product_name,
        size: variant.size,
        color: variant.color,
        uom: lineUom,
        qty: initialQty,
        pur_price: unitPrice,
        gst_per: variant.gst_per || (typeof defaultTaxRate === "number" ? defaultTaxRate : Number(defaultTaxRate) || 0),
        hsn_code: variant.hsn_code,
        barcode: variant.barcode,
        line_total: unitPrice * initialQty,
        brand: variant.brand,
        discount_percent: 0,
        discount_amount: 0,
        mrp: variant.mrp ?? 0,
      };
      setLineItems((prev) => [...prev, newItem]);
      toast({
        title: "Item Added",
        description: `${variant.product_name} - ${variant.size}`,
      });
    },
    [toast, originalBillId, defaultTaxRate],
  );

  /** POS-style: scan / Enter adds line directly; dropdown only for slow manual typing. */
  const searchAndAddProduct = useCallback(
    async (searchTerm: string, options?: { fromScan?: boolean }) => {
      const trimmed = searchTerm.trim();
      if (!trimmed || !currentOrganization?.id) return;
      if (processingBarcodeRef.current) return;

      processingBarcodeRef.current = true;
      barcodeScanner.markSubmitted(trimmed);
      barcodeScanner.cancelAutoSubmit();

      try {
        let variant = await lookupVariantByBarcode(trimmed);

        if (!variant) {
          const results = await fetchSearchVariants(trimmed);
          if (results.length === 0) {
            toast({
              title: "Product not found",
              description: `No product for barcode "${trimmed}"`,
              variant: "destructive",
            });
            return;
          }
          const exact = results.find(
            (r) => r.barcode.trim().toLowerCase() === trimmed.toLowerCase(),
          );
          variant = exact || results[0];
        }

        await addVariantToReturn(variant);
        setSearchQuery("");
        setShowSearch(false);
        setSearchResults([]);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      } finally {
        setTimeout(() => {
          processingBarcodeRef.current = false;
        }, 150);
      }
    },
    [
      currentOrganization?.id,
      lookupVariantByBarcode,
      fetchSearchVariants,
      addVariantToReturn,
      toast,
      barcodeScanner,
    ],
  );

  useEffect(() => {
    if (!searchQuery || searchQuery.length < 1) {
      setSearchResults([]);
      setShowSearch(false);
      return;
    }
    if (processingBarcodeRef.current) return;

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    const now = Date.now();
    const delta = now - lastInputTimeRef.current;
    if (
      barcodeScanner.detectScannerInput(searchQuery, delta) ||
      barcodeScanner.isScannerInput
    ) {
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      void searchProducts(searchQuery);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, barcodeScanner, searchProducts]);

  // Load items from a specific purchase bill (matches Purchase Entry "Supplier Invoice No" first, then software bill no)
  const loadBillByNumber = async () => {
    if (!returnData.original_bill_number.trim() || !currentOrganization) return;
    setLoadingBill(true);
    setBillLoaded(false);
    setOriginalBillId('');
    try {
      const searchTerm = returnData.original_bill_number.trim();
      const billSelect = `id, supplier_id, supplier_name, is_dc_purchase, bill_date, supplier_invoice_no, software_bill_no, purchase_items(id, sku_id, product_id, product_name, size, color, qty, pur_price, gst_per, hsn_code, barcode, line_total, brand, discount_percent, discount_amount)`;

      const baseQuery = () =>
        supabase
          .from("purchase_bills")
          .select(billSelect)
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null);

      const withSupplier = (q: ReturnType<typeof baseQuery>) =>
        returnData.supplier_id ? q.eq("supplier_id", returnData.supplier_id) : q;

      type PickOutcome =
        | { status: "ok"; bill: Record<string, unknown> }
        | { status: "ambiguous" }
        | { status: "empty" };

      const pickOne = async (q: ReturnType<typeof baseQuery>, ambiguousMsg: string): Promise<PickOutcome> => {
        const scoped = withSupplier(q);
        const { data: rows, error } = await scoped.order("bill_date", { ascending: false }).limit(2);
        if (error) throw error;
        if (!rows?.length) return { status: "empty" };
        if (rows.length > 1 && !returnData.supplier_id) {
          toast({ title: "Select supplier", description: ambiguousMsg, variant: "destructive" });
          return { status: "ambiguous" };
        }
        return { status: "ok", bill: rows[0] as Record<string, unknown> };
      };

      let invPick = await pickOne(
        baseQuery().eq("supplier_invoice_no", searchTerm),
        `Several bills use supplier invoice "${searchTerm}". Choose the supplier, then Load Items again.`
      );
      if (invPick.status === "ambiguous") return;

      let bill: Record<string, unknown> | null =
        invPick.status === "ok" ? invPick.bill : null;

      if (!bill) {
        const softPick = await pickOne(
          baseQuery().eq("software_bill_no", searchTerm),
          `Several bills match software bill no "${searchTerm}". Choose the supplier, then Load Items again.`
        );
        if (softPick.status === "ambiguous") return;
        bill = softPick.status === "ok" ? softPick.bill : null;
      }

      if (!bill) {
        toast({
          title: "Not Found",
          description: returnData.supplier_id
            ? `No purchase bill for this supplier with supplier invoice or software bill "${searchTerm}".`
            : `No purchase bill with supplier invoice no. or software bill no. "${searchTerm}".`,
          variant: "destructive",
        });
        return;
      }

      // Auto-fill supplier if not already set
      if (!returnData.supplier_id && bill.supplier_id) {
        setReturnData((prev) => ({
          ...prev,
          supplier_id: bill.supplier_id as string,
          supplier_name: (bill.supplier_name as string) || prev.supplier_name,
        }));
      }

      // Auto-detect DC bill: delivery challan (no GST)
      const isBillDC = !!(bill as any).is_dc_purchase;
      if (isBillDC) {
        setTaxType('dc');
        toast({ title: 'DC bill detected — return will be saved as Delivery Challan (no GST).' });
      }

      const rawItems: any[] = (bill as any).purchase_items || [];
      const skuIds = [...new Set(rawItems.map((i) => i.sku_id).filter(Boolean))] as string[];
      const productIds = [...new Set(rawItems.map((i) => i.product_id).filter(Boolean))] as string[];
      const uomByProductId = new Map<string, string>();
      if (productIds.length > 0) {
        const productsData = await fetchPurchaseReturnProductsByIds(
          currentOrganization.id,
          productIds,
          "id, uom",
        );
        productsData.forEach((p: { id: string; uom?: string | null }) => {
          uomByProductId.set(p.id, p.uom || "NOS");
        });
      }
      const stockBySku = new Map<string, number>();
      if (skuIds.length > 0) {
        const { data: variantsData, error: varErr } = await supabase
          .from("product_variants")
          .select("id, stock_qty, products(organization_id)")
          .in("id", skuIds);
        if (varErr) throw varErr;
        for (const v of variantsData || []) {
          const row = v as { id: string; stock_qty?: number; products?: { organization_id?: string } | null };
          if (row.products?.organization_id === currentOrganization.id) {
            stockBySku.set(row.id, Math.max(0, Number(row.stock_qty) || 0));
          }
        }
      }

      const skippedNames: string[] = [];
      const items: LineItem[] = [];
      let rowIdx = 0;
      for (const item of rawItems) {
        const purchasedQty = Math.max(0, Number(item.qty) || 0);
        const stockQty = item.sku_id ? (stockBySku.get(item.sku_id) ?? 0) : 0;
        const returnQty = Math.min(purchasedQty, stockQty);
        if (returnQty <= 0) {
          if (purchasedQty > 0) {
            skippedNames.push((item.product_name || "Item").trim() || "Item");
          }
          continue;
        }

        const pur_price = Number(item.pur_price) || 0;
        const baseAmount = returnQty * pur_price;
        const discount_percent = Number(item.discount_percent) || 0;
        let discount_amount = 0;
        if (discount_percent > 0) {
          discount_amount = baseAmount * (discount_percent / 100);
        } else if (purchasedQty > 0 && Number(item.discount_amount)) {
          discount_amount = (Number(item.discount_amount) * returnQty) / purchasedQty;
        }
        const line_total = baseAmount - discount_amount;

        items.push({
          temp_id: `${Date.now()}-${rowIdx}-${Math.random().toString(36).slice(2, 9)}`,
          product_id: item.product_id,
          sku_id: item.sku_id,
          product_name: item.product_name || '',
          size: item.size || '',
          color: item.color || '',
          uom: uomByProductId.get(item.product_id) || "NOS",
          qty: returnQty,
          pur_price,
          gst_per: isBillDC ? 0 : (Number(item.gst_per) || 0),
          hsn_code: item.hsn_code || '',
          barcode: item.barcode || '',
          line_total,
          brand: item.brand || '',
          discount_percent,
          discount_amount,
        });
        rowIdx += 1;
      }

      if (items.length === 0) {
        toast({
          title: "Nothing to return",
          description:
            skippedNames.length > 0
              ? `No current stock for loaded lines (${skippedNames.slice(0, 5).join(", ")}${skippedNames.length > 5 ? "…" : ""}). Purchase qty is capped by stock.`
              : "This bill has no line items, or stock is zero for every line.",
          variant: "destructive",
        });
        return;
      }

      setOriginalBillId(bill.id as string);
      setLineItems(items);
      setBillLoaded(true);
      const skipNote =
        skippedNames.length > 0
          ? ` ${skippedNames.length} line(s) skipped (no stock).`
          : "";
      toast({
        title: "Bill Loaded",
        description: `${items.length} item(s) loaded — qty = min(purchase qty, current stock).${skipNote}`,
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to load bill', variant: 'destructive' });
    } finally {
      setLoadingBill(false);
    }
  };

  const handleProductSelect = async (variant: ProductVariant) => {
    await addVariantToReturn(variant);
    setSearchQuery("");
    setShowSearch(false);
    setSearchResults([]);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const updateLineItem = (temp_id: string, field: keyof LineItem, value: any) => {
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.temp_id === temp_id) {
          const updated = { ...item, [field]: value };
          // Calculate base amount
          const baseAmount = updated.qty * updated.pur_price;
          
          // Handle discount changes
          if (field === "discount_percent") {
            updated.discount_amount = baseAmount * (updated.discount_percent / 100);
          } else if (field === "discount_amount") {
            updated.discount_percent = baseAmount > 0 ? (updated.discount_amount / baseAmount) * 100 : 0;
          } else if (field === "qty" || field === "pur_price") {
            // Recalculate discount amount when qty or price changes
            updated.discount_amount = baseAmount * (updated.discount_percent / 100);
          }
          
          // Calculate line total after discount
          updated.line_total = baseAmount - updated.discount_amount;
          return updated;
        }
        return item;
      })
    );
  };

  const removeLineItem = (temp_id: string) => {
    setLineItems((prev) => prev.filter((item) => item.temp_id !== temp_id));
  };

  const handleSupplierChange = (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    if (supplier) {
      setReturnData({
        ...returnData,
        supplier_id: supplier.id,
        supplier_name: supplier.supplier_name,
      });
    }
  };

  const handleSave = async () => {
    // PRIMARY GUARD: synchronous ref (React state updates are async — `loading` check is insufficient against rapid double-clicks)
    if (savingRef.current) return;
    if (loading) return;
    savingRef.current = true;
    try {
      await handleSaveInner();
    } finally {
      savingRef.current = false;
    }
  };

  const handleSaveInner = async () => {
    const isMissingDcColumnError = (err: any) => {
      const msg = (err?.message || String(err || "")).toLowerCase();
      return msg.includes("is_dc") && (msg.includes("column") || msg.includes("schema cache"));
    };

    const stripIsDcFromItems = (items: Array<Record<string, any>>) =>
      items.map(({ is_dc, ...rest }) => rest);

    if (!returnData.supplier_id) {
      toast({
        title: "Error",
        description: "Please select a supplier",
        variant: "destructive",
      });
      return;
    }

    if (lineItems.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one item",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const paymentMethodForReturnRow: string | null =
        refundSettlement === "immediate_refund" ? refundPaymentMethod : null;

      const isDC = taxType === "dc";

      if (isEditMode && editId) {
        // Update existing return
        const updatePayload: any = {
          supplier_id: returnData.supplier_id,
          supplier_name: returnData.supplier_name,
          original_bill_number: returnData.original_bill_number || null,
          return_date: format(returnDate, "yyyy-MM-dd"),
          gross_amount: grossAmount,
          is_dc: isDC,
          gst_amount: isDC ? 0 : gstAmount,
          net_amount: isDC ? grossAmount - discountAmount : netAmount,
          notes: returnData.notes || null,
          payment_method: paymentMethodForReturnRow,
        };
        const fallbackUpdatePayload = (() => {
          const { is_dc: _ignore, ...rest } = updatePayload;
          return rest;
        })();
        updatePayload.discount_amount = discountAmount;
        updatePayload.discount_percent = discountPercent;
        const itemsPayload = lineItems.map((item) => buildPurchaseReturnItemPayload(item, isDC));

        // Run the two independent operations in parallel for faster save.
        // Note: missing column errors can be thrown (not only returned in `{ error }`), so we retry in catch.
        const updateReturnPromise = (async () => {
          try {
            const { error } = await supabase
              .from("purchase_returns" as any)
              .update(updatePayload)
              .eq("id", editId);

            if (!error) return { error: null as any };
            if (!isMissingDcColumnError(error)) return { error };

            const { error: fallbackError } = await supabase
              .from("purchase_returns" as any)
              .update(fallbackUpdatePayload)
              .eq("id", editId);
            return { error: fallbackError };
          } catch (err: any) {
            if (!isMissingDcColumnError(err)) throw err;

            const { error: fallbackError } = await supabase
              .from("purchase_returns" as any)
              .update(fallbackUpdatePayload)
              .eq("id", editId);
            return { error: fallbackError };
          }
        })();

        const [updateReturnRes, rpcRes] = await Promise.all([
          updateReturnPromise,
          supabase.rpc(
            'update_purchase_return_items' as any,
            { p_return_id: editId, p_items: itemsPayload as any }
          ),
        ]);

        if (updateReturnRes?.error) throw updateReturnRes.error;
        if (rpcRes?.error) throw rpcRes.error;
        if (rpcRes?.data && !(rpcRes.data as any).success) {
          throw new Error((rpcRes.data as any).error || 'Update failed');
        }

        const { data: acctEditPr } = await supabase
          .from("settings")
          .select("accounting_engine_enabled")
          .eq("organization_id", currentOrganization!.id)
          .maybeSingle();
        if (!isDC && isAccountingEngineEnabled(acctEditPr as { accounting_engine_enabled?: boolean } | null)) {
          try {
            await deleteJournalEntryByReference(currentOrganization!.id, "PurchaseReturn", editId, supabase);
            await supabase
              .from("purchase_returns" as any)
              .update({ journal_status: "pending", journal_error: null })
              .eq("id", editId);
            await recordPurchaseReturnJournalEntry(
              editId,
              currentOrganization!.id,
              netAmount,
              format(returnDate, "yyyy-MM-dd"),
              `Purchase return ${returnNumber}`,
              supabase,
              paymentMethodForReturnRow
            );
            await supabase
              .from("purchase_returns" as any)
              .update({ journal_status: "posted", journal_error: null })
              .eq("id", editId);
          } catch (glErr) {
            const errMsg = glErr instanceof Error ? glErr.message : String(glErr);
            await supabase
              .from("purchase_returns" as any)
              .update({ journal_status: "failed", journal_error: errMsg.slice(0, 2000) })
              .eq("id", editId);
            console.error("Purchase return edit journal:", glErr);
            toast({
              title: "Ledger warning",
              description: "Purchase return was saved but the day book could not be updated.",
              variant: "destructive",
            });
          }
        } else if (isDC) {
          await supabase
            .from("purchase_returns" as any)
            .update({ journal_status: "not_applicable", journal_error: null })
            .eq("id", editId);
        }

        toast({
          title: "Success",
          description: "Purchase return updated successfully",
        });
      } else {
        // Generate fresh return number at save time to prevent duplicate key errors
        let freshReturnNumber = returnNumber;
        try {
          const { data: freshNum } = await supabase.rpc("generate_purchase_return_number", {
            p_organization_id: currentOrganization?.id,
          });
          if (freshNum) freshReturnNumber = freshNum;
        } catch (e) {
          console.warn("Failed to regenerate return number, using existing:", e);
        }

        // Insert new purchase return
        const headerPayload: any = {
          organization_id: currentOrganization?.id,
          supplier_id: returnData.supplier_id,
          supplier_name: returnData.supplier_name,
          original_bill_number: returnData.original_bill_number || null,
          return_date: format(returnDate, "yyyy-MM-dd"),
          gross_amount: grossAmount,
          is_dc: isDC,
          gst_amount: isDC ? 0 : gstAmount,
          net_amount: isDC ? grossAmount - discountAmount : netAmount,
          notes: returnData.notes || null,
          return_number: freshReturnNumber,
          credit_status: "pending",
          payment_method: paymentMethodForReturnRow,
          discount_amount: discountAmount,
          discount_percent: discountPercent,
        };

        let returnRecord: any = null;
        const { is_dc: _ignoreIsDc, ...fallbackHeaderPayload } = headerPayload;
        try {
          const insertResult = await supabase
            .from("purchase_returns" as any)
            .insert(headerPayload)
            .select()
            .single();

          if (insertResult.error) {
            if (!isMissingDcColumnError(insertResult.error)) throw insertResult.error;
            const fallbackInsertResult = await supabase
              .from("purchase_returns" as any)
              .insert(fallbackHeaderPayload)
              .select()
              .single();
            if (fallbackInsertResult.error) throw fallbackInsertResult.error;
            returnRecord = fallbackInsertResult.data;
          } else {
            returnRecord = insertResult.data;
          }
        } catch (insertErr: any) {
          if (!isMissingDcColumnError(insertErr)) throw insertErr;
          const fallbackInsertResult = await supabase
            .from("purchase_returns" as any)
            .insert(fallbackHeaderPayload)
            .select()
            .single();
          if (fallbackInsertResult.error) throw fallbackInsertResult.error;
          returnRecord = fallbackInsertResult.data;
        }

        // Insert return items
        const itemsToInsertWithDc = lineItems.map((item) => ({
          return_id: (returnRecord as any).id,
          ...buildPurchaseReturnItemPayload(item, isDC),
        }));

        const itemsToInsertWithoutDc = stripIsDcFromItems(itemsToInsertWithDc as any[]);
        try {
          const itemsInsertRes = await supabase
            .from("purchase_return_items" as any)
            .insert(itemsToInsertWithDc);

          if (itemsInsertRes.error) {
            if (!isMissingDcColumnError(itemsInsertRes.error)) throw itemsInsertRes.error;
            const fallbackItemsInsert = await supabase
              .from("purchase_return_items" as any)
              .insert(itemsToInsertWithoutDc as any);
            if (fallbackItemsInsert.error) throw fallbackItemsInsert.error;
          }
        } catch (itemsErr: any) {
          if (!isMissingDcColumnError(itemsErr)) throw itemsErr;
          const fallbackItemsInsert = await supabase
            .from("purchase_return_items" as any)
            .insert(itemsToInsertWithoutDc as any);
          if (fallbackItemsInsert.error) throw fallbackItemsInsert.error;
        }

        const prId = (returnRecord as unknown as { id: string }).id;
        const { data: acctPr } = await supabase
          .from("settings")
          .select("accounting_engine_enabled")
          .eq("organization_id", currentOrganization!.id)
          .maybeSingle();
        if (!isDC && isAccountingEngineEnabled(acctPr as { accounting_engine_enabled?: boolean } | null)) {
          try {
            await recordPurchaseReturnJournalEntry(
              prId,
              currentOrganization!.id,
              netAmount,
              format(returnDate, "yyyy-MM-dd"),
              `Purchase return ${freshReturnNumber}`,
              supabase,
              paymentMethodForReturnRow
            );
            await supabase
              .from("purchase_returns" as any)
              .update({ journal_status: "posted", journal_error: null })
              .eq("id", prId);
          } catch (glErr) {
            await supabase
              .from("purchase_returns" as any)
              .update({
                journal_status: "failed",
                journal_error: glErr instanceof Error ? glErr.message.slice(0, 2000) : String(glErr).slice(0, 2000),
              })
              .eq("id", prId);
            await supabase.from("purchase_return_items" as any).delete().eq("return_id", prId);
            await supabase.from("purchase_returns" as any).delete().eq("id", prId);
            throw glErr;
          }
        } else if (isDC) {
          await supabase
            .from("purchase_returns" as any)
            .update({ journal_status: "not_applicable", journal_error: null })
            .eq("id", prId);
        }

        // Auto-create credit note voucher for proper accounting
        try {
          // Generate credit note number
          const { data: lastVoucher } = await supabase
            .from("voucher_entries")
            .select("voucher_number")
            .eq("organization_id", currentOrganization?.id)
            .eq("voucher_type", "credit_note")
            .order("created_at", { ascending: false })
            .limit(1);

          const lastNum = lastVoucher?.[0]?.voucher_number?.match(/\d+$/)?.[0] || "0";
          const creditNoteNumber = `SCN-${String(parseInt(lastNum) + 1).padStart(5, "0")}`;

          // Create credit note voucher
          const { data: creditNote, error: creditNoteError } = await supabase
            .from("voucher_entries")
            .insert({
              organization_id: currentOrganization?.id,
              voucher_number: creditNoteNumber,
              voucher_type: "credit_note",
              voucher_date: format(returnDate, "yyyy-MM-dd"),
              reference_type: "supplier",
              reference_id: returnData.supplier_id,
              description: `Supplier Credit Note for Purchase Return: ${returnNumber}`,
              total_amount: netAmount,
            })
            .select()
            .single();

          if (creditNoteError) throw creditNoteError;

          // Link credit note to purchase return
          await supabase
            .from("purchase_returns" as any)
            .update({ credit_note_id: creditNote?.id })
            .eq("id", (returnRecord as any).id);

        } catch (creditError) {
          console.error("Error creating credit note voucher:", creditError);
          // Don't fail the whole save, just log it
        }

        toast({
          title: "Success",
          description: "Purchase return saved successfully with credit note",
        });
      }

      // Clear draft on successful save
      await deleteDraft();
      navigate("/purchase-returns");
    } catch (error: any) {
      console.error("Error saving purchase return:", error);
      const msg = error?.message || String(error);
      toast({
        title: msg.includes("No Stock available For Return") ? "Stock Error" : "Error saving return",
        description: msg.includes("No Stock available For Return")
          ? msg.replace("No Stock available For Return.", "Cannot save return — insufficient stock.")
          : msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const displayNetAmount = isDC ? grossAmount - discountAmount : netAmount;
  const taxableAmount = isDC ? grossAmount - discountAmount : Math.max(0, displayNetAmount - gstAmount);
  const totalReturnQty = lineItems.reduce((sum, item) => sum + item.qty, 0);
  const isReturnHydrating = isEditMode && loadingReturn;
  const isReturnEditBlocked = isReturnHydrating || !!returnLoadError;

  return (
    <>
    <div
      className={cn(entryPageShellClass, "bg-white sale-order-readable min-h-0 relative")}
      data-entry-form
      aria-busy={isReturnHydrating}
    >
      {(isReturnHydrating || returnLoadError) && (
        <div className="absolute inset-0 z-30 flex items-start justify-center bg-white/80 px-4 pt-16 backdrop-blur-[1px]">
          <Card className="w-full max-w-md border-black/20 shadow-lg">
            <CardContent className="flex flex-col items-center gap-3 p-5 text-center">
              {returnLoadError ? (
                <>
                  <p className="text-sm font-bold text-destructive">Could not load purchase return</p>
                  <p className="text-xs text-black/60">{returnLoadError}</p>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={() => setReturnLoadRetryKey((key) => key + 1)}>
                      Retry
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate("/purchase-returns")}>
                      Back to Returns
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-black" />
                  <p className="text-sm font-bold text-black">Loading purchase return details...</p>
                  <p className="text-xs text-black/60">
                    The window is ready. Item rows will appear here shortly.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <header className="bg-white border-b-2 border-black shrink-0 flex flex-col">
        <div className={cn("entry-page-header-row h-[52px] flex items-center gap-2", entryPageSectionX)}>
          <div className="entry-page-header-leading flex items-center gap-2 sm:gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/purchase-returns")}
              className="h-8 shrink-0 text-black hover:text-black hover:bg-black/5 border border-black/20 text-xs gap-1.5 font-bold"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Button>
            <div className="w-px h-6 bg-black/15 shrink-0" />
            <RotateCcw className="h-5 w-5 text-black shrink-0" />
            <span className="text-black font-bold text-[15px] whitespace-nowrap hidden md:inline">
              {isEditMode ? "Edit Purchase Return" : "Purchase Return Entry"}
            </span>
            <span className="border-2 border-black text-black font-mono text-[11px] font-bold px-3 py-1 rounded-md shrink-0">
              {returnNumber || "NEW"}
            </span>
          </div>
        </div>
      </header>

      <main className={cn(entryPageMainClass, isReturnEditBlocked && "pointer-events-none opacity-60")}>
        <section className={cn("bg-white border-b border-black/10 py-2 shrink-0 shadow-sm", entryPageSectionX)}>
          <div className="flex flex-wrap lg:flex-nowrap items-end gap-3">
            <div className="space-y-1 flex-1 min-w-[120px]">
              <Label htmlFor="return_number" className="text-[13px] font-bold text-black">Return No.</Label>
              <Input
                id="return_number"
                value={returnNumber}
                readOnly
                className="h-10 bg-neutral-50 font-mono font-bold text-sm border-black/20"
              />
            </div>

            <div className="space-y-1 flex-[1.5] min-w-[160px]">
              <Label className="text-[13px] font-bold text-black">
                Supplier <span className="text-red-600">*</span>
              </Label>
              <Select value={returnData.supplier_id} onValueChange={handleSupplierChange}>
                <SelectTrigger className="h-10 border-black/20">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.supplier_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 flex-1 min-w-[140px]">
              <Label className="text-[13px] font-bold text-black">Return Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full h-10 justify-start text-left font-normal border-black/20",
                      !returnDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {returnDate ? format(returnDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={returnDate}
                    onSelect={(date) => date && setReturnDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1 flex-1 min-w-[140px]">
              <Label className="text-[13px] font-bold text-black">GST Type</Label>
              <Select value={taxType} onValueChange={(value: "exclusive" | "inclusive" | "dc") => setTaxType(value)}>
                <SelectTrigger className="h-10 border-black/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exclusive">GST Exclusive</SelectItem>
                  <SelectItem value="inclusive">GST Inclusive</SelectItem>
                  <SelectItem value="dc">DC (No GST)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap lg:flex-nowrap items-end gap-3">
            <div className="space-y-1 flex-[2] min-w-[220px]">
              <Label className="text-[13px] font-bold text-black">Supplier Invoice No. (original purchase)</Label>
              <p className="text-[11px] text-black/55 leading-snug">
                Load Items: each line qty = min(qty on purchase, current stock). Lines with no stock are omitted.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Supplier invoice no. or software bill no."
                  value={returnData.original_bill_number}
                  className="no-uppercase h-10 border-black/20"
                  onChange={(e) => {
                    setReturnData({ ...returnData, original_bill_number: e.target.value });
                    setBillLoaded(false);
                    setOriginalBillId("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      loadBillByNumber();
                    }
                  }}
                />
                <Button
                  type="button"
                  onClick={loadBillByNumber}
                  disabled={loadingBill || !returnData.original_bill_number.trim()}
                  className="h-10 px-4 flex items-center gap-2 shrink-0 bg-black text-white hover:bg-black/90 font-bold"
                >
                  {loadingBill ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      Load Items
                    </>
                  )}
                </Button>
              </div>
              {billLoaded && (
                <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                  Items loaded — qty reflects current stock. Adjust before saving.
                </p>
              )}
            </div>

            <div className="space-y-1 flex-1 min-w-[160px]">
              <Label className="text-[13px] font-bold text-black">Refund Settlement (GL)</Label>
              <Select
                value={refundSettlement}
                onValueChange={(v) => setRefundSettlement(v as PurchaseReturnRefundSettlement)}
              >
                <SelectTrigger className="h-10 border-black/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ap_adjustment">Reduce supplier balance (AP)</SelectItem>
                  <SelectItem value="immediate_refund">Refund received (cash/bank)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {refundSettlement === "immediate_refund" && (
              <div className="space-y-1 flex-1 min-w-[120px]">
                <Label className="text-[13px] font-bold text-black">Received via</Label>
                <Select
                  value={refundPaymentMethod}
                  onValueChange={(v) => setRefundPaymentMethod(v as PurchaseReturnRefundPm)}
                >
                  <SelectTrigger className="h-10 border-black/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1 flex-[1.5] min-w-[180px]">
              <Label className="text-[13px] font-bold text-black">Notes</Label>
              <Textarea
                placeholder="Enter notes or reason for return"
                value={returnData.notes}
                onChange={(e) => setReturnData({ ...returnData, notes: e.target.value })}
                rows={2}
                className="min-h-[40px] resize-none border-black/20 text-sm"
              />
            </div>
          </div>

          {isDC && (
            <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-md">
              <span className="text-xs font-bold text-orange-700">DC Return — GST set to 0% for all items</span>
            </div>
          )}
        </section>

        <section className={cn("bg-neutral-50 border-b border-black/10 py-3 shrink-0", entryPageSectionX)}>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[280px]">
              <div className="relative">
                {isSearching ? (
                  <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black/40 animate-spin pointer-events-none" />
                ) : (
                  <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black/40 pointer-events-none" />
                )}
                <Input
                  ref={searchInputRef}
                  placeholder="SCAN BARCODE OR SEARCH BY NAME, BRAND, CATEGORY, STYLE..."
                  value={searchQuery}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    const now = Date.now();
                    const delta = now - lastInputTimeRef.current;
                    lastInputTimeRef.current = now;
                    barcodeScanner.recordKeystroke();
                    setSearchQuery(newValue);

                    if (searchTimeoutRef.current) {
                      clearTimeout(searchTimeoutRef.current);
                      searchTimeoutRef.current = null;
                    }

                    const isScannerLike =
                      barcodeScanner.detectScannerInput(newValue, delta) ||
                      (newValue.length >= 4 && delta < 50);

                    if (isScannerLike) {
                      setShowSearch(false);
                      setSearchResults([]);
                      barcodeScanner.scheduleAutoSubmit(newValue, (val) => {
                        void searchAndAddProduct(val, { fromScan: true });
                      });
                      return;
                    }
                  }}
                  onFocus={() => {
                    if (searchResults.length > 0) setShowSearch(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => {
                      setShowSearch(false);
                      setSearchResults([]);
                      barcodeScanner.reset();
                    }, 400);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      barcodeScanner.cancelAutoSubmit();
                      const value = (e.currentTarget.value || searchQuery).trim();
                      if (!value) return;
                      void searchAndAddProduct(value, { fromScan: true });
                    }
                    if (e.key === "Escape") {
                      barcodeScanner.cancelAutoSubmit();
                      setShowSearch(false);
                      setSearchResults([]);
                      setSearchQuery("");
                      barcodeScanner.reset();
                    }
                  }}
                  className="pl-10 h-10 text-sm bg-white border-black/20 uppercase font-semibold"
                  autoComplete="off"
                />
                {showSearch && searchResults.length > 0 && (
                  <div className="absolute top-full mt-1 w-full bg-white border border-black/15 rounded-md shadow-lg z-[100] max-h-60 overflow-auto">
                    {searchResults.map((variant, idx) => (
                      <div
                        key={variant.id}
                        className={cn(
                          "p-3 hover:bg-neutral-100 cursor-pointer border-b border-black/5 last:border-b-0",
                          idx === 0 && "bg-neutral-50",
                        )}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleProductSelect(variant)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-semibold text-sm text-black">{variant.product_name}</div>
                          <div className="text-xs text-black/50 font-mono">{variant.barcode}</div>
                        </div>
                        <div className="text-sm text-black/60">
                          {variant.brand} | Size: {variant.size} | ₹{variant.pur_price}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <CameraScanButton
              onBarcodeScanned={(barcode) => {
                void searchAndAddProduct(barcode, { fromScan: true });
              }}
              className="h-10 border-black/20"
            />
            <div className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg ml-auto shrink-0">
              <span className="text-[12px] font-bold opacity-80">Total Qty</span>
              <span className="font-black tabular-nums text-[16px]">{totalReturnQty}</span>
            </div>
          </div>
        </section>

        <section className={cn("flex-1 min-h-0 pb-2 overflow-hidden bg-neutral-100 relative w-full min-w-0", entryPageSectionX)}>
          <div className="h-full w-full min-w-0 overflow-x-auto overflow-y-auto isolate rounded-lg border border-black/15 shadow-sm bg-white">
            {lineItems.length > 0 ? (
              <Table className="table-fixed w-full min-w-[1100px] border-separate border-spacing-0 erp-desktop-table erp-entry-lines-table">
                <TableHeader className="sticky top-0 z-10">
                  <TableRow className="bg-white border-b-2 border-black hover:bg-white">
                    <TableHead className="w-[40px] text-center !text-[15px] uppercase font-bold text-black h-11">#</TableHead>
                    <TableHead className="min-w-[160px] text-left !text-[15px] uppercase font-bold text-black h-11">Item Name</TableHead>
                    <TableHead className="w-[80px] text-center !text-[15px] uppercase font-bold text-black h-11">Brand</TableHead>
                    <TableHead className="w-[70px] text-center !text-[15px] uppercase font-bold text-black h-11">Color</TableHead>
                    <TableHead className="w-[60px] text-center !text-[15px] uppercase font-bold text-black h-11">Size</TableHead>
                    <TableHead className="w-[100px] text-center !text-[15px] uppercase font-bold text-black h-11">Barcode</TableHead>
                    <TableHead className="w-[72px] text-center text-[13px] uppercase font-bold text-black h-11">Qty</TableHead>
                    {showMrp && (
                      <TableHead className="w-[80px] text-right text-[13px] uppercase font-bold text-black h-11">MRP</TableHead>
                    )}
                    <TableHead className="w-[88px] text-right text-[13px] uppercase font-bold text-black h-11 bg-neutral-100">Pur. Rate</TableHead>
                    <TableHead className="w-[64px] text-center text-[13px] uppercase font-bold text-black h-11">Disc%</TableHead>
                    <TableHead className="w-[72px] text-right text-[13px] uppercase font-bold text-black h-11">Disc ₹</TableHead>
                    {!isDC && (
                      <TableHead className="w-[64px] text-center text-[13px] uppercase font-bold text-black h-11">GST%</TableHead>
                    )}
                    <TableHead className="w-[88px] text-right text-[13px] uppercase font-bold text-black h-11 border-l-2 border-black bg-neutral-100">Total</TableHead>
                    <TableHead className="w-[40px] h-11" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item, index) => (
                    <TableRow key={item.temp_id} className="border-b border-black/5">
                      <TableCell className="text-center text-black/60 font-mono !text-[15px] py-1.5">{index + 1}</TableCell>
                      <TableCell className="font-bold !text-[17px] text-black py-1.5 leading-snug">{item.product_name}</TableCell>
                      <TableCell className="text-center !text-[16px] font-medium text-black py-1.5">{item.brand}</TableCell>
                      <TableCell className="text-center !text-[16px] font-medium text-black py-1.5">{item.color || "-"}</TableCell>
                      <TableCell className="text-center !text-[16px] font-mono font-semibold text-black py-1.5">{item.size}</TableCell>
                      <TableCell className="text-center !text-[15px] font-mono font-medium text-black/80 py-1.5">{item.barcode}</TableCell>
                      <TableCell className="py-1">
                        <div className="flex items-center gap-1 justify-center">
                          <Input
                            type="number"
                            min={isDecimalUOM(item.uom) ? "0.001" : "1"}
                            step={isDecimalUOM(item.uom) ? "0.001" : "1"}
                            value={item.qty}
                            onChange={(e) =>
                              updateLineItem(item.temp_id, "qty", parseReturnQty(item.uom, e.target.value))
                            }
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            className="w-[56px] h-8 text-center text-sm border-black/20 font-mono"
                          />
                          {item.uom && item.uom !== "NOS" && item.uom !== "PCS" && (
                            <span className="text-[10px] text-black/50 whitespace-nowrap">{getUOMLabel(item.uom)}</span>
                          )}
                        </div>
                      </TableCell>
                      {showMrp && (
                        <TableCell className="py-1">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.mrp ?? 0}
                            onChange={(e) =>
                              updateLineItem(item.temp_id, "mrp", parseFloat(e.target.value) || 0)
                            }
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            className="w-[72px] h-8 text-right text-sm border-black/20 font-mono ml-auto"
                          />
                        </TableCell>
                      )}
                      <TableCell className="py-1">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.pur_price}
                          onChange={(e) =>
                            updateLineItem(item.temp_id, "pur_price", parseFloat(e.target.value) || 0)
                          }
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          className="w-[80px] h-8 text-right text-sm border-black/20 font-mono ml-auto bg-neutral-50"
                        />
                      </TableCell>
                      <TableCell className="py-1">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={item.discount_percent}
                          onChange={(e) =>
                            updateLineItem(item.temp_id, "discount_percent", parseFloat(e.target.value) || 0)
                          }
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          className="w-[56px] h-8 text-center text-sm border-black/20 font-mono mx-auto"
                        />
                      </TableCell>
                      <TableCell className="py-1">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.discount_amount}
                          onChange={(e) =>
                            updateLineItem(item.temp_id, "discount_amount", parseFloat(e.target.value) || 0)
                          }
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          className="w-[64px] h-8 text-right text-sm border-black/20 font-mono ml-auto"
                        />
                      </TableCell>
                      {!isDC && (
                        <TableCell className="py-1">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={item.gst_per}
                            onChange={(e) =>
                              updateLineItem(item.temp_id, "gst_per", parseFloat(e.target.value) || 0)
                            }
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            className="w-[56px] h-8 text-center text-sm border-black/20 font-mono mx-auto"
                          />
                        </TableCell>
                      )}
                      <TableCell className="text-right font-bold text-[15px] font-mono tabular-nums text-black py-1.5 border-l-2 border-black/10">
                        ₹{item.line_total.toFixed(2)}
                      </TableCell>
                      <TableCell className="py-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-red-50"
                          onClick={() => removeLineItem(item.temp_id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-black/45">
                <Search className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm font-semibold">Scan barcode or search products to add return lines</p>
                <p className="text-xs mt-1">Or load items from an original supplier invoice above</p>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="entry-page-footer sale-order-footer shrink-0 relative z-40">
        <div className="bg-white text-black border-t-2 border-black w-full">
          <div className="flex items-center justify-between px-4 py-3 gap-4 w-full min-w-0 flex-wrap">
            <div className="flex items-center gap-0 shrink-0 overflow-x-auto flex-wrap">
              <span className="text-[14px] font-extrabold uppercase tracking-wide text-black mr-2 whitespace-nowrap">Bill Disc %</span>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={discountPercent || ""}
                onChange={(e) => handleDiscountPercentChange(parseFloat(e.target.value) || 0)}
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                placeholder="0"
                className="w-[80px] h-10 text-[16px] text-right bg-white text-black font-extrabold font-mono border-2 border-black/20 rounded-sm"
              />
              <div className="w-px h-8 bg-black/15 mx-3 shrink-0" />
              <span className="text-[14px] font-extrabold uppercase tracking-wide text-black mr-2 whitespace-nowrap">Bill Disc ₹</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={discountAmount || ""}
                onChange={(e) => handleDiscountAmountChange(parseFloat(e.target.value) || 0)}
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                placeholder="0"
                className="w-[90px] h-10 text-[16px] text-right bg-white text-black font-extrabold font-mono border-2 border-black/20 rounded-sm"
              />
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="hidden md:flex flex-col gap-0.5 pl-4 border-l border-black/15">
                <div className="flex items-center justify-between gap-3 min-w-[120px]">
                  <span className="text-[12px] uppercase tracking-wide font-extrabold text-black/70">Items</span>
                  <span className="text-[16px] font-extrabold tabular-nums">{lineItems.length}</span>
                </div>
                <div className="flex items-center justify-between gap-3 min-w-[120px]">
                  <span className="text-[12px] uppercase tracking-wide font-extrabold text-black/70">Total Qty</span>
                  <span className="text-[16px] font-extrabold tabular-nums">{totalReturnQty}</span>
                </div>
              </div>
              <div className="hidden lg:flex flex-col gap-0.5 pl-4 border-l border-black/15">
                <div className="flex items-center justify-between gap-3 min-w-[140px]">
                  <span className="text-[13px] uppercase tracking-wide font-extrabold text-black/70">Gross</span>
                  <span className="text-[18px] font-extrabold tabular-nums">₹{grossAmount.toFixed(0)}</span>
                </div>
                {!isDC && (
                  <div className="flex items-center justify-between gap-3 min-w-[140px]">
                    <span className="text-[13px] uppercase tracking-wide font-extrabold text-black/70">GST</span>
                    <span className="text-[18px] font-extrabold tabular-nums">₹{gstAmount.toFixed(0)}</span>
                  </div>
                )}
              </div>
              <div className="pl-4 border-l-2 border-black flex flex-col items-end shrink-0">
                <span className="text-[13px] font-extrabold uppercase tracking-wide text-black underline underline-offset-2">Net Return</span>
                <span className="text-[36px] font-black font-mono tabular-nums leading-none text-black tracking-tighter">
                  ₹{displayNetAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-neutral-100 border-t border-black/10 flex flex-wrap items-center px-4 py-2.5 gap-x-3 gap-y-1.5">
          <div className="flex items-center gap-2.5 !text-[17px] text-black font-mono flex-1 min-w-0 overflow-x-auto whitespace-nowrap">
            <span>Gross <span className="font-extrabold">₹{grossAmount.toFixed(0)}</span></span>
            <span className="text-black/30">—</span>
            <span>Disc <span className="font-extrabold">₹{discountAmount.toFixed(0)}</span></span>
            <span className="text-black/30">=</span>
            <span>Taxable <span className="font-extrabold">₹{taxableAmount.toFixed(2)}</span></span>
            {!isDC && (
              <>
                <span className="text-black/30">+</span>
                <span>GST <span className="font-extrabold">₹{gstAmount.toFixed(2)}</span></span>
              </>
            )}
            <span className="text-black/30">=</span>
            <span>Net <span className="font-black">₹{displayNetAmount.toLocaleString("en-IN")}</span></span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/purchase-returns")}
              className="h-9 px-3 text-[13px] font-bold text-red-700 hover:bg-red-50 gap-1.5 border border-red-200"
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={loading || isReturnEditBlocked || lineItems.length === 0}
              className="h-9 px-5 text-[14px] bg-black text-white hover:bg-black/90 font-extrabold gap-1.5"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {isEditMode ? "Update Return" : "Save Return"}
                </>
              )}
            </Button>
          </div>
        </div>
      </footer>
    </div>

      {/* Draft Resume Dialog */}
      <DraftResumeDialog
        open={showDraftDialog}
        onOpenChange={setShowDraftDialog}
        onResume={() => {
          loadDraftData(draftData);
          deleteDraft();
          setShowDraftDialog(false);
        }}
        onStartFresh={() => {
          deleteDraft();
          setShowDraftDialog(false);
        }}
        draftType="Purchase Return"
        lastSaved={lastSaved}
      />

      {/* Stock Not Available Alert */}
      <AlertDialog open={stockAlertOpen} onOpenChange={setStockAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stock Not Available</AlertDialogTitle>
            <AlertDialogDescription>{stockAlertMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => {
              setStockAlertOpen(false);
              setTimeout(() => searchInputRef.current?.focus(), 50);
            }}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default PurchaseReturnEntry;
