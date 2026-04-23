import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/hooks/useSettings";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { BackToDashboard } from "@/components/BackToDashboard";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Search, Plus, Calendar as CalendarIcon, FileText, Trash2, ArrowRight, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { CustomerHistoryDialog } from "@/components/CustomerHistoryDialog";

export default function DeliveryChallanDashboard() {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { orgNavigate: navigate } = useOrgNavigation();
  const { user } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date>(startOfMonth(new Date()));
  const [dateTo, setDateTo] = useState<Date>(endOfMonth(new Date()));
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [convertConfirm, setConvertConfirm] = useState<any | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  const [selectedCustomerForHistory, setSelectedCustomerForHistory] = useState<{id: string | null; name: string} | null>(null);

  const { data: challansData, isLoading, refetch } = useQuery({
    queryKey: ['delivery-challans', currentOrganization?.id, dateFrom, dateTo, statusFilter],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      let query = supabase
        .from('delivery_challans')
        .select(`
          *,
          delivery_challan_items (*)
        `)
        .eq('organization_id', currentOrganization.id)
        .is('deleted_at', null)
        .gte('challan_date', dateFrom.toISOString())
        .lte('challan_date', dateTo.toISOString())
        .order('challan_date', { ascending: false });
      
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const filteredChallans = (challansData || []).filter((challan: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      challan.challan_number?.toLowerCase().includes(query) ||
      challan.customer_name?.toLowerCase().includes(query) ||
      challan.customer_phone?.includes(query)
    );
  });

  const handleDelete = async (challanId: string) => {
    try {
      const { error } = await supabase.rpc('soft_delete_delivery_challan', {
        p_challan_id: challanId,
        p_user_id: user?.id
      });
      if (error) throw error;
      toast({ title: "Deleted", description: "Challan moved to recycle bin" });
      refetch();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
    setDeleteConfirm(null);
  };

  const handleConvertToInvoice = async (challan: any) => {
    setIsConverting(true);
    try {
      // Generate sale number
      const { data: saleNumber, error: saleNumError } = await supabase.rpc('generate_sale_number_atomic', {
        p_organization_id: currentOrganization?.id
      });
      if (saleNumError) throw saleNumError;

      // Fetch settings for GST
      const { data: settingsData } = await supabase
        .from('settings')
        .select('sale_settings')
        .eq('organization_id', currentOrganization?.id)
        .maybeSingle();

      const saleSettings = settingsData?.sale_settings as any;
      const defaultGst = saleSettings?.default_gst_percent || 0;

      // Calculate GST amounts
      const items = challan.delivery_challan_items || [];
      let grossAmount = 0;
      let gstAmount = 0;

      const saleItems = items.map((item: any) => {
        const lineGst = item.line_total * defaultGst / 100;
        grossAmount += item.line_total;
        gstAmount += lineGst;
        return {
          product_id: item.product_id,
          variant_id: item.variant_id,
          product_name: item.product_name,
          size: item.size,
          barcode: item.barcode,
          color: item.color,
          quantity: item.quantity,
          unit_price: item.unit_price,
          mrp: item.mrp,
          discount_percent: item.discount_percent,
          gst_percent: defaultGst,
          line_total: item.line_total + (item.line_total * defaultGst / 100),
          hsn_code: item.hsn_code,
        };
      });

      const netAmount = grossAmount + gstAmount - challan.flat_discount_amount + challan.round_off;

      // Create sale record (no stock deduction - already done via challan)
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert([{
          sale_number: saleNumber,
          sale_date: new Date().toISOString(),
          sale_type: 'invoice',
          customer_id: challan.customer_id,
          customer_name: challan.customer_name,
          customer_phone: challan.customer_phone,
          customer_email: challan.customer_email,
          customer_address: challan.customer_address,
          gross_amount: grossAmount,
          gst_amount: gstAmount,
          discount_amount: challan.discount_amount,
          flat_discount_percent: challan.flat_discount_percent,
          flat_discount_amount: challan.flat_discount_amount,
          round_off: challan.round_off,
          net_amount: netAmount,
          payment_method: 'pay_later',
          payment_status: 'pending',
          organization_id: currentOrganization?.id,
          salesman: challan.salesman,
          shipping_address: challan.shipping_address,
          notes: `Converted from Delivery Challan: ${challan.challan_number}`,
        }])
        .select()
        .single();

      if (saleError) throw saleError;

      // Step 1: Delete DC items to restore stock (triggers stock restoration)
      await supabase.from('delivery_challan_items').delete().eq('challan_id', challan.id);

      // Step 2: Insert sale_items (triggers stock deduction — net effect = 0)
      const saleItemsData = saleItems.map((item: any) => ({
        sale_id: saleData.id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        product_name: item.product_name,
        size: item.size,
        barcode: item.barcode,
        color: item.color,
        quantity: item.quantity,
        unit_price: item.unit_price,
        mrp: item.mrp,
        discount_percent: item.discount_percent,
        line_total: item.line_total,
        hsn_code: item.hsn_code,
      }));
      const { error: itemsError } = await supabase.from('sale_items').insert(saleItemsData);
      if (itemsError) throw itemsError;

      // Step 3: Update challan status
      await supabase
        .from('delivery_challans')
        .update({
          status: 'invoiced',
          converted_to_invoice_id: saleData.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', challan.id);

      toast({ 
        title: "Invoice Created", 
        description: `Invoice ${saleNumber} created from challan ${challan.challan_number}` 
      });
      
      refetch();
    } catch (error: any) {
      console.error('Error converting to invoice:', error);
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsConverting(false);
      setConvertConfirm(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="min-w-[80px] justify-center bg-pink-400 hover:bg-pink-500 text-white">Pending</Badge>;
      case 'delivered':
        return <Badge className="min-w-[80px] justify-center bg-green-500 hover:bg-green-600 text-white">Delivered</Badge>;
      case 'invoiced':
        return <Badge className="min-w-[80px] justify-center bg-blue-500 hover:bg-blue-600 text-white">Invoiced</Badge>;
      default:
        return <Badge className="min-w-[80px] justify-center bg-gray-400 text-white">{status}</Badge>;
    }
  };

  // Stats
  const totalChallans = filteredChallans.length;
  const totalAmount = filteredChallans.reduce((sum: number, c: any) => sum + (c.net_amount || 0), 0);
  const pendingCount = filteredChallans.filter((c: any) => c.status === 'pending').length;
  const invoicedCount = filteredChallans.filter((c: any) => c.status === 'invoiced').length;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-[1600px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <BackToDashboard />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Delivery Challans</h1>
              <p className="text-sm text-muted-foreground">Manage delivery challans and convert to invoices</p>
            </div>
          </div>
          <Button onClick={() => navigate('/delivery-challan-entry')}>
            <Plus className="h-4 w-4 mr-2" /> New Challan
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Total Challans</div>
            <div className="text-2xl font-bold">{totalChallans}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Total Value</div>
            <div className="text-2xl font-bold">₹{totalAmount.toLocaleString()}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Pending</div>
            <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Invoiced</div>
            <div className="text-2xl font-bold text-blue-600">{invoicedCount}</div>
          </Card>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by challan no, customer..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="invoiced">Invoiced</SelectItem>
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[140px]">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(dateFrom, "dd MMM")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateFrom} onSelect={(d) => d && setDateFrom(d)} /></PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[140px]">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(dateTo, "dd MMM")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateTo} onSelect={(d) => d && setDateTo(d)} /></PopoverContent>
            </Popover>
          </div>
        </Card>

        {/* Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Challan No</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-center">Items</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">Loading...</TableCell></TableRow>
              ) : filteredChallans.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No challans found</TableCell></TableRow>
              ) : (
                filteredChallans.map((challan: any) => (
                  <TableRow key={challan.id}>
                    <TableCell className="font-medium">{challan.challan_number}</TableCell>
                    <TableCell>{format(new Date(challan.challan_date), 'dd/MM/yyyy')}</TableCell>
                    <TableCell>
                      <div>
                        <button
                          className="text-primary hover:underline cursor-pointer bg-transparent border-none p-0 font-inherit text-left"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCustomerForHistory({ id: challan.customer_id, name: challan.customer_name });
                            setShowCustomerHistory(true);
                          }}
                        >
                          {challan.customer_name}
                        </button>
                      </div>
                      <div className="text-xs text-muted-foreground">{challan.customer_phone}</div>
                    </TableCell>
                    <TableCell className="text-center">
                      {challan.delivery_challan_items?.reduce((sum: number, i: any) => sum + i.quantity, 0) || 0}
                    </TableCell>
                    <TableCell className="text-right font-medium">₹{(challan.net_amount || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-center">{getStatusBadge(challan.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        {challan.status === 'pending' && (
                          <Button variant="ghost" size="sm" onClick={() => setConvertConfirm(challan)} title="Convert to Invoice">
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        )}
                        {challan.converted_to_invoice_id && (
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/sales-invoice-dashboard`)} title="View Invoice">
                            <FileText className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(challan.id)} className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Challan?</AlertDialogTitle>
            <AlertDialogDescription>This will move the challan to recycle bin and restore the stock.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteConfirm && handleDelete(deleteConfirm)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Convert Confirmation */}
      <AlertDialog open={!!convertConfirm} onOpenChange={() => setConvertConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert to Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a Sales Invoice from this delivery challan. GST will be added based on your settings. 
              Stock has already been deducted via the challan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isConverting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => convertConfirm && handleConvertToInvoice(convertConfirm)} disabled={isConverting}>
              {isConverting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Converting...</> : "Convert to Invoice"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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