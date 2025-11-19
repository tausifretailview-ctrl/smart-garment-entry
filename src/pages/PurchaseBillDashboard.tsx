import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Loader2, Receipt, Search, ChevronDown, ChevronRight, Printer, Plus, Home, Edit, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { BackToDashboard } from "@/components/BackToDashboard";
import { printBarcodesDirectly } from "@/utils/barcodePrinter";

interface PurchaseItem {
  id: string;
  product_id: string;
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
  items?: PurchaseItem[];
}

const PurchaseBillDashboard = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
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

  useEffect(() => {
    fetchBills();
  }, []);

  const fetchBills = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("purchase_bills")
        .select("*")
        .order("bill_date", { ascending: false });

      if (error) throw error;

      setBills(data || []);
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
      // First delete all purchase items
      const { error: itemsError } = await supabase
        .from("purchase_items")
        .delete()
        .eq("bill_id", billToDelete.id);

      if (itemsError) throw itemsError;

      // Then delete the purchase bill
      const { error: billError } = await supabase
        .from("purchase_bills")
        .delete()
        .eq("id", billToDelete.id);

      if (billError) throw billError;

      toast({
        title: "Success",
        description: `Purchase bill ${billToDelete.software_bill_no || billToDelete.supplier_invoice_no} deleted successfully`,
      });

      // Refresh the bills list
      await fetchBills();
    } catch (error: any) {
      console.error("Error deleting bill:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete purchase bill",
        variant: "destructive",
      });
    } finally {
      setDeletingBill(null);
      setBillToDelete(null);
    }
  };

  const handlePrintBarcodes = async (billId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent card expansion/collapse
    setPrintingBill(billId);

    try {
      // Fetch settings to get default barcode format
      const { data: settingsData } = await supabase
        .from("settings")
        .select("bill_barcode_settings")
        .maybeSingle();

      const barcodeFormat = (settingsData?.bill_barcode_settings as any)?.barcode_format || "a4_12x4";

      // Fetch bill items with product details
      const { data: items, error } = await supabase
        .from("purchase_items")
        .select(`
          *,
          products (
            product_name,
            brand,
            color,
            style
          )
        `)
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

      // Format items for barcode printing
      const barcodeItems = items.map((item: any) => ({
        sku_id: item.sku_id,
        product_name: item.products?.product_name || "",
        brand: item.products?.brand || "",
        color: item.products?.color || "",
        style: item.products?.style || "",
        size: item.size,
        sale_price: item.sale_price,
        barcode: item.barcode,
        qty: item.qty,
        bill_number: item.bill_number || "",
      }));

      // Print barcodes directly with selected format
      await printBarcodesDirectly(barcodeItems, { sheetType: barcodeFormat as any });
      
      toast({
        title: "Success",
        description: "Barcodes sent to printer",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to print barcodes",
        variant: "destructive",
      });
    } finally {
      setPrintingBill(null);
    }
  };

  const filteredBills = bills.filter((bill) => {
    const matchesSearch =
      searchQuery === "" ||
      bill.supplier_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bill.supplier_invoice_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bill.software_bill_no?.toLowerCase().includes(searchQuery.toLowerCase());

    const billDate = new Date(bill.bill_date);
    const matchesStartDate = !startDate || billDate >= new Date(startDate);
    const matchesEndDate = !endDate || billDate <= new Date(endDate);

    return matchesSearch && matchesStartDate && matchesEndDate;
  });

  const totalPurchaseAmount = filteredBills.reduce((sum, bill) => sum + bill.net_amount, 0);

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
          <Button onClick={() => navigate("/purchase-entry")} className="gap-2">
            <Plus className="h-4 w-4" />
            New Purchase
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Bills</CardDescription>
              <CardTitle className="text-3xl">{filteredBills.length}</CardTitle>
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

        <Card className="shadow-lg border-border">
          <CardHeader>
            <div className="flex flex-col gap-4">
              <div>
                <CardTitle className="text-2xl">All Purchase Bills</CardTitle>
                <CardDescription>
                  {filteredBills.length} {filteredBills.length === 1 ? "bill" : "bills"} found
                </CardDescription>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by bill no, supplier, invoice..."
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
                      <TableHead className="w-16">Sr. No.</TableHead>
                      <TableHead>Bill No.</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Invoice No.</TableHead>
                      <TableHead>Supplier Name</TableHead>
                      <TableHead className="text-right">Gross Amount</TableHead>
                      <TableHead className="text-right">GST Amount</TableHead>
                      <TableHead className="text-right">Net Amount</TableHead>
                      <TableHead className="text-center">Items</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBills.map((bill, index) => (
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
                          <TableCell className="font-medium">{index + 1}</TableCell>
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
                          <TableCell className="font-medium">{bill.supplier_name}</TableCell>
                          <TableCell className="text-right">₹{bill.gross_amount.toFixed(2)}</TableCell>
                          <TableCell className="text-right">₹{bill.gst_amount.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-semibold text-primary">
                            ₹{bill.net_amount.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary">
                              {billItems[bill.id]?.length || 0}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
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
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Expanded Items Row */}
                        {expandedBill === bill.id && billItems[bill.id] && billItems[bill.id].length > 0 && (
                          <TableRow>
                            <TableCell colSpan={10} className="bg-muted/20 p-0">
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
                                        <TableHead>HSN Code</TableHead>
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
                                          <TableCell className="text-xs">{item.hsn_code || "—"}</TableCell>
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
    </div>
  );
};

export default PurchaseBillDashboard;
