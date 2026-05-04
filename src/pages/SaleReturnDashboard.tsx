import { useState, useEffect, useRef, useMemo } from "react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { supabase } from "@/integrations/supabase/client";
import { deleteLedgerEntries } from "@/lib/customerLedger";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp, Printer, Trash2, Plus, Search, Receipt, TrendingDown, IndianRupee, CreditCard, Banknote, ArrowLeftRight, Pencil, Download, CalendarIcon } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useReactToPrint } from "react-to-print";
import { SaleReturnPrint } from "@/components/SaleReturnPrint";
import { SaleReturnThermalPrint } from "@/components/SaleReturnThermalPrint";
import { useSoftDelete } from "@/hooks/useSoftDelete";
import { AdjustCustomerCreditNoteDialog } from "@/components/AdjustCustomerCreditNoteDialog";
import { CustomerHistoryDialog } from "@/components/CustomerHistoryDialog";
import { format } from "date-fns";
import * as XLSX from "xlsx";

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

const formatCreditStatusLabel = (ret: SaleReturn) => {
  if (ret.credit_status === "refunded") return "Refunded to Customer";
  if (ret.credit_status === "adjusted_outstanding") return "Adjusted to Customer Outstanding";
  if (ret.credit_status === "partially_adjusted") return "CN Partially Applied to Invoice(s)";
  if (ret.credit_status === "adjusted" && ret.linked_sale_id) return "S/R Adjusted in Invoice";
  if (ret.credit_status === "adjusted") return "Credit Note Generated";
  if (ret.credit_status === "pending") return "Credit Note Pending";
  return "Pending";
};

export default function SaleReturnDashboard() {
  const { orgNavigate: navigate } = useOrgNavigation();
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

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

  const [returnToPrint, setReturnToPrint] = useState<SaleReturn | null>(null);
  const [businessDetails, setBusinessDetails] = useState<BusinessDetails | null>(null);
  const [billFormat, setBillFormat] = useState<string>('a4');
  const printRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Credit note adjustment dialog states
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [selectedReturnForAdjust, setSelectedReturnForAdjust] = useState<SaleReturn | null>(null);
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  const [selectedCustomerForHistory, setSelectedCustomerForHistory] = useState<{id: string | null; name: string} | null>(null);
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
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset page on filter change
  useEffect(() => {
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
      const linkedSaleMap: Record<string, { sale_number: string; sale_type: string | null }> = {};
      if (linkedSaleIds.length > 0) {
        const { data: linkedSales } = await supabase
          .from("sales")
          .select("id, sale_number, sale_type")
          .in("id", linkedSaleIds);
        (linkedSales || []).forEach((s: any) => {
          linkedSaleMap[s.id] = { sale_number: s.sale_number, sale_type: s.sale_type || null };
        });
      }

      const enriched = returnsList.map(r => ({
        ...r,
        customer_phone: r.customer_id ? customerPhoneMap[r.customer_id] || null : null,
        total_qty: qtyMap[r.id] || 0,
        adjusted_sale_number: r.linked_sale_id ? linkedSaleMap[r.linked_sale_id]?.sale_number || null : null,
        adjusted_sale_type: r.linked_sale_id ? linkedSaleMap[r.linked_sale_id]?.sale_type || null : null,
      }));

      return { returns: enriched, totalCount: count || 0 };
    },
    enabled: !!currentOrganization?.id,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const returns = returnsData?.returns || [];

  const { data: summaryData } = useQuery({
    queryKey: ["sale-returns-summary", currentOrganization?.id, debouncedSearch, fromDate, toDate, statusFilter],
    queryFn: async () => {
      if (!currentOrganization?.id) return { totalReturns: 0, totalValue: 0, totalQty: 0 };

      let query = supabase
        .from("sale_returns")
        .select("id, net_amount", { count: "exact" })
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);

      if (fromDate) query = query.gte("return_date", fromDate);
      if (toDate) query = query.lte("return_date", toDate);
      if (statusFilter && statusFilter !== "all") query = query.eq("credit_status", statusFilter);

      if (debouncedSearch) {
        const searchStr = debouncedSearch.trim();
        const { data: matchingItems } = await supabase
          .from("sale_return_items")
          .select("return_id")
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

      const { data, count, error } = await query;
      if (error) throw error;
      const rows = data || [];
      const totalValue = rows.reduce((sum: number, row: any) => sum + Number(row.net_amount || 0), 0);

      let totalQty = 0;
      const returnIds = rows.map((r: any) => r.id).filter(Boolean);
      if (returnIds.length > 0) {
        const { data: items } = await supabase
          .from("sale_return_items")
          .select("quantity")
          .in("return_id", returnIds);
        totalQty = (items || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
      }

      return { totalReturns: count || 0, totalValue, totalQty };
    },
    enabled: !!currentOrganization?.id,
    staleTime: 30000,
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
  const averageValue = totalReturns > 0 ? totalValue / totalReturns : 0;
  const totalPages = Math.ceil(totalReturns / pageSize);

  return (
    <div className="w-full px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Sale Returns</h1>
          <Button onClick={() => navigate("/sale-return-entry")}>
            <Plus className="h-4 w-4 mr-2" />
            New Return
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-sm font-medium text-white/80">Total Returns</CardDescription>
              <Receipt className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{totalReturns}</div>
              <p className="text-xs text-white/70">All return records</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-orange-500 to-orange-600 border-0 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-sm font-medium text-white/80">Total Return Value</CardDescription>
              <TrendingDown className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">₹{totalValue.toFixed(0)}</div>
              <p className="text-xs text-white/70">Net refund value</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-violet-500 to-violet-600 border-0 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-sm font-medium text-white/80">Total Qty</CardDescription>
              <Receipt className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{totalQty}</div>
              <p className="text-xs text-white/70">Items returned</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-rose-500 to-rose-600 border-0 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-sm font-medium text-white/80">Average Return Value</CardDescription>
              <IndianRupee className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">₹{averageValue.toFixed(0)}</div>
              <p className="text-xs text-white/70">Per return</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search return no, customer, product, barcode..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground whitespace-nowrap">From</label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-[150px]"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground whitespace-nowrap">To</label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-[150px]"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
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
              <Button variant="outline" size="sm" onClick={handleExportExcel}>
                <Download className="h-4 w-4 mr-1" />
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => handlePrintTable()}>
                <Printer className="h-4 w-4 mr-1" />
                Print
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div ref={tableRef}>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : returns.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No returns found</div>
            ) : (
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-black backdrop-blur supports-[backdrop-filter]:bg-black [&_th]:text-white [&_th]:font-bold">
                  <TableRow>
                    <TableHead className="w-12 print:hidden text-[13px] font-semibold"></TableHead>
                    <TableHead className="text-[13px] font-semibold">Return No</TableHead>
                    <TableHead className="text-[13px] font-semibold">Date</TableHead>
                    <TableHead className="text-[13px] font-semibold">Customer</TableHead>
                    <TableHead className="text-[13px] font-semibold">Mobile</TableHead>
                    <TableHead className="text-[13px] font-semibold">Original Sale No</TableHead>
                    <TableHead className="text-right text-[13px] font-semibold">Qty</TableHead>
                    <TableHead className="text-right text-[13px] font-semibold">Gross</TableHead>
                    <TableHead className="text-right text-[13px] font-semibold">GST</TableHead>
                    <TableHead className="text-right text-[13px] font-semibold">Net Amount</TableHead>
                    <TableHead className="text-[13px] font-semibold">Status</TableHead>
                    <TableHead className="text-[13px] font-semibold">Adjusted In Invoice</TableHead>
                    <TableHead className="text-right text-[13px] font-semibold">Adjusted Amt</TableHead>
                    <TableHead className="text-[13px] font-semibold">Settlement</TableHead>
                    <TableHead className="text-right print:hidden text-[13px] font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returns.map((ret) => (
                    <>
                      <TableRow key={ret.id} className="text-[13px] md:text-sm">
                        <TableCell className="print:hidden">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleRow(ret.id)}
                          >
                            {expandedRows.has(ret.id) ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{ret.return_number || "-"}</Badge>
                        </TableCell>
                        <TableCell>{new Date(ret.return_date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <button
                            className="text-primary hover:underline cursor-pointer bg-transparent border-none p-0 font-inherit text-left"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCustomerForHistory({ id: ret.customer_id, name: ret.customer_name });
                              setShowCustomerHistory(true);
                            }}
                          >
                            {ret.customer_name}
                          </button>
                        </TableCell>
                        <TableCell className="text-[13px] md:text-sm">{ret.customer_phone || "-"}</TableCell>
                        <TableCell>
                          {ret.original_sale_number ? (
                            <Badge variant="outline">{ret.original_sale_number}</Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right">{ret.total_qty || 0}</TableCell>
                        <TableCell className="text-right">₹{ret.gross_amount.toFixed(2)}</TableCell>
                        <TableCell className="text-right">₹{ret.gst_amount.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-medium">₹{ret.net_amount.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[12px] bg-slate-50 text-slate-700 border-slate-300">
                            {formatCreditStatusLabel(ret)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {ret.adjusted_sale_number ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300">
                              {ret.adjusted_sale_number} {ret.adjusted_sale_type === 'pos' ? '(S/R Adjusted)' : ''}
                            </Badge>
                          ) : ret.original_sale_number ? (
                            <Badge variant="outline">{ret.original_sale_number}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-[13px]">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">₹{ret.net_amount.toFixed(2)}</TableCell>
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
                            {(!["adjusted", "adjusted_outstanding", "refunded"].includes(ret.credit_status || "") &&
                              (ret.credit_status === "pending" ||
                                ret.credit_status === "partially_adjusted" ||
                                !ret.credit_status)) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setSelectedReturnForAdjust(ret);
                                  setShowAdjustDialog(true);
                                }}
                                title="Adjust Credit Note"
                              >
                                <CreditCard className="h-4 w-4 text-purple-600" />
                              </Button>
                            )}
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
                          <TableCell colSpan={15} className="bg-muted/50">
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
              </Table>
            )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages} ({totalReturns} total)
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Previous</Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

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

        {/* Credit Note Adjustment Dialog */}
        {selectedReturnForAdjust && (
          <AdjustCustomerCreditNoteDialog
            open={showAdjustDialog}
            onOpenChange={setShowAdjustDialog}
            saleReturnId={selectedReturnForAdjust.id}
            creditNoteId={selectedReturnForAdjust.credit_note_id || ""}
            returnNumber={selectedReturnForAdjust.return_number || "N/A"}
            creditAmount={
              selectedReturnForAdjust.credit_available_balance != null &&
              !Number.isNaN(Number(selectedReturnForAdjust.credit_available_balance))
                ? Number(selectedReturnForAdjust.credit_available_balance)
                : selectedReturnForAdjust.net_amount
            }
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

        <CustomerHistoryDialog
          open={showCustomerHistory}
          onOpenChange={setShowCustomerHistory}
          customerId={selectedCustomerForHistory?.id || null}
          customerName={selectedCustomerForHistory?.name || ''}
          organizationId={currentOrganization?.id || ''}
        />
      </div>
  );
}
