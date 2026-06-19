import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { CUSTOMER_SEGMENT_LABELS } from "@/utils/customerSegments";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Loader2, IndianRupee, CreditCard, RotateCcw, FileText, Receipt, ChevronDown, ChevronRight, History, Eye, Wallet, Scale } from "lucide-react";
import { format } from "date-fns";
import { useCustomerAccountHistoryData } from "@/hooks/useCustomerAccountHistoryData";
import { cn } from "@/lib/utils";

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

function isSaleRecordCancelled(sale: { is_cancelled?: boolean | null; payment_status?: string | null }) {
  return sale.is_cancelled === true || String(sale.payment_status || "").toLowerCase() === "cancelled";
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
}

export function CustomerAccountHistoryContent({
  customerId,
  customerName,
  organizationId,
  queriesEnabled,
  scrollAreaClassName = "flex-1 mt-3 h-[55vh]",
  wrapperClassName = "px-3 sm:px-5 pb-3 sm:pb-5 flex flex-col flex-1 overflow-hidden",
}: CustomerAccountHistoryContentProps) {
  const [activeTab, setActiveTab] = useState("sales");
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const [selectedLegacyIndex, setSelectedLegacyIndex] = useState<number>(0);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const legacyRowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  const {
    isSchool,
    schoolFeeData,
    openingBalance,
    totalSales,
    totalSalesGross,
    totalCashPaid,
    summary,
    customerSegment,
    customerSaleStats,
    saleStatsLoading,
    salesHistory,
    salesLoading,
    paymentHistory,
    paymentsLoading,
    creditNotes,
    creditNotesLoading,
    saleReturns,
    returnsLoading,
    legacyInvoices,
    legacyLoading,
    customerAdvances,
    advancesLoading,
    balanceAdjustments,
    adjustmentsLoading,
    refunds,
  } = useCustomerAccountHistoryData({ customerId, organizationId, queriesEnabled });

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
    if (queriesEnabled && activeTab === 'legacy') {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [queriesEnabled, activeTab, handleKeyDown]);

  useEffect(() => { setSelectedLegacyIndex(0); }, [legacyInvoices]);

  useEffect(() => { if (!queriesEnabled) setPreview(null); }, [queriesEnabled]);

  const renderContent = () => (
    <>
      <div className={wrapperClassName}>
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

            // Business mode — dashboard-style gradient KPIs
            const { outstandingDr, advanceAvailable, cnAvailable, cnAppliedOnInvoices } = summary;
            const showGrossSales =
              (totalSalesGross || 0) > (totalSales || 0) + 0.005;
            const lifetimeRev = customerSaleStats?.revenue ?? 0;
            const lifetimeOrders = customerSaleStats?.orders ?? 0;
            const lastSale = customerSaleStats?.lastSaleDate;

            return (
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Card className="bg-gradient-to-br from-violet-500 to-violet-600 border-0 shadow-md rounded-xl">
                    <CardHeader className="pb-1 pt-3 px-3">
                      <CardDescription className="text-sm font-medium text-white/80">Segment</CardDescription>
                    </CardHeader>
                    <CardContent className="px-3 pb-3 pt-0">
                      <p className="text-xl font-black text-white">
                        {saleStatsLoading ? "…" : CUSTOMER_SEGMENT_LABELS[customerSegment]}
                      </p>
                      <p className="text-xs text-white/65 mt-0.5">
                        {lifetimeOrders} order{lifetimeOrders === 1 ? "" : "s"}
                        {lastSale ? ` · Last ${lastSale}` : ""}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 shadow-md rounded-xl">
                    <CardHeader className="pb-1 pt-3 px-3">
                      <CardDescription className="text-sm font-medium text-white/80">Lifetime Sales</CardDescription>
                    </CardHeader>
                    <CardContent className="px-3 pb-3 pt-0">
                      <p className="text-xl font-black text-white tabular-nums">
                        {saleStatsLoading ? "…" : `₹${Math.round(lifetimeRev).toLocaleString("en-IN")}`}
                      </p>
                      {showGrossSales && (
                        <p className="text-xs text-white/65 mt-0.5">Ledger net ₹{totalSales.toFixed(0)}</p>
                      )}
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-md rounded-xl">
                    <CardHeader className="pb-1 pt-3 px-3">
                      <CardDescription className="text-sm font-medium text-white/80">Opening Balance</CardDescription>
                    </CardHeader>
                    <CardContent className="px-3 pb-3 pt-0">
                      <p className="text-xl font-black text-white tabular-nums">₹{openingBalance.toFixed(0)}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-purple-500 to-purple-600 border-0 shadow-md rounded-xl">
                    <CardHeader className="pb-1 pt-3 px-3">
                      <CardDescription className="text-sm font-medium text-white/80">Cash / UPI Paid</CardDescription>
                    </CardHeader>
                    <CardContent className="px-3 pb-3 pt-0">
                      <p className="text-xl font-black text-white tabular-nums">₹{(totalCashPaid || 0).toFixed(0)}</p>
                    </CardContent>
                  </Card>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Card className="bg-gradient-to-br from-amber-500 to-amber-600 border-0 shadow-md rounded-xl">
                    <CardHeader className="pb-1 pt-3 px-3">
                      <CardDescription className="text-sm font-medium text-white/80">Advance Available</CardDescription>
                    </CardHeader>
                    <CardContent className="px-3 pb-3 pt-0">
                      <p className="text-xl font-black text-white tabular-nums">₹{advanceAvailable.toFixed(0)}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-pink-500 to-pink-600 border-0 shadow-md rounded-xl">
                    <CardHeader className="pb-1 pt-3 px-3">
                      <CardDescription className="text-sm font-medium text-white/80">CN Available</CardDescription>
                    </CardHeader>
                    <CardContent className="px-3 pb-3 pt-0">
                      <p className="text-xl font-black text-white tabular-nums">₹{cnAvailable.toFixed(0)}</p>
                      <p className="text-xs text-white/65 mt-0.5 truncate">
                        {cnAvailable > 0.005
                          ? "Pool to apply"
                          : cnAppliedOnInvoices > 0
                            ? `₹${cnAppliedOnInvoices.toLocaleString("en-IN")} applied`
                            : "None"}
                      </p>
                    </CardContent>
                  </Card>
                  <Card
                    className={cn(
                      "border-0 shadow-md rounded-xl bg-gradient-to-br",
                      outstandingDr > 0.005
                        ? "from-red-500 to-red-600"
                        : advanceAvailable > 0.005
                          ? "from-teal-500 to-teal-600"
                          : "from-slate-500 to-slate-600",
                    )}
                  >
                    <CardHeader className="pb-1 pt-3 px-3">
                      <CardDescription className="text-sm font-medium text-white/80">
                        {outstandingDr > 0.005
                          ? "Outstanding (Dr)"
                          : advanceAvailable > 0.005
                            ? "Unused Advance"
                            : "Current Balance"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="px-3 pb-3 pt-0">
                      <p className="text-xl font-black text-white tabular-nums">
                        ₹
                        {(outstandingDr > 0.005 ? outstandingDr : advanceAvailable).toFixed(0)}
                      </p>
                      <p className="text-xs text-white/65 mt-0.5">
                        {outstandingDr > 0.005
                          ? "Customer owes"
                          : advanceAvailable > 0.005
                            ? "Available for bills"
                            : "Settled"}
                      </p>
                    </CardContent>
                  </Card>
                </div>
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

            <ScrollArea className={scrollAreaClassName}>
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
                        const saleCancelled = isSaleRecordCancelled(sale);
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
                              <TableCell className={cn("font-medium", saleCancelled && "line-through decoration-red-500/70 text-muted-foreground")}>{sale.sale_number}</TableCell>
                              <TableCell className={cn(saleCancelled && "text-muted-foreground")}>{format(new Date(sale.sale_date), 'dd/MM/yyyy')}</TableCell>
                              <TableCell><Badge variant="outline">{sale.sale_type?.toUpperCase()}</Badge></TableCell>
                              <TableCell className={cn(saleCancelled && "line-through decoration-red-500/70 text-muted-foreground font-medium")}>₹{sale.net_amount.toFixed(2)}</TableCell>
                              <TableCell className={cn(saleCancelled && "line-through decoration-red-500/70 text-muted-foreground")}>₹{(sale.paid_amount || 0).toFixed(2)}</TableCell>
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
                              <TableCell>
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="View details" onClick={(e) => { e.stopPropagation(); setPreview({ type: "sale", data: sale }); }}>
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
                            {isExpanded && saleCancelled && items.length === 0 && (
                              <TableRow key={`${sale.id}-cancelled-note`}>
                                <TableCell colSpan={8} className="py-2 text-xs text-muted-foreground italic bg-muted/20">
                                  Items were removed when this invoice was cancelled; amounts above are for audit reference only.
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
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
