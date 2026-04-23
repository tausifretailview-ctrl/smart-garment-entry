import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/hooks/useSettings";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardHeader, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

import { Search, Printer, Edit, ChevronDown, ChevronUp, Trash2, Loader2, FileText, ArrowRight, Plus, Clock, CheckCircle, Send, IndianRupee, MessageCircle, CalendarIcon, Download, FilePenLine } from "lucide-react";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";
import { format } from "date-fns";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useToast } from "@/hooks/use-toast";
import { useReactToPrint } from "react-to-print";
import { QuotationPrint } from "@/components/QuotationPrint";
import { ThermalPrint80mm } from "@/components/ThermalPrint80mm";
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
import { CustomerHistoryDialog } from "@/components/CustomerHistoryDialog";
import { useAuth } from "@/contexts/AuthContext";

export default function QuotationDashboard() {
  const { toast } = useToast();
  const { navigate } = useOrgNavigation();
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
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  const [selectedCustomerForHistory, setSelectedCustomerForHistory] = useState<{id: string | null; name: string} | null>(null);
  const { user } = useAuth();

  // Check for unsaved draft
  const { data: hasDraft } = useQuery({
    queryKey: ['quotation-draft', currentOrganization?.id, user?.id],
    queryFn: async () => {
      if (!currentOrganization?.id || !user?.id) return false;
      const { data, error } = await supabase
        .from('drafts')
        .select('id')
        .eq('organization_id', currentOrganization.id)
        .eq('draft_type', 'quotation')
        .eq('created_by', user.id)
        .maybeSingle();
      if (error) return false;
      return !!data;
    },
    enabled: !!currentOrganization?.id && !!user?.id,
  });

  // Fetch settings for print (centralized, cached 5min)
  const { data: settings } = useSettings();

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
    const variants: Record<string, { className: string, label: string }> = {
      draft: { className: "min-w-[80px] justify-center bg-gray-400 hover:bg-gray-500 text-white", label: "Draft" },
      sent: { className: "min-w-[80px] justify-center bg-blue-500 hover:bg-blue-600 text-white", label: "Sent" },
      confirmed: { className: "min-w-[80px] justify-center bg-green-500 hover:bg-green-600 text-white", label: "Confirmed" },
      expired: { className: "min-w-[80px] justify-center bg-red-500 hover:bg-red-600 text-white", label: "Expired" },
      cancelled: { className: "min-w-[80px] justify-center bg-pink-400 hover:bg-pink-500 text-white", label: "Cancelled" },
    };
    const config = variants[status] || { className: "min-w-[80px] justify-center bg-gray-400 text-white", label: status };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  // Server-side summary stats via RPC
  const { data: quotationSummaryData } = useQuery({
    queryKey: ['quotation-summary', currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_quotation_summary', {
        p_org_id: currentOrganization!.id,
      });
      if (error) throw error;
      return data as { total_count: number; total_amount: number; draft_count: number; sent_count: number; accepted_count: number };
    },
    enabled: !!currentOrganization?.id,
    staleTime: 30_000,
  });

  const allQuotations = quotationsData || [];
  const stats = {
    total: quotationSummaryData?.total_count ?? allQuotations.length,
    totalValue: quotationSummaryData?.total_amount ?? 0,
    draft: quotationSummaryData?.draft_count ?? 0,
    sent: quotationSummaryData?.sent_count ?? 0,
    confirmed: quotationSummaryData?.accepted_count ?? 0,
    expired: allQuotations.filter((q: any) => q.status === 'expired').length,
    conversionRate: (quotationSummaryData?.total_count ?? 0) > 0
      ? (((quotationSummaryData?.accepted_count ?? 0) / quotationSummaryData!.total_count) * 100).toFixed(1)
      : '0',
  };

  const handleCardClick = (status: string) => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  return (
    <div className="p-6 space-y-6">

      {/* Summary Statistics Cards - Vasy ERP Style Vibrant */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card 
          className={`cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-lg ${statusFilter === 'all' ? 'ring-2 ring-white' : ''}`}
          onClick={() => handleCardClick('all')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="text-xs font-medium text-white/80">Total</CardDescription>
            <FileText className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.total}</div>
            <p className="text-xs text-white/70">All quotations</p>
          </CardContent>
        </Card>
        
        <Card 
          className={`cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-slate-500 to-slate-600 border-0 shadow-lg ${statusFilter === 'draft' ? 'ring-2 ring-white' : ''}`}
          onClick={() => handleCardClick('draft')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="text-xs font-medium text-white/80">Draft</CardDescription>
            <Clock className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.draft}</div>
            <p className="text-xs text-white/70">Pending review</p>
          </CardContent>
        </Card>
        
        <Card 
          className={`cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-cyan-500 to-cyan-600 border-0 shadow-lg ${statusFilter === 'sent' ? 'ring-2 ring-white' : ''}`}
          onClick={() => handleCardClick('sent')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="text-xs font-medium text-white/80">Sent</CardDescription>
            <Send className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.sent}</div>
            <p className="text-xs text-white/70">Awaiting response</p>
          </CardContent>
        </Card>
        
        <Card 
          className={`cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 shadow-lg ${statusFilter === 'confirmed' ? 'ring-2 ring-white' : ''}`}
          onClick={() => handleCardClick('confirmed')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="text-xs font-medium text-white/80">Confirmed</CardDescription>
            <CheckCircle className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.confirmed}</div>
            <p className="text-xs text-white/70">Accepted</p>
          </CardContent>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-violet-500 to-violet-600 border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="text-xs font-medium text-white/80">Conversion</CardDescription>
            <ArrowRight className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.conversionRate}%</div>
            <p className="text-xs text-white/70">Success rate</p>
          </CardContent>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-amber-500 to-amber-600 border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="text-xs font-medium text-white/80">Total Value</CardDescription>
            <IndianRupee className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">₹{stats.totalValue.toLocaleString('en-IN')}</div>
            <p className="text-xs text-white/70">Gross value</p>
          </CardContent>
        </Card>
      </div>
      
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Quotation Dashboard
          </h1>
          <div className="flex gap-2">
            {hasDraft && (
              <Button variant="outline" className="border-amber-500 text-amber-600 hover:bg-amber-50" onClick={() => navigate('/quotation-entry', { state: { resumeDraft: true } })}>
                <FilePenLine className="h-4 w-4 mr-2" />
                Resume Draft
              </Button>
            )}
            <Button onClick={() => navigate('/quotation-entry')}>
              <Plus className="h-4 w-4 mr-2" />
              New Quotation
            </Button>
          </div>
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
                      <div>
                        <button
                          className="text-primary hover:underline cursor-pointer bg-transparent border-none p-0 font-inherit text-left"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCustomerForHistory({ id: quotation.customer_id, name: quotation.customer_name });
                            setShowCustomerHistory(true);
                          }}
                        >
                          {quotation.customer_name}
                        </button>
                      </div>
                      <div className="text-sm text-muted-foreground">{quotation.customer_phone}</div>
                    </TableCell>
                    <TableCell className="font-medium">₹{quotation.net_amount?.toFixed(2)}</TableCell>
                    <TableCell>{getStatusBadge(quotation.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleWhatsAppShare(quotation)} title="WhatsApp">
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setQuotationToPrint(quotation)} title="Print / PDF">
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

// PDF download helper
async function downloadQuotationPDF(printRef: React.RefObject<HTMLDivElement>, quotationNumber: string) {
  const { default: html2canvas } = await import('html2canvas');
  const { default: jsPDF } = await import('jspdf');
  
  const element = printRef.current;
  if (!element) return;

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
  });

  const imgData = canvas.toDataURL('image/png');
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;
  
  // Determine page size from aspect ratio
  const pdfWidth = 148; // A5 width mm
  const pdfHeight = (imgHeight * pdfWidth) / imgWidth;
  
  const pdf = new jsPDF({
    orientation: pdfHeight > pdfWidth ? 'portrait' : 'landscape',
    unit: 'mm',
    format: [pdfWidth, pdfHeight],
  });

  pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
  pdf.save(`Quotation-${quotationNumber}.pdf`);
}

// Print Dialog Component
function PrintQuotationDialog({ quotation, settings, onClose }: { quotation: any; settings: any; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);
  const [selectedFormat, setSelectedFormat] = useState<'a4' | 'a5' | 'a5-horizontal' | 'thermal'>(
    settings?.sale_settings?.bill_format || 'a4'
  );
  const [isDownloading, setIsDownloading] = useState(false);
  
  const getPageStyle = () => {
    switch (selectedFormat) {
      case 'a5':
        return '@page { size: 148mm 210mm; margin: 4mm; }';
      case 'a5-horizontal':
        return '@page { size: 210mm 148mm; margin: 4mm; }';
      case 'thermal':
        return '@page { size: 80mm auto; margin: 2mm 4mm; }';
      default:
        return '@page { size: A4 portrait; margin: 10mm; }';
    }
  };
  
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Quotation-${quotation.quotation_number}`,
    pageStyle: getPageStyle(),
  });

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    try {
      await downloadQuotationPDF(printRef as React.RefObject<HTMLDivElement>, quotation.quotation_number);
    } catch (error) {
      console.error('PDF download error:', error);
    } finally {
      setIsDownloading(false);
    }
  };

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
          <AlertDialogDescription>
            <div className="flex items-center gap-4 mt-2">
              <Label className="text-foreground">Bill Format:</Label>
              <Select value={selectedFormat} onValueChange={(v: 'a4' | 'a5' | 'a5-horizontal' | 'thermal') => setSelectedFormat(v)}>
                <SelectTrigger className="w-[250px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a4">A4 (210mm × 297mm)</SelectItem>
                  <SelectItem value="a5">A5 Vertical (148mm × 210mm)</SelectItem>
                  <SelectItem value="a5-horizontal">A5 Horizontal (210mm × 148mm)</SelectItem>
                  <SelectItem value="thermal">Thermal (80mm)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="border rounded-lg overflow-auto max-h-[60vh] bg-white">
          {selectedFormat === 'thermal' ? (
            <ThermalPrint80mm
              ref={printRef}
              billNo={quotation.quotation_number}
              date={new Date(quotation.quotation_date)}
              customerName={quotation.customer_name}
              customerPhone={quotation.customer_phone}
              customerAddress={quotation.customer_address}
              items={printItems.map(item => ({
                sr: item.sr,
                particulars: item.particulars,
                qty: item.qty,
                rate: item.rate,
                total: item.total,
              }))}
              subTotal={quotation.gross_amount}
              discount={quotation.discount_amount + quotation.flat_discount_amount}
              grandTotal={quotation.net_amount}
              gstBreakdown={{
                cgst: quotation.gst_amount / 2,
                sgst: quotation.gst_amount / 2,
              }}
              documentType="quotation"
              termsConditions={quotation.terms_conditions}
            />
          ) : (
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
              format={selectedFormat === 'a5' ? 'a5-vertical' : selectedFormat === 'a5-horizontal' ? 'a5-horizontal' : 'a4'}
              colorScheme={settings?.sale_settings?.invoice_color_scheme || 'blue'}
            />
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
          <Button variant="outline" onClick={handleDownloadPDF} disabled={isDownloading}>
            {isDownloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Download PDF
          </Button>
          <Button onClick={() => handlePrint()}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
