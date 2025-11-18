import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Home, Search, Printer, Edit, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { generateInvoiceFromHTML } from "@/utils/pdfGenerator";

export default function SalesInvoiceDashboard() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { currentOrganization } = useOrganization();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<string>("all");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Fetch settings for invoice printing
  const { data: settingsData } = useQuery({
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

  // Fetch customers for filter
  const { data: customersData } = useQuery({
    queryKey: ['customers', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .order('customer_name');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch invoices
  const { data: invoicesData, isLoading, refetch } = useQuery({
    queryKey: ['invoices', currentOrganization?.id, searchQuery, selectedCustomer, startDate, endDate],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      let query = supabase
        .from('sales')
        .select(`
          *,
          sale_items (*)
        `)
        .eq('organization_id', currentOrganization.id)
        .eq('sale_type', 'invoice')
        .order('created_at', { ascending: false });

      // Apply search filter
      if (searchQuery) {
        query = query.or(`sale_number.ilike.%${searchQuery}%,customer_name.ilike.%${searchQuery}%`);
      }

      // Apply customer filter
      if (selectedCustomer && selectedCustomer !== 'all') {
        query = query.eq('customer_id', selectedCustomer);
      }

      // Apply date range filter
      if (startDate) {
        query = query.gte('sale_date', startDate.toISOString());
      }
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte('sale_date', endOfDay.toISOString());
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  const toggleRow = (invoiceId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(invoiceId)) {
      newExpanded.delete(invoiceId);
    } else {
      newExpanded.add(invoiceId);
    }
    setExpandedRows(newExpanded);
  };

  const handleEdit = (invoice: any) => {
    // Navigate to invoice page with pre-filled data
    navigate('/sales-invoice', { state: { invoice } });
  };

  const handlePrint = async (invoice: any) => {
    try {
      // Get bill barcode settings for declaration and terms
      const billSettings = settingsData?.bill_barcode_settings as any || {};
      const declarationText = billSettings.bill_header || 'Declaration: Composition taxable person, not eligible to collect tax on supplies.';
      const termsText = billSettings.bill_footer || '';
      const termsList = termsText ? termsText.split('\n').filter((t: string) => t.trim()) : [
        'GOODS ONCE SOLD WILL NOT BE TAKEN BACK.',
        'NO EXCHANGE WITHOUT BARCODE & BILL.',
        'EXCHANGE TIME: 01:00 TO 04:00 PM.'
      ];

      // Fetch shop logo if available
      let logoUrl: string | undefined;
      const saleSettings = settingsData?.sale_settings as any || {};
      if (saleSettings.shop_logo_path) {
        const { data: logoData } = await supabase
          .storage
          .from('company-logos')
          .createSignedUrl(saleSettings.shop_logo_path, 3600);
        
        if (logoData?.signedUrl) {
          logoUrl = logoData.signedUrl;
        }
      }

      // Transform invoice items for PDF generation
      const transformedItems = invoice.sale_items?.map((item: any, index: number) => ({
        sr: index + 1,
        particulars: item.product_name,
        size: item.size,
        barcode: item.barcode || '',
        hsn: '',
        sp: item.mrp,
        qty: item.quantity,
        rate: item.unit_price,
        total: item.line_total,
      })) || [];

      // Calculate payment details based on invoice payment status
      const paymentMethod = invoice.payment_method || 'pending';
      let cashPaid = 0;
      let upiPaid = 0;
      let cardPaid = 0;

      if (invoice.payment_status === 'completed') {
        if (paymentMethod === 'cash') {
          cashPaid = invoice.net_amount;
        } else if (paymentMethod === 'upi') {
          upiPaid = invoice.net_amount;
        } else if (paymentMethod === 'card') {
          cardPaid = invoice.net_amount;
        }
      }

      // Prepare invoice data for PDF
      const invoiceData = {
        billNo: invoice.sale_number,
        date: new Date(invoice.sale_date),
        time: new Date(invoice.sale_date).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        }),
        customerName: invoice.customer_name,
        customerAddress: invoice.customer_address || '',
        customerMobile: invoice.customer_phone || '',
        items: transformedItems,
        subTotal: invoice.gross_amount,
        discount: invoice.discount_amount,
        grandTotal: invoice.net_amount,
        tenderAmount: invoice.net_amount,
        cashPaid,
        upiPaid,
        cardPaid,
        refundCash: 0,
        paymentMethod,
        businessName: settingsData?.business_name || 'BUSINESS NAME',
        businessAddress: settingsData?.address || '',
        businessContact: settingsData?.mobile_number || '',
        businessEmail: settingsData?.email_id || '',
        gstNumber: settingsData?.gst_number || '',
        logo: logoUrl,
        mrpTotal: invoice.gross_amount,
        declarationText,
        termsList,
      };

      // Generate and download PDF
      await generateInvoiceFromHTML(invoiceData);
      
      toast({
        title: "Invoice Generated",
        description: `Invoice PDF for ${invoice.sale_number} has been downloaded`,
      });
    } catch (error: any) {
      console.error('Error generating invoice PDF:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to generate invoice PDF",
      });
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCustomer("all");
    setStartDate(undefined);
    setEndDate(undefined);
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <BackToDashboard />
      
      <div className="max-w-[1600px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Home className="h-5 w-5 text-muted-foreground" />
          <span className="text-muted-foreground">- Sales</span>
          <h1 className="text-2xl font-semibold">Invoice Dashboard</h1>
        </div>

        {/* Filters Card */}
        <Card className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            {/* Search */}
            <div className="space-y-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Invoice No. or Customer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Customer Filter */}
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                <SelectTrigger>
                  <SelectValue placeholder="All Customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customersData?.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.customer_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Start Date */}
            <div className="space-y-2">
              <Label>From Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "dd/MM/yyyy") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={startDate} onSelect={setStartDate} />
                </PopoverContent>
              </Popover>
            </div>

            {/* End Date */}
            <div className="space-y-2">
              <Label>To Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "dd/MM/yyyy") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={endDate} onSelect={setEndDate} />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => refetch()}>Apply Filters</Button>
            <Button variant="outline" onClick={clearFilters}>Clear Filters</Button>
          </div>
        </Card>

        {/* Invoices Table */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">
              All Invoices ({invoicesData?.length || 0})
            </h2>
            <Button onClick={() => navigate('/sales-invoice')}>
              Create New Invoice
            </Button>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading invoices...</div>
          ) : invoicesData && invoicesData.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]"></TableHead>
                    <TableHead>Invoice No.</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Gross Amount</TableHead>
                    <TableHead className="text-right">Discount</TableHead>
                    <TableHead className="text-right">Net Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoicesData.map((invoice) => (
                    <>
                      <TableRow key={invoice.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleRow(invoice.id)}
                          >
                            {expandedRows.has(invoice.id) ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium">{invoice.sale_number}</TableCell>
                        <TableCell>{format(new Date(invoice.sale_date), "dd/MM/yyyy")}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{invoice.customer_name}</div>
                            {invoice.customer_phone && (
                              <div className="text-xs text-muted-foreground">{invoice.customer_phone}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {invoice.due_date ? format(new Date(invoice.due_date), "dd/MM/yyyy") : "-"}
                        </TableCell>
                        <TableCell className="text-right">₹{invoice.gross_amount.toFixed(2)}</TableCell>
                        <TableCell className="text-right text-destructive">
                          ₹{invoice.discount_amount.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ₹{invoice.net_amount.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={invoice.payment_status === 'completed' ? 'default' : 'secondary'}
                          >
                            {invoice.payment_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(invoice)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePrint(invoice)}
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      
                      {/* Expanded Row - Line Items */}
                      {expandedRows.has(invoice.id) && (
                        <TableRow>
                          <TableCell colSpan={10} className="bg-muted/30">
                            <div className="p-4">
                              <h4 className="font-semibold mb-3">Invoice Items</h4>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Product</TableHead>
                                    <TableHead>Size</TableHead>
                                    <TableHead>Barcode</TableHead>
                                    <TableHead className="text-right">Qty</TableHead>
                                    <TableHead className="text-right">Price</TableHead>
                                    <TableHead className="text-right">Discount %</TableHead>
                                    <TableHead className="text-right">GST %</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {invoice.sale_items?.map((item: any) => (
                                    <TableRow key={item.id}>
                                      <TableCell className="font-medium">{item.product_name}</TableCell>
                                      <TableCell>{item.size}</TableCell>
                                      <TableCell className="text-muted-foreground">
                                        {item.barcode || 'N/A'}
                                      </TableCell>
                                      <TableCell className="text-right">{item.quantity}</TableCell>
                                      <TableCell className="text-right">₹{item.unit_price.toFixed(2)}</TableCell>
                                      <TableCell className="text-right">{item.discount_percent}%</TableCell>
                                      <TableCell className="text-right">{item.gst_percent}%</TableCell>
                                      <TableCell className="text-right font-medium">
                                        ₹{item.line_total.toFixed(2)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                              
                              {/* Additional Invoice Info */}
                              {(invoice.notes || invoice.terms_conditions || invoice.shipping_address) && (
                                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                  {invoice.notes && (
                                    <div>
                                      <Label className="text-xs">Notes:</Label>
                                      <p className="text-muted-foreground">{invoice.notes}</p>
                                    </div>
                                  )}
                                  {invoice.terms_conditions && (
                                    <div>
                                      <Label className="text-xs">Terms & Conditions:</Label>
                                      <p className="text-muted-foreground">{invoice.terms_conditions}</p>
                                    </div>
                                  )}
                                  {invoice.shipping_address && (
                                    <div>
                                      <Label className="text-xs">Shipping Address:</Label>
                                      <p className="text-muted-foreground">{invoice.shipping_address}</p>
                                    </div>
                                  )}
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
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-muted-foreground mb-4">No invoices found</div>
              <Button onClick={() => navigate('/sales-invoice')}>
                Create Your First Invoice
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
