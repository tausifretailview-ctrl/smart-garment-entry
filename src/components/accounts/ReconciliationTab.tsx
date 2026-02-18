import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, FileDown, Trash2, TrendingUp, DollarSign, Wallet, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRoles } from "@/hooks/useUserRoles";
import * as XLSX from "xlsx";

interface ReconciliationTabProps {
  organizationId: string;
  customers: any[] | undefined;
}

export function ReconciliationTab({ organizationId, customers }: ReconciliationTabProps) {
  const queryClient = useQueryClient();
  const { isAdmin } = useUserRoles();

  const [reconStartDate, setReconStartDate] = useState<Date>(startOfMonth(new Date()));
  const [reconEndDate, setReconEndDate] = useState<Date>(endOfMonth(new Date()));
  const [reconCustomerFilter, setReconCustomerFilter] = useState<string>("");
  const [reconStatusFilter, setReconStatusFilter] = useState<string>("all");

  // Fetch reconciliation data
  const { data: reconciliationData } = useQuery({
    queryKey: ["payment-reconciliation", organizationId, reconStartDate, reconEndDate, reconCustomerFilter, reconStatusFilter],
    queryFn: async () => {
      let salesIdsFilter: string[] | null = null;
      if (reconCustomerFilter && reconCustomerFilter !== "all" && reconCustomerFilter !== "") {
        const { data: customerSales, error: salesError } = await supabase.from("sales").select("id").eq("customer_id", reconCustomerFilter).is("deleted_at", null);
        if (salesError) throw salesError;
        salesIdsFilter = customerSales?.map(s => s.id) || [];
        if (salesIdsFilter.length === 0) return [];
      }
      let query = supabase.from("voucher_entries").select("*").eq("organization_id", organizationId).or("voucher_type.eq.receipt,voucher_type.eq.RECEIPT").is("deleted_at", null).gte("voucher_date", format(reconStartDate, "yyyy-MM-dd")).lte("voucher_date", format(reconEndDate, "yyyy-MM-dd"));
      if (salesIdsFilter !== null) query = query.in("reference_id", salesIdsFilter);
      const { data: payments, error } = await query.order("voucher_date", { ascending: false });
      if (error) throw error;

      const enhanced = await Promise.all(
        (payments || []).map(async (payment) => {
          let customerName = "Unknown";
          let customerPhone = "";
          let invoiceDetails: any = null;
          if (payment.reference_id) {
            const { data: invoice } = await supabase.from("sales").select("*").eq("id", payment.reference_id).maybeSingle();
            if (invoice) {
              if (reconStatusFilter && reconStatusFilter !== "all" && invoice.payment_status !== reconStatusFilter) return null;
              invoiceDetails = invoice;
              customerName = invoice.customer_name || "Walk-in Customer";
              customerPhone = invoice.customer_phone || "";
              if (invoice.customer_id) {
                const { data: customer } = await supabase.from("customers").select("*").eq("id", invoice.customer_id).maybeSingle();
                if (customer) { customerName = customer.customer_name || customerName; customerPhone = customer.phone || customerPhone; }
              }
            }
          }
          return { ...payment, customerName, customerPhone, invoiceDetails };
        })
      );
      return enhanced.filter(e => e !== null);
    },
    enabled: !!organizationId,
  });

  // Delete receipt mutation
  const deleteReceipt = useMutation({
    mutationFn: async (payment: any) => {
      const invoiceId = payment.reference_id;
      const paymentAmount = Number(payment.total_amount);
      if (invoiceId) {
        const { data: invoice } = await supabase.from("sales").select("paid_amount, net_amount").eq("id", invoiceId).maybeSingle();
        if (invoice) {
          const newPaidAmount = Math.max(0, (invoice.paid_amount || 0) - paymentAmount);
          const newStatus = newPaidAmount >= invoice.net_amount ? 'completed' : newPaidAmount > 0 ? 'partial' : 'pending';
          await supabase.from("sales").update({ paid_amount: newPaidAmount, payment_status: newStatus }).eq("id", invoiceId);
        }
      }
      await supabase.from("voucher_items").delete().eq("voucher_id", payment.id);
      const { error } = await supabase.from("voucher_entries").delete().eq("id", payment.id);
      if (error) throw error;
      return { paymentAmount };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["payment-reconciliation"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      toast.success(`Receipt deleted. ₹${Math.round(data.paymentAmount).toLocaleString('en-IN')} reversed.`);
    },
    onError: (error: Error) => { toast.error(`Failed to delete receipt: ${error.message}`); },
  });

  const handleExport = () => {
    const filtered = reconciliationData || [];
    const ws = XLSX.utils.json_to_sheet(filtered.map((payment) => ({
      "Voucher No": payment.voucher_number,
      "Payment Date": format(new Date(payment.voucher_date), "dd/MM/yyyy"),
      "Customer Name": payment.customerName,
      "Customer Phone": payment.customerPhone || "-",
      "Invoice Number": payment.invoiceDetails?.sale_number || "-",
      "Invoice Date": payment.invoiceDetails?.sale_date ? format(new Date(payment.invoiceDetails.sale_date), "dd/MM/yyyy") : "-",
      "Invoice Amount": payment.invoiceDetails?.net_amount?.toFixed(2) || "0.00",
      "Cash Amount": payment.invoiceDetails?.cash_amount?.toFixed(2) || "0.00",
      "Card Amount": payment.invoiceDetails?.card_amount?.toFixed(2) || "0.00",
      "UPI Amount": payment.invoiceDetails?.upi_amount?.toFixed(2) || "0.00",
      "Payment Amount": payment.total_amount.toFixed(2),
      "Payment Method": ((payment as any).metadata?.paymentMethod) || payment.invoiceDetails?.payment_method || "-",
      "Payment Status": payment.invoiceDetails?.payment_status || "-",
      "Balance": payment.invoiceDetails ? (payment.invoiceDetails.net_amount - (payment.invoiceDetails.paid_amount || 0)).toFixed(2) : "0.00",
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reconciliation");
    XLSX.writeFile(wb, `Payment_Reconciliation_${format(reconStartDate, "dd-MM-yyyy")}_to_${format(reconEndDate, "dd-MM-yyyy")}.xlsx`);
    toast.success("Reconciliation report exported to Excel");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Payment Reconciliation Report</CardTitle>
          <CardDescription>All customer payments matched with invoices for accounting audit</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="space-y-2">
              <Label>From Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !reconStartDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {reconStartDate ? format(reconStartDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={reconStartDate} onSelect={(date) => date && setReconStartDate(date)} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>To Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !reconEndDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {reconEndDate ? format(reconEndDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={reconEndDate} onSelect={(date) => date && setReconEndDate(date)} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Customer Filter</Label>
              <Select value={reconCustomerFilter || "all"} onValueChange={setReconCustomerFilter}>
                <SelectTrigger><SelectValue placeholder="All Customers" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers?.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>{customer.customer_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status Filter</Label>
              <Select value={reconStatusFilter || "all"} onValueChange={setReconStatusFilter}>
                <SelectTrigger><SelectValue placeholder="All Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Summary Cards */}
          {reconciliationData && (() => {
            const filteredData = reconciliationData.filter((r) => {
              const matchesCustomer = reconCustomerFilter === "all" || reconCustomerFilter === "" || r.invoiceDetails?.customer_id === reconCustomerFilter;
              const matchesStatus = reconStatusFilter === "all" || r.invoiceDetails?.payment_status === reconStatusFilter;
              return matchesCustomer && matchesStatus;
            });
            const sourceBreakdown = { accounts: { count: 0, amount: 0 }, pos: { count: 0, amount: 0 }, sales: { count: 0, amount: 0 } };
            filteredData.forEach((r) => {
              const desc = (r.description || '').toLowerCase();
              const amount = r.total_amount || 0;
              if (desc.includes('pos')) { sourceBreakdown.pos.count++; sourceBreakdown.pos.amount += amount; }
              else if (desc.includes('sales') || desc.includes('sale invoice')) { sourceBreakdown.sales.count++; sourceBreakdown.sales.amount += amount; }
              else { sourceBreakdown.accounts.count++; sourceBreakdown.accounts.amount += amount; }
            });
            const totalAmount = filteredData.reduce((sum, r) => sum + (r.total_amount || 0), 0);
            return (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-green-900 dark:text-green-100">Total Payments</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-green-900 dark:text-green-100">{filteredData.length}</div><p className="text-xs text-green-700 dark:text-green-300 mt-1">Payment transactions</p></CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-blue-900 dark:text-blue-100">Total Amount Received</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-blue-900 dark:text-blue-100">₹{totalAmount.toFixed(2)}</div><p className="text-xs text-blue-700 dark:text-blue-300 mt-1">Cash + Card + UPI</p></CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-purple-900 dark:text-purple-100">Unique Customers</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-purple-900 dark:text-purple-100">{new Set(filteredData?.map((r) => r.invoiceDetails?.customer_id).filter(Boolean)).size}</div><p className="text-xs text-purple-700 dark:text-purple-300 mt-1">Customers paid</p></CardContent>
                  </Card>
                </div>

                {/* Source Breakdown */}
                <Card className="border-l-4 border-l-primary">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2"><Receipt className="h-4 w-4" /> Payment Sources Breakdown</CardTitle>
                    <CardDescription>Payments categorized by entry source</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900 border border-emerald-200 dark:border-emerald-800">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center"><Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /></div>
                          <div><p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">Accounts</p><p className="text-xs text-emerald-700 dark:text-emerald-300">{sourceBreakdown.accounts.count} payments</p></div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-emerald-900 dark:text-emerald-100">₹{sourceBreakdown.accounts.amount.toFixed(2)}</p>
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">{totalAmount > 0 ? ((sourceBreakdown.accounts.amount / totalAmount) * 100).toFixed(1) : 0}%</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center"><DollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400" /></div>
                          <div><p className="text-sm font-medium text-blue-900 dark:text-blue-100">POS Dashboard</p><p className="text-xs text-blue-700 dark:text-blue-300">{sourceBreakdown.pos.count} payments</p></div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-blue-900 dark:text-blue-100">₹{sourceBreakdown.pos.amount.toFixed(2)}</p>
                          <p className="text-xs text-blue-600 dark:text-blue-400">{totalAmount > 0 ? ((sourceBreakdown.pos.amount / totalAmount) * 100).toFixed(1) : 0}%</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900 border border-orange-200 dark:border-orange-800">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-orange-500/20 flex items-center justify-center"><TrendingUp className="h-5 w-5 text-orange-600 dark:text-orange-400" /></div>
                          <div><p className="text-sm font-medium text-orange-900 dark:text-orange-100">Sales Dashboard</p><p className="text-xs text-orange-700 dark:text-orange-300">{sourceBreakdown.sales.count} payments</p></div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-orange-900 dark:text-orange-100">₹{sourceBreakdown.sales.amount.toFixed(2)}</p>
                          <p className="text-xs text-orange-600 dark:text-orange-400">{totalAmount > 0 ? ((sourceBreakdown.sales.amount / totalAmount) * 100).toFixed(1) : 0}%</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            );
          })()}

          {/* Export */}
          <div className="flex justify-end">
            <Button onClick={handleExport} variant="outline" className="gap-2"><FileDown className="h-4 w-4" /> Export to Excel</Button>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Voucher No</TableHead>
                  <TableHead>Payment Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Invoice No</TableHead>
                  <TableHead>Invoice Date</TableHead>
                  <TableHead className="text-right">Invoice Amt</TableHead>
                  <TableHead className="text-right">Payment Breakdown</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  {isAdmin && <TableHead className="text-center">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {reconciliationData?.map((payment) => {
                  const invoice = payment.invoiceDetails;
                  const balance = invoice ? invoice.net_amount - (invoice.paid_amount || 0) : 0;
                  const cashAmt = invoice?.cash_amount || 0;
                  const cardAmt = invoice?.card_amount || 0;
                  const upiAmt = invoice?.upi_amount || 0;
                  return (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium">{payment.voucher_number}</TableCell>
                      <TableCell>{format(new Date(payment.voucher_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>
                        <div><div className="font-medium">{payment.customerName}</div>{payment.customerPhone && <div className="text-xs text-muted-foreground">{payment.customerPhone}</div>}</div>
                      </TableCell>
                      <TableCell className="font-medium">{invoice?.sale_number || "-"}</TableCell>
                      <TableCell>{invoice?.sale_date ? format(new Date(invoice.sale_date), "dd/MM/yyyy") : "-"}</TableCell>
                      <TableCell className="text-right">₹{invoice?.net_amount?.toFixed(2) || "0.00"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap gap-1 justify-end">
                          {cashAmt > 0 && <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">Cash: ₹{cashAmt.toFixed(2)}</Badge>}
                          {cardAmt > 0 && <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">Card: ₹{cardAmt.toFixed(2)}</Badge>}
                          {upiAmt > 0 && <Badge variant="outline" className="bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300">UPI: ₹{upiAmt.toFixed(2)}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">₹{payment.total_amount.toFixed(2)}</TableCell>
                      <TableCell className="capitalize">{((payment as any).metadata?.paymentMethod) || invoice?.payment_method || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={invoice?.payment_status === "completed" ? "default" : invoice?.payment_status === "partial" ? "secondary" : "outline"}
                          className={cn(invoice?.payment_status === "completed" && "bg-green-500 text-white", invoice?.payment_status === "partial" && "bg-orange-500 text-white")}>
                          {invoice?.payment_status || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell className={cn("text-right font-medium", balance > 0 && "text-orange-600 dark:text-orange-400")}>₹{balance.toFixed(2)}</TableCell>
                      {isAdmin && (
                        <TableCell className="text-center">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" disabled={deleteReceipt.isPending}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Payment Receipt?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will delete receipt <span className="font-medium">{payment.voucher_number}</span> and reverse ₹{Number(payment.total_amount).toFixed(2)} back.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteReceipt.mutate(payment)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete & Reverse</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                {/* Page Totals */}
                {reconciliationData && reconciliationData.length > 0 && (() => {
                  const totals = reconciliationData.reduce((acc: any, p: any) => {
                    const inv = p.invoiceDetails;
                    const bal = inv ? inv.net_amount - (inv.paid_amount || 0) : 0;
                    return { invoiceAmount: acc.invoiceAmount + (inv?.net_amount || 0), paidAmount: acc.paidAmount + (p.total_amount || 0), balance: acc.balance + bal };
                  }, { invoiceAmount: 0, paidAmount: 0, balance: 0 });
                  return (
                    <TableRow className="bg-muted/70 font-semibold border-t-2">
                      <TableCell colSpan={5} className="text-right">Page Total:</TableCell>
                      <TableCell className="text-right">₹{totals.invoiceAmount.toFixed(2)}</TableCell>
                      <TableCell></TableCell>
                      <TableCell className="text-right">₹{totals.paidAmount.toFixed(2)}</TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                      <TableCell className="text-right">₹{totals.balance.toFixed(2)}</TableCell>
                      {isAdmin && <TableCell></TableCell>}
                    </TableRow>
                  );
                })()}
                {(!reconciliationData || reconciliationData.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 12 : 11} className="text-center py-8 text-muted-foreground">No payment records found for the selected period and filters</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
