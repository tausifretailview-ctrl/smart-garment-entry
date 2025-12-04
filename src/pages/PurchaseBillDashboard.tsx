import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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
import { Loader2, Receipt, Search, ChevronDown, ChevronRight, Printer, Plus, Home, Edit, Trash2, Database, ArrowUpDown, Wallet, Settings2 } from "lucide-react";
import { format } from "date-fns";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDashboardColumnSettings } from "@/hooks/useDashboardColumnSettings";

interface PurchaseItem {
  id: string;
  product_id: string;
  product_name?: string;
  size: string;
  qty: number;
  pur_price: number;
  sale_price: number;
  gst_per: number;
  hsn_code: string;
  barcode: string;
  line_total: number;
}

interface PurchaseBill {
  id: string;
  supplier_name: string;
  supplier_invoice_no: string;
  software_bill_no: string;
  bill_date: string;
  gross_amount: number;
  gst_amount: number;
  net_amount: number;
  notes: string;
  created_at: string;
  payment_status?: string;
  paid_amount?: number;
  items?: PurchaseItem[];
}

const PurchaseBillDashboard = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { currentOrganization } = useOrganization();
  const [bills, setBills] = useState<PurchaseBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expandedBill, setExpandedBill] = useState<string | null>(null);
  const [billItems, setBillItems] = useState<Record<string, PurchaseItem[]>>({});
  const [printingBill, setPrintingBill] = useState<string | null>(null);
  const [deletingBill, setDeletingBill] = useState<string | null>(null);
  const [billToDelete, setBillToDelete] = useState<PurchaseBill | null>(null);

  // Selection and pagination states
  const [selectedBills, setSelectedBills] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  
  // Payment recording states
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [selectedBillForPayment, setSelectedBillForPayment] = useState<PurchaseBill | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);

  // Column visibility settings with database persistence
  const defaultPurchaseColumns = {
    status: true,
    recordPayment: true,
    modify: true,
    printBarcodes: true,
    delete: true
  };
  
  const { columnSettings, updateColumnSetting } = useDashboardColumnSettings(
    "purchase_bill_dashboard",
    defaultPurchaseColumns
  );

  useEffect(() => {
    fetchBills();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, startDate, endDate, itemsPerPage]);

  const fetchBills = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("purchase_bills")
        .select("*")
        .order("bill_date", { ascending: false });

      if (error) throw error;

      setBills(data || []);
      
      // Fetch item counts for all bills
      if (data && data.length > 0) {
        const billIds = data.map(b => b.id);
        const { data: allItems, error: itemsError } = await supabase
          .from("purchase_items")
          .select("bill_id, qty, id, product_id, product_name, size, pur_price, sale_price, gst_per, hsn_code, barcode, line_total")
          .in("bill_id", billIds);
        
        if (!itemsError && allItems) {
          const itemsByBill: Record<string, PurchaseItem[]> = {};
          allItems.forEach(item => {
            if (!itemsByBill[item.bill_id]) {
              itemsByBill[item.bill_id] = [];
            }
            itemsByBill[item.bill_id].push(item);
          });
          setBillItems(itemsByBill);
        }
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load purchase bills",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchBillItems = async (billId: string) => {
    if (billItems[billId]) {
      return; // Already fetched
    }

    try {
      const { data, error } = await supabase
        .from("purchase_items")
        .select("*")
        .eq("bill_id", billId)
        .order("created_at");

      if (error) throw error;

      setBillItems((prev) => ({
        ...prev,
        [billId]: data || [],
      }));
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load bill items",
        variant: "destructive",
      });
    }
  };

  const toggleExpanded = async (billId: string) => {
    if (expandedBill === billId) {
      setExpandedBill(null);
    } else {
      setExpandedBill(billId);
      await fetchBillItems(billId);
    }
  };

  const handleDeleteClick = (bill: PurchaseBill, event: React.MouseEvent) => {
    event.stopPropagation();
    setBillToDelete(bill);
  };

  const handleDeleteConfirm = async () => {
    if (!billToDelete) return;

    setDeletingBill(billToDelete.id);
    try {
      // Delete purchase items - database triggers will handle stock restoration automatically
      const { error: itemsError } = await supabase
        .from("purchase_items")
        .delete()
        .eq("bill_id", billToDelete.id);

      if (itemsError) throw itemsError;

      // Delete purchase bill
      const { error: billError } = await supabase
        .from("purchase_bills")
        .delete()
        .eq("id", billToDelete.id);

      if (billError) throw billError;

      toast({
        title: "Success",
        description: "Purchase bill deleted and stock restored successfully",
      });

      setBillToDelete(null);
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

  // Note: Stock restoration is now handled automatically by database triggers
  // (handle_purchase_item_delete) when purchase_items are deleted.
  // This prevents double stock deduction that was occurring previously.

  const toggleSelectAll = () => {
    if (selectedBills.size === paginatedBills.length) {
      setSelectedBills(new Set());
    } else {
      setSelectedBills(new Set(paginatedBills.map(b => b.id)));
    }
  };

  const toggleSelectBill = (billId: string) => {
    const newSelected = new Set(selectedBills);
    if (newSelected.has(billId)) {
      newSelected.delete(billId);
    } else {
      newSelected.add(billId);
    }
    setSelectedBills(newSelected);
  };

  const handleBulkDelete = async () => {
    setIsDeleting(true);
    try {
      const billsToDelete = Array.from(selectedBills);
      
      for (const billId of billsToDelete) {
        // Delete purchase items - database triggers will handle stock restoration automatically
        const { error: itemsError } = await supabase
          .from("purchase_items")
          .delete()
          .eq("bill_id", billId);

        if (itemsError) throw itemsError;

        const { error: billError } = await supabase
          .from("purchase_bills")
          .delete()
          .eq("id", billId);

        if (billError) throw billError;
      }

      toast({
        title: "Success",
        description: `${billsToDelete.length} purchase bill(s) deleted and stock restored successfully`,
      });

      setSelectedBills(new Set());
      setShowBulkDeleteDialog(false);
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
      // Fetch all purchase items with missing product_name
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

      // Update each item with the correct product_name
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

      // Refresh bills to reflect changes
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

  const handlePageSizeChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  const handleOpenPaymentDialog = (bill: PurchaseBill, event: React.MouseEvent) => {
    event.stopPropagation();
    setSelectedBillForPayment(bill);
    const remainingAmount = bill.net_amount - (bill.paid_amount || 0);
    setPaymentAmount(remainingAmount.toFixed(2));
    setPaymentDate(format(new Date(), "yyyy-MM-dd"));
    setPaymentMethod("cash");
    setPaymentNotes("");
    setShowPaymentDialog(true);
  };

  const handleRecordPayment = async () => {
    if (!selectedBillForPayment) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid payment amount",
        variant: "destructive",
      });
      return;
    }

    const currentPaid = selectedBillForPayment.paid_amount || 0;
    const newTotalPaid = currentPaid + amount;

    if (newTotalPaid > selectedBillForPayment.net_amount) {
      toast({
        title: "Amount Exceeds Bill Total",
        description: "Payment amount exceeds the remaining bill amount",
        variant: "destructive",
      });
      return;
    }

    setIsRecordingPayment(true);
    try {
      // Determine new payment status
      let newStatus = 'unpaid';
      if (newTotalPaid >= selectedBillForPayment.net_amount) {
        newStatus = 'paid';
      } else if (newTotalPaid > 0) {
        newStatus = 'partial';
      }

      // Update purchase bill with payment
      const { error: updateError } = await supabase
        .from("purchase_bills")
        .update({
          paid_amount: newTotalPaid,
          payment_status: newStatus,
        })
        .eq("id", selectedBillForPayment.id);

      if (updateError) throw updateError;

      // TODO: Create voucher entry for this payment in accounts
      // This can be integrated with the accounts module later

      toast({
        title: "Payment Recorded",
        description: `₹${amount.toFixed(2)} payment recorded successfully`,
      });

      setShowPaymentDialog(false);
      setSelectedBillForPayment(null);
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
    event.stopPropagation(); // Prevent card expansion/collapse
    setPrintingBill(billId);

    try {
      // Fetch bill details
      const { data: billData, error: billError } = await supabase
        .from("purchase_bills")
        .select("id, software_bill_no, supplier_id")
        .eq("id", billId)
        .single();

      if (billError) throw billError;

      // Fetch supplier code separately
      let supplierCode = "";
      if (billData?.supplier_id) {
        const { data: supplierData } = await supabase
          .from("suppliers")
          .select("supplier_code")
          .eq("id", billData.supplier_id)
          .single();
        
        supplierCode = supplierData?.supplier_code || "";
      }

      // Fetch bill items with product details directly from purchase_items
      const { data: items, error } = await supabase
        .from("purchase_items")
        .select("*")
        .eq("bill_id", billId);

      if (error) throw error;

      if (!items || items.length === 0) {
        toast({
          title: "No Items",
          description: "This bill has no items to print barcodes for",
          variant: "destructive",
        });
        return;
      }

      // Format items for barcode printing page - use saved product details
      const barcodeItems = items.map((item: any) => ({
        sku_id: item.sku_id,
        product_name: item.product_name || "",
        brand: item.brand || "",
        category: item.category || "",
        color: item.color || "",
        style: item.style || "",
        size: item.size,
        sale_price: item.sale_price,
        pur_price: item.pur_price, // Include purchase price for purchase code calculation
        barcode: item.barcode,
        qty: item.qty,
        bill_number: item.bill_number || "",
        supplier_code: supplierCode,
      }));

      // Navigate to barcode printing page with items
      navigate("/barcode-printing", { 
        state: { purchaseItems: barcodeItems } 
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

  const filteredBills = bills.filter((bill) => {
    const searchLower = searchQuery.toLowerCase();
    
    // Check basic bill fields
    const matchesBasicSearch =
      searchQuery === "" ||
      bill.supplier_name.toLowerCase().includes(searchLower) ||
      bill.supplier_invoice_no?.toLowerCase().includes(searchLower) ||
      bill.software_bill_no?.toLowerCase().includes(searchLower);
    
    // Check barcode in bill items
    const items = billItems[bill.id] || [];
    const matchesBarcodeSearch = searchQuery !== "" && items.some(item => 
      item.barcode?.toLowerCase().includes(searchLower) ||
      item.product_name?.toLowerCase().includes(searchLower)
    );
    
    const matchesSearch = matchesBasicSearch || matchesBarcodeSearch;

    const billDate = new Date(bill.bill_date);
    const matchesStartDate = !startDate || billDate >= new Date(startDate);
    const matchesEndDate = !endDate || billDate <= new Date(endDate);

    return matchesSearch && matchesStartDate && matchesEndDate;
  }).sort((a, b) => {
    const dateA = new Date(a.bill_date).getTime();
    const dateB = new Date(b.bill_date).getTime();
    return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
  });

  // Pagination
  const totalPages = Math.ceil(filteredBills.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedBills = filteredBills.slice(startIndex, endIndex);

  const totalPurchaseAmount = filteredBills.reduce((sum, bill) => sum + bill.net_amount, 0);
  const totalPurchaseQty = filteredBills.reduce((sum, bill) => {
    const billQty = billItems[bill.id]?.reduce((itemSum, item) => itemSum + item.qty, 0) || 0;
    return sum + billQty;
  }, 0);

  const getPaymentStatusBadge = (bill: PurchaseBill) => {
    const status = bill.payment_status || 'unpaid';
    const paidAmount = bill.paid_amount || 0;
    
    if (status === 'paid' || paidAmount >= bill.net_amount) {
      return <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">Paid</Badge>;
    } else if (status === 'partial' || (paidAmount > 0 && paidAmount < bill.net_amount)) {
      return <Badge className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20">Partial</Badge>;
    } else {
      return <Badge className="bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20">Unpaid</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="gap-2"
            >
              <Home className="h-4 w-4" />
              Dashboard
            </Button>
            <Receipt className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">Purchase Bills</h1>
          </div>
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Settings2 className="h-4 w-4" />
                  Columns
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64">
                <div className="space-y-4">
                  <h4 className="font-medium text-sm">Show/Hide Columns</h4>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="status"
                        checked={columnSettings.status}
                        onCheckedChange={(checked) => updateColumnSetting('status', checked as boolean)}
                      />
                      <Label htmlFor="status" className="text-sm cursor-pointer">Payment Status</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="recordPayment"
                        checked={columnSettings.recordPayment}
                        onCheckedChange={(checked) => updateColumnSetting('recordPayment', checked as boolean)}
                      />
                      <Label htmlFor="recordPayment" className="text-sm cursor-pointer">Record Payment</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="modify"
                        checked={columnSettings.modify}
                        onCheckedChange={(checked) => updateColumnSetting('modify', checked as boolean)}
                      />
                      <Label htmlFor="modify" className="text-sm cursor-pointer">Edit</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="printBarcodes"
                        checked={columnSettings.printBarcodes}
                        onCheckedChange={(checked) => updateColumnSetting('printBarcodes', checked as boolean)}
                      />
                      <Label htmlFor="printBarcodes" className="text-sm cursor-pointer">Print Barcodes</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="delete"
                        checked={columnSettings.delete}
                        onCheckedChange={(checked) => updateColumnSetting('delete', checked as boolean)}
                      />
                      <Label htmlFor="delete" className="text-sm cursor-pointer">Delete</Label>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button 
              onClick={handleFixMissingProductNames} 
              variant="outline"
              className="gap-2"
              disabled={isFixing}
            >
              {isFixing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Database className="h-4 w-4" />
              )}
              Fix Missing Data
            </Button>
            <Button onClick={() => navigate("/purchase-entry")} className="gap-2">
              <Plus className="h-4 w-4" />
              New Purchase
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Bills</CardDescription>
              <CardTitle className="text-3xl">{filteredBills.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Purchase Qty</CardDescription>
              <CardTitle className="text-3xl">{totalPurchaseQty}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Purchase Amount</CardDescription>
              <CardTitle className="text-3xl">₹{totalPurchaseAmount.toFixed(2)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Average Bill Value</CardDescription>
              <CardTitle className="text-3xl">
                ₹{filteredBills.length > 0 ? (totalPurchaseAmount / filteredBills.length).toFixed(2) : "0.00"}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Bulk Actions */}
        {selectedBills.size > 0 && (
          <Card className="mb-4 border-primary/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium">
                    {selectedBills.size} bill(s) selected
                  </span>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowBulkDeleteDialog(true)}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Selected
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-lg border-border">
          <CardHeader>
            <div className="flex flex-col gap-4">
              <div>
                <CardTitle className="text-2xl">All Purchase Bills</CardTitle>
                <CardDescription>
                  {filteredBills.length} {filteredBills.length === 1 ? "bill" : "bills"} found
                </CardDescription>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by bill no, supplier, barcode..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Input
                  type="date"
                  placeholder="Start Date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <Input
                  type="date"
                  placeholder="End Date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
                <Select value={sortOrder} onValueChange={(value: "asc" | "desc") => setSortOrder(value)}>
                  <SelectTrigger className="gap-2">
                    <ArrowUpDown className="h-4 w-4" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Newest First (DESC)</SelectItem>
                    <SelectItem value="asc">Oldest First (ASC)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredBills.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg">No purchase bills found</p>
                <p className="text-sm">Create your first purchase bill to get started</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-12"></TableHead>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedBills.size === paginatedBills.length && paginatedBills.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="w-16">Sr. No.</TableHead>
                      <TableHead>Bill No.</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Invoice No.</TableHead>
                      <TableHead>Supplier Name</TableHead>
                      <TableHead className="text-right">Gross Amount</TableHead>
                      <TableHead className="text-right">GST Amount</TableHead>
                      <TableHead className="text-right">Net Amount</TableHead>
                      {columnSettings.status && <TableHead className="text-center">Payment Status</TableHead>}
                      <TableHead className="text-center">Items</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
              <TableBody>
                {paginatedBills.map((bill, index) => (
                      <>
                        <TableRow
                          key={bill.id}
                          className="cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => toggleExpanded(bill.id)}
                        >
                        <TableCell>
                          {expandedBill === bill.id ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedBills.has(bill.id)}
                            onCheckedChange={() => toggleSelectBill(bill.id)}
                          />
                        </TableCell>
                          <TableCell className="font-medium">{startIndex + index + 1}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-mono text-xs">
                              {bill.software_bill_no || "N/A"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {format(new Date(bill.bill_date), "dd MMM yyyy")}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{bill.supplier_invoice_no}</TableCell>
                          <TableCell className="font-medium">
                            {bill.supplier_name}
                            <Badge variant="outline" className="ml-2 text-xs">
                              Qty: {billItems[bill.id]?.reduce((sum, item) => sum + item.qty, 0) || 0}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">₹{bill.gross_amount.toFixed(2)}</TableCell>
                          <TableCell className="text-right">₹{bill.gst_amount.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-semibold text-primary">
                            ₹{bill.net_amount.toFixed(2)}
                          </TableCell>
                          {columnSettings.status && (
                            <TableCell className="text-center">
                              {getPaymentStatusBadge(bill)}
                            </TableCell>
                          )}
                          <TableCell className="text-center">
                            <Badge variant="secondary">
                              {billItems[bill.id]?.length || 0}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              {columnSettings.recordPayment && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => handleOpenPaymentDialog(bill, e)}
                                  className="gap-1"
                                  title="Record Payment"
                                >
                                  <Wallet className="h-4 w-4" />
                                </Button>
                              )}
                              {columnSettings.modify && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate("/purchase-entry", { state: { editBillId: bill.id } });
                                  }}
                                  className="gap-1"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
                              {columnSettings.printBarcodes && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => handlePrintBarcodes(bill.id, e)}
                                  disabled={printingBill === bill.id}
                                  className="gap-1"
                                >
                                  {printingBill === bill.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Printer className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                              {columnSettings.delete && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => handleDeleteClick(bill, e)}
                                  disabled={deletingBill === bill.id}
                                  className="gap-1 text-destructive hover:text-destructive"
                                >
                                  {deletingBill === bill.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Expanded Items Row */}
                        {expandedBill === bill.id && billItems[bill.id] && billItems[bill.id].length > 0 && (
                          <TableRow>
                            <TableCell colSpan={columnSettings.status ? 13 : 12} className="bg-muted/20 p-0">
                              <div className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="font-semibold text-sm">Purchase Items Details</h4>
                                  {bill.notes && (
                                    <p className="text-sm text-muted-foreground">
                                      <span className="font-medium">Notes:</span> {bill.notes}
                                    </p>
                                  )}
                                </div>
                                <div className="border rounded-lg overflow-hidden">
                                  <Table>
                                     <TableHeader>
                                      <TableRow className="bg-muted/30">
                                        <TableHead>Size</TableHead>
                                        <TableHead>Barcode</TableHead>
                                        <TableHead>Product Name</TableHead>
                                        <TableHead className="text-right">Quantity</TableHead>
                                        <TableHead className="text-right">Purchase Price</TableHead>
                                        <TableHead className="text-right">Sale Price</TableHead>
                                        <TableHead className="text-right">GST %</TableHead>
                                        <TableHead className="text-right">Line Total</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                       {billItems[bill.id].map((item) => (
                                        <TableRow key={item.id}>
                                          <TableCell className="font-medium">{item.size}</TableCell>
                                          <TableCell>
                                            {item.barcode ? (
                                              <Badge variant="outline" className="font-mono text-xs">
                                                {item.barcode}
                                              </Badge>
                                            ) : (
                                              <span className="text-muted-foreground">—</span>
                                            )}
                                          </TableCell>
                                          <TableCell>{item.product_name || "—"}</TableCell>
                                          <TableCell className="text-right">{item.qty}</TableCell>
                                          <TableCell className="text-right">₹{item.pur_price.toFixed(2)}</TableCell>
                                          <TableCell className="text-right">₹{item.sale_price.toFixed(2)}</TableCell>
                                          <TableCell className="text-right">{item.gst_per}%</TableCell>
                                          <TableCell className="text-right font-semibold">
                                            ₹{item.line_total.toFixed(2)}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
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
          </CardContent>
        </Card>

        {/* Pagination Controls */}
        {filteredBills.length > 0 && (
          <Card className="mt-4">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Rows per page:</span>
                    <Select value={itemsPerPage.toString()} onValueChange={handlePageSizeChange}>
                      <SelectTrigger className="w-20 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Showing {startIndex + 1}-{Math.min(endIndex, filteredBills.length)} of {filteredBills.length} bills
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreviousPage}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!billToDelete} onOpenChange={() => setBillToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase Bill</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete purchase bill{" "}
              <span className="font-semibold">
                {billToDelete?.software_bill_no || billToDelete?.supplier_invoice_no}
              </span>
              ? This will also delete all associated items. This action cannot be undone.
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

      {/* Payment Recording Dialog */}
      <AlertDialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Record Payment</AlertDialogTitle>
            <AlertDialogDescription>
              Record a payment for purchase bill {selectedBillForPayment?.software_bill_no}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {selectedBillForPayment && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Supplier:</span>
                  <p className="font-medium">{selectedBillForPayment.supplier_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Bill Date:</span>
                  <p className="font-medium">{format(new Date(selectedBillForPayment.bill_date), "dd MMM yyyy")}</p>
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
                  <SelectContent className="bg-background z-50">
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

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRecordingPayment}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRecordPayment}
              disabled={isRecordingPayment}
            >
              {isRecordingPayment ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Recording...
                </>
              ) : (
                "Record Payment"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PurchaseBillDashboard;
