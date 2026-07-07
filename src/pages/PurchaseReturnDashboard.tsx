import { useState, useEffect, useRef, useMemo } from "react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DASHBOARD_TAB_RETURN_QUERY_OPTIONS } from "@/lib/dashboardQueryOptions";
import { useNavPerfPage, useNavPerfQueryWatch } from "@/hooks/useNavigationPerf";
import { useReactToPrint } from "react-to-print";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ChevronDown, ChevronUp, Trash2, Search, Calendar, Package, TrendingDown, Plus, Printer, Receipt, IndianRupee, Edit, Eye, CreditCard, FileText, X, Download } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { format, formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { PurchaseReturnPrint } from "@/components/PurchaseReturnPrint";
import { PrintPreviewDialog } from "@/components/PrintPreviewDialog";
import { SupplierHistoryDialog } from "@/components/SupplierHistoryDialog";
import { useSoftDelete } from "@/hooks/useSoftDelete";
import { AdjustCreditNoteDialog } from "@/components/AdjustCreditNoteDialog";
import { useDraftSave } from "@/hooks/useDraftSave";
import {
  formatPurchaseReturnCreditStatusLabel,
  formatPurchaseReturnOrigBill,
  type LinkedBillLabel,
} from "@/utils/purchaseReturnCnDisplay";
import { lookupMap } from "@/lib/coerceToMap";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { isDashboardFilterRestoring, restoreDashboardFilters } from "@/lib/dashboardFilterPersistence";

interface PurchaseReturnItem {
  id: string;
  product_id: string;
  size: string;
  color?: string;
  qty: number;
  pur_price: number;
  gst_per: number;
  line_total: number;
  barcode?: string;
  product_name?: string;
  brand?: string;
}

interface PurchaseReturn {
  id: string;
  return_number?: string;
  return_date: string;
  supplier_name: string;
  supplier_id?: string;
  original_bill_number?: string;
  gross_amount: number;
  is_dc?: boolean;
  gst_amount: number;
  net_amount: number;
  notes?: string;
  created_at: string;
  items?: PurchaseReturnItem[];
  total_qty?: number; // Calculated from items
  credit_note_id?: string;
  credit_status?: string; // 'pending', 'adjusted', 'refunded'
  linked_bill_id?: string;
  credit_available_balance?: number | null;
}

const PERF_PATH = "purchase-returns";

const PurchaseReturnDashboard = () => {
  useNavPerfPage(PERF_PATH);
  const { toast } = useToast();
  const { orgNavigate: navigate } = useOrgNavigation();
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [returns, setReturns] = useState<PurchaseReturn[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dcFilter, setDcFilter] = useState<"all" | "dc" | "gst">("all");
  const [expandedReturns, setExpandedReturns] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [returnToDelete, setReturnToDelete] = useState<PurchaseReturn | null>(null);
  const [selectedReturns, setSelectedReturns] = useState<Set<string>>(new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [returnToPrint, setReturnToPrint] = useState<PurchaseReturn | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [businessDetails, setBusinessDetails] = useState<any>(null);
  const [saleSettings, setSaleSettings] = useState<any>(null);
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const printRef = useRef<HTMLDivElement>(null);

  // Draft save hook
  const { hasDraft, draftData, deleteDraft, lastSaved } = useDraftSave('purchase_return');

  // Supplier history dialog states
  const [showSupplierHistory, setShowSupplierHistory] = useState(false);
  const [selectedSupplierForHistory, setSelectedSupplierForHistory] = useState<{id: string; name: string} | null>(null);

  // Credit note adjustment dialog states
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [selectedReturnForAdjust, setSelectedReturnForAdjust] = useState<PurchaseReturn | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const purchaseReturnFilterSnapshot = useMemo(
    () => ({
      searchQuery,
      startDate,
      endDate,
      dcFilter,
      currentPage,
      pageSize,
    }),
    [searchQuery, startDate, endDate, dcFilter, currentPage, pageSize],
  );

  useDashboardFilterPersistence(
    "purchase-return-dashboard",
    currentOrganization?.id,
    purchaseReturnFilterSnapshot,
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [
          ["searchQuery", setSearchQuery],
          ["startDate", setStartDate],
          ["endDate", setEndDate],
          ["dcFilter", setDcFilter],
        ],
        numbers: [
          ["currentPage", setCurrentPage],
          ["pageSize", setPageSize],
        ],
      });
    },
  );

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
  }, [startDate, endDate]);

  // Server-side paginated query
  const { data: returnsData, isLoading: returnsLoading, error: returnsError, refetch: refetchReturns } = useQuery({
    queryKey: ["purchase-returns", currentOrganization?.id, debouncedSearch, startDate, endDate, dcFilter, currentPage, pageSize],
    queryFn: async () => {
      if (!currentOrganization?.id) return { returns: [], totalCount: 0 };

      const startIndex = (currentPage - 1) * pageSize;
      const endIndex = startIndex + pageSize - 1;

      const isRecoverableSchemaError = (err: unknown) => {
        const m = String((err as { message?: string })?.message || "").toLowerCase();
        return (
          (m.includes("column") && m.includes("does not exist")) ||
          m.includes("could not find")
        );
      };

      const SEL_CORE =
        "id, return_number, return_date, supplier_name, supplier_id, original_bill_number, gross_amount, gst_amount, net_amount, notes, created_at, credit_note_id, credit_status, discount_amount, discount_percent";
      const SEL_LINKED = `${SEL_CORE}, linked_bill_id`;
      const SEL_CREDIT = `${SEL_LINKED}, credit_available_balance`;
      const SEL_FULL = `${SEL_CREDIT}, is_dc`;

      const runReturnsQuery = async (
        selectFields: string,
        filterMode: "is_dc" | "gst_amount"
      ) => {
        let query = supabase
          .from("purchase_returns" as any)
          .select(selectFields, { count: "exact" })
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null);

        if (filterMode === "is_dc") {
          if (dcFilter === "dc") query = query.eq("is_dc", true);
          if (dcFilter === "gst") query = query.eq("is_dc", false);
        } else {
          if (dcFilter === "dc") query = query.eq("gst_amount", 0);
          if (dcFilter === "gst") query = query.gt("gst_amount", 0);
        }

        if (debouncedSearch) {
          query = query.or(
            `supplier_name.ilike.%${debouncedSearch}%,original_bill_number.ilike.%${debouncedSearch}%,return_number.ilike.%${debouncedSearch}%`
          );
        }
        if (startDate) query = query.gte("return_date", startDate);
        if (endDate) query = query.lte("return_date", endDate);

        query = query.order("return_date", { ascending: false }).range(startIndex, endIndex);
        return await query;
      };

      /** Try select tiers from richest to minimal so older DBs without migrations still load. */
      const tiers: { fields: string; filterMode: "is_dc" | "gst_amount" }[] = [
        { fields: SEL_FULL, filterMode: "is_dc" },
        { fields: SEL_CREDIT, filterMode: "gst_amount" },
        { fields: SEL_LINKED, filterMode: "gst_amount" },
        { fields: SEL_CORE, filterMode: "gst_amount" },
      ];

      let data: any[] | null = null;
      let count = 0;
      let lastError: unknown = null;

      for (const tier of tiers) {
        const res = await runReturnsQuery(tier.fields, tier.filterMode);
        if (!res.error) {
          data = (res.data as any[]) || [];
          count = res.count || 0;
          lastError = null;
          break;
        }
        lastError = res.error;
        if (!isRecoverableSchemaError(res.error)) throw res.error;
      }

      if (lastError && !data) throw lastError;

      data = (data || []).map((r: any) => ({
        ...r,
        linked_bill_id: r.linked_bill_id ?? null,
        credit_available_balance: r.credit_available_balance ?? null,
        is_dc:
          r?.is_dc === true ||
          (r?.is_dc == null && Number(r?.gst_amount || 0) === 0),
      }));
      
      // Fetch total qty for returned items
      const returnIds = (data || []).map((r: any) => r.id);
      let qtyMap: Record<string, number> = {};
      
      if (returnIds.length > 0) {
        const { data: itemsData } = await supabase
          .from("purchase_return_items" as any)
          .select("return_id, qty")
          .in("return_id", returnIds);
        
        if (itemsData) {
          qtyMap = (itemsData as any[]).reduce((acc, item) => {
            acc[item.return_id] = (acc[item.return_id] || 0) + item.qty;
            return acc;
          }, {} as Record<string, number>);
        }
      }

      const returnsWithQty = (data || []).map((r: any) => ({
        ...r,
        // Extra safeguard for older rows where is_dc may be null.
        is_dc: r?.is_dc === true || (r?.is_dc == null && Number(r?.gst_amount || 0) === 0),
        total_qty: qtyMap[r.id] || 0
      }));

      return { returns: returnsWithQty as unknown as PurchaseReturn[], totalCount: count || 0 };
    },
    enabled: !!currentOrganization?.id,
    ...DASHBOARD_TAB_RETURN_QUERY_OPTIONS,
  });

  const linkedBillIds = [...new Set((returnsData?.returns || []).map((r) => r.linked_bill_id).filter(Boolean))] as string[];

  const { data: linkedBillByIdRaw } = useQuery({
    queryKey: ["purchase-return-linked-bills", currentOrganization?.id, linkedBillIds.join(",")],
    queryFn: async (): Promise<Record<string, LinkedBillLabel>> => {
      if (linkedBillIds.length === 0) return {};
      const { data, error } = await supabase
        .from("purchase_bills")
        .select("id, software_bill_no, supplier_invoice_no")
        .in("id", linkedBillIds);
      if (error) throw error;
      const out: Record<string, LinkedBillLabel> = {};
      for (const b of data || []) {
        out[b.id] = {
          software_bill_no: b.software_bill_no,
          supplier_invoice_no: b.supplier_invoice_no,
        };
      }
      return out;
    },
    enabled: !!currentOrganization?.id && linkedBillIds.length > 0,
    ...DASHBOARD_TAB_RETURN_QUERY_OPTIONS,
  });

  const { data: cnAmountByReturnIdRaw } = useQuery({
    queryKey: [
      "purchase-return-cn-amounts",
      currentOrganization?.id,
      (returnsData?.returns || []).map((r) => r.id).join(","),
    ],
    queryFn: async (): Promise<Record<string, number>> => {
      const cnIds = [...new Set((returnsData?.returns || []).map((r) => r.credit_note_id).filter(Boolean))] as string[];
      if (cnIds.length === 0) return {};
      const { data, error } = await supabase
        .from("voucher_entries")
        .select("id, total_amount")
        .in("id", cnIds);
      if (error) throw error;
      const byCn = new Map((data || []).map((v) => [v.id, Number(v.total_amount) || 0]));
      const out: Record<string, number> = {};
      for (const r of returnsData?.returns || []) {
        if (r.credit_note_id && byCn.has(r.credit_note_id)) {
          out[r.id] = byCn.get(r.credit_note_id)!;
        }
      }
      return out;
    },
    enabled: !!returnsData?.returns?.length,
    ...DASHBOARD_TAB_RETURN_QUERY_OPTIONS,
  });

  const linkedBillById = linkedBillByIdRaw ?? {};
  const cnAmountByReturnId = cnAmountByReturnIdRaw ?? {};

  useEffect(() => {
    if (returnsData) {
      setReturns(returnsData.returns || []);
    }
  }, [returnsData]);

  useEffect(() => {
    if (!returnsError) return;
    console.error("Error loading purchase returns:", returnsError);
    toast({
      title: "Load Error",
      description: "Failed to load purchase returns. Please refresh and try again.",
      variant: "destructive",
    });
  }, [returnsError, toast]);

  const tableLoading = returnsLoading && returns.length === 0;

  useNavPerfQueryWatch("purchase-returns-list", PERF_PATH, {
    isLoading: returnsLoading,
    rowCount: returns.length,
    blockedUi: tableLoading,
  });

  useEffect(() => {
    if (currentOrganization?.id) {
      fetchBusinessDetails();
    }
  }, [currentOrganization]);

  const fetchReturns = () => { refetchReturns(); };

  const fetchBusinessDetails = async () => {
    if (!currentOrganization?.id) return;
    try {
      const { data, error } = await supabase
        .from("settings")
        .select("business_name, address, mobile_number, email_id, gst_number, sale_settings, bill_barcode_settings")
        .eq("organization_id", currentOrganization.id)
        .maybeSingle();

      if (error) throw error;
      setBusinessDetails({
        business_name: data?.business_name,
        address: data?.address,
        mobile_number: data?.mobile_number,
        email_id: data?.email_id,
        gst_number: data?.gst_number,
      });
      setSaleSettings(data?.sale_settings);
      const barcodeSettings = data?.bill_barcode_settings as any;
      setLogoUrl(barcodeSettings?.logo_url);
    } catch (error) {
      console.error("Error fetching business details:", error);
    }
  };

  const fetchReturnItems = async (returnId: string): Promise<PurchaseReturnItem[]> => {
    try {
      // First fetch return items
      const { data: itemsData, error: itemsError } = await supabase
        .from("purchase_return_items" as any)
        .select("*")
        .eq("return_id", returnId);

      if (itemsError) throw itemsError;

      if (!itemsData || itemsData.length === 0) {
        setReturns(prev => prev.map(ret => 
          ret.id === returnId ? { ...ret, items: [] } : ret
        ));
        return [];
      }

      // Get unique product IDs
      const productIds = [...new Set(itemsData.map((item: any) => item.product_id))];

      // Fetch product info
      const { data: productsData, error: productsError } = await supabase
        .from("products")
        .select("id, product_name, brand")
        .in("id", productIds);

      if (productsError) throw productsError;

      // Create product lookup map
      const productMap = new Map((productsData || []).map((p: any) => [p.id, p]));

      const items: PurchaseReturnItem[] = itemsData.map((item: any) => {
        const product = productMap.get(item.product_id);
        return {
          ...item,
          product_name: product?.product_name || "Unknown",
          brand: product?.brand || "",
        };
      });

      setReturns(prev => prev.map(ret => 
        ret.id === returnId ? { ...ret, items } : ret
      ));
      
      return items;
    } catch (error) {
      console.error("Error fetching return items:", error);
      toast({
        title: "Error",
        description: "Failed to load return items",
        variant: "destructive",
      });
      return [];
    }
  };

  const toggleExpanded = (returnId: string) => {
    const newExpanded = new Set(expandedReturns);
    if (newExpanded.has(returnId)) {
      newExpanded.delete(returnId);
    } else {
      newExpanded.add(returnId);
      const returnRecord = returns.find(r => r.id === returnId);
      if (returnRecord && !returnRecord.items) {
        fetchReturnItems(returnId);
      }
    }
    setExpandedReturns(newExpanded);
  };

  const handleDeleteClick = (returnRecord: PurchaseReturn) => {
    setReturnToDelete(returnRecord);
    setDeleteDialogOpen(true);
  };

  const { softDelete, bulkSoftDelete } = useSoftDelete();

  const handleDeleteConfirm = async () => {
    if (!returnToDelete) return;

    try {
      const success = await softDelete("purchase_returns", returnToDelete.id);
      if (!success) throw new Error("Failed to delete purchase return");

      toast({
        title: "Success",
        description: "Purchase return moved to recycle bin",
      });

      fetchReturns();
    } catch (error) {
      console.error("Error deleting purchase return:", error);
      toast({
        title: "Error",
        description: "Failed to delete purchase return",
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setReturnToDelete(null);
    }
  };

  const toggleSelectAll = () => {
    if (selectedReturns.size === filteredReturns.length) {
      setSelectedReturns(new Set());
    } else {
      setSelectedReturns(new Set(filteredReturns.map(r => r.id)));
    }
  };

  const toggleSelectReturn = (returnId: string) => {
    const newSelected = new Set(selectedReturns);
    if (newSelected.has(returnId)) {
      newSelected.delete(returnId);
    } else {
      newSelected.add(returnId);
    }
    setSelectedReturns(newSelected);
  };

  const handleBulkDelete = async () => {
    if (selectedReturns.size === 0) return;

    try {
      const count = await bulkSoftDelete("purchase_returns", Array.from(selectedReturns));

      toast({
        title: "Success",
        description: `${count} purchase returns moved to recycle bin`,
      });

      setSelectedReturns(new Set());
      fetchReturns();
    } catch (error) {
      console.error("Error bulk deleting purchase returns:", error);
      toast({
        title: "Error",
        description: "Failed to delete purchase returns",
        variant: "destructive",
      });
    } finally {
      setBulkDeleteDialogOpen(false);
    }
  };

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Purchase_Return_${returnToPrint?.original_bill_number || returnToPrint?.id}`,
  });

  const handlePrintClick = async (returnRecord: PurchaseReturn) => {
    try {
      let items = returnRecord.items;
      if (!items || items.length === 0) {
        items = await fetchReturnItems(returnRecord.id);
      }
      
      if (items && items.length > 0) {
        setReturnToPrint({ ...returnRecord, items });
        setTimeout(() => handlePrint(), 100);
      } else {
        toast({
          title: "Error",
          description: "No items found for this purchase return",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error preparing print:", error);
      toast({
        title: "Error",
        description: "Failed to load items for printing",
        variant: "destructive",
      });
    }
  };

  const handlePrintPreviewClick = async (returnRecord: PurchaseReturn) => {
    try {
      let items = returnRecord.items;
      if (!items || items.length === 0) {
        items = await fetchReturnItems(returnRecord.id);
      }
      
      if (items && items.length > 0) {
        setReturnToPrint({ ...returnRecord, items });
        setShowPrintPreview(true);
      } else {
        toast({
          title: "Error",
          description: "No items found for this purchase return",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error preparing print preview:", error);
      toast({
        title: "Error",
        description: "Failed to load items for print preview",
        variant: "destructive",
      });
    }
  };

  const handlePdfDownload = async (returnRecord: PurchaseReturn) => {
    try {
      let items = returnRecord.items;
      if (!items || items.length === 0) {
        items = await fetchReturnItems(returnRecord.id);
      }
      if (!items || items.length === 0) {
        toast({ title: "Error", description: "No items found for this purchase return", variant: "destructive" });
        return;
      }

      // Set the print data so the hidden PurchaseReturnPrint renders
      setReturnToPrint({ ...returnRecord, items });

      // Wait for render
      await new Promise(resolve => setTimeout(resolve, 300));

      if (!printRef.current) {
        toast({ title: "Error", description: "Failed to render PDF content", variant: "destructive" });
        return;
      }

      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);

      const fileName = `Purchase_Return_${returnRecord.return_number || returnRecord.id}.pdf`;
      pdf.save(fileName);

      toast({ title: "PDF Downloaded", description: fileName });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({ title: "Error", description: "Failed to generate PDF", variant: "destructive" });
    }
  };

  // Server-side filtering already applied
  const filteredReturns = returns;
  const paginatedReturns = returns; // Already paginated server-side

  const totalPages = Math.ceil((returnsData?.totalCount || returns.length) / pageSize);

  const totalReturnAmount = returns.reduce((sum, ret) => sum + ret.net_amount, 0);
  const averageReturnValue = returns.length > 0
    ? totalReturnAmount / returns.length
    : 0;
  const totalReturnsCount = returnsData?.totalCount ?? returns.length;

  // Shell renders immediately; table shows skeleton rows while data loads.
  return (
    <div className="min-h-screen bg-slate-50 px-2 sm:px-3 md:px-4 lg:px-5 py-6 pb-24 lg:pb-6">
      <div className="w-full min-w-0 max-w-none space-y-5">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-blue-600 tracking-tight leading-tight">
            Purchase Return Dashboard
          </h1>
          <p className="text-slate-400 text-base mt-0.5">
            View and manage all purchase return records
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {selectedReturns.size > 0 && (
            <Button variant="destructive" className="h-10 text-base" onClick={() => setBulkDeleteDialogOpen(true)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected ({selectedReturns.size})
            </Button>
          )}
          <Button
            onClick={() => navigate("/purchase-return-entry")}
            className="h-10 px-5 text-base font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg transition-all gap-2"
          >
            <Plus className="h-4 w-4" />
            Create New Return
          </Button>
        </div>
      </div>

      {/* Draft Resume Card */}
      {hasDraft && draftData && (
        <Card className="border border-amber-400/60 bg-amber-50 rounded-lg shadow-sm">
          <CardHeader className="py-1.5 px-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-amber-100 rounded-md flex items-center justify-center flex-shrink-0">
                  <FileText className="h-3.5 w-3.5 text-amber-600" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-amber-800 leading-tight">
                    Unsaved Purchase Return Draft
                  </CardTitle>
                  <CardDescription className="text-xs text-amber-700 font-medium mt-0 leading-tight">
                    {(draftData as any)?.lineItems?.length || 0} items • Saved {lastSaved ? formatDistanceToNow(lastSaved, { addSuffix: true }) : "recently"}
                  </CardDescription>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    deleteDraft();
                    toast({
                      title: "Draft Discarded",
                      description: "The unsaved purchase return has been removed",
                    });
                  }}
                  className="gap-1.5 h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
                >
                  <X className="h-3.5 w-3.5" />
                  Discard
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    navigate("/purchase-return-entry", { state: { loadDraft: true } });
                  }}
                  className="gap-1.5 h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-sm"
                >
                  <Edit className="h-3.5 w-3.5" />
                  Resume Draft
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
        <Card className="hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-md rounded-xl min-w-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
            <CardDescription className="text-base font-medium text-white/80">Total Returns</CardDescription>
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <Receipt className="h-4 w-4 text-white" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <div className="text-2xl font-black text-white tabular-nums">
              {tableLoading ? "…" : totalReturnsCount}
            </div>
            <p className="text-sm text-white/65 mt-0.5">All return records</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br from-red-500 to-red-600 border-0 shadow-md rounded-xl min-w-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
            <CardDescription className="text-base font-medium text-white/80">Total Return Amount</CardDescription>
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <TrendingDown className="h-4 w-4 text-white" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <div className="text-2xl font-black text-white tabular-nums">
              {tableLoading ? "…" : `₹${totalReturnAmount.toFixed(0)}`}
            </div>
            <p className="text-sm text-white/65 mt-0.5">Net refund value</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br from-violet-500 to-violet-600 border-0 shadow-md rounded-xl min-w-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
            <CardDescription className="text-base font-medium text-white/80">Average Return Value</CardDescription>
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <IndianRupee className="h-4 w-4 text-white" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <div className="text-2xl font-black text-white tabular-nums">
              {tableLoading ? "…" : `₹${averageReturnValue.toFixed(0)}`}
            </div>
            <p className="text-sm text-white/65 mt-0.5">Per return</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-xl border border-slate-200 shadow-sm overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-white">
          <div className="relative flex-1 min-w-[200px] max-w-full sm:max-w-md md:max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search by return no., supplier or bill number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 h-10 text-base border-slate-200 bg-slate-50 focus:bg-white"
            />
          </div>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-[150px] h-10 text-base border-slate-200 bg-slate-50 hover:bg-white"
          />
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-[150px] h-10 text-base border-slate-200 bg-slate-50 hover:bg-white"
          />
          <select
            value={dcFilter}
            onChange={(e) => setDcFilter(e.target.value as any)}
            className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3 text-base min-w-[130px] hover:bg-white"
          >
            <option value="all">All Returns</option>
            <option value="dc">DC Only</option>
            <option value="gst">GST Only</option>
          </select>
        </div>
        <CardContent className="p-0 pt-0">
          {tableLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : paginatedReturns.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Purchase Returns Found</h3>
              <p className="text-muted-foreground">
                {searchQuery || startDate || endDate
                  ? "Try adjusting your filters"
                  : "Start by creating a new purchase return"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="h-11 bg-black hover:bg-black">
                    <TableHead className="w-8 px-2 py-2 text-white">
                      <input
                        type="checkbox"
                        checked={selectedReturns.size === filteredReturns.length}
                        onChange={toggleSelectAll}
                        className="rounded"
                      />
                    </TableHead>
                    <TableHead className="px-2 py-2 text-[13px] font-bold text-white uppercase">Ret. No.</TableHead>
                    <TableHead className="px-2 py-2 text-[13px] font-bold text-white uppercase">Date</TableHead>
                    <TableHead className="px-2 py-2 text-[13px] font-bold text-white uppercase">Supplier</TableHead>
                    <TableHead className="px-2 py-2 text-[13px] font-bold text-white uppercase">Orig. Bill</TableHead>
                    <TableHead className="px-2 py-2 text-[13px] font-bold text-white uppercase text-right">Qty</TableHead>
                    <TableHead className="px-2 py-2 text-[13px] font-bold text-white uppercase text-right">GST</TableHead>
                    <TableHead className="px-2 py-2 text-[13px] font-bold text-white uppercase text-right">Net Amt</TableHead>
                    <TableHead className="px-2 py-2 text-[13px] font-bold text-white uppercase">Status</TableHead>
                    <TableHead className="px-2 py-2 text-[13px] font-bold text-white uppercase text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedReturns.map((returnRecord) => (
                    <>
                      <TableRow 
                        key={returnRecord.id} 
                        className="hover:bg-muted/50 cursor-pointer h-10"
                        onClick={() => toggleExpanded(returnRecord.id)}
                      >
                        <TableCell className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedReturns.has(returnRecord.id)}
                            onChange={() => toggleSelectReturn(returnRecord.id)}
                            className="rounded"
                          />
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-sm">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="font-medium text-xs px-1.5 py-0.5">
                              {returnRecord.return_number || "-"}
                            </Badge>
                            {returnRecord.is_dc && (
                              <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded font-bold">
                                DC
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-sm whitespace-nowrap">
                          {format(new Date(returnRecord.return_date), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-sm font-medium max-w-[160px] truncate">
                          <span 
                            className={returnRecord.supplier_id ? "cursor-pointer text-blue-600 hover:underline" : ""}
                            onClick={(e) => {
                              if (returnRecord.supplier_id) {
                                e.stopPropagation();
                                setSelectedSupplierForHistory({ id: returnRecord.supplier_id, name: returnRecord.supplier_name });
                                setShowSupplierHistory(true);
                              }
                            }}
                          >
                            {returnRecord.supplier_name}
                          </span>
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-sm">
                          <Badge variant="outline" className="text-xs px-1.5 py-0.5 max-w-[120px] truncate" title={
                            returnRecord.credit_status === "adjusted" && returnRecord.linked_bill_id
                              ? `Adjusted against bill ${formatPurchaseReturnOrigBill(returnRecord, lookupMap(linkedBillById, returnRecord.linked_bill_id))}`
                              : undefined
                          }>
                            {formatPurchaseReturnOrigBill(
                              returnRecord,
                              returnRecord.linked_bill_id
                                ? lookupMap(linkedBillById, returnRecord.linked_bill_id)
                                : null
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-2 py-2 text-[15px] text-right font-medium tabular-nums">
                          {returnRecord.total_qty || 0}
                        </TableCell>
                        <TableCell className="px-2 py-2 text-[15px] text-right tabular-nums">
                          {returnRecord.is_dc ? (
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-orange-500 text-xs font-medium">DC</span>
                              <span className="text-xs text-muted-foreground">₹0.00</span>
                            </div>
                          ) : (
                            <span>₹{returnRecord.gst_amount.toFixed(2)}</span>
                          )}
                        </TableCell>
                        <TableCell className="px-2 py-2 text-[15px] text-right font-semibold tabular-nums text-primary">
                          ₹{returnRecord.net_amount.toFixed(2)}
                        </TableCell>
                        <TableCell className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                          {(() => {
                            const st = returnRecord.credit_status;
                            const label = formatPurchaseReturnCreditStatusLabel(
                              returnRecord,
                              returnRecord.linked_bill_id
                                ? lookupMap(linkedBillById, returnRecord.linked_bill_id)
                                : null,
                              cnAmountByReturnId[returnRecord.id] ?? returnRecord.net_amount
                            );
                            if (!st) return <span className="text-muted-foreground text-xs">-</span>;
                            const className =
                              st === "pending"
                                ? "bg-yellow-50 text-yellow-700 border-yellow-300"
                                : st === "adjusted"
                                  ? "bg-green-50 text-green-700 border-green-300"
                                  : st === "refunded"
                                    ? "bg-blue-50 text-blue-700 border-blue-300"
                                    : "bg-purple-50 text-purple-700 border-purple-300";
                            return (
                              <Badge
                                variant="outline"
                                className={`${className} text-xs px-1.5 py-0 max-w-[160px] truncate`}
                                title={label}
                              >
                                {label}
                              </Badge>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-0.5">
                            {(returnRecord.credit_status === 'pending' || !returnRecord.credit_status) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => {
                                  setSelectedReturnForAdjust(returnRecord);
                                  setShowAdjustDialog(true);
                                }}
                                title="Adjust Credit Note"
                              >
                                <CreditCard className="h-3.5 w-3.5 text-purple-600" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() =>
                                navigate(`/purchase-return-entry?edit=${returnRecord.id}`, {
                                  state: {
                                    editReturnId: returnRecord.id,
                                    returnPreview: returnRecord,
                                  },
                                })
                              }
                              title="Edit"
                            >
                              <Edit className="h-3.5 w-3.5 text-blue-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handlePrintPreviewClick(returnRecord)}
                              title="Preview"
                            >
                              <Eye className="h-3.5 w-3.5 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handlePrintClick(returnRecord)}
                              title="Print"
                            >
                              <Printer className="h-3.5 w-3.5 text-primary" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handlePdfDownload(returnRecord)}
                              title="Download PDF"
                            >
                              <Download className="h-3.5 w-3.5 text-orange-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => toggleExpanded(returnRecord.id)}
                              title={expandedReturns.has(returnRecord.id) ? "Collapse" : "Expand"}
                            >
                              {expandedReturns.has(returnRecord.id) ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {expandedReturns.has(returnRecord.id) && (
                        <TableRow>
                          <TableCell colSpan={10} className="bg-muted/30 p-0">
                            <div className="p-4">
                              <h4 className="font-semibold mb-3 flex items-center gap-2">
                                <Package className="h-4 w-4" />
                                Return Items ({returnRecord.items?.length || 0} items)
                              </h4>
                              {!returnRecord.items ? (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                                  Loading items...
                                </div>
                              ) : returnRecord.items.length === 0 ? (
                                <p className="text-muted-foreground">No items found</p>
                              ) : (
                                <Table>
                                  <TableHeader>
                                     <TableRow>
                                      <TableHead>#</TableHead>
                                      <TableHead>Product</TableHead>
                                      <TableHead>Brand</TableHead>
                                      <TableHead>Color</TableHead>
                                      <TableHead>Size</TableHead>
                                      <TableHead>Barcode</TableHead>
                                      <TableHead>HSN Code</TableHead>
                                      <TableHead className="text-right">Qty</TableHead>
                                      <TableHead className="text-right">Price</TableHead>
                                      <TableHead className="text-right">GST %</TableHead>
                                      <TableHead className="text-right">Total</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {returnRecord.items.map((item, idx) => (
                                      <TableRow key={item.id}>
                                        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                                        <TableCell className="font-medium">{item.product_name || "Unknown"}</TableCell>
                                        <TableCell>{item.brand || "-"}</TableCell>
                                        <TableCell>{item.color || "-"}</TableCell>
                                        <TableCell>
                                          <Badge variant="secondary">{item.size}</Badge>
                                        </TableCell>
                                        <TableCell>
                                          <code className="text-xs bg-muted px-1 py-0.5 rounded">{item.barcode || "N/A"}</code>
                                        </TableCell>
                                        <TableCell>
                                          <code className="text-xs">{(item as any).hsn_code || "-"}</code>
                                        </TableCell>
                                        <TableCell className="text-right font-medium">{item.qty}</TableCell>
                                        <TableCell className="text-right">
                                          ₹{item.pur_price.toFixed(2)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          {item.gst_per}%
                                        </TableCell>
                                        <TableCell className="text-right font-semibold">
                                          ₹{item.line_total.toFixed(2)}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                    <TableRow className="bg-muted/50 font-semibold">
                                      <TableCell colSpan={7} className="text-right">Total:</TableCell>
                                      <TableCell className="text-right">
                                        {returnRecord.items.reduce((sum, item) => sum + item.qty, 0)}
                                      </TableCell>
                                      <TableCell colSpan={2}></TableCell>
                                      <TableCell className="text-right">
                                        ₹{returnRecord.items.reduce((sum, item) => sum + item.line_total, 0).toFixed(2)}
                                      </TableCell>
                                    </TableRow>
                                  </TableBody>
                                </Table>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {filteredReturns.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-white">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">Show:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="h-9 rounded-md border border-slate-200 px-2 text-sm"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600 font-medium tabular-nums px-1">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-sm border-slate-200"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-sm border-slate-200"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase Return?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this purchase return? This action cannot be undone.
              Stock will be adjusted accordingly.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedReturns.size} Purchase Returns?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedReturns.size} selected purchase returns? 
              This action cannot be undone. Stock will be adjusted accordingly.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive">
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden Print Component */}
      <div className="hidden">
        {returnToPrint && (
          <PurchaseReturnPrint
            ref={printRef}
            returnData={returnToPrint}
            items={returnToPrint.items || []}
            businessDetails={businessDetails}
            saleSettings={saleSettings}
            logoUrl={logoUrl}
          />
        )}
      </div>

      {/* Print Preview Dialog */}
      {returnToPrint && (
        <PrintPreviewDialog
          open={showPrintPreview}
          onOpenChange={setShowPrintPreview}
          renderInvoice={() => (
            <PurchaseReturnPrint
              returnData={returnToPrint}
              items={returnToPrint.items || []}
              businessDetails={businessDetails}
              saleSettings={saleSettings}
              logoUrl={logoUrl}
            />
          )}
          defaultFormat="a4"
        />
      )}

      {/* Credit Note Adjustment Dialog */}
      {selectedReturnForAdjust && (
        <AdjustCreditNoteDialog
          open={showAdjustDialog}
          onOpenChange={setShowAdjustDialog}
          purchaseReturnId={selectedReturnForAdjust.id}
          creditNoteId={selectedReturnForAdjust.credit_note_id || ""}
          creditNoteNumber={selectedReturnForAdjust.return_number || ""}
          creditAmount={
            selectedReturnForAdjust.credit_available_balance != null &&
            !Number.isNaN(Number(selectedReturnForAdjust.credit_available_balance))
              ? Number(selectedReturnForAdjust.credit_available_balance)
              : selectedReturnForAdjust.net_amount
          }
          supplierId={selectedReturnForAdjust.supplier_id || ""}
          supplierName={selectedReturnForAdjust.supplier_name}
          onSuccess={() => {
            fetchReturns();
            setSelectedReturnForAdjust(null);
            queryClient.invalidateQueries({ queryKey: ["supplier-ledger"] });
            queryClient.invalidateQueries({ queryKey: ["supplier-transactions"] });
            queryClient.invalidateQueries({ queryKey: ["suppliers-with-balance"] });
            queryClient.invalidateQueries({ queryKey: ["supplier-balance"] });
            queryClient.invalidateQueries({ queryKey: ["supplier-balance-snapshot"] });
            queryClient.invalidateQueries({ queryKey: ["supplier-bills"] });
            queryClient.invalidateQueries({ queryKey: ["supplier-adjusted-outstanding-credit"] });
            queryClient.invalidateQueries({ queryKey: ["floating-supplier-ledger"] });
            queryClient.invalidateQueries({ queryKey: ["floating-supplier-balance-snap"] });
            queryClient.invalidateQueries({ queryKey: ["supplier-bill-payment-voucher-drift"] });
          }}
        />
      )}

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
    </div>
  );
};

export default PurchaseReturnDashboard;
