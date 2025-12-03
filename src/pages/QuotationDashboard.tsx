import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Search, Printer, Edit, ChevronDown, ChevronUp, Trash2, Loader2, FileText, ArrowRight, Plus } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useReactToPrint } from "react-to-print";
import { QuotationPrint } from "@/components/QuotationPrint";
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

export default function QuotationDashboard() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [quotationToDelete, setQuotationToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [quotationToPrint, setQuotationToPrint] = useState<any>(null);
  const printRef = useRef<HTMLDivElement>(null);

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
    queryKey: ['quotations', currentOrganization?.id, statusFilter],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      let query = supabase
        .from('quotations')
        .select(`*, quotation_items (*)`)
        .eq('organization_id', currentOrganization.id)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  const handleDeleteQuotation = async () => {
    if (!quotationToDelete) return;

    setIsDeleting(true);
    try {
      await supabase.from("quotation_items").delete().eq("quotation_id", quotationToDelete.id);
      await supabase.from("quotations").delete().eq("id", quotationToDelete.id);

      toast({ title: "Success", description: `Quotation ${quotationToDelete.quotation_number} deleted` });
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

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const filteredQuotations = (quotationsData || []).filter((q: any) => {
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

  return (
    <div className="p-4 space-y-4">
      <BackToDashboard />
      
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
        <div className="flex gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by quotation no, customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
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
            format="a5-vertical"
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
