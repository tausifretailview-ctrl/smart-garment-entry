import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardHeader, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

import { Search, Printer, Edit, ChevronDown, ChevronUp, Trash2, Loader2, FileText, ArrowRight, Plus, Clock, CheckCircle, Send, IndianRupee, MessageCircle, CalendarIcon } from "lucide-react";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useReactToPrint } from "react-to-print";
import { QuotationPrint } from "@/components/QuotationPrint";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
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
import { useSoftDelete } from "@/hooks/useSoftDelete";

export default function QuotationDashboard() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [quotationToDelete, setQuotationToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);
  const [quotationToPrint, setQuotationToPrint] = useState<any>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const { formatQuotationMessage } = useWhatsAppTemplates();
  const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
  const [toDate, setToDate] = useState<Date | undefined>(undefined);

  // Fetch settings for print
  const { data: settings } = useQuery({
    queryKey: ['settings', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  const { data: quotationsData, isLoading, refetch } = useQuery({
    queryKey: ['quotations', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      const { data, error } = await supabase
        .from('quotations')
        .select(`*, quotation_items (*)`)
        .eq('organization_id', currentOrganization.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  const { softDelete } = useSoftDelete();

  const handleDeleteQuotation = async () => {
    if (!quotationToDelete) return;

    setIsDeleting(true);
    try {
      const success = await softDelete("quotations", quotationToDelete.id);
      if (!success) throw new Error("Failed to delete quotation");

      toast({ title: "Success", description: `Quotation ${quotationToDelete.quotation_number} moved to recycle bin` });
      refetch();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setQuotationToDelete(null);
    }
  };

  const handleConvertToSaleOrder = async (quotation: any) => {
    // Navigate to Sale Order Entry with quotation data pre-filled
    navigate('/sale-order-entry', { 
      state: { 
        fromQuotation: true,
        quotationData: quotation 
      } 
    });
  };

  const handleWhatsAppShare = (quotation: any) => {
    if (!quotation.customer_phone) {
      toast({ title: "Error", description: "Customer phone number not available", variant: "destructive" });
      return;
    }

    // Format items for message
    const itemsText = quotation.quotation_items?.map((item: any, index: number) => 
      `${index + 1}. ${item.product_name} (${item.size}) x ${item.quantity} = ₹${item.line_total?.toFixed(2)}`
    ).join('\n') || '';

    const message = formatQuotationMessage({
      quotation_number: quotation.quotation_number,
      customer_name: quotation.customer_name,
      customer_phone: quotation.customer_phone,
      quotation_date: quotation.quotation_date,
      net_amount: quotation.net_amount,
      valid_until: quotation.valid_until,
      status: quotation.status,
    }, itemsText);

    // Copy to clipboard with improved UX
    const isMac = navigator.platform?.toUpperCase().indexOf("MAC") >= 0;
    const shortcut = isMac ? "Cmd+V" : "Ctrl+V";
    
    navigator.clipboard.writeText(message).then(() => {
      toast({ title: "WhatsApp", description: `✓ Message copied! Paste with ${shortcut} if it doesn't auto-fill` });
    });

    // Open WhatsApp
    const phone = quotation.customer_phone.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`;
    
    setTimeout(() => {
      window.open(whatsappUrl, '_blank');
    }, 300);
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

  // Get unique customers for dropdown
  const uniqueCustomers = Array.from(
    new Map((quotationsData || []).map((q: any) => [q.customer_id || q.customer_name, { id: q.customer_id, name: q.customer_name }]))
  ).map(([_, customer]) => customer).filter((c: any) => c.name);

  const filteredQuotations = (quotationsData || []).filter((q: any) => {
    // Apply status filter
    if (statusFilter !== 'all' && q.status !== statusFilter) return false;
    // Apply customer filter
    if (customerFilter !== 'all') {
      if (q.customer_id && q.customer_id !== customerFilter) return false;
      if (!q.customer_id && q.customer_name !== customerFilter) return false;
    }
    // Apply date range filter
    if (fromDate) {
      const qDate = new Date(q.quotation_date);
      if (qDate < fromDate) return false;
    }
    if (toDate) {
      const qDate = new Date(q.quotation_date);
      const endOfDay = new Date(toDate);
      endOfDay.setHours(23, 59, 59, 999);
      if (qDate > endOfDay) return false;
    }
    // Apply search filter
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    return q.quotation_number?.toLowerCase().includes(searchLower) ||
      q.customer_name?.toLowerCase().includes(searchLower) ||
      q.customer_phone?.toLowerCase().includes(searchLower);
  });

  const totalPages = Math.ceil(filteredQuotations.length / itemsPerPage);
  const paginatedQuotations = filteredQuotations.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", label: string }> = {
      draft: { variant: "secondary", label: "Draft" },
      sent: { variant: "default", label: "Sent" },
      confirmed: { variant: "default", label: "Confirmed" },
      expired: { variant: "destructive", label: "Expired" },
      cancelled: { variant: "outline", label: "Cancelled" },
    };
    const config = variants[status] || { variant: "secondary", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  // Calculate statistics
  const allQuotations = quotationsData || [];
  const stats = {
    total: allQuotations.length,
    totalValue: allQuotations.reduce((sum: number, q: any) => sum + (q.net_amount || 0), 0),
    draft: allQuotations.filter((q: any) => q.status === 'draft').length,
    sent: allQuotations.filter((q: any) => q.status === 'sent').length,
    confirmed: allQuotations.filter((q: any) => q.status === 'confirmed').length,
    expired: allQuotations.filter((q: any) => q.status === 'expired').length,
    conversionRate: allQuotations.length > 0 
      ? ((allQuotations.filter((q: any) => q.status === 'confirmed').length / allQuotations.length) * 100).toFixed(1)
      : '0',
  };

  const handleCardClick = (status: string) => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  return (
    <div className="p-4 space-y-4">

      {/* Summary Statistics Cards - Modern Gradient Style */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card 
          className={`cursor-pointer hover:shadow-lg transition-all duration-300 border-l-4 border-l-blue-500 hover:scale-[1.02] bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 ${statusFilter === 'all' ? 'ring-2 ring-primary shadow-lg' : ''}`}
          onClick={() => handleCardClick('all')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="text-xs font-medium">Total</CardDescription>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
            <p className="text-xs text-muted-foreground">All quotations</p>
          </CardContent>
        </Card>
        
        <Card 
          className={`cursor-pointer hover:shadow-lg transition-all duration-300 border-l-4 border-l-gray-500 hover:scale-[1.02] bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-950/30 dark:to-gray-900/20 ${statusFilter === 'draft' ? 'ring-2 ring-primary shadow-lg' : ''}`}
          onClick={() => handleCardClick('draft')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="text-xs font-medium">Draft</CardDescription>
            <Clock className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{stats.draft}</div>
            <p className="text-xs text-muted-foreground">Pending review</p>
          </CardContent>
        </Card>
        
        <Card 
          className={`cursor-pointer hover:shadow-lg transition-all duration-300 border-l-4 border-l-cyan-500 hover:scale-[1.02] bg-gradient-to-br from-cyan-50 to-cyan-100/50 dark:from-cyan-950/30 dark:to-cyan-900/20 ${statusFilter === 'sent' ? 'ring-2 ring-primary shadow-lg' : ''}`}
          onClick={() => handleCardClick('sent')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="text-xs font-medium">Sent</CardDescription>
            <Send className="h-4 w-4 text-cyan-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-600">{stats.sent}</div>
            <p className="text-xs text-muted-foreground">Awaiting response</p>
          </CardContent>
        </Card>
        
        <Card 
          className={`cursor-pointer hover:shadow-lg transition-all duration-300 border-l-4 border-l-green-500 hover:scale-[1.02] bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20 ${statusFilter === 'confirmed' ? 'ring-2 ring-primary shadow-lg' : ''}`}
          onClick={() => handleCardClick('confirmed')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="text-xs font-medium">Confirmed</CardDescription>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.confirmed}</div>
            <p className="text-xs text-muted-foreground">Accepted</p>
          </CardContent>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 border-l-4 border-l-purple-500 hover:scale-[1.02] bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="text-xs font-medium">Conversion</CardDescription>
            <ArrowRight className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{stats.conversionRate}%</div>
            <p className="text-xs text-muted-foreground">Success rate</p>
          </CardContent>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 border-l-4 border-l-amber-500 hover:scale-[1.02] bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="text-xs font-medium">Total Value</CardDescription>
            <IndianRupee className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">₹{stats.totalValue.toLocaleString('en-IN')}</div>
            <p className="text-xs text-muted-foreground">Gross value</p>
          </CardContent>
        </Card>
      </div>
      
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Quotation Dashboard
          </h1>
          <Button onClick={() => navigate('/quotation-entry')}>
            <Plus className="h-4 w-4 mr-2" />
            New Quotation
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by quotation no, customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[140px] justify-start text-left font-normal", !fromDate && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {fromDate ? format(fromDate, "dd/MM/yy") : "From Date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={fromDate} onSelect={setFromDate} initialFocus className="pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[140px] justify-start text-left font-normal", !toDate && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {toDate ? format(toDate, "dd/MM/yy") : "To Date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={toDate} onSelect={setToDate} initialFocus className="pointer-events-auto" />
            </PopoverContent>
          </Popover>
          {(fromDate || toDate) && (
            <Button variant="ghost" size="sm" onClick={() => { setFromDate(undefined); setToDate(undefined); }}>
              Clear Dates
            </Button>
          )}
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Customer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {uniqueCustomers.map((customer: any) => (
                <SelectItem key={customer.id || customer.name} value={customer.id || customer.name}>
                  {customer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Quotation No</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedQuotations.map((quotation: any) => (
                <>
                  <TableRow key={quotation.id}>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => toggleExpanded(quotation.id)}>
                        {expandedRows.has(quotation.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">{quotation.quotation_number}</TableCell>
                    <TableCell>{format(new Date(quotation.quotation_date), 'dd/MM/yyyy')}</TableCell>
                    <TableCell>{quotation.valid_until ? format(new Date(quotation.valid_until), 'dd/MM/yyyy') : '-'}</TableCell>
                    <TableCell>
                      <div>{quotation.customer_name}</div>
                      <div className="text-sm text-muted-foreground">{quotation.customer_phone}</div>
                    </TableCell>
                    <TableCell className="font-medium">₹{quotation.net_amount?.toFixed(2)}</TableCell>
                    <TableCell>{getStatusBadge(quotation.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleWhatsAppShare(quotation)} title="WhatsApp">
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setQuotationToPrint(quotation)} title="Print">
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => navigate('/quotation-entry', { state: { quotationData: quotation } })}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        {quotation.status !== 'confirmed' && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleConvertToSaleOrder(quotation)}
                            title="Convert to Sale Order"
                          >
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => setQuotationToDelete(quotation)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedRows.has(quotation.id) && (
                    <TableRow>
                      <TableCell colSpan={8} className="bg-muted/50">
                        <div className="p-4">
                          <h4 className="font-medium mb-2">Items</h4>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead>Size</TableHead>
                                <TableHead>Qty</TableHead>
                                <TableHead>Price</TableHead>
                                <TableHead>Total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {quotation.quotation_items?.map((item: any) => (
                                <TableRow key={item.id}>
                                  <TableCell>{item.product_name}</TableCell>
                                  <TableCell>{item.size}</TableCell>
                                  <TableCell>{item.quantity}</TableCell>
                                  <TableCell>₹{item.unit_price?.toFixed(2)}</TableCell>
                                  <TableCell>₹{item.line_total?.toFixed(2)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredQuotations.length)} of {filteredQuotations.length}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>Previous</Button>
              <Button variant="outline" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}>Next</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Delete Dialog */}
      <AlertDialog open={!!quotationToDelete} onOpenChange={() => setQuotationToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quotation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete quotation {quotationToDelete?.quotation_number}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteQuotation} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Print Preview Dialog */}
      {quotationToPrint && (
        <PrintQuotationDialog 
          quotation={quotationToPrint}
          settings={settings}
          onClose={() => setQuotationToPrint(null)}
        />
      )}
    </div>
  );
}

// Print Dialog Component
function PrintQuotationDialog({ quotation, settings, onClose }: { quotation: any; settings: any; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);
  
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Quotation-${quotation.quotation_number}`,
  });

  const printItems = (quotation.quotation_items || []).map((item: any, index: number) => ({
    sr: index + 1,
    particulars: item.product_name,
    size: item.size,
    barcode: item.barcode || '',
    hsn: '',
    qty: item.quantity,
    rate: item.unit_price,
    mrp: item.mrp,
    discountPercent: item.discount_percent,
    total: item.line_total,
  }));

  return (
    <AlertDialog open={true} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Print Quotation</AlertDialogTitle>
        </AlertDialogHeader>
        
        <div className="border rounded-lg overflow-auto max-h-[60vh] bg-white">
          <QuotationPrint
            ref={printRef}
            businessName={settings?.business_name || 'Business Name'}
            address={settings?.address || ''}
            mobile={settings?.mobile_number || ''}
            email={settings?.email_id}
            gstNumber={settings?.gst_number}
            logoUrl={settings?.bill_barcode_settings?.logo_url}
            quotationNumber={quotation.quotation_number}
            quotationDate={new Date(quotation.quotation_date)}
            validUntil={quotation.valid_until ? new Date(quotation.valid_until) : undefined}
            customerName={quotation.customer_name}
            customerAddress={quotation.customer_address}
            customerMobile={quotation.customer_phone}
            customerEmail={quotation.customer_email}
            items={printItems}
            grossAmount={quotation.gross_amount}
            discountAmount={quotation.discount_amount + quotation.flat_discount_amount}
            taxableAmount={quotation.gross_amount - quotation.discount_amount - quotation.flat_discount_amount}
            gstAmount={quotation.gst_amount}
            roundOff={quotation.round_off}
            netAmount={quotation.net_amount}
            termsConditions={quotation.terms_conditions}
            notes={quotation.notes}
            taxType={quotation.tax_type}
            format={settings?.sale_settings?.bill_format === 'a5-horizontal' ? 'a5-horizontal' : settings?.sale_settings?.bill_format === 'a5' ? 'a5-vertical' : settings?.sale_settings?.bill_format || 'a4'}
            colorScheme={settings?.sale_settings?.invoice_color_scheme || 'blue'}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
          <Button onClick={() => handlePrint()}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
