import { useState, useEffect, useRef } from "react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useQuery } from "@tanstack/react-query";
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
}

const PurchaseReturnDashboard = () => {
  const { toast } = useToast();
  const { orgNavigate: navigate } = useOrgNavigation();
  const { currentOrganization } = useOrganization();
  const [returns, setReturns] = useState<PurchaseReturn[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [startDate, endDate]);

  // Server-side paginated query
  const { data: returnsData, isLoading: returnsLoading, refetch: refetchReturns } = useQuery({
    queryKey: ["purchase-returns", currentOrganization?.id, debouncedSearch, startDate, endDate, dcFilter, currentPage, pageSize],
    queryFn: async () => {
      if (!currentOrganization?.id) return { returns: [], totalCount: 0 };

      const startIndex = (currentPage - 1) * pageSize;
      const endIndex = startIndex + pageSize - 1;

      let query = supabase
        .from("purchase_returns" as any)
        .select("id, return_number, return_date, supplier_name, supplier_id, original_bill_number, gross_amount, is_dc, gst_amount, net_amount, notes, created_at, credit_note_id, credit_status, linked_bill_id", { count: "exact" })
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);

      if (dcFilter === "dc") query = query.eq("is_dc", true);
      if (dcFilter === "gst") query = query.eq("is_dc", false);

      if (debouncedSearch) {
        query = query.or(`supplier_name.ilike.%${debouncedSearch}%,original_bill_number.ilike.%${debouncedSearch}%,return_number.ilike.%${debouncedSearch}%`);
      }
      if (startDate) query = query.gte("return_date", startDate);
      if (endDate) query = query.lte("return_date", endDate);

      query = query.order("return_date", { ascending: false }).range(startIndex, endIndex);

      const { data, error, count } = await query;
      if (error) throw error;
      
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
        total_qty: qtyMap[r.id] || 0
      }));

      return { returns: returnsWithQty as unknown as PurchaseReturn[], totalCount: count || 0 };
    },
    enabled: !!currentOrganization?.id,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (returnsData) {
      setReturns(returnsData.returns);
      setLoading(false);
    }
  }, [returnsData]);

  useEffect(() => {
    if (returnsLoading && returns.length === 0) setLoading(true);
  }, [returnsLoading]);

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

  if (loading) {
    return (
      <div className="w-full px-6 py-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="w-full px-6 py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Purchase Return Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            View and manage all purchase return records
          </p>
        </div>
        <Button onClick={() => navigate("/purchase-return-entry")}>
          <Plus className="h-4 w-4 mr-2" />
          Create New Return
        </Button>
      </div>

      {/* Draft Resume Card */}
      {hasDraft && draftData && (
        <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-700 mb-4">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <div>
                  <CardTitle className="text-base text-amber-900 dark:text-amber-200">
                    Unsaved Purchase Return Draft
                  </CardTitle>
                  <CardDescription className="text-amber-700 dark:text-amber-400">
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
                  className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30"
                >
                  <X className="h-4 w-4" />
                  Discard
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    navigate("/purchase-return-entry", { state: { loadDraft: true } });
                  }}
                  className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <Edit className="h-4 w-4" />
                  Resume Draft
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Summary Cards - Vasy ERP Style Vibrant */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="text-sm font-medium text-white/80">Total Returns</CardDescription>
            <Receipt className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{filteredReturns.length}</div>
            <p className="text-xs text-white/70">All return records</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-red-500 to-red-600 border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="text-sm font-medium text-white/80">Total Return Amount</CardDescription>
            <TrendingDown className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">₹{totalReturnAmount.toFixed(0)}</div>
            <p className="text-xs text-white/70">Net refund value</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-violet-500 to-violet-600 border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="text-sm font-medium text-white/80">Average Return Value</CardDescription>
            <IndianRupee className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">₹{averageReturnValue.toFixed(0)}</div>
            <p className="text-xs text-white/70">Per return</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by return no., supplier or bill number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                placeholder="Start Date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                placeholder="End Date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">DC Filter</div>
              <select
                value={dcFilter}
                onChange={(e) => setDcFilter(e.target.value as any)}
                className="border rounded px-3 py-2 text-sm bg-background w-full"
              >
                <option value="all">All Returns</option>
                <option value="dc">DC Only</option>
                <option value="gst">GST Only</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedReturns.size > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {selectedReturns.size} return(s) selected
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBulkDeleteDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Returns Table */}
      <Card>
        <CardContent className="pt-6">
          {paginatedReturns.length === 0 ? (
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
                  <TableRow className="h-10">
                    <TableHead className="w-8 px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={selectedReturns.size === filteredReturns.length}
                        onChange={toggleSelectAll}
                        className="rounded"
                      />
                    </TableHead>
                    <TableHead className="px-2 py-1.5 text-[13px]">Ret. No.</TableHead>
                    <TableHead className="px-2 py-1.5 text-[13px]">Date</TableHead>
                    <TableHead className="px-2 py-1.5 text-[13px]">Supplier</TableHead>
                    <TableHead className="px-2 py-1.5 text-[13px]">Orig. Bill</TableHead>
                    <TableHead className="px-2 py-1.5 text-[13px] text-right">Qty</TableHead>
                    <TableHead className="px-2 py-1.5 text-[13px] text-right">Gross Amt</TableHead>
                    <TableHead className="px-2 py-1.5 text-[13px] text-right">GST</TableHead>
                    <TableHead className="px-2 py-1.5 text-[13px] text-right">Net Amt</TableHead>
                    <TableHead className="px-2 py-1.5 text-[13px]">Notes</TableHead>
                    <TableHead className="px-2 py-1.5 text-[13px]">Status</TableHead>
                    <TableHead className="px-2 py-1.5 text-[13px] text-right">Actions</TableHead>
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
                          <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                            {returnRecord.original_bill_number || "N/A"}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-sm text-right font-medium tabular-nums">
                          {returnRecord.total_qty || 0}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-sm text-right tabular-nums">
                          ₹{returnRecord.gross_amount.toFixed(2)}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-sm text-right tabular-nums">
                          {returnRecord.is_dc ? (
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-orange-500 text-xs font-medium">DC</span>
                              <span className="text-xs text-muted-foreground">₹0.00</span>
                            </div>
                          ) : (
                            <span>₹{returnRecord.gst_amount.toFixed(2)}</span>
                          )}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-sm text-right font-semibold tabular-nums text-primary">
                          ₹{returnRecord.net_amount.toFixed(2)}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-sm max-w-[120px] truncate">
                          {returnRecord.notes || "-"}
                        </TableCell>
                        <TableCell className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                          {returnRecord.credit_status === 'pending' && (
                            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300 text-xs px-1.5 py-0">
                              Pending
                            </Badge>
                          )}
                          {returnRecord.credit_status === 'adjusted' && (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 text-xs px-1.5 py-0">
                              Adjusted
                            </Badge>
                          )}
                          {returnRecord.credit_status === 'refunded' && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 text-xs px-1.5 py-0">
                              Refunded
                            </Badge>
                          )}
                          {returnRecord.credit_status === 'adjusted_outstanding' && (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300 text-xs px-1.5 py-0">
                              Adj. (O/S)
                            </Badge>
                          )}
                          {!returnRecord.credit_status && (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
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
                              onClick={() => navigate(`/purchase-return-entry?edit=${returnRecord.id}`)}
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
                          <TableCell colSpan={13} className="bg-muted/30 p-0">
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

          {/* Pagination */}
          {filteredReturns.length > 0 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="border rounded px-2 py-1 text-sm"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
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
          creditAmount={selectedReturnForAdjust.net_amount}
          supplierId={selectedReturnForAdjust.supplier_id || ""}
          supplierName={selectedReturnForAdjust.supplier_name}
          onSuccess={() => {
            fetchReturns();
            setSelectedReturnForAdjust(null);
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
