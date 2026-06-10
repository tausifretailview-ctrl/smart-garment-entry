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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, CalendarIcon, Trash2, Plus, Search, Barcode } from "lucide-react";
import { format } from "date-fns";
import { cn, sortSearchResults } from "@/lib/utils";
import { getUOMLabel, isDecimalUOM } from "@/constants/uom";
import { entryPageContentClass, entryPageShellClass } from "@/lib/entryPageLayout";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { CameraScanButton } from "@/components/CameraBarcodeScannerDialog";
import { useDraftSave } from "@/hooks/useDraftSave";
import { DraftResumeDialog } from "@/components/DraftResumeDialog";
import {
  buildPurchaseReturnItemPayload,
  calculatePurchaseReturnTotals,
} from "@/utils/purchaseReturnDc";
import { fetchProductsByIds } from "@/utils/fetchAllRows";
import {
  deleteJournalEntryByReference,
  recordPurchaseReturnJournalEntry,
} from "@/utils/accounting/journalService";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";

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

const PurchaseReturnEntry = () => {
  const { toast } = useToast();
  const { orgNavigate: navigate } = useOrgNavigation();
  const { currentOrganization, loading: orgLoading } = useOrganization();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const editId =
    searchParams.get("edit") ||
    (location.state as { editReturnId?: string } | null)?.editReturnId ||
    null;
  const isEditMode = !!editId;
  
  const [loading, setLoading] = useState(false);
  const savingRef = useRef(false);
  const [loadingReturn, setLoadingReturn] = useState(() => !!editId);
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
      return;
    }

    if (orgLoading) {
      setLoadingReturn(true);
      return;
    }

    if (!currentOrganization?.id) {
      setLoadingReturn(false);
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

    const loadReturnData = async () => {
      setLoadingReturn(true);
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

          setReturnNumber(typedReturn.return_number || "");
          setReturnDate(
            typedReturn.return_date ? new Date(typedReturn.return_date) : new Date()
          );

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

          const pm = typedReturn.payment_method as string | null | undefined;
          if (pm === "cash" || pm === "upi" || pm === "card" || pm === "bank_transfer") {
            setRefundSettlement("immediate_refund");
            setRefundPaymentMethod(pm);
          } else {
            setRefundSettlement("ap_adjustment");
            setRefundPaymentMethod("cash");
          }

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

          const [productsData, variantMap] = await Promise.all([
            fetchProductsByIds(productIds, "id, product_name, brand, uom"),
            fetchVariantColorsByIds(skuIds),
          ]);

          const productMap = new Map(productsData.map((p: any) => [p.id, p]));

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
        toast({
          title: "Error",
          description:
            error instanceof Error ? error.message : "Failed to load purchase return",
          variant: "destructive",
        });
        navigate("/purchase-returns");
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
  }, [editId, currentOrganization?.id, orgLoading, navigate, toast]);

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
        const productsData = await fetchProductsByIds(productIds, "id, uom");
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

  if (loadingReturn) {
    return (
      <div className="w-full px-6 py-6 flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading purchase return...</span>
        </div>
      </div>
    );
  }

  const displayNetAmount = isDC ? grossAmount - discountAmount : netAmount;

  return (
    <>
    <div className={entryPageShellClass} data-entry-form>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className={cn(entryPageContentClass, "space-y-4 sm:space-y-6")}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            {isEditMode ? "Edit Purchase Return" : "Purchase Return Entry"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isEditMode ? `Editing return: ${returnNumber}` : "Create a new purchase return record"}
          </p>
        </div>
        <BackToDashboard to="/purchase-returns" label="Back to Returns" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Return Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Return No.</Label>
                <Input
                  value={returnNumber}
                  readOnly
                  className="bg-muted font-medium"
                />
              </div>

              <div className="space-y-2">
                <Label>Supplier *</Label>
                <Select value={returnData.supplier_id} onValueChange={handleSupplierChange}>
                  <SelectTrigger>
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

              <div className="space-y-2">
                <Label>Return Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !returnDate && "text-muted-foreground"
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

              <div className="space-y-2">
                <Label>Supplier invoice no. (original purchase)</Label>
                <p className="text-xs text-muted-foreground -mt-1">
                  Load Items: each line qty = min(qty on purchase, current stock qty). Lines with no stock are omitted.
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Same as Supplier Invoice No on Purchase Entry (or software bill no.)"
                    value={returnData.original_bill_number}
                    className="no-uppercase"
                    onChange={(e) => {
                      setReturnData({ ...returnData, original_bill_number: e.target.value });
                      setBillLoaded(false);
                      setOriginalBillId('');
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); loadBillByNumber(); } }}
                  />
                  <Button
                    type="button"
                    onClick={loadBillByNumber}
                    disabled={loadingBill || !returnData.original_bill_number.trim()}
                    className="h-10 px-4 flex items-center gap-2 flex-shrink-0"
                  >
                    {loadingBill ? (
                      <><Loader2 className="h-4 w-4 animate-spin" />Loading...</>
                    ) : (
                      <><Search className="h-4 w-4" />Load Items</>
                    )}
                  </Button>
                </div>
                {billLoaded && (
                  <p className="text-xs text-green-600 font-medium mt-1">
                    ✅ Items loaded — quantities reflect current stock (not full purchase qty). Adjust if needed before saving.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>GST Type</Label>
                <Select value={taxType} onValueChange={(value: "exclusive" | "inclusive" | "dc") => setTaxType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exclusive">GST Exclusive</SelectItem>
                    <SelectItem value="inclusive">GST Inclusive</SelectItem>
                    <SelectItem value="dc">DC (No GST)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Enter notes or reason for return"
                  value={returnData.notes}
                  onChange={(e) => setReturnData({ ...returnData, notes: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="space-y-3 md:col-span-3 border-t pt-4">
                <Label className="text-sm font-medium">Refund settlement (GL)</Label>
                <Select
                  value={refundSettlement}
                  onValueChange={(v) => setRefundSettlement(v as PurchaseReturnRefundSettlement)}
                >
                  <SelectTrigger className="max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ap_adjustment">Reduce supplier balance (Accounts Payable)</SelectItem>
                    <SelectItem value="immediate_refund">Refund received from supplier (cash or bank)</SelectItem>
                  </SelectContent>
                </Select>
                {refundSettlement === "immediate_refund" && (
                  <div className="space-y-2 max-w-xs">
                    <Label className="text-xs text-muted-foreground">Received via</Label>
                    <Select
                      value={refundPaymentMethod}
                      onValueChange={(v) => setRefundPaymentMethod(v as PurchaseReturnRefundPm)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="upi">UPI</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      Cash → <span className="font-mono">1000</span>; UPI, Card, Bank transfer →{" "}
                      <span className="font-mono">1010</span>. AP adjustment uses <span className="font-mono">2000</span>.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Gross Amount:</span>
              <span className="font-medium">₹{grossAmount.toFixed(2)}</span>
            </div>
            <div className="space-y-2 border-t pt-3">
              <Label className="text-sm text-muted-foreground">Discount</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={discountPercent || ""}
                    onChange={(e) => handleDiscountPercentChange(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="pr-6"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountAmount || ""}
                    onChange={(e) => handleDiscountAmountChange(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="pl-6"
                  />
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                </div>
              </div>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-destructive">
                <span className="text-muted-foreground">Discount:</span>
                <span className="font-medium">-₹{discountAmount.toFixed(2)}</span>
              </div>
            )}
            {!isDC ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">GST Amount:</span>
                <span className="font-medium">₹{gstAmount.toFixed(2)}</span>
              </div>
            ) : (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-medium">GST Amount:</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-bold">
                    DC
                  </span>
                  <span className="font-medium">₹0.00</span>
                </span>
              </div>
            )}
            <div className="flex justify-between border-t pt-3">
              <span className="font-semibold">Net Amount:</span>
              <span className="font-bold text-lg">
                ₹{(isDC ? grossAmount - discountAmount : netAmount).toFixed(2)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Return Items</CardTitle>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">
                Total Items: <span className="font-semibold text-foreground">{lineItems.length}</span>
              </span>
              <span className="text-muted-foreground">
                Total Qty: <span className="font-semibold text-foreground">{lineItems.reduce((sum, item) => sum + item.qty, 0)}</span>
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                {isSearching ? (
                  <Loader2 className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
                ) : (
                  <Barcode className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                )}
                <Input
                  ref={searchInputRef}
                  placeholder="Scan barcode or search products..."
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
                  className="pl-10"
                  autoComplete="off"
                />
              </div>
              <CameraScanButton
                onBarcodeScanned={(barcode) => {
                  void searchAndAddProduct(barcode, { fromScan: true });
                }}
                className="h-10"
              />
            </div>
            {showSearch && searchResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
                {searchResults.map((variant, idx) => (
                  <div
                    key={variant.id}
                    className={cn(
                      "p-3 hover:bg-muted cursor-pointer border-b last:border-b-0",
                      idx === 0 && "bg-primary/5"
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleProductSelect(variant)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{variant.product_name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{variant.barcode}</div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {variant.brand} | Size: {variant.size} | ₹{variant.pur_price}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {lineItems.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Sr No</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead className="w-24">Qty</TableHead>
                    {showMrp && <TableHead className="w-24">MRP</TableHead>}
                    <TableHead className="w-32">Price</TableHead>
                    <TableHead className="w-20">Disc%</TableHead>
                    <TableHead className="w-24">Disc ₹</TableHead>
                    {!isDC && <TableHead className="w-24">GST%</TableHead>}
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item, index) => (
                    <TableRow key={item.temp_id}>
                      <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="font-medium">{item.product_name}</TableCell>
                      <TableCell>{item.brand}</TableCell>
                      <TableCell>{item.color || "-"}</TableCell>
                      <TableCell>{item.size}</TableCell>
                      <TableCell>{item.barcode}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={isDecimalUOM(item.uom) ? "0.001" : "1"}
                            step={isDecimalUOM(item.uom) ? "0.001" : "1"}
                            value={item.qty}
                            onChange={(e) =>
                              updateLineItem(
                                item.temp_id,
                                "qty",
                                parseReturnQty(item.uom, e.target.value),
                              )
                            }
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            className="w-20"
                          />
                          {item.uom && item.uom !== "NOS" && item.uom !== "PCS" && (
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                              {getUOMLabel(item.uom)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      {showMrp && (
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.mrp ?? 0}
                            onChange={(e) =>
                              updateLineItem(item.temp_id, "mrp", parseFloat(e.target.value) || 0)
                            }
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            className="w-24"
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.pur_price}
                          onChange={(e) =>
                            updateLineItem(item.temp_id, "pur_price", parseFloat(e.target.value) || 0)
                          }
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          className="w-28"
                        />
                      </TableCell>
                      <TableCell>
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
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.discount_amount}
                          onChange={(e) =>
                            updateLineItem(item.temp_id, "discount_amount", parseFloat(e.target.value) || 0)
                          }
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          className="w-24"
                        />
                      </TableCell>
                      {!isDC && (
                        <TableCell>
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
                            className="w-20"
                          />
                        </TableCell>
                      )}
                      <TableCell className="text-right font-medium">
                        ₹{item.line_total.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLineItem(item.temp_id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Search and add products to create a return</p>
            </div>
          )}
        </CardContent>
      </Card>
        </div>
      </div>

      <footer className="shrink-0 border-t border-border bg-card shadow-[0_-4px_12px_rgba(0,0,0,0.08)] px-2 sm:px-3 lg:px-4 py-3 flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground hidden sm:block">
          {lineItems.length === 0
            ? "No items added yet"
            : `${lineItems.length} item(s) · Net: ₹${displayNetAmount.toFixed(2)}`}
        </p>
        <div className="flex justify-end gap-4 ml-auto">
          <Button variant="outline" onClick={() => navigate("/purchase-returns")}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditMode ? "Update Return" : "Save Return"}
          </Button>
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
