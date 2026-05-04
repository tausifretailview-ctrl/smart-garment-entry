import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
import { Loader2, IndianRupee, ShoppingCart, CreditCard, RotateCcw, FileText, Receipt, ChevronDown, ChevronRight, History, Eye, X, Wallet, Scale, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { useCustomerBalance } from "@/hooks/useCustomerBalance";
import { useCustomerAdvanceBalance } from "@/hooks/useCustomerAdvances";
import { useSchoolFeatures } from "@/hooks/useSchoolFeatures";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { resolveImportedOpeningBalance } from "@/lib/schoolFeeOpening";

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
type PreviewType = "sale" | "payment" | "return" | "credit-note" | "refund" | "advance" | "adjustment";

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

  if (preview.type === "advance") {
    const unused = Math.max(0, (d.amount || 0) - (d.used_amount || 0));
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Advance: {d.advance_number}</h3>
          <Badge variant={d.status === 'active' ? 'default' : d.status === 'partially_used' ? 'warning' : 'secondary'}>
            {d.status?.replace('_', ' ')}
          </Badge>
        </div>
        <Separator />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{customerName}</span></div>
          <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{format(new Date(d.advance_date), "dd/MM/yyyy")}</span></div>
          <div><span className="text-muted-foreground">Amount:</span> <span className="font-bold">₹{d.amount?.toFixed(2)}</span></div>
          <div><span className="text-muted-foreground">Used:</span> <span className="font-medium">₹{(d.used_amount || 0).toFixed(2)}</span></div>
          <div><span className="text-muted-foreground">Unused:</span> <span className={`font-bold ${unused > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>₹{unused.toFixed(2)}</span></div>
          <div><span className="text-muted-foreground">Payment Mode:</span> <span className="font-medium capitalize">{d.payment_method || "-"}</span></div>
          {d.cheque_number && (
            <div><span className="text-muted-foreground">Cheque No:</span> <span className="font-medium">{d.cheque_number}</span></div>
          )}
          {d.transaction_id && (
            <div><span className="text-muted-foreground">Transaction ID:</span> <span className="font-medium">{d.transaction_id}</span></div>
          )}
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

  if (preview.type === "adjustment") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Balance Adjustment</h3>
          <Badge>Adjustment</Badge>
        </div>
        <Separator />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{customerName}</span></div>
          <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{format(new Date(d.adjustment_date), "dd/MM/yyyy")}</span></div>
        </div>
        <Separator />
        <p className="text-sm font-semibold text-muted-foreground">Outstanding Change</p>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div><span className="text-muted-foreground">Previous:</span> <span className="font-medium">₹{d.previous_outstanding?.toFixed(2)}</span></div>
          <div><span className="text-muted-foreground">New:</span> <span className="font-medium">₹{d.new_outstanding?.toFixed(2)}</span></div>
          <div><span className="text-muted-foreground">Diff:</span> <span className={`font-bold ${d.outstanding_difference > 0 ? 'text-red-600' : d.outstanding_difference < 0 ? 'text-green-600' : ''}`}>{d.outstanding_difference > 0 ? '+' : ''}₹{d.outstanding_difference?.toFixed(2)}</span></div>
        </div>
        <p className="text-sm font-semibold text-muted-foreground">Advance Change</p>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div><span className="text-muted-foreground">Previous:</span> <span className="font-medium">₹{d.previous_advance?.toFixed(2)}</span></div>
          <div><span className="text-muted-foreground">New:</span> <span className="font-medium">₹{d.new_advance?.toFixed(2)}</span></div>
          <div><span className="text-muted-foreground">Diff:</span> <span className={`font-bold ${d.advance_difference > 0 ? 'text-green-600' : d.advance_difference < 0 ? 'text-red-600' : ''}`}>{d.advance_difference > 0 ? '+' : ''}₹{d.advance_difference?.toFixed(2)}</span></div>
        </div>
        <Separator />
        <div className="text-sm">
          <span className="text-muted-foreground">Reason:</span>
          <p className="mt-1 font-medium">{d.reason}</p>
        </div>
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

  // School: same liability math as Fee Collection / ledger (session opening + structures; payments scoped to current year)
  const { data: schoolFeeData } = useQuery({
    queryKey: ["school-customer-fees", customerId, organizationId],
    queryFn: async () => {
      if (!customerId || !organizationId) return null;
      const sel =
        "id, closing_fees_balance, class_id, is_new_admission, academic_year_id, fees_opening_is_net";
      let student: any = null;
      const { data: byCustomer } = await supabase
        .from("students")
        .select(sel)
        .eq("customer_id", customerId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (byCustomer) student = byCustomer;
      else {
        const { data: byStudentId } = await supabase
          .from("students")
          .select(sel)
          .eq("id", customerId)
          .eq("organization_id", organizationId)
          .maybeSingle();
        student = byStudentId;
      }
      if (!student) return null;

      const { data: allYears } = await supabase
        .from("academic_years")
        .select("id, year_name, start_date, end_date")
        .eq("organization_id", organizationId)
        .order("start_date", { ascending: true });

      const { data: currentYear } = await supabase
        .from("academic_years")
        .select("id, year_name, start_date, end_date")
        .eq("organization_id", organizationId)
        .eq("is_current", true)
        .maybeSingle();

      if (!currentYear?.id) {
        return {
          feesExpected: 0,
          feesPaid: 0,
          feesDue: 0,
          hasStructures: false,
          importedBalance: 0,
        };
      }

      const yearsChrono = [...(allYears || [])];
      const previousYear = currentYear.start_date
        ? yearsChrono
            .filter((y: any) => y.end_date && new Date(y.end_date) < new Date(currentYear.start_date as string))
            .sort(
              (a: any, b: any) =>
                new Date(b.end_date).getTime() - new Date(a.end_date).getTime()
            )[0]
        : null;

      let latePrevPaid = 0;
      if (previousYear?.id) {
        const { data: lateFees } = await supabase
          .from("student_fees")
          .select("paid_amount, status")
          .eq("organization_id", organizationId)
          .eq("student_id", student.id)
          .eq("academic_year_id", previousYear.id)
          .in("status", ["paid", "partial"])
          .gt("paid_amount", 0);
        latePrevPaid = (lateFees || []).reduce(
          (s, f: any) => s + Number(f.paid_amount || 0),
          0
        );
      }

      const importedOpening = resolveImportedOpeningBalance(
        Number(student.closing_fees_balance || 0),
        latePrevPaid,
        student.fees_opening_is_net === true && student.academic_year_id === currentYear.id
      );

      let structureTotal = 0;
      if (student.class_id) {
        const { data: structures } = await supabase
          .from("fee_structures")
          .select("amount, frequency")
          .eq("organization_id", organizationId)
          .eq("academic_year_id", currentYear.id)
          .eq("class_id", student.class_id);
        structureTotal = (structures || []).reduce((sum, fs: any) => {
          const mult = fs.frequency === "monthly" ? 12 : fs.frequency === "quarterly" ? 4 : 1;
          return sum + fs.amount * mult;
        }, 0);
      }

      const yearName = currentYear.year_name as string | null;
      let liabilityGross: number;
      if (student.is_new_admission === true) {
        liabilityGross = importedOpening;
      } else if (structureTotal > 0) {
        liabilityGross = structureTotal + importedOpening;
      } else if (yearName === "2025-26" && importedOpening > 0) {
        liabilityGross = importedOpening;
      } else {
        liabilityGross = importedOpening;
      }

      const { data: adjustments } = await (supabase.from("student_balance_audit" as any) as any)
        .select("adjustment_type, change_amount")
        .eq("organization_id", organizationId)
        .eq("student_id", student.id)
        .eq("academic_year_id", currentYear.id)
        .not("reason_code", "in", "(receipt_deleted,receipt_modified)");

      const adjustmentNet = (adjustments || []).reduce((sum: number, a: any) => {
        if (a.adjustment_type === "credit") return sum + (a.change_amount || 0);
        if (a.adjustment_type === "debit") return sum - (a.change_amount || 0);
        return sum;
      }, 0);

      const feesExpected = liabilityGross + adjustmentNet;

      const { data: paymentsCur } = await supabase
        .from("student_fees")
        .select("paid_amount, status")
        .eq("student_id", student.id)
        .eq("organization_id", organizationId)
        .eq("academic_year_id", currentYear.id)
        .neq("status", "deleted");

      const feesPaid = (paymentsCur || []).reduce((sum, p: any) => {
        if (p.status === "balance_adjustment") return sum;
        return sum + (p.paid_amount || 0);
      }, 0);

      const feesDue = Math.max(0, feesExpected - feesPaid);
      const hasStructures = structureTotal > 0 && student.is_new_admission !== true;

      return {
        feesExpected,
        feesPaid,
        feesDue,
        hasStructures,
        importedBalance: importedOpening,
      };
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
          id, sale_number, sale_date, net_amount, payment_status, paid_amount, sale_return_adjust, sale_type, refund_amount,
          discount_amount, flat_discount_amount,
          sale_items (
            id, product_name, size, color, quantity, unit_price, mrp, line_total, barcode
          )
        `)
        .eq('customer_id', customerId)
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .neq('payment_status', 'hold')
        .order('sale_date', { ascending: false });
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
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .not('sale_type', 'eq', 'delivery_challan');
      
      const saleIds = (sales || []).map(s => s.id);

      // Fetch vouchers: both invoice-linked AND direct customer receipts
      const { data, error } = await supabase
        .from('voucher_entries')
        .select('id, voucher_number, voucher_date, voucher_type, total_amount, description')
        .eq('organization_id', organizationId)
        .or('voucher_type.eq.receipt,voucher_type.eq.RECEIPT')
        .is('deleted_at', null)
        .or(
          saleIds.length > 0
            ? `reference_id.in.(${saleIds.join(',')}),and(reference_type.eq.customer,reference_id.eq.${customerId})`
            : `and(reference_type.eq.customer,reference_id.eq.${customerId})`
        )
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
        .select('id, credit_note_number, issue_date, credit_amount, used_amount, status')
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
        .select('id, return_number, return_date, original_sale_number, net_amount, credit_status, linked_sale_id')
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

  // Fetch customer advances
  const { data: customerAdvances, isLoading: advancesLoading } = useQuery({
    queryKey: ['customer-advances-history', customerId, organizationId],
    queryFn: async () => {
      if (!customerId || !organizationId) return [];
      const { data, error } = await supabase
        .from('customer_advances')
        .select('id, advance_number, advance_date, amount, used_amount, payment_method, status')
        .eq('customer_id', customerId)
        .eq('organization_id', organizationId)
        .order('advance_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!customerId && !!organizationId,
  });

  // Fetch balance adjustments
  const { data: balanceAdjustments, isLoading: adjustmentsLoading } = useQuery({
    queryKey: ['customer-adjustments-history', customerId, organizationId],
    queryFn: async () => {
      if (!customerId || !organizationId) return [];
      const { data, error } = await supabase
        .from('customer_balance_adjustments')
        .select('id, adjustment_date, reason, previous_outstanding, new_outstanding, outstanding_difference, previous_advance, new_advance, advance_difference')
        .eq('customer_id', customerId)
        .eq('organization_id', organizationId)
        .order('adjustment_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!customerId && !!organizationId,
  });

  const refunds = salesHistory?.filter(s => (s.refund_amount || 0) > 0) || [];
  const isLoading = balanceLoading || salesLoading;
  // Fix Apr 2026: subtract sale_return_adjust to match per-invoice outstanding.
  // Test case: Mamta Footwear-Kandivali W (1ce7dbea-...) outstanding = ₹15,054
  const displayBalance = useMemo(() => {
    const saleReturnAdjustTotal = (salesHistory || []).reduce(
      (sum, sale: any) => sum + (Number(sale.sale_return_adjust) || 0),
      0
    );
    return balance - saleReturnAdjustTotal;
  }, [balance, salesHistory]);

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

  const isMobile = useIsMobile();

  // Shared content renderer (used by both mobile panel and desktop dialog)
  const renderContent = () => (
    <>
      {/* Summary Cards */}
      <div className="px-3 sm:px-5 pb-3 sm:pb-5 flex flex-col flex-1 overflow-hidden">
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
            const creditNotesPending = (creditNotes || []).reduce((sum, cn) => {
              if (cn.status === 'active' || cn.status === 'partially_used') {
                return sum + Math.max(0, (cn.credit_amount || 0) - (cn.used_amount || 0));
              }
              return sum;
            }, 0);

            // Sale returns also create credit for the customer — only count those
            // that are still pending (not yet adjusted/refunded).
            const saleReturnsPending = (saleReturns || []).reduce((sum: number, sr: any) => {
              if (sr.credit_status && sr.credit_status !== 'pending') return sum;
              const alreadyInCN = (creditNotes || []).some((cn: any) =>
                cn.notes?.includes(sr.return_number) || cn.sale_id === sr.linked_sale_id
              );
              return alreadyInCN ? sum : sum + (sr.net_amount || 0);
            }, 0);

            const saleReturnsAdjusted = (saleReturns || []).reduce((sum: number, sr: any) => {
              return sr.credit_status && sr.credit_status !== 'pending'
                ? sum + (sr.net_amount || 0)
                : sum;
            }, 0);

            const crPending = creditNotesPending + saleReturnsPending;
            return (
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6 sm:gap-2 py-2">
                <Card className="border-l-4 border-l-blue-500">
                  <CardContent className="p-2">
                    <p className="text-[9px] sm:text-[10px] uppercase tracking-wide font-semibold text-muted-foreground truncate">Opening Bal</p>
                    <p className="text-xs sm:text-sm font-bold text-blue-600 truncate tabular-nums mt-0.5">₹{openingBalance.toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-green-500">
                  <CardContent className="p-2">
                    <p className="text-[9px] sm:text-[10px] uppercase tracking-wide font-semibold text-muted-foreground truncate">Total Sales</p>
                    <p className="text-xs sm:text-sm font-bold text-green-600 truncate tabular-nums mt-0.5">₹{totalSales.toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-purple-500">
                  <CardContent className="p-2">
                    <p className="text-[9px] sm:text-[10px] uppercase tracking-wide font-semibold text-muted-foreground truncate">Total Paid</p>
                    <p className="text-xs sm:text-sm font-bold text-purple-600 truncate tabular-nums mt-0.5">₹{totalPaid.toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-orange-500">
                  <CardContent className="p-2">
                    <p className="text-[9px] sm:text-[10px] uppercase tracking-wide font-semibold text-muted-foreground truncate">Advance</p>
                    <p className="text-xs sm:text-sm font-bold text-orange-600 truncate tabular-nums mt-0.5">₹{advanceBalance.toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-pink-500">
                  <CardContent className="p-2">
                    <p className="text-[9px] sm:text-[10px] uppercase tracking-wide font-semibold text-muted-foreground truncate">Returns / CR</p>
                    <p className="text-xs sm:text-sm font-bold text-pink-600 truncate tabular-nums mt-0.5">₹{crPending.toFixed(2)}</p>
                    <p className="text-[10px] text-pink-400 mt-0.5">
                      {crPending > 0
                        ? 'Pending adjustment'
                        : saleReturnsAdjusted > 0
                          ? `₹${saleReturnsAdjusted.toFixed(0)} adjusted`
                          : 'None pending'}
                    </p>
                  </CardContent>
                </Card>
                <Card className={`border-l-4 ${displayBalance > 0 ? 'border-l-red-500' : displayBalance < 0 ? 'border-l-emerald-500' : 'border-l-slate-400'}`}>
                  <CardContent className="p-2">
                    <p className="text-[9px] sm:text-[10px] uppercase tracking-wide font-semibold text-muted-foreground truncate">
                      {displayBalance > 0
                        ? 'Outstanding (Dr)'
                        : displayBalance < 0
                          ? (advanceBalance > 0
                              ? 'Unused Advance'
                              : crPending > 0
                                ? 'SR Credit (Pending)'
                                : 'Net Credit Bal')
                          : 'Current Bal'}
                    </p>
                    <p className={`text-xs sm:text-sm font-bold truncate tabular-nums mt-0.5 ${displayBalance > 0 ? 'text-red-600' : displayBalance < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                      ₹{Math.abs(displayBalance).toFixed(2)}
                    </p>
                    <p className={`text-[10px] font-semibold mt-0.5 ${displayBalance > 0 ? 'text-red-500' : displayBalance < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {displayBalance > 0
                        ? 'Customer Owes'
                        : displayBalance < 0
                          ? (advanceBalance > 0
                              ? 'Available for future bills'
                              : crPending > 0
                                ? 'Credit note not yet applied'
                                : 'Customer net credit')
                          : 'Fully Settled ✓'}
                    </p>
                  </CardContent>
                </Card>
              </div>
            );
          })()}

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
            <div className="overflow-x-auto -mx-1 px-1">
              <TabsList className="inline-flex w-auto min-w-full h-9 sm:grid sm:grid-cols-8 sm:w-full bg-muted/60 p-0.5 rounded-lg">
                <TabsTrigger value="sales" className="gap-1 rounded-md text-[10px] sm:text-xs font-medium px-2 h-8 whitespace-nowrap">
                  <Receipt className="h-3 w-3 hidden sm:block" />
                  Sales ({salesHistory?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="legacy" className="gap-1 rounded-md text-[10px] sm:text-xs font-medium px-2 h-8 whitespace-nowrap">
                  <History className="h-3 w-3 hidden sm:block" />
                  Legacy ({legacyInvoices?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="payments" className="gap-1 rounded-md text-[10px] sm:text-xs font-medium px-2 h-8 whitespace-nowrap">
                  <IndianRupee className="h-3 w-3 hidden sm:block" />
                  Payments ({paymentHistory?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="returns" className="gap-1 rounded-md text-[10px] sm:text-xs font-medium px-2 h-8 whitespace-nowrap">
                  <RotateCcw className="h-3 w-3 hidden sm:block" />
                  Returns ({saleReturns?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="credit-notes" className="gap-1 rounded-md text-[10px] sm:text-xs font-medium px-2 h-8 whitespace-nowrap">
                  <FileText className="h-3 w-3 hidden sm:block" />
                  C/Notes ({creditNotes?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="refunds" className="gap-1 rounded-md text-[10px] sm:text-xs font-medium px-2 h-8 whitespace-nowrap">
                  <CreditCard className="h-3 w-3 hidden sm:block" />
                  Refunds ({refunds.length})
                </TabsTrigger>
                <TabsTrigger value="advances" className="gap-1 rounded-md text-[10px] sm:text-xs font-medium px-2 h-8 whitespace-nowrap">
                  <Wallet className="h-3 w-3 hidden sm:block" />
                  Advances ({customerAdvances?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="adjustments" className="gap-1 rounded-md text-[10px] sm:text-xs font-medium px-2 h-8 whitespace-nowrap">
                  <Scale className="h-3 w-3 hidden sm:block" />
                  Adj ({balanceAdjustments?.length || 0})
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
                    <TableHeader className="bg-slate-50 dark:bg-slate-900 sticky top-0">
                      <TableRow className="border-b-2 border-slate-200 dark:border-slate-700">
                        <TableHead className="w-8 text-xs font-bold uppercase tracking-wide text-slate-600"></TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-600">Invoice #</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-600">Date</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-600">Type</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-600">Amount</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-600">Paid</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-600">Status</TableHead>
                        <TableHead className="w-10 text-xs font-bold uppercase tracking-wide text-slate-600"></TableHead>
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
                                {(() => {
                                  const statusConfig: Record<string, string> = {
                                    completed: "bg-emerald-100 text-emerald-700 border-emerald-300",
                                    partial:   "bg-amber-100 text-amber-700 border-amber-300",
                                    pending:   "bg-red-100 text-red-700 border-red-300",
                                  };
                                  return (
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${statusConfig[sale.payment_status] || "bg-slate-100 text-slate-600 border-slate-300"}`}>
                                      {sale.payment_status}
                                    </span>
                                  );
                                })()}
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
                    <TableHeader className="bg-background">
                      <TableRow className="border-b-2 border-border">
                        <TableHead className="text-foreground font-bold">Invoice #</TableHead>
                        <TableHead className="text-foreground font-bold">Date</TableHead>
                        <TableHead className="text-right text-foreground font-bold">Amount</TableHead>
                        <TableHead className="text-foreground font-bold">Status</TableHead>
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
                    <TableHeader className="bg-background">
                      <TableRow className="border-b-2 border-border">
                        <TableHead className="text-foreground font-bold">Voucher #</TableHead>
                        <TableHead className="text-foreground font-bold">Date</TableHead>
                        <TableHead className="text-foreground font-bold">Amount</TableHead>
                        <TableHead className="text-foreground font-bold">Description</TableHead>
                        <TableHead className="w-10 text-foreground font-bold"></TableHead>
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
                    <TableHeader className="bg-background">
                      <TableRow className="border-b-2 border-border">
                        <TableHead className="text-foreground font-bold">Return #</TableHead>
                        <TableHead className="text-foreground font-bold">Date</TableHead>
                        <TableHead className="text-foreground font-bold">Original Invoice</TableHead>
                        <TableHead className="text-foreground font-bold">Amount</TableHead>
                        <TableHead className="w-10 text-foreground font-bold"></TableHead>
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
                    <TableHeader className="bg-background">
                      <TableRow className="border-b-2 border-border">
                        <TableHead className="text-foreground font-bold">Credit Note #</TableHead>
                        <TableHead className="text-foreground font-bold">Date</TableHead>
                        <TableHead className="text-foreground font-bold">Amount</TableHead>
                        <TableHead className="text-foreground font-bold">Used</TableHead>
                        <TableHead className="text-foreground font-bold">Status</TableHead>
                        <TableHead className="w-10 text-foreground font-bold"></TableHead>
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
                    <TableHeader className="bg-background">
                      <TableRow className="border-b-2 border-border">
                        <TableHead className="text-foreground font-bold">Invoice #</TableHead>
                        <TableHead className="text-foreground font-bold">Date</TableHead>
                        <TableHead className="text-foreground font-bold">Sale Amount</TableHead>
                        <TableHead className="text-foreground font-bold">Refund Amount</TableHead>
                        <TableHead className="w-10 text-foreground font-bold"></TableHead>
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

              {/* Advances Tab */}
              <TabsContent value="advances" className="mt-0">
                {advancesLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : customerAdvances && customerAdvances.length > 0 ? (
                  <Table>
                    <TableHeader className="bg-background">
                      <TableRow className="border-b-2 border-border">
                        <TableHead className="text-foreground font-bold">Advance #</TableHead>
                        <TableHead className="text-foreground font-bold">Date</TableHead>
                        <TableHead className="text-right text-foreground font-bold">Amount</TableHead>
                        <TableHead className="text-right text-foreground font-bold">Used</TableHead>
                        <TableHead className="text-right text-foreground font-bold">Unused</TableHead>
                        <TableHead className="text-foreground font-bold">Method</TableHead>
                        <TableHead className="text-foreground font-bold">Status</TableHead>
                        <TableHead className="text-center text-foreground font-bold w-[50px]">View</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customerAdvances.map((adv) => {
                        const unused = Math.max(0, (adv.amount || 0) - (adv.used_amount || 0));
                        return (
                          <TableRow key={adv.id}>
                            <TableCell className="font-medium">{adv.advance_number}</TableCell>
                            <TableCell>{format(new Date(adv.advance_date), 'dd/MM/yyyy')}</TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">₹{adv.amount.toFixed(2)}</TableCell>
                            <TableCell className="text-right tabular-nums">₹{adv.used_amount.toFixed(2)}</TableCell>
                            <TableCell className={`text-right font-semibold tabular-nums ${unused > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                              ₹{unused.toFixed(2)}
                            </TableCell>
                            <TableCell className="capitalize">{adv.payment_method || '-'}</TableCell>
                            <TableCell>
                              <Badge variant={
                                adv.status === 'active' ? 'success' :
                                adv.status === 'partially_used' ? 'warning' : 'secondary'
                              }>
                                {adv.status?.replace('_', ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="View Advance" onClick={() => setPreview({ type: "advance", data: adv })}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No advances found</p>
                )}
              </TabsContent>

              {/* Balance Adjustments Tab */}
              <TabsContent value="adjustments" className="mt-0">
                {adjustmentsLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : balanceAdjustments && balanceAdjustments.length > 0 ? (
                  <Table>
                    <TableHeader className="bg-background">
                      <TableRow className="border-b-2 border-border">
                        <TableHead className="text-foreground font-bold">Date</TableHead>
                        <TableHead className="text-foreground font-bold">Reason</TableHead>
                        <TableHead className="text-right text-foreground font-bold">Prev O/S</TableHead>
                        <TableHead className="text-right text-foreground font-bold">New O/S</TableHead>
                        <TableHead className="text-right text-foreground font-bold">O/S Diff</TableHead>
                        <TableHead className="text-right text-foreground font-bold">Prev Adv</TableHead>
                        <TableHead className="text-right text-foreground font-bold">New Adv</TableHead>
                        <TableHead className="text-right text-foreground font-bold">Adv Diff</TableHead>
                        <TableHead className="text-center text-foreground font-bold w-[50px]">View</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {balanceAdjustments.map((adj) => (
                        <TableRow key={adj.id}>
                          <TableCell>{format(new Date(adj.adjustment_date), 'dd/MM/yyyy')}</TableCell>
                          <TableCell className="font-medium max-w-[200px] truncate" title={adj.reason}>{adj.reason}</TableCell>
                          <TableCell className="text-right tabular-nums">₹{adj.previous_outstanding.toFixed(2)}</TableCell>
                          <TableCell className="text-right tabular-nums">₹{adj.new_outstanding.toFixed(2)}</TableCell>
                          <TableCell className={`text-right font-semibold tabular-nums ${adj.outstanding_difference > 0 ? 'text-red-600' : adj.outstanding_difference < 0 ? 'text-green-600' : ''}`}>
                            {adj.outstanding_difference > 0 ? '+' : ''}₹{adj.outstanding_difference.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">₹{adj.previous_advance.toFixed(2)}</TableCell>
                          <TableCell className="text-right tabular-nums">₹{adj.new_advance.toFixed(2)}</TableCell>
                          <TableCell className={`text-right font-semibold tabular-nums ${adj.advance_difference > 0 ? 'text-green-600' : adj.advance_difference < 0 ? 'text-red-600' : ''}`}>
                            {adj.advance_difference > 0 ? '+' : ''}₹{adj.advance_difference.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="View Adjustment" onClick={() => setPreview({ type: "adjustment", data: adj })}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No balance adjustments found</p>
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>
          </div>
    </>
  );

  // Mobile: full-screen slide-in panel
  if (isMobile) {
    return (
      <>
        {/* Full-screen slide-in panel */}
        <div
          className={cn(
            "fixed inset-0 z-50 bg-background flex flex-col transition-transform duration-300 ease-in-out",
            open ? "translate-x-0" : "translate-x-full pointer-events-none"
          )}
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {/* Mobile header with back button */}
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-3 py-3 flex items-center gap-3 flex-shrink-0">
            <button
              onClick={() => onOpenChange(false)}
              className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center active:scale-90 transition-all touch-manipulation"
            >
              <ArrowLeft className="h-5 w-5 text-foreground" />
            </button>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold truncate">{customerName}</h2>
              <p className="text-[11px] text-muted-foreground">Account history & transactions</p>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
            {renderContent()}
          </div>
        </div>

        {/* Floating Detail Preview Dialog */}
        <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
          <DialogContent className="max-w-[95vw] max-h-[80vh] overflow-y-auto">
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

  // Desktop: standard dialog
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl w-[95vw] max-h-[92vh] overflow-hidden flex flex-col p-0">
          {/* Gradient accent bar */}
          <div className="h-1 w-full bg-gradient-to-r from-primary via-blue-500 to-accent rounded-t-lg flex-shrink-0" />
          <div className="p-3 sm:p-5 pb-0">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
                <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <ShoppingCart className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div>{customerName}</div>
                  <DialogDescription className="text-xs font-normal mt-0.5">
                    Customer account history and transactions
                  </DialogDescription>
                </div>
              </DialogTitle>
            </DialogHeader>
          </div>
          {renderContent()}
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
