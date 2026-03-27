import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { Receipt, IndianRupee, TrendingDown, Wallet } from "lucide-react";

interface SupplierHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  supplierId: string;
  supplierName: string;
  organizationId: string;
}

export const SupplierHistoryDialog = ({
  isOpen,
  onClose,
  supplierId,
  supplierName,
  organizationId,
}: SupplierHistoryDialogProps) => {
  const [activeTab, setActiveTab] = useState("purchases");

  // Fetch supplier details
  const { data: supplier } = useQuery({
    queryKey: ["supplier-details", supplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("id", supplierId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: isOpen && !!supplierId,
  });

  // Fetch purchase bills
  const { data: purchaseBills, isLoading: loadingPurchases } = useQuery({
    queryKey: ["supplier-purchases", supplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_bills")
        .select("*")
        .eq("supplier_id", supplierId)
        .is("deleted_at", null)
        .order("bill_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: isOpen && !!supplierId,
  });

  // Fetch purchase returns
  const { data: purchaseReturns, isLoading: loadingReturns } = useQuery({
    queryKey: ["supplier-returns", supplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_returns")
        .select("*")
        .eq("supplier_id", supplierId)
        .is("deleted_at", null)
        .order("return_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: isOpen && !!supplierId,
  });

  // Fetch payments from voucher entries (supplier-level + bill-linked payments)
  const { data: payments, isLoading: loadingPayments } = useQuery({
    queryKey: ["supplier-payments", supplierId, organizationId],
    queryFn: async () => {
      // Get all purchase bill IDs for this supplier
      const { data: bills } = await supabase
        .from("purchase_bills")
        .select("id")
        .eq("supplier_id", supplierId)
        .is("deleted_at", null);

      const billIds = (bills || []).map(b => b.id);

      // Fetch both: supplier-level payments AND bill-linked payments
      const { data, error } = await supabase
        .from("voucher_entries")
        .select("*")
        .eq("organization_id", organizationId)
        .or("voucher_type.eq.payment,voucher_type.eq.PAYMENT")
        .is("deleted_at", null)
        .or(
          billIds.length > 0
            ? `and(reference_type.eq.supplier,reference_id.eq.${supplierId}),reference_id.in.(${billIds.join(",")})`
            : `reference_type.eq.supplier,reference_id.eq.${supplierId}`
        )
        .order("voucher_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: isOpen && !!supplierId,
  });

  // Fetch credit notes for supplier
  const { data: creditNotes, isLoading: loadingCreditNotes } = useQuery({
    queryKey: ["supplier-credit-notes", supplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voucher_entries")
        .select("*")
        .eq("reference_id", supplierId)
        .eq("reference_type", "supplier")
        .eq("voucher_type", "credit_note")
        .is("deleted_at", null)
        .order("voucher_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: isOpen && !!supplierId,
  });

  // Calculate totals matching ledger logic
  const openingBalance = supplier?.opening_balance || 0;
  const totalPurchases = purchaseBills?.reduce((sum, bill) => sum + (bill.net_amount || 0), 0) || 0;
  const totalCreditNoteAdjust = creditNotes?.reduce((sum, cn) => sum + (Number(cn.total_amount) || 0), 0) || 0;

  // Use only voucher payments as the authoritative paid amount.
  // bill.paid_amount may duplicate voucher entries — don't add both.
  const voucherPaymentTotal = payments?.reduce(
    (sum, p) => sum + (Number(p.total_amount) || 0), 0) || 0;
  
  // Fall back to bill.paid_amount only if no vouchers exist at all
  const totalPaidOnBills = purchaseBills?.reduce(
    (sum, bill) => sum + (bill.paid_amount || 0), 0) || 0;
  
  const totalPaid = voucherPaymentTotal > 0 
    ? voucherPaymentTotal 
    : totalPaidOnBills;

  // Credit notes already represent returns — no separate totalReturns subtraction
  const currentBalance = openingBalance + totalPurchases - totalPaid - totalCreditNoteAdjust;

  const getPaymentStatusBadge = (status: string | null | undefined) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-green-500/20 text-green-700 dark:text-green-400">Paid</Badge>;
      case "partial":
        return <Badge className="bg-orange-400/20 text-orange-600 dark:text-orange-400">Partial</Badge>;
      default:
        return <Badge className="bg-red-500/20 text-red-700 dark:text-red-400">Unpaid</Badge>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col p-0">
        <div className="h-1 w-full bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 rounded-t-lg flex-shrink-0" />
        <div className="p-4 sm:p-5 pb-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
              <div className="h-9 w-9 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                <Receipt className="h-4 w-4 text-orange-600" />
              </div>
              <div>
                <div>{supplierName}</div>
                <DialogDescription className="text-xs font-normal mt-0.5">
                  Supplier account history and transactions
                  {supplier?.phone && (
                    <span className="ml-2 font-mono">{supplier.phone}</span>
                  )}
                </DialogDescription>
              </div>
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="px-4 sm:px-5 pb-4 sm:pb-5 flex flex-col flex-1 overflow-hidden">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
            <Card className="border-l-4 border-l-blue-500 shadow-sm">
              <CardContent className="p-2.5">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Opening Bal</p>
                <p className="text-sm font-bold text-blue-600 tabular-nums mt-0.5">
                  ₹{openingBalance.toLocaleString('en-IN')}
                </p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-purple-500 shadow-sm">
              <CardContent className="p-2.5">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Total Purchases</p>
                <p className="text-sm font-bold text-purple-600 tabular-nums mt-0.5">
                  ₹{totalPurchases.toLocaleString('en-IN')}
                </p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-orange-500 shadow-sm">
              <CardContent className="p-2.5">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Credit Notes</p>
                <p className="text-sm font-bold text-orange-600 tabular-nums mt-0.5">
                  ₹{totalCreditNoteAdjust.toLocaleString('en-IN')}
                </p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500 shadow-sm">
              <CardContent className="p-2.5">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Total Paid</p>
                <p className="text-sm font-bold text-green-600 tabular-nums mt-0.5">
                  ₹{totalPaid.toLocaleString('en-IN')}
                </p>
              </CardContent>
            </Card>
            <Card className={`border-l-4 shadow-sm ${currentBalance > 0 ? 'border-l-red-500' : 'border-l-emerald-500'}`}>
              <CardContent className="p-2.5">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Balance</p>
                <p className={`text-sm font-bold tabular-nums mt-0.5 ${currentBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  ₹{Math.abs(currentBalance).toLocaleString('en-IN')}
                  {currentBalance < 0 && ' CR'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-3 h-9 bg-muted/60 p-0.5 rounded-lg">
              <TabsTrigger value="purchases" className="rounded-md text-xs font-medium">
                Purchases ({purchaseBills?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="payments" className="rounded-md text-xs font-medium">
                Payments ({payments?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="returns" className="rounded-md text-xs font-medium">
                Returns ({purchaseReturns?.length || 0})
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1 mt-4" showScrollbar>
              {/* Purchases Tab */}
              <TabsContent value="purchases" className="m-0">
                {loadingPurchases ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : purchaseBills && purchaseBills.length > 0 ? (
                  <Table>
                    <TableHeader className="bg-slate-50 dark:bg-slate-900 sticky top-0">
                      <TableRow className="border-b-2 border-slate-200 dark:border-slate-700">
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-600">Bill No</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-600">Date</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-600 text-right">Amount</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-600 text-right">Paid</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-600">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchaseBills.map((bill) => (
                        <TableRow key={bill.id}>
                          <TableCell className="font-medium">
                            {bill.software_bill_no || bill.supplier_invoice_no || "-"}
                          </TableCell>
                          <TableCell>{format(new Date(bill.bill_date), "dd MMM yy")}</TableCell>
                          <TableCell className="text-right">₹{bill.net_amount?.toFixed(0)}</TableCell>
                          <TableCell className="text-right">₹{(bill.paid_amount || 0).toFixed(0)}</TableCell>
                          <TableCell>{getPaymentStatusBadge(bill.payment_status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No purchase records found</p>
                )}
              </TabsContent>

              {/* Payments Tab */}
              <TabsContent value="payments" className="m-0">
                {loadingPayments ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : payments && payments.length > 0 ? (
                  <Table>
                    <TableHeader className="bg-slate-50 dark:bg-slate-900 sticky top-0">
                      <TableRow className="border-b-2 border-slate-200 dark:border-slate-700">
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-600">Voucher No</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-600">Date</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-600 text-right">Amount</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-600">Method</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-600">Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell className="font-mono text-sm font-medium">{payment.voucher_number}</TableCell>
                          <TableCell className="text-xs tabular-nums">{format(new Date(payment.voucher_date), "dd MMM yy")}</TableCell>
                          <TableCell className="text-right font-semibold text-green-600 tabular-nums">
                            ₹{Number(payment.total_amount || 0).toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className="text-xs capitalize text-muted-foreground">
                            {payment.payment_method || "-"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                            {payment.description || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No payment records found</p>
                )}
              </TabsContent>

              {/* Returns Tab */}
              <TabsContent value="returns" className="m-0">
                {loadingReturns ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : purchaseReturns && purchaseReturns.length > 0 ? (
                  <Table>
                    <TableHeader className="bg-slate-50 dark:bg-slate-900 sticky top-0">
                      <TableRow className="border-b-2 border-slate-200 dark:border-slate-700">
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-600">Return No</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-600">Date</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-600">Original Bill</TableHead>
                        <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-600 text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchaseReturns.map((ret) => (
                        <TableRow key={ret.id}>
                          <TableCell className="font-medium">{ret.return_number || "-"}</TableCell>
                          <TableCell>{format(new Date(ret.return_date), "dd MMM yy")}</TableCell>
                          <TableCell>{ret.original_bill_number || "-"}</TableCell>
                          <TableCell className="text-right text-red-600">₹{ret.net_amount?.toFixed(0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No return records found</p>
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};
