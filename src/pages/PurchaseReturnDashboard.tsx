import { useState, useEffect, useRef } from "react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
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
import { ChevronDown, ChevronUp, Trash2, Search, Calendar, Package, TrendingDown, Plus, Printer, Receipt, IndianRupee, Edit } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { PurchaseReturnPrint } from "@/components/PurchaseReturnPrint";
import { SupplierHistoryDialog } from "@/components/SupplierHistoryDialog";
import { useSoftDelete } from "@/hooks/useSoftDelete";

interface PurchaseReturnItem {
  id: string;
  product_id: string;
  size: string;
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
  gst_amount: number;
  net_amount: number;
  notes?: string;
  created_at: string;
  items?: PurchaseReturnItem[];
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
  const [expandedReturns, setExpandedReturns] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [returnToDelete, setReturnToDelete] = useState<PurchaseReturn | null>(null);
  const [selectedReturns, setSelectedReturns] = useState<Set<string>>(new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [returnToPrint, setReturnToPrint] = useState<PurchaseReturn | null>(null);
  const [businessDetails, setBusinessDetails] = useState<any>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // Supplier history dialog states
  const [showSupplierHistory, setShowSupplierHistory] = useState(false);
  const [selectedSupplierForHistory, setSelectedSupplierForHistory] = useState<{id: string; name: string} | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    if (currentOrganization?.id) {
      fetchReturns();
      fetchBusinessDetails();
    }
  }, [currentOrganization]);

  const fetchBusinessDetails = async () => {
    if (!currentOrganization?.id) return;
    try {
      const { data, error } = await supabase
        .from("settings")
        .select("business_name, address, mobile_number, gst_number")
        .eq("organization_id", currentOrganization.id)
        .single();

      if (error) throw error;
      setBusinessDetails(data);
    } catch (error) {
      console.error("Error fetching business details:", error);
    }
  };

  const fetchReturns = async () => {
    if (!currentOrganization?.id) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("purchase_returns" as any)
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .order("return_date", { ascending: false });

      if (error) throw error;
      setReturns((data || []) as unknown as PurchaseReturn[]);
    } catch (error) {
      console.error("Error fetching purchase returns:", error);
      toast({
        title: "Error",
        description: "Failed to load purchase returns",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchReturnItems = async (returnId: string): Promise<PurchaseReturnItem[]> => {
    try {
      const { data, error } = await supabase
        .from("purchase_return_items" as any)
        .select(`
          *,
          products:product_id (
            product_name,
            brand
          )
        `)
        .eq("return_id", returnId);

      if (error) throw error;

      const items: PurchaseReturnItem[] = (data || []).map((item: any) => ({
        ...item,
        product_name: item.products?.product_name,
        brand: item.products?.brand,
      }));

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

  const filteredReturns = returns.filter(ret => {
    const matchesSearch = 
      ret.supplier_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ret.original_bill_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ret.return_number?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesDateRange = 
      (!startDate || ret.return_date >= startDate) &&
      (!endDate || ret.return_date <= endDate);

    return matchesSearch && matchesDateRange;
  });

  const paginatedReturns = filteredReturns.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const totalPages = Math.ceil(filteredReturns.length / pageSize);

  const totalReturnAmount = filteredReturns.reduce((sum, ret) => sum + ret.net_amount, 0);
  const averageReturnValue = filteredReturns.length > 0 
    ? totalReturnAmount / filteredReturns.length 
    : 0;

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
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
    <div className="container mx-auto p-6 space-y-6">
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

      {/* Summary Cards - Modern Gradient Style */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 border-l-4 border-l-blue-500 hover:scale-[1.02] bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="text-xs font-medium">Total Returns</CardDescription>
            <Receipt className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{filteredReturns.length}</div>
            <p className="text-xs text-muted-foreground">All return records</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 border-l-4 border-l-red-500 hover:scale-[1.02] bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/30 dark:to-red-900/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="text-xs font-medium">Total Return Amount</CardDescription>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">₹{totalReturnAmount.toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">Net refund value</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 border-l-4 border-l-purple-500 hover:scale-[1.02] bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="text-xs font-medium">Average Return Value</CardDescription>
            <IndianRupee className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">₹{averageReturnValue.toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">Per return</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  <TableRow>
                    <TableHead className="w-12">
                      <input
                        type="checkbox"
                        checked={selectedReturns.size === filteredReturns.length}
                        onChange={toggleSelectAll}
                        className="rounded"
                      />
                    </TableHead>
                    <TableHead>Return No.</TableHead>
                    <TableHead>Return Date</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Original Bill</TableHead>
                    <TableHead className="text-right">Gross Amount</TableHead>
                    <TableHead className="text-right">GST</TableHead>
                    <TableHead className="text-right">Net Amount</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedReturns.map((returnRecord) => (
                    <>
                      <TableRow 
                        key={returnRecord.id} 
                        className="hover:bg-muted/50 cursor-pointer"
                        onClick={() => toggleExpanded(returnRecord.id)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedReturns.has(returnRecord.id)}
                            onChange={() => toggleSelectReturn(returnRecord.id)}
                            className="rounded"
                          />
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-medium">
                            {returnRecord.return_number || "-"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {format(new Date(returnRecord.return_date), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell className="font-medium">
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
                        <TableCell>
                          <Badge variant="outline">
                            {returnRecord.original_bill_number || "N/A"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          ₹{returnRecord.gross_amount.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          ₹{returnRecord.gst_amount.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          ₹{returnRecord.net_amount.toFixed(2)}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {returnRecord.notes || "-"}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/purchase-return-entry?edit=${returnRecord.id}`)}
                              title="Edit Return"
                            >
                              <Edit className="h-4 w-4 text-blue-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePrintClick(returnRecord)}
                              title="Print Return Receipt"
                            >
                              <Printer className="h-4 w-4 text-primary" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleExpanded(returnRecord.id)}
                              title={expandedReturns.has(returnRecord.id) ? "Collapse" : "Expand"}
                            >
                              {expandedReturns.has(returnRecord.id) ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteClick(returnRecord)}
                              title="Delete Return"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
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
                                      <TableCell colSpan={6} className="text-right">Total:</TableCell>
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
          />
        )}
      </div>

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
