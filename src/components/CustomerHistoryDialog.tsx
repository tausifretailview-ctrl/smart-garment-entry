import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, IndianRupee, ShoppingCart, CreditCard, RotateCcw, FileText, Receipt, ChevronDown, ChevronRight, History } from "lucide-react";
import { format } from "date-fns";
import { useCustomerBalance } from "@/hooks/useCustomerBalance";

interface SaleItem {
  id: string;
  product_name: string;
  size: string;
  color: string | null;
  quantity: number;
  unit_price: number;
  mrp: number;
  line_total: number;
  barcode: string | null;
}

interface CustomerHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string | null;
  customerName: string;
  organizationId: string;
}

export function CustomerHistoryDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  organizationId,
}: CustomerHistoryDialogProps) {
  const [activeTab, setActiveTab] = useState("sales");
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const [selectedLegacyIndex, setSelectedLegacyIndex] = useState<number>(0);

  // Get customer balance
  const { balance, openingBalance, totalSales, totalPaid, isLoading: balanceLoading } = useCustomerBalance(
    customerId,
    organizationId
  );

  // Fetch sales history with items
  const { data: salesHistory, isLoading: salesLoading } = useQuery({
    queryKey: ['customer-sales-history', customerId, organizationId],
    queryFn: async () => {
      if (!customerId || !organizationId) return [];
      const { data, error } = await supabase
        .from('sales')
        .select(`
          id, sale_number, sale_date, net_amount, payment_status, paid_amount, sale_type, refund_amount,
          sale_items (
            id, product_name, size, color, quantity, unit_price, mrp, line_total, barcode
          )
        `)
        .eq('customer_id', customerId)
        .eq('organization_id', organizationId)
        .order('sale_date', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!customerId && !!organizationId,
  });

  // Fetch payment history from voucher_entries
  const { data: paymentHistory, isLoading: paymentsLoading } = useQuery({
    queryKey: ['customer-payment-history', customerId, organizationId],
    queryFn: async () => {
      if (!customerId || !organizationId) return [];
      
      // First get all sale IDs for this customer
      const { data: sales } = await supabase
        .from('sales')
        .select('id')
        .eq('customer_id', customerId)
        .eq('organization_id', organizationId);
      
      if (!sales || sales.length === 0) return [];
      
      const saleIds = sales.map(s => s.id);
      
      // Fetch voucher entries for these sales
      const { data, error } = await supabase
        .from('voucher_entries')
        .select('*')
        .eq('organization_id', organizationId)
        .in('reference_id', saleIds)
        .or('voucher_type.eq.receipt,voucher_type.eq.RECEIPT')
        .order('voucher_date', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!customerId && !!organizationId,
  });

  // Fetch credit notes
  const { data: creditNotes, isLoading: creditNotesLoading } = useQuery({
    queryKey: ['customer-credit-notes-history', customerId, organizationId],
    queryFn: async () => {
      if (!customerId || !organizationId) return [];
      const { data, error } = await supabase
        .from('credit_notes')
        .select('*')
        .eq('customer_id', customerId)
        .eq('organization_id', organizationId)
        .order('issue_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!customerId && !!organizationId,
  });

  // Fetch sale returns
  const { data: saleReturns, isLoading: returnsLoading } = useQuery({
    queryKey: ['customer-sale-returns-history', customerId, organizationId],
    queryFn: async () => {
      if (!customerId || !organizationId) return [];
      const { data, error } = await supabase
        .from('sale_returns')
        .select('*')
        .eq('customer_id', customerId)
        .eq('organization_id', organizationId)
        .order('return_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!customerId && !!organizationId,
  });

  // Fetch legacy invoices (historical data from Odoo/other systems)
  const { data: legacyInvoices, isLoading: legacyLoading } = useQuery({
    queryKey: ['customer-legacy-invoices', customerId, organizationId],
    queryFn: async () => {
      if (!organizationId || !customerId) return [];
      
      const { data, error } = await supabase
        .from('legacy_invoices')
        .select('id, invoice_number, customer_name, invoice_date, amount, payment_status, source')
        .eq('organization_id', organizationId)
        .eq('customer_id', customerId)
        .order('invoice_date', { ascending: false });
      
      if (error) {
        console.error('Error fetching legacy invoices:', error);
        return [];
      }
      
      return data || [];
    },
    enabled: open && !!organizationId && !!customerId,
  });

  // Calculate refunds from sales
  const refunds = salesHistory?.filter(s => (s.refund_amount || 0) > 0) || [];

  const isLoading = balanceLoading || salesLoading;

  // Keyboard navigation for Legacy tab
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (activeTab !== 'legacy' || !legacyInvoices || legacyInvoices.length === 0) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedLegacyIndex(prev => Math.min(prev + 1, legacyInvoices.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedLegacyIndex(prev => Math.max(prev - 1, 0));
    }
  }, [activeTab, legacyInvoices]);

  useEffect(() => {
    if (open && activeTab === 'legacy') {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, activeTab, handleKeyDown]);

  // Reset selected index when legacy invoices change
  useEffect(() => {
    setSelectedLegacyIndex(0);
  }, [legacyInvoices]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            {customerName}
          </DialogTitle>
          <DialogDescription>Customer account history and transactions</DialogDescription>
        </DialogHeader>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-3 py-3">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Opening Balance</p>
              <p className="text-lg font-bold text-blue-600">₹{openingBalance.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Total Sales</p>
              <p className="text-lg font-bold text-green-600">₹{totalSales.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Total Paid</p>
              <p className="text-lg font-bold text-purple-600">₹{totalPaid.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className={`border-l-4 ${balance > 0 ? 'border-l-red-500' : 'border-l-emerald-500'}`}>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Current Balance</p>
              <p className={`text-lg font-bold ${balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                ₹{Math.abs(balance).toFixed(2)}
                {balance < 0 && ' CR'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid grid-cols-6 w-full">
            <TabsTrigger value="sales" className="gap-1 text-xs">
              <Receipt className="h-3 w-3" />
              Sales ({salesHistory?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="legacy" className="gap-1 text-xs">
              <History className="h-3 w-3" />
              Legacy ({legacyInvoices?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="payments" className="gap-1 text-xs">
              <IndianRupee className="h-3 w-3" />
              Payments ({paymentHistory?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="returns" className="gap-1 text-xs">
              <RotateCcw className="h-3 w-3" />
              Returns ({saleReturns?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="credit-notes" className="gap-1 text-xs">
              <FileText className="h-3 w-3" />
              C/Notes ({creditNotes?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="refunds" className="gap-1 text-xs">
              <CreditCard className="h-3 w-3" />
              Refunds ({refunds.length})
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-3">
            {/* Sales Tab */}
            <TabsContent value="sales" className="mt-0">
              {salesLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : salesHistory && salesHistory.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesHistory.map((sale) => {
                      const isExpanded = expandedSaleId === sale.id;
                      const items = (sale as any).sale_items as SaleItem[] || [];
                      
                      return (
                        <>
                          <TableRow 
                            key={sale.id} 
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setExpandedSaleId(isExpanded ? null : sale.id)}
                          >
                            <TableCell className="p-2">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </TableCell>
                            <TableCell className="font-medium">{sale.sale_number}</TableCell>
                            <TableCell>{format(new Date(sale.sale_date), 'dd/MM/yyyy')}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{sale.sale_type?.toUpperCase()}</Badge>
                            </TableCell>
                            <TableCell>₹{sale.net_amount.toFixed(2)}</TableCell>
                            <TableCell>₹{(sale.paid_amount || 0).toFixed(2)}</TableCell>
                            <TableCell>
                              <Badge variant={sale.payment_status === 'completed' ? 'default' : 'secondary'}>
                                {sale.payment_status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                          {isExpanded && items.length > 0 && (
                            <TableRow key={`${sale.id}-items`}>
                              <TableCell colSpan={7} className="p-0 bg-muted/30">
                                <div className="p-3">
                                  <p className="text-xs font-medium text-muted-foreground mb-2">
                                    Purchased Items ({items.length})
                                  </p>
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="text-xs">
                                        <TableHead className="py-1">Product</TableHead>
                                        <TableHead className="py-1">Size</TableHead>
                                        <TableHead className="py-1">Color</TableHead>
                                        <TableHead className="py-1 text-center">Qty</TableHead>
                                        <TableHead className="py-1 text-right">Price</TableHead>
                                        <TableHead className="py-1 text-right">Total</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {items.map((item) => (
                                        <TableRow key={item.id} className="text-xs">
                                          <TableCell className="py-1 font-medium">{item.product_name}</TableCell>
                                          <TableCell className="py-1">{item.size}</TableCell>
                                          <TableCell className="py-1">{item.color || '-'}</TableCell>
                                          <TableCell className="py-1 text-center">{item.quantity}</TableCell>
                                          <TableCell className="py-1 text-right">₹{item.unit_price.toFixed(2)}</TableCell>
                                          <TableCell className="py-1 text-right font-medium">₹{item.line_total.toFixed(2)}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">No sales found</p>
              )}
            </TabsContent>

            {/* Legacy Invoices Tab (Historical Data) */}
            <TabsContent value="legacy" className="mt-0">
              {legacyLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : legacyInvoices && legacyInvoices.length > 0 ? (
                <>
                  <div className="mb-2 p-2 bg-muted/50 rounded-md">
                    <p className="text-xs text-muted-foreground">
                      Legacy data from: <span className="font-medium">{legacyInvoices[0]?.source || 'External System'}</span>
                      {' | '}Total: <span className="font-medium">₹{legacyInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0).toFixed(2)}</span>
                    </p>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {legacyInvoices.map((inv, index) => (
                        <TableRow 
                          key={inv.id}
                          className={`cursor-pointer ${selectedLegacyIndex === index ? 'bg-primary/10 ring-1 ring-primary/30' : ''}`}
                          onClick={() => setSelectedLegacyIndex(index)}
                        >
                          <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                          <TableCell>{format(new Date(inv.invoice_date), 'dd/MM/yyyy')}</TableCell>
                          <TableCell className="text-right font-semibold">₹{(inv.amount || 0).toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant={inv.payment_status === 'Paid' ? 'default' : 'secondary'}>
                              {inv.payment_status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              ) : (
                <p className="text-center text-muted-foreground py-8">No legacy invoices found</p>
              )}
            </TabsContent>

            {/* Payments Tab */}
            <TabsContent value="payments" className="mt-0">
              {paymentsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : paymentHistory && paymentHistory.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Voucher #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentHistory.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="font-medium">{payment.voucher_number}</TableCell>
                        <TableCell>{format(new Date(payment.voucher_date), 'dd/MM/yyyy')}</TableCell>
                        <TableCell className="text-green-600 font-semibold">₹{payment.total_amount.toFixed(2)}</TableCell>
                        <TableCell className="text-muted-foreground">{payment.description || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">No payments found</p>
              )}
            </TabsContent>

            {/* Returns Tab */}
            <TabsContent value="returns" className="mt-0">
              {returnsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : saleReturns && saleReturns.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Return #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Original Invoice</TableHead>
                      <TableHead>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {saleReturns.map((ret) => (
                      <TableRow key={ret.id}>
                        <TableCell className="font-medium">{ret.return_number}</TableCell>
                        <TableCell>{format(new Date(ret.return_date), 'dd/MM/yyyy')}</TableCell>
                        <TableCell>{ret.original_sale_number || '-'}</TableCell>
                        <TableCell className="text-red-600 font-semibold">₹{ret.net_amount.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">No returns found</p>
              )}
            </TabsContent>

            {/* Credit Notes Tab */}
            <TabsContent value="credit-notes" className="mt-0">
              {creditNotesLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : creditNotes && creditNotes.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Credit Note #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Used</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {creditNotes.map((cn) => (
                      <TableRow key={cn.id}>
                        <TableCell className="font-medium">{cn.credit_note_number}</TableCell>
                        <TableCell>{format(new Date(cn.issue_date), 'dd/MM/yyyy')}</TableCell>
                        <TableCell className="text-violet-600 font-semibold">₹{cn.credit_amount.toFixed(2)}</TableCell>
                        <TableCell>₹{(cn.used_amount || 0).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={cn.status === 'active' ? 'default' : cn.status === 'fully_used' ? 'secondary' : 'outline'}
                            className={cn.status === 'active' ? 'bg-green-500' : ''}
                          >
                            {cn.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">No credit notes found</p>
              )}
            </TabsContent>

            {/* Refunds Tab */}
            <TabsContent value="refunds" className="mt-0">
              {refunds.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Sale Amount</TableHead>
                      <TableHead>Refund Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {refunds.map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell className="font-medium">{sale.sale_number}</TableCell>
                        <TableCell>{format(new Date(sale.sale_date), 'dd/MM/yyyy')}</TableCell>
                        <TableCell>₹{sale.net_amount.toFixed(2)}</TableCell>
                        <TableCell className="text-red-600 font-semibold">₹{(sale.refund_amount || 0).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">No refunds found</p>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
