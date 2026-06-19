import { useState, useEffect, useRef, useMemo } from "react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { supabase } from "@/integrations/supabase/client";
import { deleteLedgerEntries } from "@/lib/customerLedger";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { STALE_LIVE } from "@/lib/queryStaleTimes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp, Printer, Trash2, Plus, Search, Receipt, TrendingDown, IndianRupee, CreditCard, Banknote, ArrowLeftRight, Pencil, FileSpreadsheet, Package, Settings2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useDashboardColumnSettings } from "@/hooks/useDashboardColumnSettings";
import { TableSkeleton } from "@/components/ui/skeletons";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useReactToPrint } from "react-to-print";
import { SaleReturnPrint } from "@/components/SaleReturnPrint";
import { SaleReturnThermalPrint } from "@/components/SaleReturnThermalPrint";
import { useSoftDelete } from "@/hooks/useSoftDelete";
import { AdjustCustomerCreditNoteDialog } from "@/components/AdjustCustomerCreditNoteDialog";
import { useOpenCustomerAccount } from "@/hooks/useOpenCustomerAccount";
import { CreditNoteHistoryDialog } from "@/components/CreditNoteHistoryDialog";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { MobileStatStrip } from "@/components/mobile/MobileStatStrip";
import { MobileListCard, MobileListCardSkeleton } from "@/components/mobile/MobileListCard";
import { cn } from "@/lib/utils";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { isDashboardFilterRestoring, restoreDashboardFilters } from "@/lib/dashboardFilterPersistence";

interface SaleReturn {
  id: string;
  return_number: string | null;
  customer_name: string;
  customer_id: string | null;
  original_sale_number: string | null;
  return_date: string;
  gross_amount: number;
  gst_amount: number;
  net_amount: number;
  /** Remaining rupees on CN when partially applied (null = use net_amount). */
  credit_available_balance?: number | null;
  notes: string | null;
  items?: SaleReturnItem[];
  credit_note_id?: string;
  credit_status?: string;
  linked_sale_id?: string;
  refund_type?: string;
  credit_note_number?: string;
  customer_phone?: string | null;
  total_qty?: number;
  adjusted_sale_number?: string | null;
  adjusted_sale_type?: string | null;
  /** Amount applied on linked invoice (from sales.sale_return_adjust). */
  actual_adjusted_amt?: number;
  /** Return net not yet applied when partial CN on invoice. */
  remaining_cn_amt?: number;
  /** Live remaining on linked credit_notes row (credit_amount - used_amount). */
  cn_live_remaining?: number | null;
}

interface SaleReturnItem {
  id: string;
  product_name: string;
  size: string;
  color: string | null;
  barcode: string | null;
  quantity: number;
  unit_price: number;
  gst_percent: number;
  line_total: number;
}

interface BusinessDetails {
  business_name: string | null;
  address: string | null;
  mobile_number: string | null;
  gst_number: string | null;
}

const getCreditStatusBadgeClass = (ret: SaleReturn): string => {
  const status = (ret.credit_status || "").toLowerCase();
  if (status === "refunded") return "bg-slate-500 hover:bg-slate-600 text-white";
  if (status === "adjusted" && ret.linked_sale_id) return "bg-green-500 hover:bg-green-600 text-white";
  if (status === "partially_adjusted") return "bg-orange-400 hover:bg-orange-500 text-white";
  if (status === "adjusted") return "bg-teal-500 hover:bg-teal-600 text-white";
  if (status === "adjusted_outstanding") return "bg-violet-500 hover:bg-violet-600 text-white";
  return "bg-red-500 hover:bg-red-600 text-white";
};

const formatCreditStatusLabel = (ret: SaleReturn) => {
  if (ret.credit_status === "refunded") return "Refunded to Customer";
  if (ret.credit_status === "adjusted_outstanding") return "Adjusted to Customer Outstanding";
  if (ret.credit_status === "partially_adjusted") return "CN Partially Applied to Invoice(s)";
  if (ret.credit_status === "adjusted" && ret.linked_sale_id) {
    const remaining = ret.remaining_cn_amt ?? 0;
    if (remaining > 0)
      return `S/R Partial — ₹${remaining.toLocaleString("en-IN")} CN Remaining`;
    return "S/R Adjusted in Invoice";
  }
  if (ret.credit_status === "adjusted") return "Credit Note Generated";
  if (ret.credit_status === "pending") return "Credit Note Pending";
  return "Pending";
};

/**
 * Authoritative available CN amount for a sale return.
 * 1. If a credit_notes row exists, use its live remaining (credit_amount - used_amount).
 * 2. Otherwise, if the return is linked to a sale, use remaining_cn_amt.
 * 3. Otherwise (pending, no CN yet), fall back to net_amount.
 */
/** Hidden by default — enable via Columns filter. */
const DEFAULT_SALE_RETURN_COLUMNS = {
  phone: false,
  originalSale: false,
  gross: false,
  gst: false,
  adjInvoice: false,
};

const getAvailableCN = (ret: SaleReturn): number => {
  if (ret.credit_note_id && ret.cn_live_remaining != null) {
    return Number(ret.cn_live_remaining);
  }
  if (ret.linked_sale_id) {
    return Number(ret.remaining_cn_amt ?? 0);
  }
  return Number(ret.net_amount || 0);
};

export default function SaleReturnDashboard() {
  const isMobile = useIsMobile();
  const { orgNavigate: navigate } = useOrgNavigation();
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

  const { columnSettings, updateColumnSetting } = useDashboardColumnSettings(
    "sale_return_dashboard",
    DEFAULT_SALE_RETURN_COLUMNS,
  );

  const optionalColumnCount =
    (columnSettings.phone ? 1 : 0) +
    (columnSettings.originalSale ? 1 : 0) +
    (columnSettings.gross ? 1 : 0) +
    (columnSettings.gst ? 1 : 0) +
    (columnSettings.adjInvoice ? 1 : 0);
  const tableColSpan = 11 + optionalColumnCount;

  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [returnToDelete, setReturnToDelete] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Date filters
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  // Status filter
  const [statusFilter, setStatusFilter] = useState("all");

  const saleReturnFilterSnapshot = useMemo(
    () => ({
      searchTerm,
      fromDate,
      toDate,
      statusFilter,
      currentPage,
    }),
    [searchTerm, fromDate, toDate, statusFilter, currentPage],
  );

  useDashboardFilterPersistence(
    "sale-returns",
    currentOrganization?.id,
    saleReturnFilterSnapshot,
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [
          ["searchTerm", setSearchTerm],
          ["fromDate", setFromDate],
          ["toDate", setToDate],
          ["statusFilter", setStatusFilter],
        ],
        numbers: [["currentPage", setCurrentPage]],
      });
    },
  );

  const [returnToPrint, setReturnToPrint] = useState<SaleReturn | null>(null);
  const [businessDetails, setBusinessDetails] = useState<BusinessDetails | null>(null);
  const [billFormat, setBillFormat] = useState<string>('a4');
  const printRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Credit note adjustment dialog states
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [selectedReturnForAdjust, setSelectedReturnForAdjust] = useState<SaleReturn | null>(null);

  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [selectedReturnForRefund, setSelectedReturnForRefund] = useState<SaleReturn | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMode, setRefundMode] = useState<"cash" | "upi" | "card">("cash");
  const [refundNote, setRefundNote] = useState("");
  const [isProcessingRefund, setIsProcessingRefund] = useState(false);
  const openCustomerAccount = useOpenCustomerAccount();
  const [showCnHistory, setShowCnHistory] = useState(false);
  const [selectedCnForHistory, setSelectedCnForHistory] = useState<{
    creditNoteId: string | null;
    saleReturnId: string;
  } | null>(null);

  const openCnHistory = (ret: SaleReturn) => {
    setSelectedCnForHistory({
      creditNoteId: ret.credit_note_id || null,
      saleReturnId: ret.id,
    });
    setShowCnHistory(true);
  };
  const queryClient = useQueryClient();

  const isThermal = billFormat === 'thermal';

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    pageStyle: isThermal
      ? '@page { size: 80mm auto; margin: 2mm; }'
      : '@page { size: A4 portrait; margin: 5mm; }',
  });

  const handlePrintTable = useReactToPrint({
    contentRef: tableRef,
  });

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      if (!isDashboardFilterRestoring()) setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset page on filter change
  useEffect(() => {
    if (isDashboardFilterRestoring()) return;
    setCurrentPage(1);
  }, [fromDate, toDate, statusFilter]);

  // Server-side paginated query
  const { data: returnsData, isLoading: returnsLoading, refetch: refetchReturns } = useQuery({
    queryKey: ["sale-returns", currentOrganization?.id, debouncedSearch, currentPage, pageSize, fromDate, toDate, statusFilter],
    queryFn: async () => {
      if (!currentOrganization?.id) return { returns: [], totalCount: 0 };

      const startIndex = (currentPage - 1) * pageSize;
      const endIndex = startIndex + pageSize - 1;

      let query = supabase
        .from("sale_returns")
        .select("id, return_number, customer_name, customer_id, original_sale_number, return_date, gross_amount, gst_amount, net_amount, credit_available_balance, notes, credit_note_id, credit_status, linked_sale_id, refund_type", { count: "exact" })
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);

      // Date filters
      if (fromDate) {
        query = query.gte("return_date", fromDate);
      }
      if (toDate) {
        query = query.lte("return_date", toDate);
      }

      // Status filter
      if (statusFilter && statusFilter !== "all") {
        query = query.eq("credit_status", statusFilter);
      }

      if (debouncedSearch) {
        const searchStr = debouncedSearch.trim();

        // Search sale_return_items for barcode or product name match
        const { data: matchingItems } = await supabase
          .from('sale_return_items')
          .select('return_id')
          .or(`barcode.ilike.%${searchStr}%,product_name.ilike.%${searchStr}%`)
          .limit(200);

        const matchingReturnIds = [...new Set((matchingItems || []).map((i: any) => i.return_id).filter(Boolean))];
        const { data: matchingCustomers } = await supabase
          .from("customers")
          .select("id")
          .eq("organization_id", currentOrganization.id)
          .or(`customer_name.ilike.%${searchStr}%,phone.ilike.%${searchStr}%`)
          .limit(200);
        const matchingCustomerIds = [...new Set((matchingCustomers || []).map((c: any) => c.id).filter(Boolean))];
        const clauses = [
          `return_number.ilike.%${searchStr}%`,
          `customer_name.ilike.%${searchStr}%`,
          `original_sale_number.ilike.%${searchStr}%`,
        ];
        if (matchingReturnIds.length > 0) clauses.push(`id.in.(${matchingReturnIds.join(",")})`);
        if (matchingCustomerIds.length > 0) clauses.push(`customer_id.in.(${matchingCustomerIds.join(",")})`);

        query = query.or(clauses.join(","));
      }

      query = query.order("return_date", { ascending: false }).range(startIndex, endIndex);

      const { data, error, count } = await query;
      if (error) throw error;

      const returnsList = (data || []) as SaleReturn[];

      // Fetch customer phones for all customer_ids
      const customerIds = [...new Set(returnsList.map(r => r.customer_id).filter(Boolean))] as string[];
      let customerPhoneMap: Record<string, string> = {};
      if (customerIds.length > 0) {
        const { data: customers } = await supabase
          .from("customers")
          .select("id, phone")
          .in("id", customerIds);
        if (customers) {
          customers.forEach((c: any) => {
            if (c.phone) customerPhoneMap[c.id] = c.phone;
          });
        }
      }

      // Fetch total qty per return from sale_return_items
      const returnIds = returnsList.map(r => r.id);
      let qtyMap: Record<string, number> = {};
      if (returnIds.length > 0) {
        const { data: items } = await supabase
          .from("sale_return_items")
          .select("return_id, quantity")
          .in("return_id", returnIds);
        if (items) {
          items.forEach((item: any) => {
            qtyMap[item.return_id] = (qtyMap[item.return_id] || 0) + (item.quantity || 0);
          });
        }
      }

      // Enrich returns
      const linkedSaleIds = [...new Set(returnsList.map(r => r.linked_sale_id).filter(Boolean))] as string[];
      const linkedSaleMap: Record<
        string,
        { sale_number: string; sale_type: string | null; sale_return_adjust: number }
      > = {};
      if (linkedSaleIds.length > 0) {
        const { data: linkedSales } = await supabase
          .from("sales")
          .select("id, sale_number, sale_type, sale_return_adjust")
          .in("id", linkedSaleIds);
        (linkedSales || []).forEach((s: any) => {
          linkedSaleMap[s.id] = {
            sale_number: s.sale_number,
            sale_type: s.sale_type || null,
            sale_return_adjust: Number(s.sale_return_adjust || 0),
          };
        });
      }

      // Fetch live CN remaining for any return that has a credit_note_id
      const creditNoteIds = [...new Set(returnsList.map(r => r.credit_note_id).filter(Boolean))] as string[];
      const cnLiveMap: Record<string, number> = {};
      const cnNumberMap: Record<string, string> = {};
      if (creditNoteIds.length > 0 && currentOrganization?.id) {
        const { data: cnRows } = await supabase
          .from("credit_notes")
          .select("id, credit_amount, used_amount, credit_note_number")
          .eq("organization_id", currentOrganization.id)
          .in("id", creditNoteIds);
        (cnRows || []).forEach((c: any) => {
          const remaining = Math.max(0, Number(c.credit_amount || 0) - Number(c.used_amount || 0));
          cnLiveMap[c.id] = remaining;
          if (c.credit_note_number) cnNumberMap[c.id] = c.credit_note_number;
        });
      }

      const enriched = returnsList.map((r) => {
        const linked = r.linked_sale_id ? linkedSaleMap[r.linked_sale_id] : undefined;
        const net = Number(r.net_amount || 0);
        const sra = linked ? linked.sale_return_adjust : 0;
        const actual_adjusted_amt = r.linked_sale_id
          ? (linked ? sra : net)
          : net;
        const remaining_cn_amt =
          r.linked_sale_id && linked ? Math.max(0, net - sra) : 0;
        const cn_live_remaining =
          r.credit_note_id && cnLiveMap[r.credit_note_id] != null
            ? cnLiveMap[r.credit_note_id]
            : null;
        return {
          ...r,
          customer_phone: r.customer_id ? customerPhoneMap[r.customer_id] || null : null,
          total_qty: qtyMap[r.id] || 0,
          adjusted_sale_number: r.linked_sale_id ? linked?.sale_number || null : null,
          adjusted_sale_type: r.linked_sale_id ? linked?.sale_type || null : null,
          actual_adjusted_amt,
          remaining_cn_amt,
          cn_live_remaining,
          credit_note_number: r.credit_note_id
            ? cnNumberMap[r.credit_note_id] || undefined
            : undefined,
        };
      });

      // Self-heal stale credit_available_balance on sale_returns (fire-and-forget)
      if (currentOrganization?.id) {
        enriched.forEach((r) => {
          if (
            r.credit_note_id &&
            r.cn_live_remaining != null &&
            Math.abs(Number(r.credit_available_balance ?? -1) - r.cn_live_remaining) > 0.01
          ) {
            supabase
              .from("sale_returns")
              .update({ credit_available_balance: r.cn_live_remaining })
              .eq("id", r.id)
              .eq("organization_id", currentOrganization.id)
              .then(() => {});
          }
        });
      }

      return { returns: enriched, totalCount: count || 0 };
    },
    enabled: !!currentOrganization?.id,
    staleTime: STALE_LIVE,
    refetchOnWindowFocus: false,
  });

  const returns = returnsData?.returns || [];

  const { data: summaryData } = useQuery({
    queryKey: ["sale-returns-summary", currentOrganization?.id, debouncedSearch, fromDate, toDate, statusFilter],
    queryFn: async () => {
      if (!currentOrganization?.id) return { totalReturns: 0, totalValue: 0, totalQty: 0 };

      const applySummaryFilters = (base: any) => {
        let q = base
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null);
        if (fromDate) q = q.gte("return_date", fromDate);
        if (toDate) q = q.lte("return_date", toDate);
        if (statusFilter && statusFilter !== "all") q = q.eq("credit_status", statusFilter);
        return q;
      };

      let searchOrClause: string | null = null;
      if (debouncedSearch) {
        const searchStr = debouncedSearch.trim();
        const returnIdsInScope: string[] = [];
        const PAGE = 1000;
        let offset = 0;
        while (true) {
          const { data, error } = await applySummaryFilters(
            supabase.from("sale_returns").select("id"),
          ).range(offset, offset + PAGE - 1);
          if (error) throw error;
          if (!data?.length) break;
          returnIdsInScope.push(...data.map((r) => r.id).filter(Boolean));
          if (data.length < PAGE) break;
          offset += PAGE;
        }

        const matchedReturnIds = new Set<string>();
        for (let i = 0; i < returnIdsInScope.length; i += 200) {
          const batch = returnIdsInScope.slice(i, i + 200);
          if (batch.length === 0) continue;
          const { data: matchingItems } = await supabase
            .from("sale_return_items")
            .select("return_id")
            .in("return_id", batch)
            .or(`barcode.ilike.%${searchStr}%,product_name.ilike.%${searchStr}%`)
            .limit(200);
          (matchingItems || []).forEach((row) => {
            if (row.return_id) matchedReturnIds.add(row.return_id);
          });
        }

        const { data: matchingCustomers } = await supabase
          .from("customers")
          .select("id")
          .eq("organization_id", currentOrganization.id)
          .or(`customer_name.ilike.%${searchStr}%,phone.ilike.%${searchStr}%`)
          .limit(200);
        const matchingCustomerIds = [...new Set((matchingCustomers || []).map((c: any) => c.id).filter(Boolean))];

        const clauses = [
          `return_number.ilike.%${searchStr}%`,
          `customer_name.ilike.%${searchStr}%`,
          `original_sale_number.ilike.%${searchStr}%`,
        ];
        if (matchedReturnIds.size > 0) clauses.push(`id.in.(${[...matchedReturnIds].join(",")})`);
        if (matchingCustomerIds.length > 0) clauses.push(`customer_id.in.(${matchingCustomerIds.join(",")})`);
        searchOrClause = clauses.join(",");
      }

      const withSearch = (base: any) => {
        let q = applySummaryFilters(base);
        if (searchOrClause) q = q.or(searchOrClause);
        return q;
      };

      const { count, error: countError } = await withSearch(
        supabase.from("sale_returns").select("id", { count: "exact", head: true }),
      );
      if (countError) throw countError;

      let totalValue = 0;
      let totalGross = 0;
      let totalGst = 0;
      const allReturnIds: string[] = [];
      const PAGE = 1000;
      let offset = 0;
      while (true) {
        const { data: pageRows, error: pageError } = await withSearch(
          supabase.from("sale_returns").select("id, net_amount, gross_amount, gst_amount"),
        ).range(offset, offset + PAGE - 1);
        if (pageError) throw pageError;
        if (!pageRows?.length) break;
        for (const row of pageRows) {
          totalValue += Number(row.net_amount || 0);
          totalGross += Number(row.gross_amount || 0);
          totalGst += Number(row.gst_amount || 0);
          if (row.id) allReturnIds.push(row.id);
        }
        if (pageRows.length < PAGE) break;
        offset += PAGE;
      }

      let totalQty = 0;
      for (let i = 0; i < allReturnIds.length; i += 200) {
        const batch = allReturnIds.slice(i, i + 200);
        const { data: items } = await supabase
          .from("sale_return_items")
          .select("quantity")
          .in("return_id", batch);
        totalQty += (items || []).reduce(
          (sum: number, item: any) => sum + Number(item.quantity || 0),
          0,
        );
      }

      return { totalReturns: count || 0, totalValue, totalQty, totalGross, totalGst };
    },
    enabled: !!currentOrganization?.id,
    staleTime: STALE_LIVE,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (returnsData) setLoading(false);
  }, [returnsData]);

  useEffect(() => {
    if (returnsLoading && returns.length === 0) setLoading(true);
  }, [returnsLoading]);

  useEffect(() => {
    if (currentOrganization) {
      fetchBusinessDetails();
    }
  }, [currentOrganization]);

  const fetchReturns = () => { refetchReturns(); };

  const fetchBusinessDetails = async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("business_name, address, mobile_number, gst_number, sale_settings")
      .eq("organization_id", currentOrganization?.id)
      .single();

    if (error) {
      console.error("Error fetching business details:", error);
      return;
    }

    setBusinessDetails(data);
    const saleSettings = data?.sale_settings as any;
    // Use Invoice setting (sales_bill_format) for credit note print format.
    // If POS is configured as thermal, also use thermal.
    const fmt = saleSettings?.sales_bill_format || saleSettings?.pos_bill_format;
    if (fmt) {
      setBillFormat(fmt);
    }
  };

  // Cache for loaded items
  const [loadedItems, setLoadedItems] = useState<Record<string, SaleReturnItem[]>>({});

  const fetchReturnItems = async (returnId: string) => {
    if (loadedItems[returnId]) return loadedItems[returnId];
    const { data, error } = await supabase
      .from("sale_return_items")
      .select("*")
      .eq("return_id", returnId);

    if (error) {
      toast({ title: "Error", description: "Failed to load return items", variant: "destructive" });
      return [];
    }

    const items = (data || []) as SaleReturnItem[];
    setLoadedItems(prev => ({ ...prev, [returnId]: items }));
    return items;
  };

  const toggleRow = async (returnId: string) => {
    const newExpanded = new Set(expandedRows);
    
    if (newExpanded.has(returnId)) {
      newExpanded.delete(returnId);
    } else {
      newExpanded.add(returnId);
      if (!loadedItems[returnId]) {
        await fetchReturnItems(returnId);
      }
    }
    
    setExpandedRows(newExpanded);
  };

  const { softDelete } = useSoftDelete();

  const handleDelete = async () => {
    if (!returnToDelete) return;

    const ret: any = (returns as any[])?.find?.((r: any) => r.id === returnToDelete);
    const success = await softDelete("sale_returns", returnToDelete);
    if (success) {
      if (ret?.return_number && currentOrganization?.id) {
        await deleteLedgerEntries({ organizationId: currentOrganization.id, voucherNo: ret.return_number, voucherTypes: ['SALE_RETURN'] });
      }
      toast({ title: "Success", description: "Return moved to recycle bin" });
      refetchReturns();
    }
    setDeleteDialogOpen(false);
    setReturnToDelete(null);
  };

  const handlePrintClick = async (returnRecord: SaleReturn) => {
    let printData: any = { ...returnRecord };
    if (!returnRecord.items) {
      const items = await fetchReturnItems(returnRecord.id);
      printData = { ...printData, items };
    }
    if (returnRecord.credit_note_id) {
      const { data: cn } = await supabase
        .from("credit_notes")
        .select("credit_note_number")
        .eq("id", returnRecord.credit_note_id)
        .maybeSingle();
      if (cn) {
        printData.credit_note_number = cn.credit_note_number;
      }
    }
    setReturnToPrint(printData);
    setTimeout(() => handlePrint(), 100);
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (returns.length === 0) {
      toast({ title: "No data", description: "No returns to export", variant: "destructive" });
      return;
    }

    const exportData = returns.map((ret) => ({
      "Return No": ret.return_number || "-",
      "Date": format(new Date(ret.return_date), "dd/MM/yyyy"),
      "Customer": ret.customer_name,
      "Mobile": ret.customer_phone || "-",
      "Original Sale No": ret.original_sale_number || "-",
      "Qty": ret.total_qty || 0,
      "Gross": Math.round(ret.gross_amount),
      "GST": Math.round(ret.gst_amount * 100) / 100,
      "Net Amount": Math.round(ret.net_amount),
      "Credit Status": ret.credit_status || "-",
      "Adjusted In Invoice": ret.adjusted_sale_number || ret.original_sale_number || "-",
      "Refund Type": ret.refund_type === 'cash_refund' ? 'Cash Refund' : ret.refund_type === 'exchange' ? 'Exchange' : 'Credit Note',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sale Returns");
    XLSX.writeFile(wb, `Sale_Returns_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast({ title: "Exported", description: `${returns.length} records exported to Excel` });
  };

  const totalReturns = summaryData?.totalReturns ?? returnsData?.totalCount ?? returns.length;
  const totalValue = summaryData?.totalValue ?? returns.reduce((sum, ret) => sum + ret.net_amount, 0);
  const totalQty = summaryData?.totalQty ?? returns.reduce((sum, ret) => sum + (ret.total_qty || 0), 0);
  const totalGross = summaryData?.totalGross ?? returns.reduce((sum, ret) => sum + (ret.gross_amount || 0), 0);
  const totalGst = summaryData?.totalGst ?? returns.reduce((sum, ret) => sum + (ret.gst_amount || 0), 0);
  const averageValue = totalReturns > 0 ? totalValue / totalReturns : 0;
  const totalPages = Math.ceil(totalReturns / pageSize);

  const canAdjustCn = (ret: SaleReturn) => {
    const status = ret.credit_status || "";
    if (status === "refunded" || !ret.customer_id) return false;
    if (status === "adjusted" && ret.linked_sale_id) {
      const remaining = ret.remaining_cn_amt ?? 0;
      if (remaining <= 0) return false;
    }
    return getAvailableCN(ret) > 0;
  };

  const canRefundCn = (ret: SaleReturn) => {
    const status = (ret.credit_status || "").toLowerCase();
    if (status === "refunded" || status === "adjusted") return false;
    if (
      status !== "pending" &&
      status !== "partially_adjusted" &&
      status !== "Credit Note Pending".toLowerCase()
    ) {
      return false;
    }
    const refundableAmt = getAvailableCN(ret);
    return refundableAmt > 0 && !!ret.customer_id;
  };

  const saleReturnDialogs = (
    <>
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Sale Return?</AlertDialogTitle>
              <AlertDialogDescription>
                This will move the return to Recycle Bin. Stock will be automatically reversed.
                You can permanently delete it later from the Recycle Bin.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {selectedReturnForAdjust && (
          <AdjustCustomerCreditNoteDialog
            open={showAdjustDialog}
            onOpenChange={setShowAdjustDialog}
            saleReturnId={selectedReturnForAdjust.id}
            creditNoteId={selectedReturnForAdjust.credit_note_id || ""}
            returnNumber={selectedReturnForAdjust.return_number || "N/A"}
            creditAmount={(() => {
              const r = selectedReturnForAdjust;
              const live = getAvailableCN(r);
              return live > 0 ? live : Number(r.net_amount);
            })()}
            customerId={selectedReturnForAdjust.customer_id || ""}
            customerName={selectedReturnForAdjust.customer_name}
            onSuccess={() => refetchReturns()}
          />
        )}

        <div style={{ display: "none" }}>
          {returnToPrint && businessDetails && (
            isThermal ? (
              <SaleReturnThermalPrint
                ref={printRef}
                saleReturn={returnToPrint}
                businessDetails={businessDetails}
              />
            ) : (
              <SaleReturnPrint
                ref={printRef}
                saleReturn={returnToPrint}
                businessDetails={businessDetails}
              />
            )
          )}
        </div>

        <CreditNoteHistoryDialog
          open={showCnHistory}
          onOpenChange={setShowCnHistory}
          creditNoteId={selectedCnForHistory?.creditNoteId}
          saleReturnId={selectedCnForHistory?.saleReturnId}
          organizationId={currentOrganization?.id}
        />

        <Dialog open={showRefundDialog} onOpenChange={setShowRefundDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Refund Credit Note to Customer</DialogTitle>
              <DialogDescription>
                Refund available credit for {selectedReturnForRefund?.return_number || "this return"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="text-sm text-muted-foreground">
                Max refundable: ₹
                {(selectedReturnForRefund ? getAvailableCN(selectedReturnForRefund) : 0).toLocaleString("en-IN")}
              </div>
              <div className="space-y-2">
                <Label>Refund amount</Label>
                <Input
                  type="number"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  min={0}
                  max={selectedReturnForRefund ? getAvailableCN(selectedReturnForRefund) : 0}
                />
              </div>
              <div className="space-y-2">
                <Label>Payment mode</Label>
                <Select value={refundMode} onValueChange={(v: "cash" | "upi" | "card") => setRefundMode(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Note (optional)</Label>
                <Textarea
                  value={refundNote}
                  onChange={(e) => setRefundNote(e.target.value)}
                  placeholder="Reason for refund..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRefundDialog(false)}>
                Cancel
              </Button>
              <Button
                disabled={isProcessingRefund || !refundAmount || parseFloat(refundAmount) <= 0}
                onClick={async () => {
                  if (!selectedReturnForRefund || !currentOrganization?.id) return;
                  const amount = parseFloat(refundAmount);
                  if (!amount || amount <= 0) return;
                  const maxRef = getAvailableCN(selectedReturnForRefund);
                  if (amount > maxRef + 0.01) {
                    toast({
                      title: "Invalid amount",
                      description: `Refund cannot exceed ₹${maxRef.toLocaleString("en-IN")}.`,
                      variant: "destructive",
                    });
                    return;
                  }
                  if (!selectedReturnForRefund.customer_id) {
                    toast({
                      title: "Refund failed",
                      description: "This return has no linked customer.",
                      variant: "destructive",
                    });
                    return;
                  }
                  setIsProcessingRefund(true);
                  try {
                    const {
                      data: { user },
                    } = await supabase.auth.getUser();
                    const refundDate = new Date().toISOString().split("T")[0];
                    const { data: rfNumber, error: rfNumErr } = await supabase.rpc(
                      "generate_voucher_number",
                      { p_type: "cn_refund", p_date: refundDate },
                    );
                    if (rfNumErr) throw rfNumErr;
                    const noteSuffix = refundNote.trim() ? ` — ${refundNote.trim()}` : "";
                    const returnNo = selectedReturnForRefund.return_number || "sale return";
                    const { error: voucherError } = await supabase.from("voucher_entries").insert({
                      organization_id: currentOrganization.id,
                      voucher_type: "payment",
                      voucher_number: String(rfNumber || `RF/${refundDate}`),
                      voucher_date: refundDate,
                      reference_type: "customer",
                      reference_id: selectedReturnForRefund.customer_id,
                      total_amount: amount,
                      payment_method: refundMode,
                      description: `Credit note refund for ${returnNo} to ${selectedReturnForRefund.customer_name}${noteSuffix}`,
                      created_by: user?.id || null,
                    });
                    if (voucherError) throw voucherError;

                    const remaining = Math.max(0, maxRef - amount);
                    const { error: srError } = await supabase
                      .from("sale_returns")
                      .update({
                        credit_status: remaining <= 0.01 ? "refunded" : selectedReturnForRefund.credit_status,
                        credit_available_balance: remaining <= 0.01 ? 0 : remaining,
                      })
                      .eq("id", selectedReturnForRefund.id);
                    if (srError) throw srError;

                    toast({
                      title: "Refund recorded",
                      description: `₹${amount.toLocaleString("en-IN")} refunded to ${selectedReturnForRefund.customer_name}`,
                    });
                    setShowRefundDialog(false);
                    queryClient.invalidateQueries({ queryKey: ["sale-returns"] });
                    queryClient.invalidateQueries({ queryKey: ["sale-returns-summary"] });
                    queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
                    queryClient.invalidateQueries({ queryKey: ["customer-transactions"] });
                    queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
                    queryClient.invalidateQueries({ queryKey: ["customer-ledger-cn-refunds"] });
                  } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err);
                    toast({ title: "Refund failed", description: message, variant: "destructive" });
                  } finally {
                    setIsProcessingRefund(false);
                  }
                }}
              >
                {isProcessingRefund ? "Processing..." : "Record Refund"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </>
  );

  if (isMobile) {
    return (
      <>
        <div className="flex flex-col min-h-screen bg-muted/30 pb-8">
          <MobilePageHeader
            title="Sale Returns"
            subtitle={`${totalReturns} returns`}
            rightContent={
              <button
                type="button"
                onClick={() => navigate("/sale-return-entry")}
                className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-sm active:scale-90 touch-manipulation"
              >
                <Plus className="h-5 w-5 text-primary-foreground" />
              </button>
            }
          />

          <div className="px-4 pt-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search return, customer, sale..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-10 bg-card border-border/60 rounded-xl text-sm"
              />
            </div>
          </div>

          <MobileStatStrip
            stats={[
              { label: "Returns", value: String(totalReturns), color: "text-blue-600", bg: "bg-blue-50" },
              { label: "Value", value: `₹${Math.round(totalValue).toLocaleString("en-IN")}`, color: "text-orange-600", bg: "bg-orange-50" },
              { label: "Qty", value: String(totalQty), color: "text-violet-600", bg: "bg-violet-50" },
              { label: "Avg", value: `₹${Math.round(averageValue).toLocaleString("en-IN")}`, color: "text-rose-600", bg: "bg-rose-50" },
            ]}
          />

          <div className="flex gap-2 px-4 py-2 overflow-x-auto no-scrollbar">
            {[
              { v: "all", l: "All" },
              { v: "pending", l: "Pending" },
              { v: "partially_adjusted", l: "Partial" },
              { v: "adjusted", l: "Adjusted" },
              { v: "refunded", l: "Refunded" },
            ].map((s) => (
              <button
                key={s.v}
                type="button"
                onClick={() => { setStatusFilter(s.v); setCurrentPage(1); }}
                className={cn(
                  "flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-all touch-manipulation",
                  statusFilter === s.v ? "bg-foreground text-background border-transparent" : "bg-card text-muted-foreground border-border"
                )}
              >
                {s.l}
              </button>
            ))}
          </div>

          <div className="flex-1 px-4 space-y-2.5 pb-4">
            {returnsLoading ? (
              Array.from({ length: 5 }).map((_, i) => <MobileListCardSkeleton key={i} />)
            ) : returns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Receipt className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">No returns found</p>
              </div>
            ) : (
              returns.map((ret) => (
                <MobileListCard
                  key={ret.id}
                  title={ret.return_number || "Return"}
                  subtitle={
                    <>
                      <button
                        type="button"
                        className="text-primary font-medium"
                        onClick={(e) => {
                          e.stopPropagation();
                          openCustomerAccount(ret.customer_id, ret.customer_name);
                        }}
                      >
                        {ret.customer_name}
                      </button>
                      {ret.original_sale_number ? ` · ${ret.original_sale_number}` : null}
                    </>
                  }
                  badge={
                    <Badge variant="outline" className="text-[10px]">
                      {formatCreditStatusLabel(ret)}
                    </Badge>
                  }
                  amount={
                    <div className="text-sm font-bold tabular-nums">
                      ₹{ret.net_amount.toLocaleString("en-IN")}
                    </div>
                  }
                  meta={
                    <>
                      <span>{format(new Date(ret.return_date), "dd MMM yyyy")}</span>
                      {ret.credit_note_number ? (
                        <button
                          type="button"
                          className="text-primary font-medium block text-left"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCnHistory(ret);
                          }}
                        >
                          CN: {ret.credit_note_number}
                        </button>
                      ) : (ret.refund_type === "credit_note" || !ret.refund_type) ? (
                        <button
                          type="button"
                          className="text-muted-foreground underline text-left text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCnHistory(ret);
                          }}
                        >
                          View CN history
                        </button>
                      ) : null}
                      {(ret.remaining_cn_amt ?? 0) > 0 ? (
                        <span className="text-amber-600 block">
                          ₹{ret.remaining_cn_amt!.toLocaleString("en-IN")} CN remaining
                        </span>
                      ) : null}
                    </>
                  }
                  footer={
                    <>
                      <button
                        type="button"
                        onClick={() => navigate(`/sale-return-entry/${ret.id}`)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-blue-600 active:bg-blue-50 touch-manipulation"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      {canAdjustCn(ret) && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedReturnForAdjust(ret);
                            setShowAdjustDialog(true);
                          }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-purple-600 active:bg-purple-50 touch-manipulation"
                        >
                          <CreditCard className="h-3.5 w-3.5" />
                          Adjust
                        </button>
                      )}
                      {canRefundCn(ret) && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedReturnForRefund(ret);
                            setRefundAmount(getAvailableCN(ret).toFixed(2));
                            setRefundNote("");
                            setRefundMode("cash");
                            setShowRefundDialog(true);
                          }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-emerald-600 active:bg-emerald-50 touch-manipulation"
                        >
                          <Banknote className="h-3.5 w-3.5" />
                          Refund
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handlePrintClick(ret)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-muted-foreground active:bg-muted/50 touch-manipulation"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Print
                      </button>
                    </>
                  }
                />
              ))
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 bg-card border-t border-border mx-4 rounded-xl mb-4">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                Prev
              </Button>
              <span className="text-xs text-muted-foreground">Page {currentPage} of {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                Next
              </Button>
            </div>
          )}
        </div>
        {saleReturnDialogs}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-2 sm:px-3 md:px-4 lg:px-5 py-6 pb-24 lg:pb-6">
      <div className="w-full min-w-0 max-w-none space-y-5">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h1 className="text-3xl font-extrabold text-blue-600 tracking-tight leading-tight">
              Sale Returns
            </h1>
            <p className="text-slate-400 text-base mt-0.5">View and manage all sale returns</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleExportExcel}
              className="gap-2 h-10 text-base border-slate-300 text-slate-600 hover:bg-slate-100 font-medium"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export Excel
            </Button>
            <Button
              onClick={() => navigate("/sale-return-entry")}
              className="h-10 px-5 text-base font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg transition-all"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Return
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
          <Card className="cursor-pointer hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-md rounded-xl min-w-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
              <CardDescription className="text-base font-medium text-white/80">Total Returns</CardDescription>
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <Receipt className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <div className="text-2xl font-black text-white tabular-nums leading-tight truncate">{totalReturns}</div>
              <p className="text-sm text-white/65 mt-0.5">All return records</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br from-orange-500 to-orange-600 border-0 shadow-md rounded-xl min-w-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
              <CardDescription className="text-base font-medium text-white/80">Total Return Value</CardDescription>
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <TrendingDown className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <div className="text-2xl font-black text-white tabular-nums leading-tight truncate">
                ₹{Math.round(totalValue).toLocaleString("en-IN")}
              </div>
              <p className="text-sm text-white/65 mt-0.5">Net refund value</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br from-violet-500 to-violet-600 border-0 shadow-md rounded-xl min-w-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
              <CardDescription className="text-base font-medium text-white/80">Total Qty</CardDescription>
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <Package className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <div className="text-2xl font-black text-white tabular-nums leading-tight truncate">{totalQty}</div>
              <p className="text-sm text-white/65 mt-0.5">Items returned</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br from-rose-500 to-rose-600 border-0 shadow-md rounded-xl min-w-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
              <CardDescription className="text-base font-medium text-white/80">Average Return Value</CardDescription>
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <IndianRupee className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <div className="text-2xl font-black text-white tabular-nums leading-tight truncate">
                ₹{Math.round(averageValue).toLocaleString("en-IN")}
              </div>
              <p className="text-sm text-white/65 mt-0.5">Per return</p>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-xl border border-slate-200 shadow-sm overflow-hidden p-0">
          <div className="space-y-0">
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-white overflow-x-auto">
              <div className="relative flex-1 min-w-[180px] max-w-full sm:max-w-md md:max-w-lg lg:max-w-xl">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  placeholder="Search return no, customer, product, barcode..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-11 h-10 text-base border-slate-200 bg-slate-50 focus:bg-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-500 whitespace-nowrap">From</label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-[150px] h-10 text-base border-slate-200 bg-slate-50 focus:bg-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-500 whitespace-nowrap">To</label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-[150px] h-10 text-base border-slate-200 bg-slate-50 focus:bg-white"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[165px] h-10 text-base border-slate-200 bg-slate-50 hover:bg-white">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="adjusted">Adjusted</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                  <SelectItem value="adjusted_outstanding">Adj. Outstanding</SelectItem>
                  <SelectItem value="partially_adjusted">Partially Adjusted</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => handlePrintTable()}
                className="h-10 text-base border-slate-200 bg-slate-50 hover:bg-white gap-2"
              >
                <Printer className="h-4 w-4" />
                Print
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0 border-slate-200 bg-slate-50 hover:bg-white"
                    title="Column Settings"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 bg-popover z-50" align="end">
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm">Show/Hide Columns</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="sr-col-phone" className="text-sm">Phone</Label>
                        <Checkbox
                          id="sr-col-phone"
                          checked={columnSettings.phone}
                          onCheckedChange={(checked) => updateColumnSetting("phone", !!checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="sr-col-original-sale" className="text-sm">Original Sale</Label>
                        <Checkbox
                          id="sr-col-original-sale"
                          checked={columnSettings.originalSale}
                          onCheckedChange={(checked) => updateColumnSetting("originalSale", !!checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="sr-col-gross" className="text-sm">Gross</Label>
                        <Checkbox
                          id="sr-col-gross"
                          checked={columnSettings.gross}
                          onCheckedChange={(checked) => updateColumnSetting("gross", !!checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="sr-col-gst" className="text-sm">GST</Label>
                        <Checkbox
                          id="sr-col-gst"
                          checked={columnSettings.gst}
                          onCheckedChange={(checked) => updateColumnSetting("gst", !!checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="sr-col-adj-invoice" className="text-sm">Adj. Invoice</Label>
                        <Checkbox
                          id="sr-col-adj-invoice"
                          checked={columnSettings.adjInvoice}
                          onCheckedChange={(checked) => updateColumnSetting("adjInvoice", !!checked)}
                        />
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain px-4 pb-4">
              <div ref={tableRef}>
                {loading || returnsLoading ? (
                  <div className="py-6">
                    <TableSkeleton rows={8} columns={12} />
                  </div>
                ) : returns.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-base">No returns found</div>
                ) : (
                  <Table className="w-full min-w-0 table-fixed border-collapse text-base [&_thead_th]:!px-2 [&_tbody_td]:!px-2 [&_thead_th]:!py-2 [&_tbody_td]:!py-2 [&_thead_th]:text-base [&_tbody_td]:text-sm [&_tbody_td]:align-middle [&_tbody_td]:leading-snug">
                    <colgroup>
                      <col className="w-10 print:hidden" />
                      <col className="w-[7.5rem]" />
                      <col className="w-[5.75rem]" />
                      <col className="w-[9rem]" />
                      {columnSettings.phone && <col className="w-[5.5rem]" />}
                      {columnSettings.originalSale && <col className="w-[6.5rem]" />}
                      <col className="w-[2.75rem]" />
                      {columnSettings.gross && <col className="w-[4.25rem]" />}
                      {columnSettings.gst && <col className="w-[3.75rem]" />}
                      <col className="w-[4.75rem]" />
                      <col className="w-[7.5rem]" />
                      <col className="w-[5.75rem]" />
                      {columnSettings.adjInvoice && <col className="w-[6rem]" />}
                      <col className="w-[4.75rem]" />
                      <col className="w-[5.75rem]" />
                      <col className="w-[8rem]" />
                    </colgroup>
                    <TableHeader className="!static">
                      <TableRow>
                        <TableHead className="w-10 px-1 print:hidden" />
                        <TableHead className="font-semibold text-left">Return No</TableHead>
                        <TableHead className="font-semibold text-left whitespace-nowrap">Date</TableHead>
                        <TableHead className="font-semibold text-left">Customer</TableHead>
                        {columnSettings.phone && (
                          <TableHead className="font-semibold text-left whitespace-nowrap">Phone</TableHead>
                        )}
                        {columnSettings.originalSale && (
                          <TableHead className="font-semibold text-left whitespace-nowrap">Original Sale</TableHead>
                        )}
                        <TableHead className="text-center font-semibold px-1">Qty</TableHead>
                        {columnSettings.gross && (
                          <TableHead className="text-right font-semibold whitespace-nowrap">Gross</TableHead>
                        )}
                        {columnSettings.gst && (
                          <TableHead className="text-right font-semibold whitespace-nowrap">GST</TableHead>
                        )}
                        <TableHead className="text-right font-semibold whitespace-nowrap">Net Amt</TableHead>
                        <TableHead className="font-semibold text-left px-1">Status</TableHead>
                        <TableHead className="font-semibold text-left whitespace-nowrap">Credit Note</TableHead>
                        {columnSettings.adjInvoice && (
                          <TableHead className="font-semibold text-left whitespace-nowrap">Adj. Invoice</TableHead>
                        )}
                        <TableHead className="text-right font-semibold whitespace-nowrap">Adj. Amt</TableHead>
                        <TableHead className="font-semibold text-left whitespace-nowrap">Settlement</TableHead>
                        <TableHead className="text-right font-semibold print:hidden px-1">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {returns.map((ret) => (
                        <>
                          <TableRow key={ret.id} className="cursor-pointer hover:bg-accent/50">
                            <TableCell className="print:hidden">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleRow(ret.id)}>
                                {expandedRows.has(ret.id) ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </Button>
                            </TableCell>
                            <TableCell className="font-medium align-middle whitespace-nowrap">
                              <span
                                className="text-primary cursor-pointer hover:underline"
                                onClick={() => toggleRow(ret.id)}
                              >
                                {ret.return_number || "-"}
                              </span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap align-middle" onClick={() => toggleRow(ret.id)}>
                              {format(new Date(ret.return_date), "dd/MM/yyyy")}
                            </TableCell>
                            <TableCell
                              className="cursor-pointer text-blue-600 hover:underline align-middle max-w-[9rem] truncate"
                              title={ret.customer_name?.toUpperCase()}
                              onClick={(e) => {
                                e.stopPropagation();
                                openCustomerAccount(ret.customer_id, ret.customer_name);
                              }}
                            >
                              {ret.customer_name?.toUpperCase()}
                            </TableCell>
                            {columnSettings.phone && (
                              <TableCell onClick={() => toggleRow(ret.id)}>{ret.customer_phone || "-"}</TableCell>
                            )}
                            {columnSettings.originalSale && (
                              <TableCell onClick={() => toggleRow(ret.id)}>
                                {ret.original_sale_number ? (
                                  <span className="text-sm text-foreground/80">{ret.original_sale_number}</span>
                                ) : (
                                  "-"
                                )}
                              </TableCell>
                            )}
                            <TableCell className="text-center" onClick={() => toggleRow(ret.id)}>
                              {ret.total_qty || 0}
                            </TableCell>
                            {columnSettings.gross && (
                              <TableCell className="text-right" onClick={() => toggleRow(ret.id)}>
                                ₹{Math.round(ret.gross_amount).toLocaleString("en-IN")}
                              </TableCell>
                            )}
                            {columnSettings.gst && (
                              <TableCell className="text-right" onClick={() => toggleRow(ret.id)}>
                                ₹{Math.round(ret.gst_amount).toLocaleString("en-IN")}
                              </TableCell>
                            )}
                            <TableCell className="text-right font-medium" onClick={() => toggleRow(ret.id)}>
                              ₹{Math.round(ret.net_amount).toLocaleString("en-IN")}
                            </TableCell>
                            <TableCell className="text-center" onClick={() => toggleRow(ret.id)}>
                              <Badge
                                className={cn(
                                  "min-w-0 max-w-full justify-center whitespace-normal text-center text-xs px-2 py-0.5 leading-tight",
                                  getCreditStatusBadgeClass(ret)
                                )}
                              >
                                {formatCreditStatusLabel(ret)}
                              </Badge>
                            </TableCell>
                        <TableCell>
                          {ret.credit_note_number ? (
                            <button
                              type="button"
                              className="text-primary hover:underline cursor-pointer bg-transparent border-none p-0 font-inherit text-left font-medium"
                              onClick={(e) => {
                                e.stopPropagation();
                                openCnHistory(ret);
                              }}
                            >
                              {ret.credit_note_number}
                            </button>
                          ) : (ret.refund_type === "credit_note" || !ret.refund_type) ? (
                            <button
                              type="button"
                              className="text-muted-foreground hover:underline text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                openCnHistory(ret);
                              }}
                            >
                              Pending
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                            {columnSettings.adjInvoice && (
                              <TableCell onClick={() => toggleRow(ret.id)}>
                                {ret.adjusted_sale_number ? (
                                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs px-2 py-0.5 font-normal">
                                    {ret.adjusted_sale_number}
                                    {ret.adjusted_sale_type === "pos" ? " (S/R)" : ""}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                            )}
                            <TableCell className="text-right font-medium" onClick={() => toggleRow(ret.id)}>
                              ₹{Math.round(ret.actual_adjusted_amt ?? ret.net_amount).toLocaleString("en-IN")}
                              {(ret.remaining_cn_amt ?? 0) > 0 && (
                                <span className="block text-xs text-amber-600 font-normal leading-tight">
                                  ₹{Math.round(ret.remaining_cn_amt!).toLocaleString("en-IN")} remaining
                                </span>
                              )}
                            </TableCell>
                        <TableCell>
                          {ret.refund_type === 'cash_refund' && (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700">
                              <Banknote className="h-3 w-3 mr-1" />
                              Cash Refund
                            </Badge>
                          )}
                          {ret.refund_type === 'exchange' && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700">
                              <ArrowLeftRight className="h-3 w-3 mr-1" />
                              Exchange
                            </Badge>
                          )}
                          {(ret.refund_type === 'credit_note' || !ret.refund_type) && (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700">
                              <CreditCard className="h-3 w-3 mr-1" />
                              Credit Note
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right print:hidden">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => navigate(`/sale-return-entry/${ret.id}`)}
                              title="Edit Return"
                            >
                              <Pencil className="h-4 w-4 text-blue-600" />
                            </Button>
                            {(() => {
                              const status = ret.credit_status || "";
                              if (status === "refunded") return false;
                              if (!ret.customer_id) return false;
                              if (status === "adjusted" && ret.linked_sale_id) {
                                const remaining = ret.remaining_cn_amt ?? 0;
                                if (remaining <= 0) return false;
                              }
                              return getAvailableCN(ret) > 0;
                            })() && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setSelectedReturnForAdjust(ret);
                                  setShowAdjustDialog(true);
                                }}
                                title="Adjust credit note (creates official CN on first apply if needed)"
                              >
                                <CreditCard className="h-4 w-4 text-purple-600" />
                              </Button>
                            )}
                            {(() => {
                              const status = (ret.credit_status || "").toLowerCase();
                              if (status === "refunded" || status === "adjusted") return null;
                              if (
                                status !== "pending" &&
                                status !== "partially_adjusted" &&
                                status !== "Credit Note Pending".toLowerCase()
                              )
                                return null;
                              const refundableAmt = getAvailableCN(ret);
                              if (refundableAmt <= 0 || !ret.customer_id) return null;
                              return (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setSelectedReturnForRefund(ret);
                                    setRefundAmount(refundableAmt.toFixed(2));
                                    setRefundNote("");
                                    setRefundMode("cash");
                                    setShowRefundDialog(true);
                                  }}
                                  title={`Refund ₹${refundableAmt.toLocaleString("en-IN")} to customer`}
                                >
                                  <Banknote className="h-4 w-4 text-green-600" />
                                </Button>
                              );
                            })()}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handlePrintClick(ret)}
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                            {expandedRows.has(ret.id) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setReturnToDelete(ret.id);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedRows.has(ret.id) && loadedItems[ret.id] && (
                        <TableRow>
                          <TableCell colSpan={tableColSpan} className="bg-muted/50">
                            <div className="p-4">
                              <h4 className="font-medium mb-2">Return Items:</h4>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Product</TableHead>
                                    <TableHead>Size</TableHead>
                                    <TableHead>Barcode</TableHead>
                                    <TableHead className="text-right">Qty</TableHead>
                                    <TableHead className="text-right">Price</TableHead>
                                    <TableHead className="text-right">GST%</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {loadedItems[ret.id].map((item) => (
                                    <TableRow key={item.id}>
                                      <TableCell>{item.product_name}</TableCell>
                                      <TableCell>{item.size}</TableCell>
                                      <TableCell>{item.barcode || "-"}</TableCell>
                                      <TableCell className="text-right">{item.quantity}</TableCell>
                                      <TableCell className="text-right">₹{item.unit_price.toFixed(2)}</TableCell>
                                      <TableCell className="text-right">{item.gst_percent}%</TableCell>
                                      <TableCell className="text-right">₹{item.line_total.toFixed(2)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                              {ret.notes && (
                                <div className="mt-4">
                                  <span className="font-medium">Notes: </span>
                                  <span className="text-muted-foreground">{ret.notes}</span>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
                {returns.length > 0 && (
                  <TableFooter className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 [&>tr]:border-0 [&>tr]:hover:bg-transparent">
                    <TableRow>
                      <TableCell className="print:hidden" />
                      <TableCell
                        colSpan={3 + (columnSettings.phone ? 1 : 0) + (columnSettings.originalSale ? 1 : 0)}
                        className="font-bold text-primary py-2.5"
                      >
                        GRAND TOTAL
                      </TableCell>
                      <TableCell className="text-center font-bold tabular-nums py-2.5">
                        {totalQty.toLocaleString("en-IN")}
                      </TableCell>
                      {columnSettings.gross && (
                        <TableCell className="text-right font-bold tabular-nums py-2.5">
                          ₹{Math.round(totalGross).toLocaleString("en-IN")}
                        </TableCell>
                      )}
                      {columnSettings.gst && (
                        <TableCell className="text-right font-bold tabular-nums py-2.5">
                          ₹{Math.round(totalGst).toLocaleString("en-IN")}
                        </TableCell>
                      )}
                      <TableCell className="text-right font-bold tabular-nums py-2.5">
                        ₹{Math.round(totalValue).toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell
                        colSpan={5 + (columnSettings.adjInvoice ? 1 : 0)}
                        className="print:[display:none]"
                      />
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
                )}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-0 py-3 border-t border-slate-100 mt-2">
                  <div className="text-sm text-slate-500">
                    Showing {(currentPage - 1) * pageSize + 1} to{" "}
                    {Math.min(currentPage * pageSize, totalReturns)} of {totalReturns} returns
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="h-9 text-sm px-3 border-slate-200"
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-slate-600 font-medium flex items-center px-2">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="h-9 text-sm px-3 border-slate-200"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

        {saleReturnDialogs}
      </div>
    </div>
  );
}
