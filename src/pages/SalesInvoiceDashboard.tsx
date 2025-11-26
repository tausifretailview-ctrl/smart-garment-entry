import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Search, Printer, Edit, ChevronDown, ChevronUp, Trash2, Loader2, MessageCircle } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { InvoiceWrapper } from "@/components/InvoiceWrapper";
import { PrintPreviewDialog } from "@/components/PrintPreviewDialog";
import { useReactToPrint } from "react-to-print";
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

export default function SalesInvoiceDashboard() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { currentOrganization } = useOrganization();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [invoiceToDelete, setInvoiceToDelete] = useState<any>(null);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [invoiceToPrint, setInvoiceToPrint] = useState<any>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [billFormat, setBillFormat] = useState<'a4' | 'a5' | 'thermal'>('a4');
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentOrganization?.id) {
      fetchBillFormat();
    }
  }, [currentOrganization?.id]);

  const fetchBillFormat = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('sale_settings')
        .eq('organization_id', currentOrganization?.id)
        .maybeSingle();

      if (error) throw error;
      if (data?.sale_settings) {
        const settings = data.sale_settings as any;
        setBillFormat(settings.sales_bill_format || 'a4');
      }
    } catch (error) {
      console.error('Error fetching bill format:', error);
    }
  };

  const { data: invoicesData, isLoading, refetch } = useQuery({
    queryKey: ['invoices', currentOrganization?.id, searchQuery],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      let query = supabase
        .from('sales')
        .select(`*, sale_items (*)`)
        .eq('organization_id', currentOrganization.id)
        .eq('sale_type', 'invoice')
        .order('created_at', { ascending: false });

      if (searchQuery) {
        query = query.or(`sale_number.ilike.%${searchQuery}%,customer_name.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Stock restoration is now handled automatically by database triggers
  // No need for manual stock restoration code
  
  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete) return;

    setIsDeleting(true);
    try {
      // Delete sale_items first - trigger will automatically restore stock
      const { error: itemsError } = await supabase
        .from("sale_items")
        .delete()
        .eq("sale_id", invoiceToDelete.id);

      if (itemsError) throw itemsError;

      // Then delete the sale record
      const { error: saleError } = await supabase
        .from("sales")
        .delete()
        .eq("id", invoiceToDelete.id);

      if (saleError) throw saleError;

      toast({
        title: "Success",
        description: `Invoice ${invoiceToDelete.sale_number} deleted and stock restored`,
      });

      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete invoice",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setInvoiceToDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedInvoices.size === 0) return;

    setIsDeleting(true);
    try {
      const invoicesToDelete = Array.from(selectedInvoices);
      
      // Delete sale_items for all invoices - triggers will automatically restore stock
      for (const invoiceId of invoicesToDelete) {
        const { error: itemsError } = await supabase
          .from("sale_items")
          .delete()
          .eq("sale_id", invoiceId);

        if (itemsError) throw itemsError;

        const { error: saleError } = await supabase
          .from("sales")
          .delete()
          .eq("id", invoiceId);

        if (saleError) throw saleError;
      }

      toast({
        title: "Success",
        description: `${invoicesToDelete.length} invoice(s) deleted and stock restored`,
      });

      setSelectedInvoices(new Set());
      setShowBulkDeleteDialog(false);
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete invoices",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedInvoices.size === (invoicesData?.length || 0) && invoicesData && invoicesData.length > 0) {
      setSelectedInvoices(new Set());
    } else {
      setSelectedInvoices(new Set(invoicesData?.map(i => i.id) || []));
    }
  };

  const toggleSelectInvoice = (invoiceId: string) => {
    const newSelected = new Set(selectedInvoices);
    if (newSelected.has(invoiceId)) {
      newSelected.delete(invoiceId);
    } else {
      newSelected.add(invoiceId);
    }
    setSelectedInvoices(newSelected);
  };

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const totalPages = Math.ceil((invoicesData?.length || 0) / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedInvoices = invoicesData?.slice(startIndex, endIndex) || [];

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
  }, [searchQuery, itemsPerPage]);

  const handlePageSizeChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    onAfterPrint: () => {
      setInvoiceToPrint(null);
      toast({
        title: "Success",
        description: "Invoice printed successfully",
      });
    },
  });

  const handlePrintInvoice = (invoice: any) => {
    setInvoiceToPrint(invoice);
    setShowPrintPreview(true);
  };

  const handleWhatsAppShare = (invoice: any) => {
    if (!invoice.customer_phone) {
      toast({
        title: "No Phone Number",
        description: "Customer phone number is required to send WhatsApp message",
        variant: "destructive",
      });
      return;
    }

    const itemsList = invoice.sale_items?.map((item: any, index: number) => 
      `${index + 1}. ${item.product_name} (${item.size}) - Qty: ${item.quantity} - ₹${item.line_total.toFixed(2)}`
    ).join('\n') || '';

    const message = `*Invoice Details*\n\nInvoice No: ${invoice.sale_number}\nDate: ${format(new Date(invoice.sale_date), 'dd/MM/yyyy')}\nCustomer: ${invoice.customer_name}\n\n*Items:*\n${itemsList}\n\nGross Amount: ₹${invoice.gross_amount.toFixed(2)}\nDiscount: ₹${invoice.discount_amount.toFixed(2)}\nRound Off: ₹${invoice.round_off.toFixed(2)}\n*Net Amount: ₹${invoice.net_amount.toFixed(2)}*\n\nPayment Method: ${invoice.payment_method.toUpperCase()}\nPayment Status: ${invoice.payment_status}\n${invoice.terms_conditions ? `\n*Terms & Conditions:*\n${invoice.terms_conditions}` : ''}\n\nThank you for your business!`;

    const phoneNumber = invoice.customer_phone.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    
    // Create temporary link to open WhatsApp
    const link = document.createElement('a');
    link.href = whatsappUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-accent/5 to-background p-6">
      <BackToDashboard />
      
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Sales Invoice Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">View and manage all sales invoices</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => navigate("/sales-invoice")}>
              New Invoice
            </Button>
            {selectedInvoices.size > 0 && (
              <Button
                onClick={() => setShowBulkDeleteDialog(true)}
                disabled={isDeleting}
                variant="destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected ({selectedInvoices.size})
              </Button>
            )}
          </div>
        </div>

        <Card className="p-6">
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by invoice number or customer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={selectedInvoices.size === (invoicesData?.length || 0) && invoicesData && invoicesData.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                      <TableHead>Invoice No</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedInvoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          No invoices found
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedInvoices.map((invoice: any) => (
                        <>
                          <TableRow key={invoice.id} className="cursor-pointer hover:bg-accent/50">
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedInvoices.has(invoice.id)}
                                onCheckedChange={() => toggleSelectInvoice(invoice.id)}
                              />
                            </TableCell>
                            <TableCell onClick={() => toggleExpanded(invoice.id)}>
                              {expandedRows.has(invoice.id) ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </TableCell>
                            <TableCell className="font-medium" onClick={() => toggleExpanded(invoice.id)}>
                              {invoice.sale_number}
                            </TableCell>
                            <TableCell onClick={() => toggleExpanded(invoice.id)}>{invoice.customer_name}</TableCell>
                            <TableCell onClick={() => toggleExpanded(invoice.id)}>
                              {invoice.customer_phone || '-'}
                            </TableCell>
                            <TableCell onClick={() => toggleExpanded(invoice.id)}>
                              {format(new Date(invoice.sale_date), 'dd/MM/yyyy')}
                            </TableCell>
                            <TableCell onClick={() => toggleExpanded(invoice.id)}>₹{invoice.net_amount.toFixed(2)}</TableCell>
                            <TableCell onClick={() => toggleExpanded(invoice.id)}>
                              <Badge variant={invoice.payment_status === 'completed' ? 'default' : 'secondary'}>
                                {invoice.payment_status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-end gap-2">
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => handleWhatsAppShare(invoice)}
                                  title="Share on WhatsApp"
                                  disabled={!invoice.customer_phone}
                                >
                                  <MessageCircle className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => handlePrintInvoice(invoice)}
                                  title="Print Invoice"
                                >
                                  <Printer className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => navigate('/sales-invoice', { state: { invoiceData: invoice } })}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => setInvoiceToDelete(invoice)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {expandedRows.has(invoice.id) && (
                            <TableRow>
                              <TableCell colSpan={9} className="bg-muted/50 p-4">
                                <div className="space-y-2">
                                  <h4 className="font-semibold">Items:</h4>
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Product</TableHead>
                                        <TableHead>Size</TableHead>
                                        <TableHead>Qty</TableHead>
                                        <TableHead>Price</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {invoice.sale_items?.map((item: any) => (
                                        <TableRow key={item.id}>
                                          <TableCell>{item.product_name}</TableCell>
                                          <TableCell>{item.size}</TableCell>
                                          <TableCell>{item.quantity}</TableCell>
                                          <TableCell>₹{item.unit_price.toFixed(2)}</TableCell>
                                          <TableCell className="text-right">₹{item.line_total.toFixed(2)}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
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

            {invoicesData && invoicesData.length > 0 && (
              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {startIndex + 1} to {Math.min(endIndex, invoicesData.length)} of {invoicesData.length} invoices
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
          </div>
        </Card>
      </div>

      <AlertDialog open={!!invoiceToDelete} onOpenChange={() => setInvoiceToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete invoice {invoiceToDelete?.sale_number}? Stock quantities will be restored. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteInvoice} className="bg-destructive hover:bg-destructive/90" disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedInvoices.size} Invoice(s)</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedInvoices.size} selected invoice(s)? Stock quantities will be restored for all items. This action cannot be undone.
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
        
        {/* Print Preview Dialog */}
        {invoiceToPrint && (
          <PrintPreviewDialog
            open={showPrintPreview}
            onOpenChange={setShowPrintPreview}
            defaultFormat={billFormat}
            invoiceComponent={
              <InvoiceWrapper
                billNo={invoiceToPrint.sale_number}
                date={new Date(invoiceToPrint.sale_date)}
                customerName={invoiceToPrint.customer_name}
                customerAddress={invoiceToPrint.customer_address || ""}
                customerMobile={invoiceToPrint.customer_phone || ""}
                items={invoiceToPrint.sale_items?.map((item: any, index: number) => ({
                  sr: index + 1,
                  particulars: item.product_name,
                  size: item.size,
                  barcode: item.barcode || "",
                  hsn: "",
                  sp: item.mrp,
                  qty: item.quantity,
                  rate: item.unit_price,
                  total: item.line_total,
                })) || []}
                subTotal={invoiceToPrint.gross_amount}
                discount={invoiceToPrint.discount_amount}
                grandTotal={invoiceToPrint.net_amount}
                cashPaid={invoiceToPrint.payment_method === 'cash' ? invoiceToPrint.net_amount : 0}
                upiPaid={invoiceToPrint.payment_method === 'upi' ? invoiceToPrint.net_amount : 0}
                paymentMethod={invoiceToPrint.payment_method}
              />
            }
          />
        )}

        {/* Hidden Invoice for Printing */}
      {invoiceToPrint && (
        <div style={{ 
          position: 'fixed',
          top: 0,
          left: 0,
          width: '210mm',
          minHeight: '297mm',
          opacity: 0,
          pointerEvents: 'none',
          zIndex: -9999,
          overflow: 'visible'
        }}>
          <InvoiceWrapper
            ref={printRef}
            billNo={invoiceToPrint.sale_number}
            date={new Date(invoiceToPrint.sale_date)}
            customerName={invoiceToPrint.customer_name}
            customerAddress={invoiceToPrint.customer_address || ""}
            customerMobile={invoiceToPrint.customer_phone || ""}
            customerGSTIN=""
            items={invoiceToPrint.sale_items?.map((item: any, index: number) => ({
              sr: index + 1,
              particulars: item.product_name,
              size: item.size,
              barcode: item.barcode || "",
              hsn: "",
              sp: item.mrp,
              qty: item.quantity,
              rate: item.unit_price,
              total: item.line_total,
            })) || []}
            subTotal={invoiceToPrint.gross_amount}
            discount={invoiceToPrint.discount_amount}
            grandTotal={invoiceToPrint.net_amount}
            paymentMethod={invoiceToPrint.payment_method}
          />
        </div>
      )}
    </div>
  );
}
