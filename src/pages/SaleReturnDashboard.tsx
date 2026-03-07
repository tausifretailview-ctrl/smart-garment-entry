import { useState, useEffect, useRef, useMemo } from "react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Printer, Trash2, Plus, Search, Receipt, TrendingDown, IndianRupee, CreditCard, Banknote, ArrowLeftRight, Pencil } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useReactToPrint } from "react-to-print";
import { SaleReturnPrint } from "@/components/SaleReturnPrint";
import { useSoftDelete } from "@/hooks/useSoftDelete";
import { AdjustCustomerCreditNoteDialog } from "@/components/AdjustCustomerCreditNoteDialog";
import { CustomerHistoryDialog } from "@/components/CustomerHistoryDialog";

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
  notes: string | null;
  items?: SaleReturnItem[];
  credit_note_id?: string;
  credit_status?: string;
  linked_sale_id?: string;
  refund_type?: string;
  credit_note_number?: string;
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

  const [returnToPrint, setReturnToPrint] = useState<SaleReturn | null>(null);
  const [businessDetails, setBusinessDetails] = useState<BusinessDetails | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // Credit note adjustment dialog states
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [selectedReturnForAdjust, setSelectedReturnForAdjust] = useState<SaleReturn | null>(null);
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  const [selectedCustomerForHistory, setSelectedCustomerForHistory] = useState<{id: string | null; name: string} | null>(null);
  const queryClient = useQueryClient();

  const handlePrint = useReactToPrint({
    contentRef: printRef,
  });

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Server-side paginated query
  const { data: returnsData, isLoading: returnsLoading, refetch: refetchReturns } = useQuery({
    queryKey: ["sale-returns", currentOrganization?.id, debouncedSearch, currentPage, pageSize],
    queryFn: async () => {
      if (!currentOrganization?.id) return { returns: [], totalCount: 0 };

      const startIndex = (currentPage - 1) * pageSize;
      const endIndex = startIndex + pageSize - 1;

      let query = supabase
        .from("sale_returns")
        .select("id, return_number, customer_name, customer_id, original_sale_number, return_date, gross_amount, gst_amount, net_amount, notes, credit_note_id, credit_status, linked_sale_id, refund_type", { count: "exact" })
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);

      if (debouncedSearch) {
        query = query.or(`return_number.ilike.%${debouncedSearch}%,customer_name.ilike.%${debouncedSearch}%,original_sale_number.ilike.%${debouncedSearch}%`);
      }

      query = query.order("return_date", { ascending: false }).range(startIndex, endIndex);

      const { data, error, count } = await query;
      if (error) throw error;
      return { returns: (data || []) as SaleReturn[], totalCount: count || 0 };
    },
    enabled: !!currentOrganization?.id,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const returns = returnsData?.returns || [];

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
      .select("business_name, address, mobile_number, gst_number")
      .eq("organization_id", currentOrganization?.id)
      .single();

    if (error) {
      console.error("Error fetching business details:", error);
      return;
    }

    setBusinessDetails(data);
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

    const success = await softDelete("sale_returns", returnToDelete);
    if (success) {
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
    // Fetch credit note number if credit_note_id exists
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

  // Server-side filtering already applied, no client-side filter needed
  const totalReturns = returnsData?.totalCount || returns.length;
  const totalValue = returns.reduce((sum, ret) => sum + ret.net_amount, 0);
  const averageValue = returns.length > 0 ? totalValue / returns.length : 0;
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

        {/* Summary Cards - Vasy ERP Style Vibrant */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by return number, customer, sale number, or date..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : returns.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No returns found</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Return No</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Original Sale No</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">GST</TableHead>
                    <TableHead className="text-right">Net Amount</TableHead>
                    <TableHead>Credit Status</TableHead>
                    <TableHead>Refund Type</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returns.map((ret) => (
                    <>
                      <TableRow key={ret.id}>
                        <TableCell>
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
                        <TableCell>
                          {ret.original_sale_number ? (
                            <Badge variant="outline">{ret.original_sale_number}</Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right">₹{ret.gross_amount.toFixed(2)}</TableCell>
                        <TableCell className="text-right">₹{ret.gst_amount.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-medium">₹{ret.net_amount.toFixed(2)}</TableCell>
                        <TableCell>
                          {ret.credit_status === 'pending' && (
                            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
                              Pending
                            </Badge>
                          )}
                          {ret.credit_status === 'adjusted' && (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                              Adjusted
                            </Badge>
                          )}
                          {ret.credit_status === 'refunded' && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                              Refunded
                            </Badge>
                          )}
                          {ret.credit_status === 'adjusted_outstanding' && (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300">
                              Adjusted (Outstanding)
                            </Badge>
                          )}
                          {!ret.credit_status && (
                            <span className="text-muted-foreground text-sm">-</span>
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
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => navigate(`/sale-return-entry/${ret.id}`)}
                              title="Edit Return"
                            >
                              <Pencil className="h-4 w-4 text-blue-600" />
                            </Button>
                            {(ret.credit_status === 'pending' || !ret.credit_status) && (
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
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedRows.has(ret.id) && ret.items && (
                        <TableRow>
                          <TableCell colSpan={11} className="bg-muted/50">
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
                                  {ret.items.map((item) => (
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
          </CardContent>
        </Card>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Sale Return?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the return record.
                Note: Stock will NOT be automatically adjusted.
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
            creditAmount={selectedReturnForAdjust.net_amount}
            customerId={selectedReturnForAdjust.customer_id || ""}
            customerName={selectedReturnForAdjust.customer_name}
            onSuccess={fetchReturns}
          />
        )}

        <div style={{ display: "none" }}>
          {returnToPrint && businessDetails && (
            <SaleReturnPrint
              ref={printRef}
              saleReturn={returnToPrint}
              businessDetails={businessDetails}
            />
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
