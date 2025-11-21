import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Loader2, Receipt, Search, ChevronDown, ChevronRight, Printer, Plus, Edit, Trash2, MessageCircle } from "lucide-react";
import { format } from "date-fns";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useOrganization } from "@/contexts/OrganizationContext";
import { printInvoiceDirectly } from "@/utils/pdfGenerator";

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
  variant_id: string;
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
  const [selectedSales, setSelectedSales] = useState<Set<string>>(new Set());
  const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    fetchSales();
  }, [currentOrganization]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "p") {
        e.preventDefault();
        if (expandedSale && sales.length > 0) {
          const sale = sales.find(s => s.id === expandedSale);
          if (sale) {
            handlePrintClick(sale, { stopPropagation: () => {} } as React.MouseEvent);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [expandedSale, sales]);

  const fetchSales = async () => {
    if (!currentOrganization?.id) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .eq("sale_type", "pos")
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
    if (saleItems[saleId]) return saleItems[saleId];

    try {
      const { data, error } = await supabase
        .from("sale_items")
        .select("*")
        .eq("sale_id", saleId);

      if (error) throw error;

      const items = data || [];
      setSaleItems((prev) => ({ ...prev, [saleId]: items }));
      return items;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load sale items",
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

  const restoreStockForSale = async (saleId: string) => {
    const { data: items, error: fetchError } = await supabase
      .from("sale_items")
      .select("*")
      .eq("sale_id", saleId);

    if (fetchError) throw fetchError;

    if (items && items.length > 0) {
      for (const item of items) {
        const { data: variant } = await supabase
          .from("product_variants")
          .select("stock_qty")
          .eq("id", item.variant_id)
          .single();

        if (variant) {
          const newStock = variant.stock_qty + item.quantity;
          const { error: updateError } = await supabase
            .from("product_variants")
            .update({ stock_qty: newStock })
            .eq("id", item.variant_id);

          if (updateError) throw updateError;
        }
      }
    }
  };

  const handleDeleteSale = async () => {
    if (!saleToDelete) return;

    setIsDeleting(true);
    try {
      await restoreStockForSale(saleToDelete.id);

      const { error: itemsError } = await supabase
        .from("sale_items")
        .delete()
        .eq("sale_id", saleToDelete.id);

      if (itemsError) throw itemsError;

      const { error: saleError } = await supabase
        .from("sales")
        .delete()
        .eq("id", saleToDelete.id);

      if (saleError) throw saleError;

      toast({
        title: "Success",
        description: `Sale ${saleToDelete.sale_number} deleted and stock restored`,
      });

      await fetchSales();
    } catch (error: any) {
      console.error("Error deleting sale:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete sale",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setSaleToDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedSales.size === 0) return;

    setIsDeleting(true);
    try {
      const salesToDelete = Array.from(selectedSales);
      
      for (const saleId of salesToDelete) {
        await restoreStockForSale(saleId);

        const { error: itemsError } = await supabase
          .from("sale_items")
          .delete()
          .eq("sale_id", saleId);

        if (itemsError) throw itemsError;

        const { error: saleError } = await supabase
          .from("sales")
          .delete()
          .eq("id", saleId);

        if (saleError) throw saleError;
      }

      toast({
        title: "Success",
        description: `${salesToDelete.length} sale(s) deleted and stock restored`,
      });

      setSelectedSales(new Set());
      setShowBulkDeleteDialog(false);
      await fetchSales();
    } catch (error: any) {
      console.error("Error deleting sales:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete sales",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedSales.size === filteredSales.length && filteredSales.length > 0) {
      setSelectedSales(new Set());
    } else {
      setSelectedSales(new Set(filteredSales.map(s => s.id)));
    }
  };

  const toggleSelectSale = (saleId: string) => {
    const newSelected = new Set(selectedSales);
    if (newSelected.has(saleId)) {
      newSelected.delete(saleId);
    } else {
      newSelected.add(saleId);
    }
    setSelectedSales(newSelected);
  };

  const handleEditSale = (saleId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    navigate(`/pos-sales?saleId=${saleId}`);
  };

  const handlePrintClick = async (sale: Sale, event: React.MouseEvent) => {
    event.stopPropagation();
    
    const items = await fetchSaleItems(sale.id);
    
    try {
      const { data: settings } = await supabase
        .from('settings')
        .select('*')
        .eq('organization_id', currentOrganization?.id)
        .maybeSingle();

      const saleSettings = settings?.sale_settings as any;
      const saleDate = new Date(sale.sale_date);
      const currentTime = saleDate.toLocaleTimeString('en-US');
      const mrpTotal = items.reduce((sum, item) => sum + (item.mrp * item.quantity), 0);

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
        cardPaid: sale.payment_method === 'card' ? sale.net_amount : 0,
        declarationText: saleSettings?.declaration_text,
        termsList: saleSettings?.terms_list,
      };

      await printInvoiceDirectly(invoiceData);
      
      toast({
        title: "Printing Invoice",
        description: `Invoice ${sale.sale_number} sent to printer`,
      });
    } catch (error: any) {
      console.error('Error printing invoice:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to print invoice",
      });
    }
  };

  const handleWhatsAppShare = async (sale: Sale, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (!sale.customer_phone) {
      toast({
        title: "No Phone Number",
        description: "Customer phone number is required to send WhatsApp message",
        variant: "destructive",
      });
      return;
    }

    const items = await fetchSaleItems(sale.id);
    
    const itemsList = items.map((item, index) => 
      `${index + 1}. ${item.product_name} (${item.size}) - Qty: ${item.quantity} - ₹${item.line_total.toFixed(2)}`
    ).join('\n');

    const message = `*Invoice Details*\n\nInvoice No: ${sale.sale_number}\nDate: ${format(new Date(sale.sale_date), 'dd/MM/yyyy')}\nCustomer: ${sale.customer_name}\n\n*Items:*\n${itemsList}\n\nGross Amount: ₹${sale.gross_amount.toFixed(2)}\nDiscount: ₹${(sale.discount_amount + sale.flat_discount_amount).toFixed(2)}\nRound Off: ₹${sale.round_off.toFixed(2)}\n*Net Amount: ₹${sale.net_amount.toFixed(2)}*\n\nPayment Method: ${sale.payment_method.toUpperCase()}\n\nThank you for your business!`;

    const phoneNumber = sale.customer_phone.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    
    window.location.href = whatsappUrl;
  };

  const filteredSales = sales.filter((sale) => {
    const matchesSearch =
      sale.sale_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sale.customer_name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDateRange =
      (!startDate || new Date(sale.sale_date) >= new Date(startDate)) &&
      (!endDate || new Date(sale.sale_date) <= new Date(endDate));

    return matchesSearch && matchesDateRange;
  });

  const totalPages = Math.ceil(filteredSales.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedSales = filteredSales.slice(startIndex, endIndex);

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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, startDate, endDate, itemsPerPage]);

  const handlePageSizeChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-accent/5 to-background p-6">
      <BackToDashboard />
      
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              POS Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">View and manage all POS sales</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => navigate("/pos-sales")} className="gap-2">
              <Plus className="h-4 w-4" />
              New Sale
            </Button>
            {selectedSales.size > 0 && (
              <Button
                onClick={() => setShowBulkDeleteDialog(true)}
                disabled={isDeleting}
                variant="destructive"
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete Selected ({selectedSales.size})
              </Button>
            )}
          </div>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              Sales Records
            </CardTitle>
            <CardDescription>Search and filter your sales history</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by sale number or customer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40"
                placeholder="Start Date"
              />
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40"
                placeholder="End Date"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={selectedSales.size === filteredSales.length && filteredSales.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                      <TableHead>Sale Number</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedSales.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                          No sales found
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedSales.map((sale) => (
                        <>
                          <TableRow
                            key={sale.id}
                            className="cursor-pointer hover:bg-accent/50"
                          >
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedSales.has(sale.id)}
                                onCheckedChange={() => toggleSelectSale(sale.id)}
                              />
                            </TableCell>
                            <TableCell onClick={() => toggleExpanded(sale.id)}>
                              {expandedSale === sale.id ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </TableCell>
                            <TableCell className="font-medium" onClick={() => toggleExpanded(sale.id)}>
                              {sale.sale_number}
                            </TableCell>
                            <TableCell onClick={() => toggleExpanded(sale.id)}>{sale.customer_name}</TableCell>
                            <TableCell onClick={() => toggleExpanded(sale.id)}>
                              {sale.customer_phone || '-'}
                            </TableCell>
                            <TableCell onClick={() => toggleExpanded(sale.id)}>
                              {format(new Date(sale.sale_date), "dd/MM/yyyy")}
                            </TableCell>
                            <TableCell onClick={() => toggleExpanded(sale.id)}>₹{sale.net_amount.toFixed(2)}</TableCell>
                            <TableCell onClick={() => toggleExpanded(sale.id)}>
                              <Badge variant={sale.payment_method === "cash" ? "default" : "secondary"}>
                                {sale.payment_method}
                              </Badge>
                            </TableCell>
                            <TableCell onClick={() => toggleExpanded(sale.id)}>
                              <Badge variant={sale.payment_status === "completed" ? "default" : "destructive"}>
                                {sale.payment_status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => handleWhatsAppShare(sale, e)}
                                  title="Share on WhatsApp"
                                  disabled={!sale.customer_phone}
                                >
                                  <MessageCircle className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => handlePrintClick(sale, e)}
                                  title="Print Invoice (Ctrl+P)"
                                >
                                  <Printer className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => handleEditSale(sale.id, e)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSaleToDelete(sale);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {expandedSale === sale.id && saleItems[sale.id] && (
                            <TableRow>
                              <TableCell colSpan={9} className="bg-muted/50 p-4">
                                <div className="space-y-2">
                                  <h4 className="font-semibold text-sm">Sale Items:</h4>
                                  <div className="rounded-md border">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Product</TableHead>
                                          <TableHead>Size</TableHead>
                                          <TableHead>Quantity</TableHead>
                                          <TableHead>MRP</TableHead>
                                          <TableHead>Unit Price</TableHead>
                                          <TableHead>Discount</TableHead>
                                          <TableHead>GST</TableHead>
                                          <TableHead className="text-right">Total</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {saleItems[sale.id].map((item) => (
                                          <TableRow key={item.id}>
                                            <TableCell>{item.product_name}</TableCell>
                                            <TableCell>{item.size}</TableCell>
                                            <TableCell>{item.quantity}</TableCell>
                                            <TableCell>₹{item.mrp.toFixed(2)}</TableCell>
                                            <TableCell>₹{item.unit_price.toFixed(2)}</TableCell>
                                            <TableCell>{item.discount_percent}%</TableCell>
                                            <TableCell>{item.gst_percent}%</TableCell>
                                            <TableCell className="text-right">₹{item.line_total.toFixed(2)}</TableCell>
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
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {filteredSales.length > 0 && (
              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {startIndex + 1} to {Math.min(endIndex, filteredSales.length)} of {filteredSales.length} sales
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Show:</span>
                    <Select value={itemsPerPage.toString()} onValueChange={handlePageSizeChange}>
                      <SelectTrigger className="w-20 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreviousPage}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <div className="flex items-center gap-2 px-3">
                    <span className="text-sm">
                      Page {currentPage} of {totalPages}
                    </span>
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
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!saleToDelete} onOpenChange={() => setSaleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sale</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete sale {saleToDelete?.sale_number}? Stock quantities will be restored. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSale} className="bg-destructive hover:bg-destructive/90" disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedSales.size} Sale(s)</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedSales.size} selected sale(s)? Stock quantities will be restored for all items. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleBulkDelete} 
              className="bg-destructive hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                'Delete All'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default POSDashboard;
