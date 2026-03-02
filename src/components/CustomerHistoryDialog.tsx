import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Loader2, IndianRupee, ShoppingCart, CreditCard, RotateCcw, FileText, Receipt, ChevronDown, ChevronRight, History, Eye, X } from "lucide-react";
import { format } from "date-fns";
import { useCustomerBalance } from "@/hooks/useCustomerBalance";
import { useCustomerAdvanceBalance } from "@/hooks/useCustomerAdvances";
import { useSchoolFeatures } from "@/hooks/useSchoolFeatures";

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

// Types for preview
type PreviewType = "sale" | "payment" | "return" | "credit-note" | "refund";

interface PreviewData {
  type: PreviewType;
  data: any;
}

interface CustomerHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string | null;
  customerName: string;
  organizationId: string;
}

// ─── Floating Detail Preview ───
function TransactionDetailPreview({ preview, onClose, customerName }: { preview: PreviewData; onClose: () => void; customerName: string }) {
  const d = preview.data;

  if (preview.type === "sale" || preview.type === "refund") {
    const items: SaleItem[] = d.sale_items || [];
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Invoice: {d.sale_number}</h3>
          <Badge variant={d.payment_status === "completed" ? "default" : "secondary"}>{d.payment_status}</Badge>
        </div>
        <Separator />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{customerName}</span></div>
          <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{format(new Date(d.sale_date), "dd/MM/yyyy")}</span></div>
          <div><span className="text-muted-foreground">Type:</span> <span className="font-medium uppercase">{d.sale_type}</span></div>
          <div><span className="text-muted-foreground">Net Amount:</span> <span className="font-bold">₹{d.net_amount?.toFixed(2)}</span></div>
          <div><span className="text-muted-foreground">Paid:</span> <span className="font-medium text-green-600">₹{(d.paid_amount || 0).toFixed(2)}</span></div>
          {preview.type === "refund" && d.refund_amount > 0 && (
            <div><span className="text-muted-foreground">Refund:</span> <span className="font-medium text-red-600">₹{d.refund_amount.toFixed(2)}</span></div>
          )}
        </div>
        {items.length > 0 && (
          <>
            <Separator />
            <p className="text-sm font-semibold text-muted-foreground">Items ({items.length})</p>
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
                    <TableCell className="py-1">{item.color || "-"}</TableCell>
                    <TableCell className="py-1 text-center">{item.quantity}</TableCell>
                    <TableCell className="py-1 text-right">₹{item.unit_price.toFixed(2)}</TableCell>
                    <TableCell className="py-1 text-right font-medium">₹{item.line_total.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </div>
    );
  }

  if (preview.type === "payment") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Payment: {d.voucher_number}</h3>
          <Badge>Receipt</Badge>
        </div>
        <Separator />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{customerName}</span></div>
          <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{format(new Date(d.voucher_date), "dd/MM/yyyy")}</span></div>
          <div><span className="text-muted-foreground">Amount:</span> <span className="font-bold text-green-600">₹{d.total_amount?.toFixed(2)}</span></div>
          <div><span className="text-muted-foreground">Payment Mode:</span> <span className="font-medium">{d.payment_method || d.payment_mode || "-"}</span></div>
        </div>
        {d.description && (
          <>
            <Separator />
            <div className="text-sm">
              <span className="text-muted-foreground">Description:</span>
              <p className="mt-1">{d.description}</p>
            </div>
          </>
        )}
      </div>
    );
  }

  if (preview.type === "return") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Sale Return: {d.return_number}</h3>
          <Badge variant="destructive">Return</Badge>
        </div>
        <Separator />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{customerName}</span></div>
          <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{format(new Date(d.return_date), "dd/MM/yyyy")}</span></div>
          <div><span className="text-muted-foreground">Original Invoice:</span> <span className="font-medium">{d.original_sale_number || "-"}</span></div>
          <div><span className="text-muted-foreground">Net Amount:</span> <span className="font-bold text-red-600">₹{d.net_amount?.toFixed(2)}</span></div>
          {d.gross_amount != null && (
            <div><span className="text-muted-foreground">Gross Amount:</span> <span className="font-medium">₹{d.gross_amount?.toFixed(2)}</span></div>
          )}
          {d.discount_amount != null && d.discount_amount > 0 && (
            <div><span className="text-muted-foreground">Discount:</span> <span className="font-medium">₹{d.discount_amount?.toFixed(2)}</span></div>
          )}
        </div>
        {d.notes && (
          <>
            <Separator />
            <div className="text-sm">
              <span className="text-muted-foreground">Notes:</span>
              <p className="mt-1">{d.notes}</p>
            </div>
          </>
        )}
      </div>
    );
  }

  if (preview.type === "credit-note") {
    const remaining = Math.max(0, (d.credit_amount || 0) - (d.used_amount || 0));
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Credit Note: {d.credit_note_number}</h3>
          <Badge variant={d.status === "active" ? "default" : "secondary"} className={d.status === "active" ? "bg-green-500" : ""}>
            {d.status}
          </Badge>
        </div>
        <Separator />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{customerName}</span></div>
          <div><span className="text-muted-foreground">Issue Date:</span> <span className="font-medium">{format(new Date(d.issue_date), "dd/MM/yyyy")}</span></div>
          <div><span className="text-muted-foreground">Credit Amount:</span> <span className="font-bold text-violet-600">₹{d.credit_amount?.toFixed(2)}</span></div>
          <div><span className="text-muted-foreground">Used:</span> <span className="font-medium">₹{(d.used_amount || 0).toFixed(2)}</span></div>
          <div><span className="text-muted-foreground">Remaining:</span> <span className="font-bold text-green-600">₹{remaining.toFixed(2)}</span></div>
          {d.expiry_date && (
            <div><span className="text-muted-foreground">Expiry:</span> <span className="font-medium">{format(new Date(d.expiry_date), "dd/MM/yyyy")}</span></div>
          )}
        </div>
        {d.notes && (
          <>
            <Separator />
            <div className="text-sm">
              <span className="text-muted-foreground">Notes:</span>
              <p className="mt-1">{d.notes}</p>
            </div>
          </>
        )}
      </div>
    );
  }

  return null;
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
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const legacyRowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const { isSchool } = useSchoolFeatures();

  // Get customer balance (business mode)
  const { balance, openingBalance, totalSales, totalPaid, isLoading: balanceLoading } = useCustomerBalance(
    customerId,
    organizationId
  );

  // Get advance balance
  const { data: advanceBalance = 0 } = useCustomerAdvanceBalance(
    customerId,
    organizationId
  );

  // School: fetch student linked to this customer and their fee data
  const { data: schoolFeeData } = useQuery({
    queryKey: ['school-customer-fees', customerId, organizationId],
    queryFn: async () => {
      if (!customerId || !organizationId) return null;
      // Find student linked to this customer
      const { data: student } = await supabase
        .from('students')
        .select('id, closing_fees_balance, class_id')
        .eq('customer_id', customerId)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (!student) return null;

      // Get current academic year
      const { data: currentYear } = await supabase
        .from('academic_years')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('is_current', true)
        .maybeSingle();

      // Get fee structures for the class
      let structureTotal = 0;
      if (student.class_id && currentYear?.id) {
        const { data: structures } = await supabase
          .from('fee_structures')
          .select('amount, frequency')
          .eq('organization_id', organizationId)
          .eq('academic_year_id', currentYear.id)
          .eq('class_id', student.class_id);
        structureTotal = (structures || []).reduce((sum, fs) => {
          const mult = fs.frequency === 'monthly' ? 12 : fs.frequency === 'quarterly' ? 4 : 1;
          return sum + fs.amount * mult;
        }, 0);
      }

      // Get all fee payments
      const { data: payments } = await supabase
        .from('student_fees')
        .select('paid_amount')
        .eq('student_id', student.id)
        .eq('organization_id', organizationId);
      const feesPaid = (payments || []).reduce((sum, p) => sum + (p.paid_amount || 0), 0);

      const hasStructures = structureTotal > 0;
      const importedBalance = student.closing_fees_balance || 0;
      const feesExpected = hasStructures ? structureTotal : importedBalance;
      const feesDue = Math.max(0, feesExpected - feesPaid);

      return { feesExpected, feesPaid, feesDue, hasStructures, importedBalance };
    },
    enabled: open && isSchool && !!customerId && !!organizationId,
  });

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
        .is('deleted_at', null)
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
      const { data: sales } = await supabase
        .from('sales')
        .select('id')
        .eq('customer_id', customerId)
        .eq('organization_id', organizationId);
      if (!sales || sales.length === 0) return [];
      const saleIds = sales.map(s => s.id);
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
        .is('deleted_at', null)
        .order('return_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!customerId && !!organizationId,
  });

  // Fetch legacy invoices
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
      if (error) { console.error('Error fetching legacy invoices:', error); return []; }
      return data || [];
    },
    enabled: open && !!organizationId && !!customerId,
  });

  const refunds = salesHistory?.filter(s => (s.refund_amount || 0) > 0) || [];
  const isLoading = balanceLoading || salesLoading;

  // Keyboard navigation for Legacy tab
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (activeTab !== 'legacy' || !legacyInvoices || legacyInvoices.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedLegacyIndex(prev => {
        const newIndex = Math.min(prev + 1, legacyInvoices.length - 1);
        legacyRowRefs.current[newIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return newIndex;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedLegacyIndex(prev => {
        const newIndex = Math.max(prev - 1, 0);
        legacyRowRefs.current[newIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return newIndex;
      });
    }
  }, [activeTab, legacyInvoices]);

  useEffect(() => {
    if (open && activeTab === 'legacy') {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, activeTab, handleKeyDown]);

  useEffect(() => { setSelectedLegacyIndex(0); }, [legacyInvoices]);

  // Close preview when main dialog closes
  useEffect(() => { if (!open) setPreview(null); }, [open]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl w-[95vw] max-h-[92vh] overflow-hidden flex flex-col p-3 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <ShoppingCart className="h-6 w-6 text-primary" />
              {customerName}
            </DialogTitle>
            <DialogDescription className="text-sm">Customer account history and transactions</DialogDescription>
          </DialogHeader>

          {/* Summary Cards */}
          {(() => {
            // For school orgs with linked student fee data, show school-specific cards
            if (isSchool && schoolFeeData) {
              return (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 py-3">
                  <Card className={`border-l-4 ${schoolFeeData.hasStructures ? 'border-l-blue-500' : 'border-l-orange-500'}`}>
                    <CardContent className="p-2 sm:p-3">
                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                        {schoolFeeData.hasStructures ? 'Total Fees' : 'Opening Balance'}
                      </p>
                      <p className={`text-sm sm:text-base font-bold truncate ${schoolFeeData.hasStructures ? 'text-blue-600' : 'text-orange-600'}`}>
                        ₹{schoolFeeData.feesExpected.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-green-500">
                    <CardContent className="p-2 sm:p-3">
                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Total Paid</p>
                      <p className="text-sm sm:text-base font-bold text-green-600 truncate">
                        ₹{schoolFeeData.feesPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-red-500">
                    <CardContent className="p-2 sm:p-3">
                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Pending Due</p>
                      <p className="text-sm sm:text-base font-bold text-red-600 truncate">
                        ₹{schoolFeeData.feesDue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-blue-400">
                    <CardContent className="p-2 sm:p-3">
                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Collection Rate</p>
                      <p className="text-sm sm:text-base font-bold text-blue-600 truncate">
                        {schoolFeeData.feesExpected > 0 ? `${((schoolFeeData.feesPaid / schoolFeeData.feesExpected) * 100).toFixed(1)}%` : '0%'}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              );
            }

            // Business mode: original 6-card layout
            const crPending = (creditNotes || []).reduce((sum, cn) => {
              if (cn.status === 'active' || cn.status === 'partially_used') {
                return sum + Math.max(0, (cn.credit_amount || 0) - (cn.used_amount || 0));
              }
              return sum;
            }, 0);
            return (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3 py-3">
                <Card className="border-l-4 border-l-blue-500">
                  <CardContent className="p-2 sm:p-3">
                    <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Opening Bal</p>
                    <p className="text-sm sm:text-base font-bold text-blue-600 truncate">₹{openingBalance.toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-green-500">
                  <CardContent className="p-2 sm:p-3">
                    <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Total Sales</p>
                    <p className="text-sm sm:text-base font-bold text-green-600 truncate">₹{totalSales.toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-purple-500">
                  <CardContent className="p-2 sm:p-3">
                    <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Total Paid</p>
                    <p className="text-sm sm:text-base font-bold text-purple-600 truncate">₹{totalPaid.toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-orange-500">
                  <CardContent className="p-2 sm:p-3">
                    <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Advance</p>
                    <p className="text-sm sm:text-base font-bold text-orange-600 truncate">₹{advanceBalance.toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-pink-500">
                  <CardContent className="p-2 sm:p-3">
                    <p className="text-[10px] sm:text-xs text-muted-foreground truncate">CR Pending</p>
                    <p className="text-sm sm:text-base font-bold text-pink-600 truncate">₹{crPending.toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card className={`border-l-4 ${balance > 0 ? 'border-l-red-500' : 'border-l-emerald-500'}`}>
                  <CardContent className="p-2 sm:p-3">
                    <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Current Bal</p>
                    <p className={`text-sm sm:text-base font-bold truncate ${balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      ₹{Math.abs(balance).toFixed(2)}
                      {balance < 0 && ' CR'}
                    </p>
                  </CardContent>
                </Card>
              </div>
            );
          })()}

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
            <div className="overflow-x-auto -mx-1 px-1">
              <TabsList className="inline-flex w-auto min-w-full sm:grid sm:grid-cols-6 sm:w-full">
                <TabsTrigger value="sales" className="gap-1 text-xs whitespace-nowrap">
                  <Receipt className="h-3 w-3 hidden sm:block" />
                  Sales ({salesHistory?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="legacy" className="gap-1 text-xs whitespace-nowrap">
                  <History className="h-3 w-3 hidden sm:block" />
                  Legacy ({legacyInvoices?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="payments" className="gap-1 text-xs whitespace-nowrap">
                  <IndianRupee className="h-3 w-3 hidden sm:block" />
                  Payments ({paymentHistory?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="returns" className="gap-1 text-xs whitespace-nowrap">
                  <RotateCcw className="h-3 w-3 hidden sm:block" />
                  Returns ({saleReturns?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="credit-notes" className="gap-1 text-xs whitespace-nowrap">
                  <FileText className="h-3 w-3 hidden sm:block" />
                  C/Notes ({creditNotes?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="refunds" className="gap-1 text-xs whitespace-nowrap">
                  <CreditCard className="h-3 w-3 hidden sm:block" />
                  Refunds ({refunds.length})
                </TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="flex-1 mt-3 h-[55vh]">
              {/* Sales Tab */}
              <TabsContent value="sales" className="mt-0">
                {salesLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
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
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesHistory.map((sale) => {
                        const isExpanded = expandedSaleId === sale.id;
                        const items = (sale as any).sale_items as SaleItem[] || [];
                        return (
                          <>
                            <TableRow key={sale.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setExpandedSaleId(isExpanded ? null : sale.id)}>
                              <TableCell className="p-2">
                                {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                              </TableCell>
                              <TableCell className="font-medium">{sale.sale_number}</TableCell>
                              <TableCell>{format(new Date(sale.sale_date), 'dd/MM/yyyy')}</TableCell>
                              <TableCell><Badge variant="outline">{sale.sale_type?.toUpperCase()}</Badge></TableCell>
                              <TableCell>₹{sale.net_amount.toFixed(2)}</TableCell>
                              <TableCell>₹{(sale.paid_amount || 0).toFixed(2)}</TableCell>
                              <TableCell>
                                <Badge variant={sale.payment_status === 'completed' ? 'default' : 'secondary'}>{sale.payment_status}</Badge>
                              </TableCell>
                              <TableCell>
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="View Invoice" onClick={(e) => { e.stopPropagation(); setPreview({ type: "sale", data: sale }); }}>
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                            {isExpanded && items.length > 0 && (
                              <TableRow key={`${sale.id}-items`}>
                                <TableCell colSpan={8} className="p-0 bg-muted/30">
                                  <div className="p-3">
                                    <p className="text-xs font-medium text-muted-foreground mb-2">Purchased Items ({items.length})</p>
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

              {/* Legacy Invoices Tab */}
              <TabsContent value="legacy" className="mt-0">
                {legacyLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
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
                            ref={(el) => { legacyRowRefs.current[index] = el; }}
                            className={`cursor-pointer ${selectedLegacyIndex === index ? 'bg-primary/10 ring-1 ring-primary/30' : ''}`}
                            onClick={() => setSelectedLegacyIndex(index)}
                          >
                            <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                            <TableCell>{format(new Date(inv.invoice_date), 'dd/MM/yyyy')}</TableCell>
                            <TableCell className="text-right font-semibold">₹{(inv.amount || 0).toFixed(2)}</TableCell>
                            <TableCell>
                              <Badge variant={inv.payment_status === 'Paid' ? 'default' : 'secondary'}>{inv.payment_status}</Badge>
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
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : paymentHistory && paymentHistory.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Voucher #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentHistory.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell className="font-medium">{payment.voucher_number}</TableCell>
                          <TableCell>{format(new Date(payment.voucher_date), 'dd/MM/yyyy')}</TableCell>
                          <TableCell className="text-green-600 font-semibold">₹{payment.total_amount.toFixed(2)}</TableCell>
                          <TableCell className="text-muted-foreground">{payment.description || '-'}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="View Payment" onClick={() => setPreview({ type: "payment", data: payment })}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
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
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : saleReturns && saleReturns.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Return #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Original Invoice</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {saleReturns.map((ret) => (
                        <TableRow key={ret.id}>
                          <TableCell className="font-medium">{ret.return_number}</TableCell>
                          <TableCell>{format(new Date(ret.return_date), 'dd/MM/yyyy')}</TableCell>
                          <TableCell>{ret.original_sale_number || '-'}</TableCell>
                          <TableCell className="text-red-600 font-semibold">₹{ret.net_amount.toFixed(2)}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="View Return" onClick={() => setPreview({ type: "return", data: ret })}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
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
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : creditNotes && creditNotes.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Credit Note #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Used</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-10"></TableHead>
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
                            <Badge variant={cn.status === 'active' ? 'default' : cn.status === 'fully_used' ? 'secondary' : 'outline'} className={cn.status === 'active' ? 'bg-green-500' : ''}>
                              {cn.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="View Credit Note" onClick={() => setPreview({ type: "credit-note", data: cn })}>
                              <Eye className="h-4 w-4" />
                            </Button>
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
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {refunds.map((sale) => (
                        <TableRow key={sale.id}>
                          <TableCell className="font-medium">{sale.sale_number}</TableCell>
                          <TableCell>{format(new Date(sale.sale_date), 'dd/MM/yyyy')}</TableCell>
                          <TableCell>₹{sale.net_amount.toFixed(2)}</TableCell>
                          <TableCell className="text-red-600 font-semibold">₹{(sale.refund_amount || 0).toFixed(2)}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="View Invoice" onClick={() => setPreview({ type: "refund", data: sale })}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
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

      {/* Floating Detail Preview Dialog */}
      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Transaction Details
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <TransactionDetailPreview preview={preview} onClose={() => setPreview(null)} customerName={customerName} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
