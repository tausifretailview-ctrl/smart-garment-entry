import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Receipt, Search, ChevronDown, ChevronRight, Printer, Plus, Home, Edit, Trash2, Database, ArrowUpDown, Wallet, Settings2, CheckCircle2, Clock, ShoppingCart, IndianRupee, FileText, X, RefreshCw, Barcode, Eye, CreditCard, Camera, Lock, LockOpen, ZoomIn, FileSpreadsheet, Ban } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format, formatDistanceToNow } from "date-fns";
import { formatPurchaseBillEntryAt } from "@/lib/purchaseBillEntryAt";
import { ColumnDef } from "@tanstack/react-table";
import * as XLSX from "xlsx";

import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  dispatchPurchaseDraftDiscarded,
  readPurchaseEntryDraftMeta,
  countPurchaseDraftQty,
  readPurchaseEntrySnapshot,
  summarizePurchaseDraft,
  type PurchaseEntryDraftMeta,
} from "@/lib/purchaseEntryPersistence";
import { useSettings } from "@/hooks/useSettings";
import { DASHBOARD_TAB_RETURN_QUERY_OPTIONS } from "@/lib/dashboardQueryOptions";
import { fetchProductsByIds, fetchPurchaseItemsByBillId } from "@/utils/fetchAllRows";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SupplierHistoryDialog } from "@/components/SupplierHistoryDialog";
import { useSoftDelete, StockDependency } from "@/hooks/useSoftDelete";
import { useDraftSave } from "@/hooks/useDraftSave";
import { useContextMenu, useIsDesktop } from "@/hooks/useContextMenu";
import { DesktopContextMenu, PageContextMenu, ContextMenuItem } from "@/components/DesktopContextMenu";
import { ERPTable } from "@/components/erp-table";
import { cn } from "@/lib/utils";
import { useTabCacheLayout } from "@/contexts/TabCacheLayoutContext";
import { useSharedAppShell } from "@/contexts/SharedAppShellContext";
import { onWheelScrollContainer } from "@/lib/scrollWheel";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { isDashboardFilterRestoring, pickPersistedNumber, pickPersistedString, readPurchaseBillDashboardFilters, restoreDashboardFilters } from "@/lib/dashboardFilterPersistence";
import {
  derivePurchaseBillDisplayStatus,
  getEffectivePaidAmountForPurchaseBill,
  getPurchaseBillPendingAmount,
} from "@/utils/purchaseBillSettlement";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useNavPerfPage, useNavPerfQueryWatch } from "@/hooks/useNavigationPerf";
import { fetchPurchaseDashboardSummary } from "@/utils/purchaseDashboardSummary";
import {
  fetchPurchaseBillIdsMatchingLineItems,
  purchaseBillTextSearchFilter,
} from "@/utils/purchaseBillDashboardSearch";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { MobileStatStrip } from "@/components/mobile/MobileStatStrip";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { Skeleton } from "@/components/ui/skeleton";

/** Supplier invoice image column — hidden by default; enable via Columns menu. */
const PURCHASE_BILLS_DEFAULT_COLUMN_VISIBILITY: Record<string, boolean> = {
  bill_image: false,
};

interface PurchaseItem {
  id: string;
  product_id: string;
  product_name?: string;
  brand?: string;
  category?: string;
  color?: string;
  style?: string;
  product_style?: string;
  size: string;
  qty: number;
  pur_price: number;
  sale_price: number;
  mrp?: number;
  gst_per: number;
  hsn_code: string;
  barcode: string;
  line_total: number;
  deleted_at?: string | null;
}

const hasDisplayValue = (value?: string | null): value is string => {
  return Boolean(value && value.trim() && value.trim() !== '-');
};

const getDisplayStyle = (item: { style?: string | null; product_style?: string | null }) => {
  if (hasDisplayValue(item.style)) return item.style.trim();
  if (hasDisplayValue(item.product_style)) return item.product_style.trim();
  return '';
};

// Helper function to format product description (matches PurchaseEntry format)
const formatProductDescription = (item: {
  product_name?: string;
  brand?: string;
  category?: string;
  style?: string;
  color?: string;
  size: string;
}) => {
  const nameParts: string[] = [];
  if (hasDisplayValue(item.product_name)) nameParts.push(item.product_name.trim());
  if (hasDisplayValue(item.category)) nameParts.push(item.category.trim());
  if (hasDisplayValue(item.style)) nameParts.push(item.style.trim());
  if (hasDisplayValue(item.color)) nameParts.push(item.color.trim());
  if (hasDisplayValue(item.brand)) nameParts.push(item.brand.trim());
  const desc = nameParts.join('-');
  return `${desc} | ${item.size}`;
};

interface PurchaseBill {
  id: string;
  supplier_id?: string;
  supplier_name: string;
  supplier_invoice_no: string;
  software_bill_no: string;
  bill_date: string;
  bill_entry_at?: string | null;
  gross_amount: number;
  discount_amount: number;
  gst_amount: number;
  net_amount: number;
  notes: string;
  created_at: string;
  payment_status?: string;
  paid_amount?: number;
  total_qty?: number;
  is_dc_purchase?: boolean;
  bill_image_url?: string | null;
  is_locked?: boolean;
  is_cancelled?: boolean;
  cancelled_at?: string | null;
  cancelled_reason?: string | null;
  items?: PurchaseItem[];
  purchase_items?: { count: number }[];
}

const PERF_PATH = "purchase-bills";

const PurchaseBillDashboard = () => {
  useNavPerfPage(PERF_PATH);
  const inTabCache = useTabCacheLayout();
  const sharedShell = useSharedAppShell();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { orgNavigate: navigate } = useOrgNavigation();
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const savedPurchaseFilters = readPurchaseBillDashboardFilters(currentOrganization?.id);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState(
    () => pickPersistedString(savedPurchaseFilters?.searchQuery) ?? "",
  );
  const [startDate, setStartDate] = useState(
    () => pickPersistedString(savedPurchaseFilters?.startDate) ?? "",
  );
  const [endDate, setEndDate] = useState(
    () => pickPersistedString(savedPurchaseFilters?.endDate) ?? "",
  );
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [billItems, setBillItems] = useState<Record<string, PurchaseItem[]>>({});
  const [printingBill, setPrintingBill] = useState<string | null>(null);
  const [deletingBill, setDeletingBill] = useState<string | null>(null);
  const [billToDelete, setBillToDelete] = useState<PurchaseBill | null>(null);
  // Cancel bill state
  const [billToCancel, setBillToCancel] = useState<PurchaseBill | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // Selection and pagination states
  const [selectedBills, setSelectedBills] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(
    () => pickPersistedNumber(savedPurchaseFilters?.currentPage) ?? 1,
  );
  const [itemsPerPage, setItemsPerPage] = useState(
    () => pickPersistedNumber(savedPurchaseFilters?.itemsPerPage) ?? 50,
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(() => {
    const saved = pickPersistedString(savedPurchaseFilters?.sortOrder);
    return saved === "asc" || saved === "desc" ? saved : "desc";
  });
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>(
    () => pickPersistedString(savedPurchaseFilters?.paymentStatusFilter) ?? "all",
  );
  const [dcFilter, setDcFilter] = useState<string>(
    () => pickPersistedString(savedPurchaseFilters?.dcFilter) ?? "all",
  );

  const purchaseFilterSnapshot = useMemo(
    () => ({
      searchQuery,
      startDate,
      endDate,
      sortOrder,
      paymentStatusFilter,
      dcFilter,
      currentPage,
      itemsPerPage,
    }),
    [
      searchQuery,
      startDate,
      endDate,
      sortOrder,
      paymentStatusFilter,
      dcFilter,
      currentPage,
      itemsPerPage,
    ],
  );

  useDashboardFilterPersistence(
    "purchase-bills",
    currentOrganization?.id,
    purchaseFilterSnapshot,
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [
          ["searchQuery", setSearchQuery],
          ["startDate", setStartDate],
          ["endDate", setEndDate],
          ["sortOrder", setSortOrder],
          ["paymentStatusFilter", setPaymentStatusFilter],
          ["dcFilter", setDcFilter],
        ],
        numbers: [
          ["currentPage", setCurrentPage],
          ["itemsPerPage", setItemsPerPage],
        ],
      });
    },
  );

  const purchaseQueriesEnabled = !!currentOrganization?.id;

  // Image upload and lock states
  const [uploadingImageForBill, setUploadingImageForBill] = useState<string | null>(null);
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [togglingLock, setTogglingLock] = useState<string | null>(null);
  
  // Payment recording states
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [selectedBillForPayment, setSelectedBillForPayment] = useState<PurchaseBill | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);

  // Supplier history dialog states
  const [showSupplierHistory, setShowSupplierHistory] = useState(false);
  const [selectedSupplierForHistory, setSelectedSupplierForHistory] = useState<{id: string; name: string} | null>(null);
  
  // Stock dependency warning states
  const [showDependencyWarning, setShowDependencyWarning] = useState(false);
  const [stockDependencies, setStockDependencies] = useState<StockDependency[]>([]);
  const [isCheckingDependencies, setIsCheckingDependencies] = useState(false);
  
  // Draft save hook
  const { hasDraft, draftData, deleteDraft, lastSaved, checkDraft } = useDraftSave('purchase');
  const [draftBannerDismissed, setDraftBannerDismissed] = useState(false);
  const [browserDraftMeta, setBrowserDraftMeta] = useState<PurchaseEntryDraftMeta | null>(null);

  const refreshBrowserDraftMeta = useCallback(() => {
    if (!currentOrganization?.id || !user?.id) {
      setBrowserDraftMeta(null);
      return;
    }
    const meta = readPurchaseEntryDraftMeta(currentOrganization.id, user.id);
    if (meta) {
      setBrowserDraftMeta(meta);
      return;
    }
    const inline = readPurchaseEntrySnapshot(currentOrganization.id, user.id);
    if (inline?.lineItems?.length) {
      setBrowserDraftMeta({
        lineCount: inline.lineItems.length,
        totalQty: countPurchaseDraftQty(inline.lineItems),
        savedAt: inline.savedAt ?? Date.now(),
        billData: inline.billData,
        softwareBillNo: inline.softwareBillNo,
        billDate: inline.billDate,
        isEditMode: inline.isEditMode,
        editingBillId: inline.editingBillId,
        fullDataInIdb: false,
      });
      return;
    }
    setBrowserDraftMeta(null);
  }, [currentOrganization?.id, user?.id]);

  useEffect(() => {
    refreshBrowserDraftMeta();
  }, [refreshBrowserDraftMeta, hasDraft, draftData, lastSaved]);

  const draftSummary = useMemo(() => {
    const fromDb = draftData ? summarizePurchaseDraft(draftData) : null;
    if (fromDb) return fromDb;
    if (browserDraftMeta) {
      return {
        lineCount: browserDraftMeta.lineCount,
        totalQty: browserDraftMeta.totalQty,
        isEdit: Boolean(browserDraftMeta.isEditMode && browserDraftMeta.editingBillId),
        savedAt: browserDraftMeta.savedAt,
      };
    }
    return null;
  }, [draftData, browserDraftMeta]);

  const showDraftBanner = Boolean(draftSummary) && !draftBannerDismissed;

  useEffect(() => {
    if (draftSummary) setDraftBannerDismissed(false);
  }, [draftSummary?.lineCount, draftSummary?.savedAt]);

  // Virtual scrolling ref
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Context menu for desktop right-click
  const isDesktop = useIsDesktop();
  const rowContextMenu = useContextMenu<PurchaseBill>();
  const pageContextMenu = useContextMenu<void>();

  // Get context menu items for purchase bill row
  const getBillContextMenuItems = (bill: PurchaseBill): ContextMenuItem[] => {
    return [
      {
        label: "View Details",
        icon: Eye,
        onClick: () => handleToggleExpand(bill.id),
      },
      {
        label: "Edit Bill",
        icon: Edit,
        onClick: () => {
          if (bill.is_cancelled) {
            toast({ title: "Bill Cancelled", description: "Cancelled bills cannot be edited.", variant: "destructive" });
            return;
          }
          navigate("/purchase-entry", { state: { editBillId: bill.id } });
        },
        disabled: bill.is_cancelled,
      },
      { label: "", separator: true, onClick: () => {} },
      {
        label: "Record Payment",
        icon: CreditCard,
        onClick: () => {
          setSelectedBillForPayment(bill);
          const remainingAmount = getPurchaseBillPendingAmount(bill);
          setPaymentAmount(remainingAmount.toFixed(2));
          setPaymentDate(format(new Date(), "yyyy-MM-dd"));
          setPaymentMethod("cash");
          setPaymentNotes("");
          setShowPaymentDialog(true);
        },
        disabled: bill.payment_status === 'completed' || bill.is_cancelled,
      },
      {
        label: "Print Barcodes",
        icon: Barcode,
        onClick: async () => {
          try {
            // Fetch items fresh from database instead of relying on expand cache
            const { data: items, error } = await supabase
              .from("purchase_items")
              .select("id, product_id, product_name, brand, category, color, style, size, sale_price, mrp, pur_price, barcode, qty")
              .eq("bill_id", bill.id);
            if (error) throw error;

            // Fallback: fetch style from products master for items missing style
            const fetchedItems = items || [];
            const missingStyleIds = Array.from(new Set(
              fetchedItems.filter(i => !hasDisplayValue(i.style) && i.product_id).map(i => i.product_id)
            ));
            let styleMap = new Map<string, string>();
            if (missingStyleIds.length > 0) {
              const { data: prods } = await supabase.from("products").select("id, style").in("id", missingStyleIds);
              if (prods) styleMap = new Map(prods.filter(p => hasDisplayValue(p.style)).map(p => [p.id, p.style!.trim()]));
            }

            let supplierCode = "";
            if (bill.supplier_id) {
              const { data: supplierData } = await supabase
                .from("suppliers")
                .select("supplier_code")
                .eq("id", bill.supplier_id)
                .single();
              supplierCode = supplierData?.supplier_code || "";
            }

            const barcodeItems = fetchedItems.map(item => ({
              sku_id: item.id,
              product_name: item.product_name || "",
              brand: item.brand || "",
              category: item.category || "",
              color: item.color || "",
              style: hasDisplayValue(item.style) ? item.style.trim() : (styleMap.get(item.product_id) || ""),
              size: item.size,
              sale_price: item.sale_price,
              mrp: item.mrp,
              pur_price: item.pur_price,
              barcode: item.barcode,
              qty: item.qty,
              bill_number: bill.software_bill_no || bill.supplier_invoice_no,
              supplier_code: supplierCode,
            }));
            navigate("/barcode-printing", { state: { purchaseItems: barcodeItems, billId: bill.id } });
          } catch (err) {
            toast({ title: "Error loading items for barcode print", variant: "destructive" });
          }
        },
      },
      { label: "", separator: true, onClick: () => {} },
      {
        label: "Cancel Bill",
        icon: Ban,
        onClick: () => {
          setCancelReason('');
          setBillToCancel(bill);
        },
        disabled: !canCancel || bill.is_cancelled,
        destructive: true,
      },
    ];
  };

  // Get page-level context menu items
  const getPageContextMenuItems = (): ContextMenuItem[] => [
    {
      label: "POS Billing",
      icon: ShoppingCart,
      onClick: () => navigate("/pos-sales"),
    },
    {
      label: "Stock Report",
      icon: Database,
      onClick: () => navigate("/stock-report"),
    },
    {
      label: "Size-wise Stock",
      icon: Wallet,
      onClick: () => navigate("/item-wise-stock-report"),
    },
    { label: "", separator: true, onClick: () => {} },
    {
      label: "New Purchase",
      icon: Plus,
      onClick: () => navigate("/purchase-entry", { state: { newBill: true } }),
    },
    {
      label: "Add Supplier",
      icon: Home,
      onClick: () => navigate("/suppliers"),
    },
    {
      label: "Refresh List",
      icon: RefreshCw,
      onClick: () => fetchBills(),
    },
  ];

  // Handle row right-click
  const handleRowContextMenu = (e: React.MouseEvent, bill: PurchaseBill) => {
    if (!isDesktop) return;
    rowContextMenu.openMenu(e, bill);
  };

  // Handle page right-click (empty area)
  const handlePageContextMenu = (e: React.MouseEvent) => {
    if (!isDesktop) return;
    const target = e.target as HTMLElement;
    if (target.closest('tr') || target.closest('button') || target.closest('a')) return;
    pageContextMenu.openMenu(e, undefined);
  };

  const { data: purchaseSettings } = useSettings();
  const showMrp = (purchaseSettings?.purchase_settings as any)?.show_mrp || false;

  // Debounced search for server-side filtering
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      if (!isDashboardFilterRestoring()) setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (isDashboardFilterRestoring()) return;
    setCurrentPage(1);
  }, [startDate, endDate, itemsPerPage, paymentStatusFilter, dcFilter]);

  const purchaseBillsQueryKey = [
    "purchase-bills",
    currentOrganization?.id,
    debouncedSearch,
    startDate,
    endDate,
    sortOrder,
    currentPage,
    itemsPerPage,
    paymentStatusFilter,
    dcFilter,
  ] as const;

  const patchPurchaseBillsCache = useCallback(
    (patch: (bill: PurchaseBill) => PurchaseBill) => {
      queryClient.setQueryData<{ bills: PurchaseBill[]; totalCount: number } | undefined>(
        purchaseBillsQueryKey,
        (prev) => {
          if (!prev) return prev;
          return { ...prev, bills: prev.bills.map(patch) };
        },
      );
    },
    [queryClient, purchaseBillsQueryKey],
  );

  // Server-side paginated query for purchase bills
  const {
    data: billsQueryData,
    isLoading: billsQueryLoading,
    isFetching: billsQueryFetching,
    isError: billsQueryError,
    error: billsQueryErrorDetail,
    refetch: refetchBills,
  } = useQuery({
    queryKey: purchaseBillsQueryKey,
    queryFn: async () => {
      if (!currentOrganization?.id) return { bills: [], totalCount: 0 };

      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage - 1;

      let query = supabase
        .from("purchase_bills")
        .select("id, supplier_id, supplier_name, supplier_invoice_no, software_bill_no, bill_date, bill_entry_at, gross_amount, discount_amount, gst_amount, net_amount, notes, created_at, payment_status, paid_amount, total_qty, is_dc_purchase, bill_image_url, is_locked, is_cancelled, cancelled_at, cancelled_reason, purchase_items(count)", { count: "exact" })
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);

      const isBarcodeLikeSearch = debouncedSearch && /^\d{4,}$/.test(debouncedSearch.trim());

      // Server-side search — also search product details in purchase_items (org-scoped)
      if (debouncedSearch) {
        const searchStr = debouncedSearch.trim();

        const matchingBillIds = await fetchPurchaseBillIdsMatchingLineItems(
          currentOrganization.id,
          searchStr,
          {
            startDate: isBarcodeLikeSearch ? undefined : startDate,
            endDate: isBarcodeLikeSearch ? undefined : endDate,
            skipDate: Boolean(isBarcodeLikeSearch),
          },
        );

        const billTextFilter = purchaseBillTextSearchFilter(searchStr);

        if (matchingBillIds.length > 0) {
          // Get bill IDs matching text search
          const { data: textMatches } = await supabase
            .from("purchase_bills")
            .select("id")
            .eq("organization_id", currentOrganization.id)
            .is("deleted_at", null)
            .or(billTextFilter);

          const textMatchIds = (textMatches || []).map((b: any) => b.id);
          const allMatchIds = [...new Set([...textMatchIds, ...matchingBillIds])];
          query = query.in("id", allMatchIds);
        } else {
          query = query.or(billTextFilter);
        }
      }

      // Server-side date filtering — skip when searching by barcode/numeric to find bills across all dates
      if (startDate && !isBarcodeLikeSearch) {
        query = query.gte("bill_date", startDate);
      }
      if (endDate && !isBarcodeLikeSearch) {
        query = query.lte("bill_date", endDate);
      }

      // Payment status filter
      // Default behavior: "all" means active (non-cancelled) only
      if (paymentStatusFilter === "all" || !paymentStatusFilter) {
        query = query.or("is_cancelled.is.null,is_cancelled.eq.false");
      } else if (paymentStatusFilter === "cancelled") {
        query = query.eq("is_cancelled", true);
      } else if (paymentStatusFilter === "all_including_cancelled") {
        // No is_cancelled filter — show everything
      } else if (paymentStatusFilter === "not_paid") {
        query = query
          .or("is_cancelled.is.null,is_cancelled.eq.false")
          .or("payment_status.is.null,payment_status.eq.unpaid,payment_status.eq.pending");
      } else {
        query = query
          .or("is_cancelled.is.null,is_cancelled.eq.false")
          .eq("payment_status", paymentStatusFilter);
      }

      // DC filter
      if (dcFilter === "dc") {
        query = query.eq("is_dc_purchase", true);
      } else if (dcFilter === "gst") {
        query = query.or("is_dc_purchase.is.null,is_dc_purchase.eq.false");
      }

      query = query.order("bill_date", { ascending: sortOrder === "asc" })
        .range(startIndex, endIndex);

      const { data, error, count } = await query;
      if (error) throw error;

      return { bills: (data || []) as PurchaseBill[], totalCount: count || 0 };
    },
    enabled: purchaseQueriesEnabled,
    ...DASHBOARD_TAB_RETURN_QUERY_OPTIONS,
  });

  const bills = billsQueryData?.bills ?? [];

  const fetchBills = () => {
    refetchBills();
  };

  const fetchBillItems = async (billId: string, isCancelled?: boolean) => {
    if (billItems[billId]) {
      return; // Already fetched
    }

    try {
      const fetchedItems = (await fetchPurchaseItemsByBillId(
        billId,
        "id, product_id, product_name, brand, category, color, style, size, qty, pur_price, sale_price, mrp, gst_per, hsn_code, barcode, line_total",
        { includeDeleted: isCancelled },
      )) as PurchaseItem[];
      const missingStyleProductIds = Array.from(
        new Set(
          fetchedItems
            .filter((item) => !hasDisplayValue(item.style) && item.product_id)
            .map((item) => item.product_id)
        )
      );

      let itemsWithStyleFallback = fetchedItems;

      if (missingStyleProductIds.length > 0) {
        const products = await fetchProductsByIds(missingStyleProductIds, "id, style");
        if (products.length > 0) {
          const styleByProductId = new Map(
            products
              .filter((product) => hasDisplayValue(product.style))
              .map((product) => [product.id, product.style!.trim()])
          );

          itemsWithStyleFallback = fetchedItems.map((item) => {
            if (hasDisplayValue(item.style)) return item;
            const fallbackStyle = styleByProductId.get(item.product_id);
            return fallbackStyle ? { ...item, product_style: fallbackStyle } : item;
          });
        }
      }

      setBillItems((prev) => ({
        ...prev,
        [billId]: itemsWithStyleFallback,
      }));
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load bill items",
        variant: "destructive",
      });
    }
  };

  const handleToggleExpand = useCallback(async (billId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(billId)) {
        next.delete(billId);
      } else {
        next.add(billId);
        const targetBill = bills.find((bill) => bill.id === billId);
        fetchBillItems(billId, !!targetBill?.is_cancelled);
      }
      return next;
    });
  }, [billItems, bills]);

  const { softDelete, bulkSoftDelete, checkPurchaseStockDependencies } = useSoftDelete();
  const { hasSpecialPermission } = useUserPermissions();
  const canDelete = hasSpecialPermission('delete_records');
  const canCancel = hasSpecialPermission('cancel_invoice');

  const handleDeleteClick = async (bill: PurchaseBill, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!canDelete) {
      toast({
        title: "Permission Denied",
        description: "You don't have permission to delete purchase bills. Ask admin to enable 'Delete Records' in User Rights.",
        variant: "destructive",
      });
      return;
    }
    setBillToDelete(bill);
    
    // Check for stock dependencies
    setIsCheckingDependencies(true);
    const dependencies = await checkPurchaseStockDependencies(bill.id);
    setIsCheckingDependencies(false);
    
    if (dependencies.length > 0) {
      setStockDependencies(dependencies);
      setShowDependencyWarning(true);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!billToDelete) return;
    if (!canDelete) return;

    setDeletingBill(billToDelete.id);
    try {
      const success = await softDelete("purchase_bills", billToDelete.id);
      if (!success) throw new Error("Failed to delete purchase bill");

      toast({
        title: "Success",
        description: "Purchase bill moved to recycle bin",
      });

      setBillToDelete(null);
      setShowDependencyWarning(false);
      setStockDependencies([]);
      await fetchBills();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete purchase bill",
        variant: "destructive",
      });
    } finally {
      setDeletingBill(null);
    }
  };

  const handleCancelDelete = () => {
    setBillToDelete(null);
    setShowDependencyWarning(false);
    setStockDependencies([]);
  };

  const handleCancelBill = async () => {
    if (!billToCancel) return;
    if (!canCancel) {
      toast({
        title: "Permission Denied",
        description: "You don't have permission to cancel purchase bills. Ask admin to enable 'Cancel Invoice' in User Rights.",
        variant: "destructive",
      });
      return;
    }
    setIsCancelling(true);
    try {
      const { data, error } = await supabase.rpc('cancel_purchase_bill', {
        p_bill_id: billToCancel.id,
        p_reason: cancelReason.trim() || null,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string; message?: string; bill_no?: string };
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to cancel purchase bill');
      }
      toast({
        title: "Bill Cancelled",
        description: result.message || `Purchase bill ${billToCancel.software_bill_no || billToCancel.supplier_invoice_no} cancelled. Stock reversed.`,
      });
      setBillToCancel(null);
      setCancelReason('');
      await fetchBills();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to cancel purchase bill",
        variant: "destructive",
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const [bulkDependencies, setBulkDependencies] = useState<{billId: string; billNo: string; deps: StockDependency[]}[]>([]);
  const [showBulkDependencyWarning, setShowBulkDependencyWarning] = useState(false);

  // Bulk cancel state
  const [showBulkCancelDialog, setShowBulkCancelDialog] = useState(false);
  const [bulkCancelReason, setBulkCancelReason] = useState('');
  const [isBulkCancelling, setIsBulkCancelling] = useState(false);

  const handleBulkCancel = async () => {
    if (!canCancel) {
      toast({
        title: "Permission Denied",
        description: "You don't have permission to cancel purchase bills. Ask admin to enable 'Cancel Invoice' in User Rights.",
        variant: "destructive",
      });
      return;
    }
    setIsBulkCancelling(true);
    let success = 0;
    let failed = 0;
    const failureReasons: string[] = [];
    try {
      const ids = Array.from(selectedBills);
      for (const id of ids) {
        const bill = bills.find(b => b.id === id);
        if (bill?.is_cancelled) continue;
        const { data, error } = await supabase.rpc('cancel_purchase_bill', {
          p_bill_id: id,
          p_reason: bulkCancelReason.trim() || null,
        });
        const result = data as { success: boolean; error?: string };
        if (error || !result?.success) {
          failed++;
          const billLabel = bill?.software_bill_no || bill?.supplier_invoice_no || id.slice(0, 8);
          const reason = error?.message || result?.error || 'Unknown error';
          failureReasons.push(`${billLabel}: ${reason}`);
        } else {
          success++;
        }
      }
      toast({
        title: "Bulk Cancel Complete",
        description:
          `${success} bill(s) cancelled${failed > 0 ? `, ${failed} failed` : ''}.` +
          (failureReasons.length > 0 ? ` Reason: ${failureReasons.join(' | ')}` : ' Stock reversed.'),
        variant: failed > 0 ? "destructive" : "default",
      });
      setSelectedBills(new Set());
      setShowBulkCancelDialog(false);
      setBulkCancelReason('');
      await fetchBills();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to cancel bills",
        variant: "destructive",
      });
    } finally {
      setIsBulkCancelling(false);
    }
  };

  const handleBulkDeleteClick = async () => {
    if (!canDelete) {
      toast({
        title: "Permission Denied",
        description: "You don't have permission to delete purchase bills. Ask admin to enable 'Delete Records' in User Rights.",
        variant: "destructive",
      });
      return;
    }
    const billsToCheck = Array.from(selectedBills);
    setIsDeleting(true);
    
    const allDeps: {billId: string; billNo: string; deps: StockDependency[]}[] = [];
    for (const billId of billsToCheck) {
      const deps = await checkPurchaseStockDependencies(billId);
      if (deps.length > 0) {
        const bill = bills.find(b => b.id === billId);
        allDeps.push({
          billId,
          billNo: bill?.software_bill_no || bill?.supplier_invoice_no || billId,
          deps
        });
      }
    }
    setIsDeleting(false);
    
    if (allDeps.length > 0) {
      setBulkDependencies(allDeps);
      setShowBulkDependencyWarning(true);
    } else {
      setShowBulkDeleteDialog(true);
    }
  };

  const handleBulkDelete = async () => {
    if (!canDelete) return;
    setIsDeleting(true);
    try {
      const billsToDelete = Array.from(selectedBills);
      const count = await bulkSoftDelete("purchase_bills", billsToDelete);

      toast({
        title: "Success",
        description: `${count} purchase bill(s) moved to recycle bin`,
      });

      setSelectedBills(new Set());
      setShowBulkDeleteDialog(false);
      setShowBulkDependencyWarning(false);
      setBulkDependencies([]);
      await fetchBills();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete purchase bills",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFixMissingProductNames = async () => {
    setIsFixing(true);
    try {
      const { data: itemsToFix, error: fetchError } = await supabase
        .from("purchase_items")
        .select(`
          id,
          sku_id,
          product_variants!inner (
            id,
            products!inner (
              product_name
            )
          )
        `)
        .or("product_name.is.null,product_name.eq.");

      if (fetchError) throw fetchError;

      if (!itemsToFix || itemsToFix.length === 0) {
        toast({
          title: "All Good!",
          description: "No purchase items with missing product names found",
        });
        return;
      }

      let updatedCount = 0;
      for (const item of itemsToFix) {
        const productName = (item.product_variants as any)?.products?.product_name;
        
        if (productName) {
          const { error: updateError } = await supabase
            .from("purchase_items")
            .update({ product_name: productName })
            .eq("id", item.id);

          if (updateError) {
            console.error(`Failed to update item ${item.id}:`, updateError);
          } else {
            updatedCount++;
          }
        }
      }

      toast({
        title: "Success",
        description: `Fixed ${updatedCount} purchase item(s) with missing product names`,
      });

      await fetchBills();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fix missing product names",
        variant: "destructive",
      });
    } finally {
      setIsFixing(false);
    }
  };

  const handlePageSizeChange = useCallback((value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  }, []);

  const handleOpenPaymentDialog = (bill: PurchaseBill, event: React.MouseEvent) => {
    event.stopPropagation();
    setSelectedBillForPayment(bill);
    const remainingAmount = getPurchaseBillPendingAmount(bill);
    setPaymentAmount(remainingAmount.toFixed(2));
    setPaymentDate(format(new Date(), "yyyy-MM-dd"));
    setPaymentMethod("cash");
    setPaymentNotes("");
    setShowPaymentDialog(true);
  };

  const handleUploadBillImage = async (billId: string, file: File) => {
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toast({ title: "Invalid file", description: "Please upload JPG, PNG, WEBP, or PDF", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 10MB", variant: "destructive" });
      return;
    }
    setUploadingImageForBill(billId);
    try {
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const filePath = `${currentOrganization?.id}/${billId}-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('supplier-bill-images')
        .upload(filePath, file, { contentType: file.type, upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('supplier-bill-images').getPublicUrl(filePath);
      const imageUrl = data.publicUrl;
      const { error: updateError } = await supabase
        .from('purchase_bills')
        .update({ bill_image_url: imageUrl })
        .eq('id', billId);
      if (updateError) throw updateError;
      patchPurchaseBillsCache((b) =>
        b.id === billId ? { ...b, bill_image_url: imageUrl } : b,
      );
      toast({ title: "Invoice image saved", description: "Supplier bill image uploaded successfully" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingImageForBill(null);
    }
  };

  const handleToggleLock = async (bill: PurchaseBill, e: React.MouseEvent) => {
    e.stopPropagation();
    setTogglingLock(bill.id);
    try {
      const newLocked = !bill.is_locked;
      const { error } = await supabase
        .from('purchase_bills')
        .update({ is_locked: newLocked })
        .eq('id', bill.id);
      if (error) throw error;
      patchPurchaseBillsCache((b) =>
        b.id === bill.id ? { ...b, is_locked: newLocked } : b,
      );
      toast({
        title: newLocked ? "Bill Locked" : "Bill Unlocked",
        description: newLocked
          ? `${bill.software_bill_no} is now locked. Editing is disabled.`
          : `${bill.software_bill_no} is now unlocked for editing.`,
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setTogglingLock(null);
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedBillForPayment || !currentOrganization) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid payment amount",
        variant: "destructive",
      });
      return;
    }

    setIsRecordingPayment(true);
    // Re-fetch bill from DB to avoid stale state-driven overpayment
    const { data: freshBill, error: freshErr } = await supabase
      .from("purchase_bills")
      .select("id, net_amount, paid_amount, is_cancelled, deleted_at")
      .eq("id", selectedBillForPayment.id)
      .maybeSingle();
    if (freshErr) {
      toast({ title: "Error", description: freshErr.message, variant: "destructive" });
      setIsRecordingPayment(false);
      return;
    }
    if (!freshBill || freshBill.deleted_at) {
      toast({ title: "Bill unavailable", variant: "destructive" });
      setIsRecordingPayment(false);
      return;
    }
    const currentPaid = Number(freshBill.paid_amount) || 0;
    const billNet = Number(freshBill.net_amount) || 0;
    const newTotalPaid = currentPaid + amount;
    if (newTotalPaid > billNet + 1) {
      toast({
        title: "Overpayment Blocked",
        description: `Already paid ₹${currentPaid} of ₹${billNet}. Refresh and retry.`,
        variant: "destructive",
      });
      await fetchBills();
      setIsRecordingPayment(false);
      return;
    }
    try {
      let newStatus = 'unpaid';
      if (Math.abs(newTotalPaid - billNet) < 1) {
        newStatus = 'paid';
      } else if (newTotalPaid > 0) {
        newStatus = 'partial';
      }

      const { error: updateError } = await supabase
        .from("purchase_bills")
        .update({
          paid_amount: newTotalPaid,
          payment_status: newStatus,
        })
        .eq("id", selectedBillForPayment.id);

      if (updateError) throw updateError;

      const { data: voucherNumber, error: voucherNumberError } = await supabase.rpc(
        "generate_voucher_number",
        { p_type: "payment", p_date: paymentDate }
      );

      if (voucherNumberError) throw voucherNumberError;

      const paymentDescription = `Payment for Bill: ${selectedBillForPayment.software_bill_no || selectedBillForPayment.supplier_invoice_no} | Supplier: ${selectedBillForPayment.supplier_name}${paymentNotes ? ` | ${paymentNotes}` : ''}`;
      
      const { error: voucherError } = await supabase
        .from("voucher_entries")
        .insert({
          organization_id: currentOrganization.id,
          voucher_number: voucherNumber,
          voucher_type: "payment",
          voucher_date: paymentDate,
          reference_type: "supplier",
          reference_id: selectedBillForPayment.id,
          description: paymentDescription,
          total_amount: amount,
        });

      if (voucherError) throw voucherError;

      toast({
        title: "Payment Recorded",
        description: `₹${amount.toFixed(2)} payment recorded successfully`,
      });

      setShowPaymentDialog(false);
      setSelectedBillForPayment(null);
      void queryClient.invalidateQueries({ queryKey: ["purchase-bills"] });
      void queryClient.invalidateQueries({ queryKey: ["purchase-summary"] });
      await fetchBills();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to record payment",
        variant: "destructive",
      });
    } finally {
      setIsRecordingPayment(false);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handlePrintBarcodes = async (billId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setPrintingBill(billId);

    try {
      const { data: billData, error: billError } = await supabase
        .from("purchase_bills")
        .select("id, software_bill_no, supplier_id")
        .eq("id", billId)
        .single();

      if (billError) throw billError;

      let supplierCode = "";
      if (billData?.supplier_id) {
        const { data: supplierData } = await supabase
          .from("suppliers")
          .select("supplier_code")
          .eq("id", billData.supplier_id)
          .single();
        
        supplierCode = supplierData?.supplier_code || "";
      }

      const items = await fetchPurchaseItemsByBillId(billId);

      if (!items || items.length === 0) {
        toast({
          title: "No Items",
          description: "This bill has no items to print barcodes for",
          variant: "destructive",
        });
        return;
      }

      // Fallback: fetch style from products master for items missing style
      const missingStyleIds = Array.from(new Set(
        items.filter((i: any) => !hasDisplayValue(i.style) && i.product_id).map((i: any) => i.product_id)
      ));
      let styleMap = new Map<string, string>();
      if (missingStyleIds.length > 0) {
        const { data: prods } = await supabase.from("products").select("id, style").in("id", missingStyleIds);
        if (prods) styleMap = new Map(prods.filter(p => hasDisplayValue(p.style)).map(p => [p.id, p.style!.trim()]));
      }

      const barcodeItems = items.map((item: any) => ({
        sku_id: item.sku_id,
        product_name: item.product_name || "",
        brand: item.brand || "",
        category: item.category || "",
        color: item.color || "",
        style: hasDisplayValue(item.style) ? item.style.trim() : (styleMap.get(item.product_id) || ""),
        size: item.size,
        sale_price: item.sale_price,
        mrp: item.mrp,
        pur_price: item.pur_price,
        barcode: item.barcode,
        qty: item.qty,
        bill_number: item.bill_number || "",
        supplier_code: supplierCode,
      }));

      navigate("/barcode-printing", { 
        state: { purchaseItems: barcodeItems, billId: billId } 
      });
      
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load items",
        variant: "destructive",
      });
    } finally {
      setPrintingBill(null);
    }
  };

  // Bills are already filtered server-side, no client-side filtering needed
  const filteredBills = useMemo(() => {
    return bills.sort((a, b) => {
      const dateA = new Date(a.bill_date).getTime();
      const dateB = new Date(b.bill_date).getTime();
      return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
    });
  }, [bills, sortOrder]);

  // Server-side summary stats — mirrors ALL filters from the bills query (no pagination)
  const { data: purchaseSummaryData, isLoading: purchaseSummaryLoading, isFetching: purchaseSummaryFetching } = useQuery({
    queryKey: ['purchase-summary', currentOrganization?.id, startDate, endDate, paymentStatusFilter, dcFilter, debouncedSearch],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;
      return fetchPurchaseDashboardSummary({
        organizationId: currentOrganization.id,
        startDate,
        endDate,
        paymentStatusFilter,
        dcFilter,
        debouncedSearch,
      });
    },
    enabled: purchaseQueriesEnabled,
    retry: false,
    ...DASHBOARD_TAB_RETURN_QUERY_OPTIONS,
  });

  const isDashboardInitialLoad =
    purchaseQueriesEnabled && billsQueryLoading && bills.length === 0;
  const isDashboardBackgroundRefresh =
    (billsQueryFetching || purchaseSummaryFetching) && !isDashboardInitialLoad;
  const loading = isDashboardInitialLoad && !billsQueryError;

  useNavPerfQueryWatch("purchase-bills-list", PERF_PATH, {
    isLoading: billsQueryLoading,
    isFetching: billsQueryFetching,
    rowCount: bills.length,
    blockedUi: loading,
  });
  useNavPerfQueryWatch("purchase-summary", PERF_PATH, {
    isLoading: purchaseSummaryLoading,
    isFetching: purchaseSummaryFetching,
  });

  const billTotalCount = billsQueryData?.totalCount ?? 0;
  const summaryLooksValid =
    purchaseSummaryData != null &&
    (purchaseSummaryData.total_count > 0 || billTotalCount === 0);

  const summaryStats = useMemo(() => {
    const base = summaryLooksValid
      ? purchaseSummaryData!
      : {
          total_count: billTotalCount,
          total_amount: 0,
          paid_amount: 0,
          unpaid_amount: 0,
          partial_amount: 0,
        };
    return {
      totalBills: base.total_count,
      totalAmount: base.total_amount,
      totalQty: summaryLooksValid
        ? filteredBills.reduce((sum, bill) => sum + (bill.total_qty || 0), 0)
        : 0,
      paidAmount: base.paid_amount,
      unpaidAmount: base.unpaid_amount,
      partialAmount: base.partial_amount,
    };
  }, [summaryLooksValid, purchaseSummaryData, billTotalCount, filteredBills]);

  // Server-side pagination — bills already represent current page
  const totalPages = useMemo(() => Math.ceil((billsQueryData?.totalCount || filteredBills.length) / itemsPerPage), [billsQueryData, filteredBills.length, itemsPerPage]);
  const paginatedBills = filteredBills;

  // Memoized event handlers (defined after filteredBills/paginatedBills)
  const toggleSelectAll = useCallback(() => {
    if (selectedBills.size === paginatedBills.length) {
      setSelectedBills(new Set());
    } else {
      setSelectedBills(new Set(paginatedBills.map(b => b.id)));
    }
  }, [selectedBills.size, paginatedBills]);

  const toggleSelectBill = useCallback((billId: string) => {
    setSelectedBills(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(billId)) {
        newSelected.delete(billId);
      } else {
        newSelected.add(billId);
      }
      return newSelected;
    });
  }, []);

  const getPaymentStatusBadge = (bill: PurchaseBill) => {
    if (bill.is_cancelled) {
      return (
        <Badge
          className="min-w-[70px] justify-center bg-gray-500 hover:bg-gray-600 text-white"
          title={bill.cancelled_reason ? `Cancelled: ${bill.cancelled_reason}` : 'Cancelled'}
        >
          Cancelled
        </Badge>
      );
    }
    const displayStatus = derivePurchaseBillDisplayStatus(bill);
    const paidAmount = getEffectivePaidAmountForPurchaseBill(bill);
    const pending = getPurchaseBillPendingAmount(bill);
    const title =
      displayStatus === "paid"
        ? `Paid ₹${paidAmount.toLocaleString("en-IN")} of ₹${(bill.net_amount || 0).toLocaleString("en-IN")}`
        : displayStatus === "partial"
          ? `Paid ₹${paidAmount.toLocaleString("en-IN")}, pending ₹${pending.toLocaleString("en-IN")} (incl. CN on bill)`
          : `Pending ₹${pending.toLocaleString("en-IN")}`;

    if (displayStatus === "paid") {
      return (
        <Badge className="min-w-[70px] justify-center bg-green-500 hover:bg-green-600 text-white" title={title}>
          Paid
        </Badge>
      );
    }
    if (displayStatus === "partial") {
      return (
        <Badge className="min-w-[70px] justify-center bg-orange-400 hover:bg-orange-500 text-white" title={title}>
          Partial
        </Badge>
      );
    }
    return (
      <Badge className="min-w-[70px] justify-center bg-red-500 hover:bg-red-600 text-white" title={title}>
        Not Paid
      </Badge>
    );
  };

  // ERPTable column definitions
  const columns = useMemo<ColumnDef<PurchaseBill, any>[]>(() => [
    {
      id: "select",
      header: () => (
        <Checkbox
          checked={selectedBills.size === paginatedBills.length && paginatedBills.length > 0}
          onCheckedChange={toggleSelectAll}
        />
      ),
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={selectedBills.has(row.original.id)}
            onCheckedChange={() => toggleSelectBill(row.original.id)}
          />
        </div>
      ),
      size: 36,
      minSize: 36,
    },
    {
      id: "srNo",
      header: "Sr.",
      cell: ({ row }) => {
        const globalIndex = paginatedBills.indexOf(row.original);
        return <span className="font-medium text-sm">{(currentPage - 1) * itemsPerPage + globalIndex + 1}</span>;
      },
      size: 45,
      minSize: 40,
    },
    {
      accessorKey: "software_bill_no",
      header: "Bill No.",
      cell: ({ row }) => {
        const bill = row.original;
        return (
          <div className={cn("flex items-center gap-1.5", bill.is_cancelled && "opacity-60")}>
            <span className={cn("font-mono text-sm font-semibold bg-primary/8 text-primary px-2 py-0.5 rounded-md", bill.is_cancelled && "line-through")}>
              {bill.software_bill_no || "N/A"}
            </span>
            {bill.is_dc_purchase && (
              <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400 border border-orange-300 dark:border-orange-700">DC</span>
            )}
            {bill.is_cancelled && (
              <span
                title={bill.cancelled_reason || 'Cancelled — stock reversed'}
                className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/30 uppercase tracking-wide"
              >
                Cancelled
              </span>
            )}
            <button
              onClick={(e) => handleToggleLock(bill, e)}
              disabled={togglingLock === bill.id}
              title={bill.is_locked ? "Click to unlock" : "Click to lock"}
              className="shrink-0"
            >
              {togglingLock === bill.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : bill.is_locked ? (
                <Lock className="h-3.5 w-3.5 text-amber-500" />
              ) : (
                <LockOpen className="h-3.5 w-3.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors" />
              )}
            </button>
          </div>
        );
      },
      size: 120,
      minSize: 90,
    },
    {
      accessorKey: "bill_date",
      header: "Dates",
      cell: ({ row }) => (
        <div className="text-xs whitespace-nowrap tabular-nums leading-snug">
          <div className="text-foreground">{format(new Date(row.original.bill_date), "dd MMM yyyy")}</div>
          <div className="text-muted-foreground" title="Bill saved in EzzyERP">
            {formatPurchaseBillEntryAt(row.original, "dd MMM yyyy, hh:mm a")}
          </div>
        </div>
      ),
      size: 130,
      minSize: 110,
    },
    {
      accessorKey: "supplier_invoice_no",
      header: "Inv. No.",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.supplier_invoice_no}</span>
      ),
      size: 90,
      minSize: 70,
    },
    {
      accessorKey: "supplier_name",
      header: "Supplier",
      cell: ({ row }) => {
        const bill = row.original;
        return (
          <div className="flex items-center gap-1.5">
            <span 
              className={cn("truncate text-sm", bill.supplier_id ? "cursor-pointer text-blue-600 hover:underline font-medium" : "font-medium")}
              onClick={(e) => {
                if (bill.supplier_id) {
                  e.stopPropagation();
                  setSelectedSupplierForHistory({ id: bill.supplier_id, name: bill.supplier_name });
                  setShowSupplierHistory(true);
                }
              }}
            >
              {bill.supplier_name}
            </span>
            <Badge className="text-xs px-1.5 py-0 shrink-0 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-0 font-semibold tabular-nums">
              {bill.total_qty || 0}
            </Badge>
          </div>
        );
      },
      size: 180,
      minSize: 120,
    },
    {
      accessorKey: "gross_amount",
      header: "Gross Amt",
      cell: ({ row }) => (
        <span className="text-right block tabular-nums text-sm text-slate-600 dark:text-slate-400">₹{row.original.gross_amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      ),
      size: 100,
      minSize: 80,
    },
    {
      accessorKey: "discount_amount",
      header: "Discount",
      cell: ({ row }) => {
        const disc = row.original.discount_amount || 0;
        return disc > 0 ? (
          <span className="text-right block tabular-nums text-sm text-destructive">-₹{disc.toFixed(2)}</span>
        ) : (
          <span className="text-right block tabular-nums text-sm text-muted-foreground/50">₹0.00</span>
        );
      },
      size: 90,
      minSize: 70,
    },
    {
      accessorKey: "gst_amount",
      header: "GST",
      cell: ({ row }) => (
        <span className="text-right block tabular-nums text-sm text-blue-600 dark:text-blue-400">₹{row.original.gst_amount.toFixed(2)}</span>
      ),
      size: 85,
      minSize: 70,
    },
    {
      accessorKey: "net_amount",
      header: "Net Amt",
      cell: ({ row }) => (
        <span className="text-right block text-base font-extrabold text-primary tabular-nums font-mono">
          ₹{row.original.net_amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ),
      size: 100,
      minSize: 80,
    },
    {
      id: "payment_status",
      header: "Status",
      cell: ({ row }) => getPaymentStatusBadge(row.original),
      size: 85,
      minSize: 75,
    },
    {
      id: "items_count",
      header: "Items",
      cell: ({ row }) => {
        const bill = row.original;
        const countFromQuery = bill.purchase_items?.[0]?.count;
        const countFromExpand = billItems[bill.id]?.length;
        const displayCount = countFromExpand ?? countFromQuery ?? 0;
        return <span className="text-center block text-sm">{displayCount}</span>;
      },
      size: 55,
      minSize: 45,
    },
    {
      id: "bill_image",
      header: "Invoice",
      cell: ({ row }) => {
        const bill = row.original;
        return (
          <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {bill.bill_image_url ? (
              <button
                type="button"
                onClick={() => { setViewImageUrl(bill.bill_image_url!); setShowImageViewer(true); }}
                className="relative group"
                title="View invoice image"
              >
                {bill.bill_image_url.endsWith('.pdf') ? (
                  <div className="w-10 h-10 rounded border border-border bg-red-50 flex items-center justify-center hover:bg-red-100 transition-colors">
                    <FileText className="h-5 w-5 text-red-500" />
                  </div>
                ) : (
                  <div className="relative w-10 h-10 rounded border border-border overflow-hidden hover:border-primary transition-colors">
                    <img
                      src={bill.bill_image_url}
                      alt="Bill"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                )}
              </button>
            ) : (
              <label
                className="w-10 h-10 rounded border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                title="Upload supplier invoice image"
              >
                {uploadingImageForBill === bill.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Camera className="h-4 w-4 text-muted-foreground/50" />
                )}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadBillImage(bill.id, file);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>
        );
      },
      size: 60,
      minSize: 55,
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const bill = row.original;
        return (
          <div className="flex items-center gap-0" onClick={(e) => e.stopPropagation()}>
            <Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950" onClick={(e) => handleOpenPaymentDialog(bill, e)} title="Record Payment">
              <Wallet className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className={`h-7 w-7 ${bill.is_cancelled ? 'opacity-40 cursor-not-allowed' : bill.is_locked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950'}`}
              onClick={(e) => {
                e.stopPropagation();
                if (bill.is_cancelled) {
                  toast({
                    title: "Bill Cancelled",
                    description: "Cancelled bills cannot be edited. Create a new bill.",
                    variant: "destructive",
                  });
                  return;
                }
                if (bill.is_locked) {
                  toast({ title: "Bill is locked", description: "Unlock the bill first to edit it.", variant: "destructive" });
                  return;
                }
                navigate("/purchase-entry", { state: { editBillId: bill.id } });
              }}
              title={bill.is_cancelled ? "Bill is cancelled" : bill.is_locked ? "Unlock bill to edit" : "Edit bill"}
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-950" onClick={(e) => handlePrintBarcodes(bill.id, e)} disabled={printingBill === bill.id} title="Print Barcodes">
              {printingBill === bill.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
            </Button>
          </div>
        );
      },
      size: 170,
      minSize: 150,
    },
  ], [selectedBills, paginatedBills, toggleSelectAll, toggleSelectBill, billItems, currentPage, itemsPerPage, printingBill, deletingBill, uploadingImageForBill, togglingLock]);

  // Render sub-row content for expanded bills
  const renderSubRow = useCallback((bill: PurchaseBill) => {
    const items = billItems[bill.id];
    if (!items || items.length === 0) return null;
    
    return (
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-sm text-primary flex items-center gap-1.5">
            <ShoppingCart className="h-3.5 w-3.5" />
            Purchase Items
          </h4>
          {bill.notes && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">Notes:</span> {bill.notes}
            </p>
          )}
        </div>
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-800 text-white [&_tr]:border-slate-700">
              <TableRow className="bg-slate-800 hover:bg-slate-800 border-none">
                <TableHead className="text-xs font-bold uppercase tracking-wide text-white">
                  Product
                </TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wide text-white">
                  SKU / Barcode
                </TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wide text-white">
                  Size / Color
                </TableHead>
                <TableHead className="text-right text-xs font-bold uppercase tracking-wide text-white">
                  Qty
                </TableHead>
                <TableHead className="text-right text-xs font-bold uppercase tracking-wide text-white">
                  Rate
                </TableHead>
                <TableHead className="text-right text-xs font-bold uppercase tracking-wide text-white">
                  GST %
                </TableHead>
                <TableHead className="text-right text-xs font-bold uppercase tracking-wide text-white">
                  Amount
                </TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wide text-white">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} className={item.deleted_at ? "bg-red-50/60 dark:bg-red-950/20" : ""}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {item.product_name || "Unknown"}
                  </TableCell>
                  <TableCell>
                    {item.barcode ? (
                      <Badge variant="outline" className="font-mono text-xs">
                        {item.barcode}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>{`${item.size || "—"} / ${item.color || "—"}`}</TableCell>
                  <TableCell className="text-right">{item.qty}</TableCell>
                  <TableCell className="text-right">₹{item.pur_price.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{item.gst_per}%</TableCell>
                  <TableCell className="text-right font-bold text-primary tabular-nums">
                    ₹{item.line_total.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {item.deleted_at ? (
                      <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900 dark:text-red-300 text-xs">
                        Cancelled
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Active</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }, [billItems, showMrp]);

  // Excel export handler
  const handleExportExcel = useCallback(async () => {
    if (!currentOrganization?.id) return;
    try {
      // Fetch ALL filtered bills (no pagination) for export
      let query = supabase
        .from("purchase_bills")
        .select("supplier_name, supplier_invoice_no, software_bill_no, bill_date, bill_entry_at, created_at, gross_amount, discount_amount, gst_amount, net_amount, payment_status, paid_amount, total_qty, is_dc_purchase")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);

      if (startDate) query = query.gte("bill_date", startDate);
      if (endDate) query = query.lte("bill_date", endDate);
      if (paymentStatusFilter && paymentStatusFilter !== "all") {
        if (paymentStatusFilter === "not_paid") {
          query = query.or("payment_status.is.null,payment_status.eq.unpaid,payment_status.eq.pending");
        } else {
          query = query.eq("payment_status", paymentStatusFilter);
        }
      }
      if (dcFilter === "dc") query = query.eq("is_dc_purchase", true);
      else if (dcFilter === "gst") query = query.or("is_dc_purchase.is.null,is_dc_purchase.eq.false");

      query = query.order("bill_date", { ascending: false });

      const allBills: any[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data } = await query.range(from, from + 999);
        if (data && data.length > 0) { allBills.push(...data); from += 1000; hasMore = data.length === 1000; }
        else hasMore = false;
      }

      const rows = allBills.map((b, i) => ({
        "Sr No": i + 1,
        "Bill No": b.software_bill_no || "",
        "Supplier Bill Date": b.bill_date ? format(new Date(b.bill_date), "dd-MM-yyyy") : "",
        "Entry Date & Time": formatPurchaseBillEntryAt(b, "dd-MM-yyyy HH:mm"),
        "Supplier Inv No": b.supplier_invoice_no || "",
        "Supplier": b.supplier_name || "",
        "Gross Amount": Math.round(b.gross_amount || 0),
        "Discount": Math.round(b.discount_amount || 0),
        "GST": Math.round(b.gst_amount || 0),
        "Net Amount": Math.round(b.net_amount || 0),
        "Paid": Math.round(b.paid_amount || 0),
        "Status": b.payment_status || "pending",
        "Items": b.total_qty || 0,
        "Type": b.is_dc_purchase ? "DC" : "GST",
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 6 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 24 },
        { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 12 },
        { wch: 10 }, { wch: 8 }, { wch: 6 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Purchase Bills");
      const dateStr = format(new Date(), "yyyy-MM-dd");
      XLSX.writeFile(wb, `Purchase_Bills_${dateStr}.xlsx`);

      toast({ title: "Exported", description: `${rows.length} bills exported to Excel` });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    }
  }, [currentOrganization?.id, startDate, endDate, paymentStatusFilter, dcFilter, toast]);

  // No full-page blocker — layout renders immediately, ERPTable shows skeletons via isLoading
  const isMobile = useIsMobile();

  if (isMobile) {
    const fmt = (n: number) => n >= 100000 ? `₹${(n/100000).toFixed(1)}L` : `₹${Math.round(n).toLocaleString("en-IN")}`;
    return (
      <div
        className={cn(
          "flex flex-col bg-slate-50 pb-24",
          inTabCache ? "h-full min-h-0 w-full overflow-hidden" : "min-h-screen",
        )}
      >
        <MobilePageHeader
          title="Purchase Bills"
          subtitle={`${summaryStats.totalBills} bills`}
          rightContent={
            <button onClick={() => navigate("/purchase-entry", { state: { newBill: true } })}
              className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-sm active:scale-90 touch-manipulation">
              <Plus className="h-5 w-5 text-primary-foreground" />
            </button>
          }
        />

        <div className="px-4 pt-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by supplier, bill no, barcode, product, brand..." value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 bg-card border-border/60 rounded-xl text-sm" />
          </div>
        </div>

        <MobileStatStrip stats={[
          { label: "Total", value: fmt(summaryStats.totalAmount), color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Paid", value: fmt(summaryStats.paidAmount), color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Unpaid", value: fmt(summaryStats.unpaidAmount), color: "text-rose-600", bg: "bg-rose-50" },
          { label: "Bills", value: String(summaryStats.totalBills), color: "text-purple-600", bg: "bg-purple-50" },
        ]} />

        <div className="flex-1 min-h-0 overflow-auto px-4 space-y-2.5 pb-4">
          {isDashboardInitialLoad ? (
            Array.from({length: 5}).map((_,i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))
          ) : paginatedBills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Receipt className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">No bills found</p>
            </div>
          ) : paginatedBills.map((bill) => {
            const displayStatus = derivePurchaseBillDisplayStatus(bill);
            const isPaid = displayStatus === "paid";
            const isPartial = displayStatus === "partial";
            const pending = getPurchaseBillPendingAmount(bill);
            const statusCls = isPaid ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : isPartial ? "bg-amber-50 text-amber-700 border-amber-200"
              : "bg-rose-50 text-rose-700 border-rose-200";
            const statusLabel = isPaid ? "Paid" : isPartial ? "Partial" : "Unpaid";
            return (
              <div key={bill.id} onClick={() => !bill.is_cancelled && navigate("/purchase-entry", { state: { editBillId: bill.id } })}
                className={cn("bg-card rounded-2xl p-3.5 border border-border/40 shadow-sm active:scale-[0.99] transition-all touch-manipulation", bill.is_cancelled && "opacity-60")}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("font-mono text-xs font-bold text-primary", bill.is_cancelled && "line-through")}>{bill.software_bill_no}</span>
                      {bill.is_dc_purchase && (
                        <span className="text-xs font-bold px-1 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400 border border-orange-300 dark:border-orange-700">DC</span>
                      )}
                      {bill.is_cancelled && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/30 uppercase tracking-wide">Cancelled</span>
                      )}
                      <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border", statusCls)}>
                        {statusLabel}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground mt-1 truncate">{bill.supplier_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Inv. {format(new Date(bill.bill_date), "d MMM yyyy")}
                      {bill.supplier_invoice_no ? ` · ${bill.supplier_invoice_no}` : ""}
                      {` · ${bill.total_qty || 0} pcs`}
                    </p>
                    <p className="text-[10px] text-muted-foreground/80 tabular-nums">
                      Entry {formatPurchaseBillEntryAt(bill, "d MMM yyyy, hh:mm a")}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-sm font-bold tabular-nums">₹{bill.net_amount.toLocaleString("en-IN")}</p>
                    {pending > 0 && <p className="text-xs text-amber-600 font-medium">Due ₹{pending.toLocaleString("en-IN")}</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 bg-card border-t border-border">
            <button onClick={() => setCurrentPage(p => Math.max(1,p-1))} disabled={currentPage===1}
              className="px-4 py-2 rounded-xl bg-muted text-sm font-medium disabled:opacity-40 touch-manipulation">← Prev</button>
            <span className="text-xs text-muted-foreground">Page {currentPage}</span>
            <button onClick={() => setCurrentPage(p => p+1)} disabled={currentPage>=totalPages}
              className="px-4 py-2 rounded-xl bg-muted text-sm font-medium disabled:opacity-40 touch-manipulation">Next →</button>
          </div>
        )}

        {/* Dialogs — payment dialog shared */}
        <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Record Payment</DialogTitle>
              <DialogDescription>
                {selectedBillForPayment && `Record payment for ${selectedBillForPayment.software_bill_no} — ₹${Math.max(0, selectedBillForPayment.net_amount - (selectedBillForPayment.paid_amount||0)).toFixed(2)} pending`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Payment Amount</Label>
                <Input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPaymentDialog(false)} disabled={isRecordingPayment}>
                Cancel
              </Button>
              <Button onClick={handleRecordPayment} disabled={isRecordingPayment}>
                {isRecordingPayment ? "Recording..." : "Record Payment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {selectedSupplierForHistory && currentOrganization && (
          <SupplierHistoryDialog
            isOpen={showSupplierHistory}
            onClose={() => setShowSupplierHistory(false)}
            supplierId={selectedSupplierForHistory.id}
            supplierName={selectedSupplierForHistory.name}
            organizationId={currentOrganization.id}
          />
        )}

        <MobileBottomNav />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col bg-slate-50 px-2 sm:px-3 md:px-4 lg:px-5 py-4 min-h-0 overflow-hidden",
        inTabCache || sharedShell ? "h-full w-full" : "h-[calc(100vh-3.5rem)]",
      )}
    >
      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-3">
        <div className="flex items-center justify-between shrink-0 mb-1">
          <div>
            <h1 className="text-3xl font-extrabold text-blue-600 tracking-tight leading-tight">
              Purchase Bills
            </h1>
            <p className="text-slate-400 text-base mt-0.5">Manage supplier invoices & payments</p>
            <p className="text-xs text-muted-foreground mt-1 h-4 flex items-center gap-1">
              {isDashboardBackgroundRefresh && (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Updating…
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button
              onClick={handleExportExcel}
              variant="outline"
              className="gap-2 h-10 text-base border-slate-300 text-slate-600 hover:bg-slate-100 font-medium"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export Excel
            </Button>
            <Button
              onClick={handleFixMissingProductNames}
              variant="outline"
              className="gap-2 h-10 text-base border-slate-300 text-slate-600 hover:bg-slate-100 font-medium"
              disabled={isFixing}
            >
              {isFixing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Database className="h-4 w-4" />
              )}
              Fix Missing Data
            </Button>
            <Button
              onClick={() => navigate("/purchase-entry", { state: { newBill: true } })}
              className="h-10 px-5 text-base font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg transition-all gap-2"
            >
              <Plus className="h-4 w-4" />
              New Purchase
            </Button>
            {selectedBills.size > 0 && (
              <>
                {canDelete && (
                  <Button
                    variant="destructive"
                    className="h-10 text-base"
                    onClick={handleBulkDeleteClick}
                    disabled={isDeleting}
                  >
                    {isDeleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                    Delete Selected ({selectedBills.size})
                  </Button>
                )}
                {canCancel && (
                  <Button
                    variant="outline"
                    className="h-10 text-base border-orange-500 text-orange-600 hover:bg-orange-50"
                    onClick={() => setShowBulkCancelDialog(true)}
                    disabled={isBulkCancelling}
                  >
                    {isBulkCancelling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Ban className="h-4 w-4 mr-2" />}
                    Cancel Selected ({selectedBills.size})
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {showDraftBanner && draftSummary && (
          <Card className="border border-amber-400/60 bg-amber-50 rounded-xl shadow-sm shrink-0">
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-amber-800">
                      {draftSummary.isEdit
                        ? "Unsaved Purchase Edit"
                        : "Unsaved Purchase Draft"}
                    </h3>
                    <CardDescription className="text-sm text-amber-700 font-medium mt-0.5">
                      {`${draftSummary.lineCount} lines · ${Math.round(draftSummary.totalQty)} qty`}
                      {lastSaved
                        ? ` • Saved ${formatDistanceToNow(lastSaved, { addSuffix: true })}`
                        : draftSummary.savedAt
                          ? ` • Saved ${formatDistanceToNow(new Date(draftSummary.savedAt), { addSuffix: true })}`
                          : " • Saved recently"}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (!currentOrganization?.id || !user?.id) return;
                      setDraftBannerDismissed(true);
                      dispatchPurchaseDraftDiscarded(currentOrganization.id, user.id);
                      const removed = await deleteDraft();
                      refreshBrowserDraftMeta();
                      await checkDraft();
                      if (!removed) {
                        setDraftBannerDismissed(false);
                        toast({
                          title: "Could not discard draft",
                          description: "Please try again or open Purchase Entry and save or clear the bill.",
                          variant: "destructive",
                        });
                        return;
                      }
                      toast({
                        title: "Draft Discarded",
                        description: "The unsaved purchase bill has been removed",
                      });
                    }}
                    className="gap-1.5 h-9 text-sm border-amber-300 text-amber-700 hover:bg-amber-100"
                  >
                    <X className="h-4 w-4" />
                    Discard
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      navigate("/purchase-entry", { state: { loadDraft: true } });
                    }}
                    className="gap-1.5 h-9 text-sm bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-sm"
                  >
                    <Edit className="h-4 w-4" />
                    Resume Draft
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 w-full shrink-0">
          <Card className="cursor-pointer hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-md rounded-xl min-w-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
              <CardDescription className="text-base font-medium text-white/80">Total Bills</CardDescription>
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <Receipt className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <div className="text-2xl font-black text-white tabular-nums leading-tight truncate">
                {summaryStats.totalBills}
              </div>
              <p className="text-sm text-white/65 mt-0.5">
                {summaryStats.totalQty.toLocaleString("en-IN")} items purchased
              </p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 shadow-md rounded-xl min-w-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
              <CardDescription className="text-base font-medium text-white/80">Paid</CardDescription>
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <div className="text-2xl font-black text-white tabular-nums leading-tight truncate">
                ₹{summaryStats.paidAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </div>
              <p className="text-sm text-white/65 mt-0.5">Paid bills</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br from-amber-500 to-amber-600 border-0 shadow-md rounded-xl min-w-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
              <CardDescription className="text-base font-medium text-white/80">Partial</CardDescription>
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <Clock className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <div className="text-2xl font-black text-white tabular-nums leading-tight truncate">
                ₹{summaryStats.partialAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </div>
              <p className="text-sm text-white/65 mt-0.5">Partially paid</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br from-red-500 to-red-600 border-0 shadow-md rounded-xl min-w-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
              <CardDescription className="text-base font-medium text-white/80">Unpaid</CardDescription>
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <Wallet className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <div className="text-2xl font-black text-white tabular-nums leading-tight truncate">
                ₹{summaryStats.unpaidAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </div>
              <p className="text-sm text-white/65 mt-0.5">Bills pending</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br from-violet-500 to-violet-600 border-0 shadow-md rounded-xl min-w-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
              <CardDescription className="text-base font-medium text-white/80">Total Amount</CardDescription>
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <IndianRupee className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <div className="text-2xl font-black text-white tabular-nums leading-tight truncate">
                ₹{summaryStats.totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </div>
              <p className="text-sm text-white/65 mt-0.5">
                Avg ₹
                {filteredBills.length > 0
                  ? (summaryStats.totalAmount / filteredBills.length).toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })
                  : "0"}{" "}
                / bill
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-xl border border-slate-200 shadow-sm overflow-hidden p-0 flex-1 min-h-0 flex flex-col">
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-white overflow-x-auto shrink-0">
              <div className="relative flex-1 min-w-[180px] max-w-full sm:max-w-md md:max-w-lg lg:max-w-xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  placeholder="Search by bill no, supplier, barcode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-11 h-10 text-base border-slate-200 bg-slate-50 focus:bg-white"
                />
              </div>
              <Input
                type="date"
                placeholder="Start Date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-[150px] h-10 text-base border-slate-200 bg-slate-50 hover:bg-white"
              />
              <Input
                type="date"
                placeholder="End Date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-[150px] h-10 text-base border-slate-200 bg-slate-50 hover:bg-white"
              />
              <Select value={sortOrder} onValueChange={(value: "asc" | "desc") => setSortOrder(value)}>
                <SelectTrigger className="w-[180px] h-10 text-base gap-2 border-slate-200 bg-slate-50 hover:bg-white">
                  <ArrowUpDown className="h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Newest First (DESC)</SelectItem>
                  <SelectItem value="asc">Oldest First (ASC)</SelectItem>
                </SelectContent>
              </Select>
              <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                <SelectTrigger className="w-[150px] h-10 text-base gap-2 border-slate-200 bg-slate-50 hover:bg-white">
                  <Wallet className="h-4 w-4" />
                  <SelectValue placeholder="Payment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All (Active)</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="not_paid">Not Paid</SelectItem>
                  <SelectItem value="cancelled">Cancelled Only</SelectItem>
                  <SelectItem value="all_including_cancelled">All (Including Cancelled)</SelectItem>
                </SelectContent>
              </Select>
              <Select value={dcFilter} onValueChange={setDcFilter}>
                <SelectTrigger className="w-[130px] h-10 text-base gap-2 border-slate-200 bg-slate-50 hover:bg-white">
                  <FileText className="h-4 w-4" />
                  <SelectValue placeholder="Bill Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Bills</SelectItem>
                  <SelectItem value="dc">DC Only</SelectItem>
                  <SelectItem value="gst">GST Only</SelectItem>
                </SelectContent>
              </Select>
              <div id="erp-toolbar-portal-purchase" className="flex items-center gap-1.5 ml-auto flex-shrink-0" />
            </div>

            <div
              ref={tableContainerRef}
              data-tab-scroll
              onWheel={onWheelScrollContainer}
              className="flex-1 min-h-0 overflow-auto tab-scroll-stable"
            >
            {billsQueryError ? (
              <div className="text-center py-12 bg-white border border-destructive/20 rounded-lg mx-2">
                <Receipt className="h-12 w-12 mx-auto mb-4 text-destructive/60" />
                <p className="text-lg font-medium text-foreground">Could not load purchase bills</p>
                <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-md mx-auto">
                  {(billsQueryErrorDetail as Error)?.message?.includes("Failed to fetch")
                    ? "Connection problem — check your internet and try again."
                    : "Please check your connection and try again."}
                </p>
                <Button variant="outline" onClick={() => refetchBills()} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Retry
                </Button>
              </div>
            ) : filteredBills.length === 0 && !isDashboardInitialLoad ? (
              <div className="text-center py-12 text-muted-foreground bg-white">
                <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg">No purchase bills found</p>
                <p className="text-sm">Create your first purchase bill to get started</p>
              </div>
            ) : (
              <ERPTable
                tableId="purchase_bills"
                columns={columns}
                data={paginatedBills}
                defaultColumnVisibility={PURCHASE_BILLS_DEFAULT_COLUMN_VISIBILITY}
                stickyFirstColumn={false}
                isLoading={loading}
                emptyMessage="No purchase bills found"
                renderSubRow={renderSubRow}
                expandedRows={expandedRows}
                onToggleExpand={handleToggleExpand}
                getRowId={(bill) => bill.id}
                onRowContextMenu={handleRowContextMenu}
                showToolbar={false}
                renderToolbar={(toolbar) => {
                  const el = document.getElementById("erp-toolbar-portal-purchase");
                  return el ? createPortal(toolbar, el) : toolbar;
                }}
              />
            )}

            </div>

            {filteredBills.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-white shrink-0">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="text-sm text-slate-500 tabular-nums">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                    {Math.min(currentPage * itemsPerPage, filteredBills.length)} of {filteredBills.length} bills
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500">Show:</span>
                    <Select value={itemsPerPage.toString()} onValueChange={handlePageSizeChange}>
                      <SelectTrigger className="w-20 h-9 text-sm border-slate-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="200">200</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreviousPage}
                    disabled={currentPage === 1}
                    className="h-9 text-sm px-3 border-slate-200"
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-slate-600 font-medium tabular-nums px-1">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                    className="h-9 text-sm px-3 border-slate-200"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Cancel Bill Dialog - reverses stock & marks bill cancelled */}
      <AlertDialog open={!!billToCancel} onOpenChange={(open) => { if (!open && !isCancelling) { setBillToCancel(null); setCancelReason(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Purchase Bill</AlertDialogTitle>
            <AlertDialogDescription>
              This will reverse stock quantities for{" "}
              <span className="font-semibold">
                {billToCancel?.software_bill_no || billToCancel?.supplier_invoice_no}
              </span>
              {" "}and mark the bill as cancelled. The bill will remain visible in the dashboard with a CANCELLED tag.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="cancel-reason">Reason (optional)</Label>
            <Input
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Wrong supplier, Duplicate entry, Goods returned..."
              disabled={isCancelling}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>Keep Bill</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleCancelBill(); }}
              disabled={isCancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isCancelling ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cancelling...</> : 'Cancel Bill & Reverse Stock'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Cancel Bills Dialog */}
      <AlertDialog open={showBulkCancelDialog} onOpenChange={(open) => { if (!open && !isBulkCancelling) { setShowBulkCancelDialog(false); setBulkCancelReason(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Selected Bills</AlertDialogTitle>
            <AlertDialogDescription>
              This will reverse stock quantities for{" "}
              <span className="font-semibold">{selectedBills.size}</span>{" "}
              selected purchase bill(s) and mark them as cancelled. Bills will remain visible with a CANCELLED tag. Already-cancelled bills will be skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="bulk-cancel-reason">Reason (optional)</Label>
            <Input
              id="bulk-cancel-reason"
              value={bulkCancelReason}
              onChange={(e) => setBulkCancelReason(e.target.value)}
              placeholder="e.g. Wrong entries, Duplicates, Returned..."
              disabled={isBulkCancelling}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkCancelling}>Keep Bills</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleBulkCancel(); }}
              disabled={isBulkCancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBulkCancelling ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cancelling...</> : `Cancel ${selectedBills.size} Bill(s) & Reverse Stock`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog - Only shown when no dependencies */}
      <AlertDialog open={!!billToDelete && !showDependencyWarning && !isCheckingDependencies} onOpenChange={handleCancelDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase Bill</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete purchase bill{" "}
              <span className="font-semibold">
                {billToDelete?.software_bill_no || billToDelete?.supplier_invoice_no}
              </span>
              ? This will also delete all associated items and reverse stock. This action can be restored from recycle bin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Stock Dependency Warning Dialog */}
      <AlertDialog open={showDependencyWarning} onOpenChange={handleCancelDelete}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <span className="text-2xl">⚠️</span>
              Warning: Stock Dependencies Found
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              <p className="mb-4">
                Deleting purchase bill{" "}
                <span className="font-semibold">
                  {billToDelete?.software_bill_no || billToDelete?.supplier_invoice_no}
                </span>
                {" "}will cause <strong className="text-destructive">negative stock</strong> because the following active sales have already consumed items from this purchase:
              </p>
              
              <div className="max-h-60 overflow-y-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sale #</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="text-right">Sold Qty</TableHead>
                      <TableHead className="text-right">Current Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockDependencies.map((dep, index) => (
                      <TableRow key={`${dep.sale_id}-${index}`}>
                        <TableCell className="font-medium">{dep.sale_number}</TableCell>
                        <TableCell>{dep.product_name}</TableCell>
                        <TableCell>{dep.size}</TableCell>
                        <TableCell className="text-right">{dep.quantity}</TableCell>
                        <TableCell className="text-right text-destructive font-medium">
                          {dep.current_stock} → {dep.current_stock - dep.purchased_qty}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              <p className="mt-4 text-sm">
                <strong>Delete is blocked because it would create negative stock.</strong> Delete or cancel the sales listed above first, or use Purchase Return to reverse the stock properly.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={stockDependencies.some(d => d.would_go_negative)}
              className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deletingBill ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : stockDependencies.some(d => d.would_go_negative) ? (
                "Delete blocked — resolve sales first"
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Bills</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedBills.size} purchase bill(s)? This will restore the stock quantities and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Stock Dependency Warning Dialog */}
      <AlertDialog open={showBulkDependencyWarning} onOpenChange={(open) => {
        if (!open) {
          setShowBulkDependencyWarning(false);
          setBulkDependencies([]);
        }
      }}>
        <AlertDialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <span className="text-2xl">⚠️</span>
              Warning: Stock Dependencies Found for {bulkDependencies.length} Bill(s)
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              <p className="mb-4">
                The following purchase bills have active sales consuming their stock. Deleting them will cause <strong className="text-destructive">negative stock</strong>:
              </p>
              
              {bulkDependencies.map((billDep) => (
                <div key={billDep.billId} className="mb-4 border rounded-md p-3">
                  <h4 className="font-semibold mb-2">Bill: {billDep.billNo}</h4>
                  <div className="max-h-32 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Sale #</TableHead>
                          <TableHead className="text-xs">Product</TableHead>
                          <TableHead className="text-xs">Size</TableHead>
                          <TableHead className="text-right text-xs">Qty</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {billDep.deps.slice(0, 5).map((dep, index) => (
                          <TableRow key={`${dep.sale_id}-${index}`}>
                            <TableCell className="text-xs">{dep.sale_number}</TableCell>
                            <TableCell className="text-xs">{dep.product_name}</TableCell>
                            <TableCell className="text-xs">{dep.size}</TableCell>
                            <TableCell className="text-right text-xs">{dep.quantity}</TableCell>
                          </TableRow>
                        ))}
                        {billDep.deps.length > 5 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-xs text-muted-foreground">
                              ...and {billDep.deps.length - 5} more items
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ))}
              
              <p className="text-sm">
                <strong>Recommendation:</strong> Delete the dependent sales first if they were trial entries.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                `Delete All ${selectedBills.size} Bills (Negative Stock)`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Payment Recording Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record a payment for purchase bill {selectedBillForPayment?.software_bill_no}
            </DialogDescription>
          </DialogHeader>
          
          {selectedBillForPayment && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Supplier:</span>
                  <p className="font-medium">{selectedBillForPayment.supplier_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Supplier bill date:</span>
                  <p className="font-medium">{format(new Date(selectedBillForPayment.bill_date), "dd MMM yyyy")}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Entry date &amp; time:</span>
                  <p className="font-medium tabular-nums">{formatPurchaseBillEntryAt(selectedBillForPayment)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Bill Amount:</span>
                  <p className="font-medium">₹{selectedBillForPayment.net_amount.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Paid Amount:</span>
                  <p className="font-medium">₹{(selectedBillForPayment.paid_amount || 0).toFixed(2)}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Remaining Amount:</span>
                  <p className="font-semibold text-lg text-primary">
                    ₹{(selectedBillForPayment.net_amount - (selectedBillForPayment.paid_amount || 0)).toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-amount">Payment Amount</Label>
                <Input
                  id="payment-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="Enter payment amount"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-date">Payment Date</Label>
                <Input
                  id="payment-date"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-method">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger id="payment-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-notes">Notes (Optional)</Label>
                <Input
                  id="payment-notes"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Payment reference or notes"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)} disabled={isRecordingPayment}>
              Cancel
            </Button>
            <Button onClick={handleRecordPayment} disabled={isRecordingPayment}>
              {isRecordingPayment ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Recording...
                </>
              ) : (
                "Record Payment"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supplier History Dialog */}
      {selectedSupplierForHistory && currentOrganization && (
        <SupplierHistoryDialog
          isOpen={showSupplierHistory}
          onClose={() => setShowSupplierHistory(false)}
          supplierId={selectedSupplierForHistory.id}
          supplierName={selectedSupplierForHistory.name}
          organizationId={currentOrganization.id}
        />
      )}

      {/* Desktop Context Menus */}
      {isDesktop && (
        <>
          <DesktopContextMenu
            isOpen={rowContextMenu.isOpen}
            position={rowContextMenu.position}
            items={rowContextMenu.contextData ? getBillContextMenuItems(rowContextMenu.contextData) : []}
            onClose={rowContextMenu.closeMenu}
          />
          <PageContextMenu
            isOpen={pageContextMenu.isOpen}
            position={pageContextMenu.position}
            items={getPageContextMenuItems()}
            onClose={pageContextMenu.closeMenu}
            title="Quick Actions"
          />
        </>
      )}
      {/* Bill Image Viewer */}
      <Dialog open={showImageViewer} onOpenChange={setShowImageViewer}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-2 flex flex-col">
          <DialogHeader className="px-2 py-1">
            <DialogTitle className="text-sm">Supplier Invoice Image</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex items-center justify-center bg-muted/30 rounded-md min-h-[400px]">
            {viewImageUrl && (
              viewImageUrl.endsWith('.pdf') ? (
                <iframe
                  src={viewImageUrl}
                  className="w-full h-[70vh]"
                  title="Supplier Invoice PDF"
                />
              ) : (
                <img
                  src={viewImageUrl}
                  alt="Supplier invoice"
                  className="max-w-full max-h-[75vh] object-contain rounded"
                />
              )
            )}
          </div>
          <div className="flex justify-between items-center px-2 py-1">
            <a
              href={viewImageUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              Open in new tab ↗
            </a>
            <Button size="sm" variant="outline" onClick={() => setShowImageViewer(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PurchaseBillDashboard;
