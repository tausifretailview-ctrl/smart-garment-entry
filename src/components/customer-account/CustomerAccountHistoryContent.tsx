import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  IndianRupee,
  CreditCard,
  RotateCcw,
  FileText,
  Receipt,
  ChevronDown,
  ChevronRight,
  Eye,
  Wallet,
  Scale,
  Pencil,
  ExternalLink,
  Link2,
  Undo2,
  History,
} from "lucide-react";
import { format } from "date-fns";
import {
  canApplyReturnCreditNote,
  useCustomerAccountHistoryData,
} from "@/hooks/useCustomerAccountHistoryData";
import { cn } from "@/lib/utils";
import type { CustomerAccountHistoryActions } from "@/components/customer-account/customerAccountHistoryActions";
import { CustomerAccountTabToolbar } from "@/components/customer-account/CustomerAccountTabToolbar";
import {
  defaultCustomerAccountTabFilters,
  filterAdvances,
  filterByDateAndSearch,
  filterCreditNotes,
  filterSales,
  isSaleRecordCancelled,
  type CustomerAccountTabFilters,
} from "@/components/customer-account/customerAccountTabFilters";
import {
  accountsHistoryCardClass,
  accountsHistoryTableClass,
  accountsHistoryTableWrapClass,
  accountsHistoryThClass,
} from "@/components/accounts/accountsHistoryUi";

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

const fmtTotal = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function computeSaleBalance(sale: {
  net_amount?: number | null;
  paid_amount?: number | null;
  sale_return_adjust?: number | null;
  is_cancelled?: boolean | null;
  payment_status?: string | null;
}) {
  if (isSaleRecordCancelled(sale)) return 0;
  const net = Number(sale.net_amount || 0);
  const paid = Number(sale.paid_amount || 0);
  const sra = Number(sale.sale_return_adjust || 0);
  return Math.max(0, net - paid - sra);
}

function TableTotalRow({
  label,
  leadingColSpan,
  trailingColSpan = 0,
  amounts,
  variant = "default",
}: {
  label: string;
  leadingColSpan: number;
  trailingColSpan?: number;
  amounts: Array<{ value: number; className?: string }>;
  variant?: "default" | "grand";
}) {
  const isGrand = variant === "grand";
  return (
    <TableRow className={cn("border-t-2", isGrand ? "bg-slate-100 dark:bg-slate-800" : "bg-muted/50 font-semibold")}>
      <TableCell
        colSpan={leadingColSpan}
        className={cn(
          "text-right uppercase tracking-wide text-muted-foreground",
          isGrand ? "text-sm font-bold text-foreground" : "text-xs",
        )}
      >
        {label}
      </TableCell>
      {amounts.map((cell, i) => (
        <TableCell
          key={i}
          className={cn(
            "num tabular-nums",
            isGrand ? "text-lg font-bold text-foreground" : "text-sm font-semibold",
            cell.className,
          )}
        >
          {fmtTotal(cell.value)}
        </TableCell>
      ))}
      {trailingColSpan > 0 ? <TableCell colSpan={trailingColSpan} /> : null}
    </TableRow>
  );
}

const customerAccountTableClass = cn(accountsHistoryTableClass, "erp-desktop-table customer-account-grid");

const customerTabTriggerClass =
  "gap-1.5 rounded-none border-b-2 border-transparent text-slate-600 dark:text-slate-400 data-[state=active]:border-primary data-[state=active]:text-slate-900 dark:data-[state=active]:text-slate-100 data-[state=active]:bg-transparent data-[state=active]:font-semibold px-4 h-10 text-xs sm:text-sm font-medium whitespace-nowrap";

function CustomerAccountTable({ children }: { children: React.ReactNode }) {
  return (
    <div className={accountsHistoryTableWrapClass}>
      <Table className={customerAccountTableClass}>{children}</Table>
    </div>
  );
}

const salesTableColGroup = (
  <colgroup>
    <col className="w-8" />
    <col className="w-[11rem]" />
    <col className="w-[5.5rem]" />
    <col className="w-[5rem]" />
    <col className="w-[7rem]" />
    <col className="w-[7rem]" />
    <col className="w-[7.5rem]" />
    <col className="w-[5.5rem]" />
    <col className="w-[5rem]" />
  </colgroup>
);

function CustomerAccountSalesTable({ children }: { children: React.ReactNode }) {
  return (
    <div className={accountsHistoryTableWrapClass}>
      <Table className={cn(customerAccountTableClass, "table-fixed")}>
        {salesTableColGroup}
        {children}
      </Table>
    </div>
  );
}

function SalesGrandTotalRow({
  count,
  amounts,
}: {
  count: number;
  amounts: { amount: number; paid: number; balance: number };
}) {
  return (
    <TableRow className="bg-slate-100 dark:bg-slate-800 border-t-2">
      <TableCell className="p-2" />
      <TableCell colSpan={3} className="text-right text-sm font-bold uppercase tracking-wide text-foreground">
        Total ({count})
      </TableCell>
      <TableCell className="num text-lg font-bold text-primary">{fmtTotal(amounts.amount)}</TableCell>
      <TableCell className="num text-lg font-bold text-emerald-700">{fmtTotal(amounts.paid)}</TableCell>
      <TableCell
        className={cn(
          "num text-lg font-bold",
          amounts.balance > 0 ? "text-amber-700" : "text-emerald-700",
        )}
      >
        {fmtTotal(amounts.balance)}
      </TableCell>
      <TableCell colSpan={2} />
    </TableRow>
  );
}

function EmptyTabMessage({ loading, hasRaw, label }: { loading?: boolean; hasRaw?: boolean; label: string }) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  return (
    <p className="text-center text-muted-foreground py-12 text-sm">
      {hasRaw ? "No records match the current filters" : `No ${label} found`}
    </p>
  );
}

// ─── Floating Detail Preview ───
function TransactionDetailPreview({ preview, onClose, customerName }: { preview: PreviewData; onClose: () => void; customerName: string }) {
  const d = preview.data;

  if (preview.type === "sale" || preview.type === "refund") {
    const items: SaleItem[] = d.sale_items || [];
    const saleCancelled = isSaleRecordCancelled(d);
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className={cn("text-lg font-bold", saleCancelled && "line-through decoration-red-500/80")}>Invoice: {d.sale_number}</h3>
          <Badge variant={saleCancelled ? "destructive" : d.payment_status === "completed" ? "default" : "secondary"}>
            {saleCancelled ? "Cancelled" : d.payment_status}
          </Badge>
        </div>
        {saleCancelled && d.cancelled_reason && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Reason:</span> {d.cancelled_reason}
          </p>
        )}
        <Separator />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{customerName}</span></div>
          <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{format(new Date(d.sale_date), "dd/MM/yyyy")}</span></div>
          <div><span className="text-muted-foreground">Type:</span> <span className="font-medium uppercase">{d.sale_type}</span></div>
          <div>
            <span className="text-muted-foreground">Net Amount:</span>{" "}
            <span className={cn("font-bold", saleCancelled && "line-through decoration-red-500/80 text-muted-foreground")}>₹{d.net_amount?.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Paid:</span>{" "}
            <span className={cn("font-medium text-green-600", saleCancelled && "line-through decoration-red-500/70")}>₹{(d.paid_amount || 0).toFixed(2)}</span>
          </div>
          {preview.type === "refund" && d.refund_amount > 0 && (
            <div><span className="text-muted-foreground">Refund:</span> <span className="font-medium text-red-600">₹{d.refund_amount.toFixed(2)}</span></div>
          )}
        </div>
        {saleCancelled && items.length === 0 && (
          <p className="text-xs text-muted-foreground italic">Line items were removed when this invoice was cancelled (stock restored).</p>
        )}
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

interface CustomerAccountHistoryContentProps {
  customerId: string | null;
  customerName: string;
  organizationId: string;
  queriesEnabled: boolean;
  scrollAreaClassName?: string;
  wrapperClassName?: string;
  actions?: CustomerAccountHistoryActions;
}

export function CustomerAccountHistoryContent({
  customerId,
  customerName,
  organizationId,
  queriesEnabled,
  scrollAreaClassName = "flex-1 mt-3 h-[55vh]",
  wrapperClassName = "px-3 sm:px-5 pb-3 sm:pb-5 flex flex-col flex-1 overflow-hidden",
  actions,
}: CustomerAccountHistoryContentProps) {
  const [activeTab, setActiveTab] = useState("sales");
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [tabFilters, setTabFilters] = useState<Record<string, CustomerAccountTabFilters>>({});

  const filters = tabFilters[activeTab] ?? defaultCustomerAccountTabFilters();
  const patchFilters = useCallback((patch: Partial<CustomerAccountTabFilters>) => {
    setTabFilters((prev) => ({
      ...prev,
      [activeTab]: { ...(prev[activeTab] ?? defaultCustomerAccountTabFilters()), ...patch },
    }));
  }, [activeTab]);

  const {
    summary,
    salesHistory,
    salesLoading,
    paymentHistory,
    paymentsLoading,
    creditNotes,
    creditNotesLoading,
    saleReturns,
    returnsLoading,
    customerAdvances,
    advancesLoading,
    balanceAdjustments,
    adjustmentsLoading,
    refunds,
    refundableCreditBalance,
  } = useCustomerAccountHistoryData({ customerId, organizationId, queriesEnabled });

  const filteredSales = useMemo(() => filterSales(salesHistory, filters), [salesHistory, filters]);
  const filteredActiveSales = useMemo(() => filteredSales.filter((s) => !isSaleRecordCancelled(s)), [filteredSales]);
  const filteredPayments = useMemo(
    () => filterByDateAndSearch(paymentHistory, filters, "voucher_date", ["voucher_number", "description", "payment_method"]),
    [paymentHistory, filters],
  );
  const filteredReturns = useMemo(
    () => filterByDateAndSearch(saleReturns, filters, "return_date", ["return_number", "original_sale_number"]),
    [saleReturns, filters],
  );
  const filteredCreditNotes = useMemo(() => filterCreditNotes(creditNotes, filters), [creditNotes, filters]);
  const filteredRefunds = useMemo(
    () => filterByDateAndSearch(refunds, filters, "sale_date", ["sale_number"]),
    [refunds, filters],
  );
  const filteredAdvances = useMemo(() => filterAdvances(customerAdvances, filters), [customerAdvances, filters]);
  const filteredAdjustments = useMemo(
    () => filterByDateAndSearch(balanceAdjustments, filters, "adjustment_date", ["reason"]),
    [balanceAdjustments, filters],
  );

  const tabTotals = useMemo(() => {
    const salesAmount = filteredActiveSales.reduce((sum, s) => sum + Number(s.net_amount || 0), 0);
    const salesPaid = filteredActiveSales.reduce((sum, s) => sum + Number(s.paid_amount || 0), 0);
    const salesBalance = filteredActiveSales.reduce((sum, s) => sum + computeSaleBalance(s), 0);
    const paymentsAmount = filteredPayments.reduce((sum, p) => sum + Number(p.total_amount || 0), 0);
    const returnsAmount = filteredReturns.reduce((sum, r) => sum + Number(r.net_amount || 0), 0);
    const cnAmount = filteredCreditNotes.reduce((sum, cn) => sum + Number(cn.credit_amount || 0), 0);
    const cnUsed = filteredCreditNotes.reduce((sum, cn) => sum + Number(cn.used_amount || 0), 0);
    const refundSaleAmount = filteredRefunds.reduce((sum, s) => sum + Number(s.net_amount || 0), 0);
    const refundAmount = filteredRefunds.reduce((sum, s) => sum + Number(s.refund_amount || 0), 0);
    const advanceAmount = filteredAdvances.reduce((sum, a) => sum + Number(a.amount || 0), 0);
    const advanceUsed = filteredAdvances.reduce((sum, a) => sum + Number(a.used_amount || 0), 0);
    const advanceUnused = filteredAdvances.reduce(
      (sum, a) => sum + Math.max(0, Number(a.amount || 0) - Number(a.used_amount || 0)),
      0,
    );
    const adjOsDiff = filteredAdjustments.reduce((sum, a) => sum + Number(a.outstanding_difference || 0), 0);
    const adjAdvDiff = filteredAdjustments.reduce((sum, a) => sum + Number(a.advance_difference || 0), 0);
    return {
      salesAmount,
      salesPaid,
      salesBalance,
      paymentsAmount,
      returnsAmount,
      cnAmount,
      cnUsed,
      refundSaleAmount,
      refundAmount,
      advanceAmount,
      advanceUsed,
      advanceUnused,
      adjOsDiff,
      adjAdvDiff,
    };
  }, [
    filteredActiveSales,
    filteredPayments,
    filteredReturns,
    filteredCreditNotes,
    filteredRefunds,
    filteredAdvances,
    filteredAdjustments,
  ]);

  useEffect(() => { if (!queriesEnabled) setPreview(null); }, [queriesEnabled]);

  const renderContent = () => (
    <>
      <div className={wrapperClassName}>
          {actions && refundableCreditBalance > 0 && (
            <div className="mb-3 p-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                ₹{refundableCreditBalance.toLocaleString("en-IN")} credit balance — refund to customer
              </p>
              <div className="flex items-center gap-2">
                {summary.advanceAvailable > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-amber-400 text-amber-800 dark:text-amber-200"
                    onClick={actions.onRefundAdvance}
                  >
                    <Undo2 className="h-4 w-4 mr-1" />
                    Refund Advance
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-red-400 text-red-700 dark:text-red-300"
                  onClick={actions.onRefundOverpayment}
                >
                  <IndianRupee className="h-4 w-4 mr-1" />
                  Refund Overpayment
                </Button>
              </div>
            </div>
          )}

          {actions && summary.advanceAvailable > 0.005 && summary.outstandingDr > 0.005 && (
            <div className="mb-3 flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={actions.onApplyAdvance}>
                <Wallet className="h-4 w-4 mr-1" />
                Apply advance in Accounts
              </Button>
            </div>
          )}

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
            <div className="overflow-x-auto -mx-1 px-1">
              <TabsList className="inline-flex w-auto min-w-full h-10 sm:w-full bg-transparent border-b border-slate-200 rounded-none p-0 gap-3">
                <TabsTrigger value="sales" className={customerTabTriggerClass}>
                  <Receipt className="h-3 w-3 hidden sm:block" />
                  Sales ({salesHistory?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="payments" className={customerTabTriggerClass}>
                  <IndianRupee className="h-3 w-3 hidden sm:block" />
                  Payments ({paymentHistory?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="returns" className={customerTabTriggerClass}>
                  <RotateCcw className="h-3 w-3 hidden sm:block" />
                  Returns ({saleReturns?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="credit-notes" className={customerTabTriggerClass}>
                  <FileText className="h-3 w-3 hidden sm:block" />
                  C/Notes ({creditNotes?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="refunds" className={customerTabTriggerClass}>
                  <CreditCard className="h-3 w-3 hidden sm:block" />
                  Refunds ({refunds.length})
                </TabsTrigger>
                <TabsTrigger value="advances" className={customerTabTriggerClass}>
                  <Wallet className="h-3 w-3 hidden sm:block" />
                  Advances ({customerAdvances?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="adjustments" className={customerTabTriggerClass}>
                  <Scale className="h-3 w-3 hidden sm:block" />
                  Adj ({balanceAdjustments?.length || 0})
                </TabsTrigger>
              </TabsList>
            </div>

            <div className={cn(accountsHistoryCardClass, "flex-1 min-h-0 flex flex-col mt-2")}>
              <CustomerAccountTabToolbar activeTab={activeTab} filters={filters} onChange={patchFilters} />
            <ScrollArea className={scrollAreaClassName}>
              {/* Sales Tab */}
              <TabsContent value="sales" className="mt-0">
                {salesLoading ? (
                  <EmptyTabMessage loading label="sales" />
                ) : filteredSales.length > 0 ? (
                  <CustomerAccountSalesTable>
                    <TableHeader className="!static">
                      <TableRow>
                        <TableHead className={cn(accountsHistoryThClass, "w-8")} />
                        <TableHead className={accountsHistoryThClass}>Invoice No</TableHead>
                        <TableHead className={accountsHistoryThClass}>Date</TableHead>
                        <TableHead className={accountsHistoryThClass}>Type</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "num")}>Amount</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "num")}>Paid</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "num")}>Balance</TableHead>
                        <TableHead className={accountsHistoryThClass}>Status</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "text-right")}>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSales.map((sale) => {
                        const isExpanded = expandedSaleId === sale.id;
                        const items = (sale as any).sale_items as SaleItem[] || [];
                        const saleCancelled = isSaleRecordCancelled(sale);
                        const balance = computeSaleBalance(sale);
                        return (
                          <Fragment key={sale.id}>
                            <TableRow
                              className={cn(
                                "cursor-pointer hover:bg-muted/50",
                                saleCancelled && "opacity-80 bg-muted/20",
                              )}
                              onClick={() => setExpandedSaleId(isExpanded ? null : sale.id)}
                            >
                              <TableCell className="p-2">
                                {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                              </TableCell>
                              <TableCell className={cn("font-medium font-mono text-primary", saleCancelled && "line-through decoration-red-500/70 text-muted-foreground")}>{sale.sale_number}</TableCell>
                              <TableCell className={cn(saleCancelled && "text-muted-foreground")}>{format(new Date(sale.sale_date), 'dd/MM/yyyy')}</TableCell>
                              <TableCell><Badge variant="outline" className="text-[10px]">{sale.sale_type?.toUpperCase()}</Badge></TableCell>
                              <TableCell className={cn("num font-semibold text-primary", saleCancelled && "line-through decoration-red-500/70 text-muted-foreground")}>₹{sale.net_amount.toFixed(2)}</TableCell>
                              <TableCell className={cn("num", saleCancelled && "line-through decoration-red-500/70 text-muted-foreground")}>₹{(sale.paid_amount || 0).toFixed(2)}</TableCell>
                              <TableCell className={cn(
                                "num font-semibold",
                                saleCancelled && "text-muted-foreground",
                                !saleCancelled && balance > 0 && "text-amber-700",
                                !saleCancelled && balance <= 0 && "text-emerald-700",
                              )}>
                                {saleCancelled ? "—" : fmtTotal(balance)}
                              </TableCell>
                              <TableCell>
                                {(() => {
                                  if (saleCancelled) {
                                    return (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-red-100 text-red-800 border-red-300 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800">
                                        Cancelled
                                      </span>
                                    );
                                  }
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
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-center gap-0.5">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" title="View details" onClick={() => setPreview({ type: "sale", data: sale })}>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  {actions && !saleCancelled && (
                                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Open invoice" onClick={() => actions.onViewInvoice(sale.id)}>
                                      <ExternalLink className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                            {isExpanded && items.length > 0 && (
                              <TableRow key={`${sale.id}-items`}>
                                <TableCell colSpan={9} className="p-0 bg-muted/30">
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
                            {isExpanded && saleCancelled && items.length === 0 && (
                              <TableRow key={`${sale.id}-cancelled-note`}>
                                <TableCell colSpan={9} className="py-2 text-xs text-muted-foreground italic bg-muted/20">
                                  Items were removed when this invoice was cancelled; amounts above are for audit reference only.
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                    <TableFooter className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 [&>tr]:border-0 [&>tr]:hover:bg-transparent">
                      <SalesGrandTotalRow
                        count={filteredActiveSales.length}
                        amounts={{
                          amount: tabTotals.salesAmount,
                          paid: tabTotals.salesPaid,
                          balance: tabTotals.salesBalance,
                        }}
                      />
                    </TableFooter>
                  </CustomerAccountSalesTable>
                ) : (
                  <EmptyTabMessage hasRaw={!!salesHistory?.length} label="sales" />
                )}
              </TabsContent>

              {/* Payments Tab */}
              <TabsContent value="payments" className="mt-0">
                {paymentsLoading ? (
                  <EmptyTabMessage loading label="payments" />
                ) : filteredPayments.length > 0 ? (
                  <CustomerAccountTable>
                    <TableHeader className="!static">
                      <TableRow>
                        <TableHead className={accountsHistoryThClass}>Voucher No</TableHead>
                        <TableHead className={accountsHistoryThClass}>Date</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "num")}>Amount</TableHead>
                        <TableHead className={accountsHistoryThClass}>Description</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "text-right")}>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPayments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell className="font-medium font-mono">{payment.voucher_number}</TableCell>
                          <TableCell>{format(new Date(payment.voucher_date), 'dd/MM/yyyy')}</TableCell>
                          <TableCell className="num text-green-600 font-semibold">₹{payment.total_amount.toFixed(2)}</TableCell>
                          <TableCell className="text-muted-foreground">{payment.description || '-'}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-0.5">
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="View Payment" onClick={() => setPreview({ type: "payment", data: payment })}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              {actions && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit Payment" onClick={() => actions.onEditPayment(payment)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 [&>tr]:border-0 [&>tr]:hover:bg-transparent">
                      <TableTotalRow
                        label={`Total (${filteredPayments.length})`}
                        leadingColSpan={2}
                        trailingColSpan={2}
                        amounts={[{ value: tabTotals.paymentsAmount, className: "text-green-600" }]}
                      />
                    </TableFooter>
                  </CustomerAccountTable>
                ) : (
                  <EmptyTabMessage hasRaw={!!paymentHistory?.length} label="payments" />
                )}
              </TabsContent>

              {/* Returns Tab */}
              <TabsContent value="returns" className="mt-0">
                {returnsLoading ? (
                  <EmptyTabMessage loading label="returns" />
                ) : filteredReturns.length > 0 ? (
                  <CustomerAccountTable>
                    <TableHeader className="!static">
                      <TableRow>
                        <TableHead className={accountsHistoryThClass}>Return No</TableHead>
                        <TableHead className={accountsHistoryThClass}>Date</TableHead>
                        <TableHead className={accountsHistoryThClass}>Original Invoice</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "num")}>Amount</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "text-right")}>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredReturns.map((ret) => (
                        <TableRow key={ret.id}>
                          <TableCell className="font-medium font-mono">{ret.return_number}</TableCell>
                          <TableCell>{format(new Date(ret.return_date), 'dd/MM/yyyy')}</TableCell>
                          <TableCell className="font-mono text-primary">{ret.original_sale_number || '-'}</TableCell>
                          <TableCell className="num text-red-600 font-semibold">₹{ret.net_amount.toFixed(2)}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-0.5">
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="View Return" onClick={() => setPreview({ type: "return", data: ret })}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              {actions && canApplyReturnCreditNote(ret) && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-orange-600" title="Apply credit note" onClick={() => actions.onApplyReturnCn(ret)}>
                                  <Link2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 [&>tr]:border-0 [&>tr]:hover:bg-transparent">
                      <TableTotalRow
                        label={`Total (${filteredReturns.length})`}
                        leadingColSpan={3}
                        trailingColSpan={1}
                        amounts={[{ value: tabTotals.returnsAmount, className: "text-red-600" }]}
                      />
                    </TableFooter>
                  </CustomerAccountTable>
                ) : (
                  <EmptyTabMessage hasRaw={!!saleReturns?.length} label="returns" />
                )}
              </TabsContent>

              {/* Credit Notes Tab */}
              <TabsContent value="credit-notes" className="mt-0">
                {creditNotesLoading ? (
                  <EmptyTabMessage loading label="credit notes" />
                ) : filteredCreditNotes.length > 0 ? (
                  <CustomerAccountTable>
                    <TableHeader className="!static">
                      <TableRow>
                        <TableHead className={accountsHistoryThClass}>Credit Note No</TableHead>
                        <TableHead className={accountsHistoryThClass}>Date</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "num")}>Amount</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "num")}>Used</TableHead>
                        <TableHead className={accountsHistoryThClass}>Status</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "text-right")}>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCreditNotes.map((cn) => (
                        <TableRow key={cn.id}>
                          <TableCell className="font-medium font-mono">{cn.credit_note_number}</TableCell>
                          <TableCell>{format(new Date(cn.issue_date), 'dd/MM/yyyy')}</TableCell>
                          <TableCell className="num text-violet-600 font-semibold">₹{cn.credit_amount.toFixed(2)}</TableCell>
                          <TableCell className="num">₹{(cn.used_amount || 0).toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant={cn.status === 'active' ? 'default' : cn.status === 'fully_used' ? 'secondary' : 'outline'} className={cn.status === 'active' ? 'bg-green-500' : ''}>
                              {cn.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-0.5">
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="View Credit Note" onClick={() => setPreview({ type: "credit-note", data: cn })}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              {actions && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="CN history" onClick={() => actions.onViewCreditNote({ id: cn.id })}>
                                  <History className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 [&>tr]:border-0 [&>tr]:hover:bg-transparent">
                      <TableTotalRow
                        label={`Total (${filteredCreditNotes.length})`}
                        leadingColSpan={2}
                        trailingColSpan={2}
                        amounts={[
                          { value: tabTotals.cnAmount, className: "text-violet-600" },
                          { value: tabTotals.cnUsed },
                        ]}
                      />
                    </TableFooter>
                  </CustomerAccountTable>
                ) : (
                  <EmptyTabMessage hasRaw={!!creditNotes?.length} label="credit notes" />
                )}
              </TabsContent>

              {/* Refunds Tab */}
              <TabsContent value="refunds" className="mt-0">
                {filteredRefunds.length > 0 ? (
                  <CustomerAccountTable>
                    <TableHeader className="!static">
                      <TableRow>
                        <TableHead className={accountsHistoryThClass}>Invoice No</TableHead>
                        <TableHead className={accountsHistoryThClass}>Date</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "num")}>Sale Amount</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "num")}>Refund Amount</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "text-right")}>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRefunds.map((sale) => (
                        <TableRow key={sale.id}>
                          <TableCell className="font-medium font-mono text-primary">{sale.sale_number}</TableCell>
                          <TableCell>{format(new Date(sale.sale_date), 'dd/MM/yyyy')}</TableCell>
                          <TableCell className="num">₹{sale.net_amount.toFixed(2)}</TableCell>
                          <TableCell className="num text-red-600 font-semibold">₹{(sale.refund_amount || 0).toFixed(2)}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-0.5">
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="View Invoice" onClick={() => setPreview({ type: "refund", data: sale })}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              {actions && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Open invoice" onClick={() => actions.onViewInvoice(sale.id)}>
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 [&>tr]:border-0 [&>tr]:hover:bg-transparent">
                      <TableTotalRow
                        label={`Total (${filteredRefunds.length})`}
                        leadingColSpan={2}
                        trailingColSpan={1}
                        amounts={[
                          { value: tabTotals.refundSaleAmount },
                          { value: tabTotals.refundAmount, className: "text-red-600" },
                        ]}
                      />
                    </TableFooter>
                  </CustomerAccountTable>
                ) : (
                  <EmptyTabMessage hasRaw={refunds.length > 0} label="refunds" />
                )}
              </TabsContent>

              {/* Advances Tab */}
              <TabsContent value="advances" className="mt-0">
                {advancesLoading ? (
                  <EmptyTabMessage loading label="advances" />
                ) : filteredAdvances.length > 0 ? (
                  <CustomerAccountTable>
                    <TableHeader className="!static">
                      <TableRow>
                        <TableHead className={accountsHistoryThClass}>Advance No</TableHead>
                        <TableHead className={accountsHistoryThClass}>Date</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "num")}>Amount</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "num")}>Used</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "num")}>Unused</TableHead>
                        <TableHead className={accountsHistoryThClass}>Method</TableHead>
                        <TableHead className={accountsHistoryThClass}>Status</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "text-right")}>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAdvances.map((adv) => {
                        const unused = Math.max(0, (adv.amount || 0) - (adv.used_amount || 0));
                        return (
                          <TableRow key={adv.id}>
                            <TableCell className="font-medium font-mono">{adv.advance_number}</TableCell>
                            <TableCell>{format(new Date(adv.advance_date), 'dd/MM/yyyy')}</TableCell>
                            <TableCell className="num font-semibold">₹{adv.amount.toFixed(2)}</TableCell>
                            <TableCell className="num">₹{adv.used_amount.toFixed(2)}</TableCell>
                            <TableCell className={cn("num font-semibold", unused > 0 ? "text-green-600" : "text-muted-foreground")}>
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
                            <TableCell>
                              <div className="flex items-center justify-end gap-0.5">
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="View Advance" onClick={() => setPreview({ type: "advance", data: adv })}>
                                  <Eye className="h-4 w-4" />
                                </Button>
                                {actions && unused > 0 && (
                                  <>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" title="Apply advance" onClick={actions.onApplyAdvance}>
                                      <Wallet className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600" title="Refund advance" onClick={actions.onRefundAdvance}>
                                      <Undo2 className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                    <TableFooter className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 [&>tr]:border-0 [&>tr]:hover:bg-transparent">
                      <TableTotalRow
                        label={`Total (${filteredAdvances.length})`}
                        leadingColSpan={2}
                        trailingColSpan={3}
                        amounts={[
                          { value: tabTotals.advanceAmount },
                          { value: tabTotals.advanceUsed },
                          { value: tabTotals.advanceUnused, className: "text-green-600" },
                        ]}
                      />
                    </TableFooter>
                  </CustomerAccountTable>
                ) : (
                  <EmptyTabMessage hasRaw={!!customerAdvances?.length} label="advances" />
                )}
              </TabsContent>

              {/* Balance Adjustments Tab */}
              <TabsContent value="adjustments" className="mt-0">
                {adjustmentsLoading ? (
                  <EmptyTabMessage loading label="balance adjustments" />
                ) : filteredAdjustments.length > 0 ? (
                  <CustomerAccountTable>
                    <TableHeader className="!static">
                      <TableRow>
                        <TableHead className={accountsHistoryThClass}>Date</TableHead>
                        <TableHead className={accountsHistoryThClass}>Reason</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "num")}>Prev O/S</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "num")}>New O/S</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "num")}>O/S Diff</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "num")}>Prev Adv</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "num")}>New Adv</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "num")}>Adv Diff</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "text-right")}>View</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAdjustments.map((adj) => (
                        <TableRow key={adj.id}>
                          <TableCell>{format(new Date(adj.adjustment_date), 'dd/MM/yyyy')}</TableCell>
                          <TableCell className="font-medium max-w-[200px] truncate" title={adj.reason}>{adj.reason}</TableCell>
                          <TableCell className="num">₹{adj.previous_outstanding.toFixed(2)}</TableCell>
                          <TableCell className="num">₹{adj.new_outstanding.toFixed(2)}</TableCell>
                          <TableCell className={cn("num font-semibold", adj.outstanding_difference > 0 ? "text-red-600" : adj.outstanding_difference < 0 ? "text-green-600" : "")}>
                            {adj.outstanding_difference > 0 ? "+" : ""}₹{adj.outstanding_difference.toFixed(2)}
                          </TableCell>
                          <TableCell className="num">₹{adj.previous_advance.toFixed(2)}</TableCell>
                          <TableCell className="num">₹{adj.new_advance.toFixed(2)}</TableCell>
                          <TableCell className={cn("num font-semibold", adj.advance_difference > 0 ? "text-green-600" : adj.advance_difference < 0 ? "text-red-600" : "")}>
                            {adj.advance_difference > 0 ? "+" : ""}₹{adj.advance_difference.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="View Adjustment" onClick={() => setPreview({ type: "adjustment", data: adj })}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 [&>tr]:border-0 [&>tr]:hover:bg-transparent">
                      <TableRow className="font-semibold">
                        <TableCell colSpan={2} className="text-right text-xs uppercase tracking-wide text-muted-foreground">
                          Total ({filteredAdjustments.length})
                        </TableCell>
                        <TableCell colSpan={2} />
                        <TableCell className={cn("num text-sm", tabTotals.adjOsDiff > 0 ? "text-red-600" : tabTotals.adjOsDiff < 0 ? "text-green-600" : "")}>
                          {tabTotals.adjOsDiff > 0 ? "+" : ""}{fmtTotal(tabTotals.adjOsDiff)}
                        </TableCell>
                        <TableCell colSpan={2} />
                        <TableCell className={cn("num text-sm", tabTotals.adjAdvDiff > 0 ? "text-green-600" : tabTotals.adjAdvDiff < 0 ? "text-red-600" : "")}>
                          {tabTotals.adjAdvDiff > 0 ? "+" : ""}{fmtTotal(tabTotals.adjAdvDiff)}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    </TableFooter>
                  </CustomerAccountTable>
                ) : (
                  <EmptyTabMessage hasRaw={!!balanceAdjustments?.length} label="balance adjustments" />
                )}
              </TabsContent>
            </ScrollArea>
            </div>
          </Tabs>
          </div>
    </>
  );

  return (
    <>
      {renderContent()}
      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[80vh] overflow-y-auto">
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
