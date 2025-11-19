import { useState, useEffect, useRef } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Receipt, Search, ChevronDown, ChevronRight, Printer, Plus, Edit, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useOrganization } from "@/contexts/OrganizationContext";
import { printInvoicePDF, generateInvoiceFromHTML } from "@/utils/pdfGenerator";

interface SaleItem {
  id: string;
  product_id: string;
  product_name: string;
  size: string;
  quantity: number;
  unit_price: number;
  mrp: number;
  discount_percent: number;
  gst_percent: number;
  line_total: number;
  barcode: string;
}

interface Sale {
  id: string;
  sale_number: string;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  sale_date: string;
  gross_amount: number;
  discount_amount: number;
  flat_discount_amount: number;
  round_off: number;
  net_amount: number;
  payment_method: string;
  payment_status: string;
  created_at: string;
  items?: SaleItem[];
}

const POSDashboard = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { currentOrganization } = useOrganization();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expandedSale, setExpandedSale] = useState<string | null>(null);
  const [saleItems, setSaleItems] = useState<Record<string, SaleItem[]>>({});
  const [deletingSale, setDeletingSale] = useState<string | null>(null);
  const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null);

  useEffect(() => {
    fetchSales();
  }, [currentOrganization]);

  const fetchSales = async () => {
    if (!currentOrganization?.id) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .order("sale_date", { ascending: false });

      if (error) throw error;

      setSales(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load sales",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSaleItems = async (saleId: string): Promise<SaleItem[]> => {
    if (saleItems[saleId]) {
      return saleItems[saleId]; // Already fetched
    }

    try {
      const { data, error } = await supabase
        .from("sale_items")
        .select("*")
        .eq("sale_id", saleId)
        .order("created_at");

      if (error) throw error;

      const items = data || [];
      setSaleItems((prev) => ({
        ...prev,
        [saleId]: items,
      }));
      
      return items;
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load sale items",
        variant: "destructive",
      });
      return [];
    }
  };

  const toggleExpanded = async (saleId: string) => {
    if (expandedSale === saleId) {
      setExpandedSale(null);
    } else {
      setExpandedSale(saleId);
      await fetchSaleItems(saleId);
    }
  };

  const handleDeleteClick = (sale: Sale, event: React.MouseEvent) => {
    event.stopPropagation();
    setSaleToDelete(sale);
  };

  const handleDeleteConfirm = async () => {
    if (!saleToDelete) return;

    setDeletingSale(saleToDelete.id);
    try {
      // First delete all sale items
      const { error: itemsError } = await supabase
        .from("sale_items")
        .delete()
        .eq("sale_id", saleToDelete.id);

      if (itemsError) throw itemsError;

      // Then delete the sale
      const { error: saleError } = await supabase
        .from("sales")
        .delete()
        .eq("id", saleToDelete.id);

      if (saleError) throw saleError;

      toast({
        title: "Success",
        description: `Sale ${saleToDelete.sale_number} deleted successfully`,
      });

      // Refresh the sales list
      await fetchSales();
    } catch (error: any) {
      console.error("Error deleting sale:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete sale",
        variant: "destructive",
      });
    } finally {
      setDeletingSale(null);
      setSaleToDelete(null);
    }
  };

  const handleEditSale = (saleId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    navigate(`/pos-sales?saleId=${saleId}`);
  };

  const handlePrintClick = async (sale: Sale, event: React.MouseEvent) => {
    event.stopPropagation();
    
    // Fetch items and get them directly
    const items = await fetchSaleItems(sale.id);
    
    // Directly generate and download PDF
    try {
      const { data: settings } = await supabase
        .from('settings')
        .select('*')
        .eq('organization_id', currentOrganization?.id)
        .maybeSingle();

      const saleSettings = settings?.sale_settings as any;
      const invoiceTemplate = saleSettings?.invoice_template || 'classic';
      const saleDate = new Date(sale.sale_date);
      const currentTime = saleDate.toLocaleTimeString('en-US');
      const mrpTotal = items.reduce((sum, item) => sum + (item.mrp * item.quantity), 0);
      const cardPaid = sale.payment_method === 'card' ? sale.net_amount : 0;

      const invoiceData = {
        billNo: sale.sale_number,
        date: saleDate,
        customerName: sale.customer_name,
        customerAddress: sale.customer_address || '',
        customerMobile: sale.customer_phone || '',
        items: items.map((item, index) => ({
          sr: index + 1,
          particulars: item.product_name,
          size: item.size,
          barcode: item.barcode || '',
          hsn: '',
          sp: item.mrp,
          qty: item.quantity,
          rate: item.unit_price,
          total: item.line_total,
        })),
        subTotal: sale.gross_amount,
        discount: sale.discount_amount + sale.flat_discount_amount,
        grandTotal: sale.net_amount,
        tenderAmount: sale.net_amount,
        cashPaid: sale.payment_method === 'cash' ? sale.net_amount : 0,
        refundCash: 0,
        upiPaid: sale.payment_method === 'upi' ? sale.net_amount : 0,
        paymentMethod: sale.payment_method,
        businessName: settings?.business_name || 'BUSINESS NAME',
        businessAddress: settings?.address || '',
        businessContact: settings?.mobile_number || '',
        businessEmail: settings?.email_id || '',
        gstNumber: settings?.gst_number || '',
        logo: (settings?.bill_barcode_settings as any)?.logo_url,
        time: currentTime,
        mrpTotal: mrpTotal,
        cardPaid: cardPaid,
        declarationText: saleSettings?.declaration_text,
        termsList: saleSettings?.terms_list,
      };

      if (invoiceTemplate === 'html-classic') {
        await generateInvoiceFromHTML(invoiceData);
      } else {
        await printInvoicePDF(invoiceData);
      }
      
      toast({
        title: "Success",
        description: "Invoice PDF downloaded successfully",
      });
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate PDF invoice",
        variant: "destructive",
      });
    }
  };

  const filteredSales = sales.filter((sale) => {
    const matchesSearch =
      searchQuery === "" ||
      sale.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sale.sale_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sale.customer_phone?.toLowerCase().includes(searchQuery.toLowerCase());

    const saleDate = new Date(sale.sale_date);
    const matchesStartDate = !startDate || saleDate >= new Date(startDate);
    const matchesEndDate = !endDate || saleDate <= new Date(endDate);

    return matchesSearch && matchesStartDate && matchesEndDate;
  });

  const totalSalesAmount = filteredSales.reduce((sum, sale) => sum + sale.net_amount, 0);
  const totalQuantity = filteredSales.reduce((sum, sale) => {
    const items = saleItems[sale.id] || [];
    return sum + items.reduce((itemSum, item) => itemSum + item.quantity, 0);
  }, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              POS Sales Dashboard
            </h1>
            <p className="text-muted-foreground mt-2">
              View and manage all POS sales transactions
            </p>
          </div>
          <div className="flex gap-3">
            <BackToDashboard />
            <Button 
              onClick={() => navigate("/pos-sales")}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              New Sale
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-indigo-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Sales
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-indigo-600">
                {filteredSales.length}
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Amount
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                ₹{totalSalesAmount.toFixed(2)}
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Items Sold
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                {totalQuantity}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>
              Search and filter sales transactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by customer, invoice..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="Start Date"
              />
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="End Date"
              />
            </div>
          </CardContent>
        </Card>

        {/* Sales List */}
        <Card>
          <CardHeader>
            <CardTitle>Sales Transactions</CardTitle>
            <CardDescription>
              {filteredSales.length} transaction(s) found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredSales.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No sales transactions found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredSales.map((sale, index) => (
                  <Card
                    key={sale.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => toggleExpanded(sale.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 grid grid-cols-2 md:grid-cols-6 gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">SR</p>
                            <p className="font-semibold">{index + 1}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Invoice #</p>
                            <p className="font-semibold">{sale.sale_number}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Customer</p>
                            <p className="font-medium">{sale.customer_name}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Date</p>
                            <p className="font-medium">
                              {format(new Date(sale.sale_date), "dd MMM yyyy")}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Amount</p>
                            <p className="font-bold text-green-600">
                              ₹{sale.net_amount.toFixed(2)}
                            </p>
                          </div>
                          <div className="flex items-start gap-2">
                            <Badge
                              variant={
                                sale.payment_status === "completed"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {sale.payment_method.toUpperCase()}
                            </Badge>
                            <Badge
                              variant={
                                sale.payment_status === "completed"
                                  ? "default"
                                  : "destructive"
                              }
                            >
                              {sale.payment_status}
                            </Badge>
                          </div>
                        </div>
                          <div className="flex items-center gap-2 ml-4">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => handlePrintClick(sale, e)}
                            title="Download Invoice PDF"
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => handleEditSale(sale.id, e)}
                            title="Edit Sale"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => handleDeleteClick(sale, e)}
                            disabled={deletingSale === sale.id}
                            title="Delete Sale"
                          >
                            {deletingSale === sale.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4 text-destructive" />
                            )}
                          </Button>
                          {expandedSale === sale.id ? (
                            <ChevronDown className="h-5 w-5" />
                          ) : (
                            <ChevronRight className="h-5 w-5" />
                          )}
                        </div>
                      </div>

                      {/* Expanded Items View */}
                      {expandedSale === sale.id && saleItems[sale.id] && (
                        <div className="mt-4 pt-4 border-t">
                          <h4 className="font-semibold mb-3">Sale Items</h4>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead>Size</TableHead>
                                <TableHead>Barcode</TableHead>
                                <TableHead className="text-right">Qty</TableHead>
                                <TableHead className="text-right">MRP</TableHead>
                                <TableHead className="text-right">Disc %</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {saleItems[sale.id].map((item) => (
                                <TableRow key={item.id}>
                                  <TableCell className="font-medium">
                                    {item.product_name}
                                  </TableCell>
                                  <TableCell>{item.size}</TableCell>
                                  <TableCell className="font-mono text-xs">
                                    {item.barcode}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {item.quantity}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    ₹{item.mrp.toFixed(2)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {item.discount_percent}%
                                  </TableCell>
                                  <TableCell className="text-right font-semibold">
                                    ₹{item.line_total.toFixed(2)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          <div className="mt-4 flex justify-end space-x-8 text-sm">
                            <div>
                              <span className="text-muted-foreground">Gross: </span>
                              <span className="font-semibold">₹{sale.gross_amount.toFixed(2)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Discount: </span>
                              <span className="font-semibold text-orange-600">
                                -₹{(sale.discount_amount + sale.flat_discount_amount).toFixed(2)}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Round Off: </span>
                              <span className="font-semibold">₹{sale.round_off.toFixed(2)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Net: </span>
                              <span className="font-bold text-green-600">
                                ₹{sale.net_amount.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!saleToDelete} onOpenChange={() => setSaleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete sale <strong>{saleToDelete?.sale_number}</strong> and all its items.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default POSDashboard;
