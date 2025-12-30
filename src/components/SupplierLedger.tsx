import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowLeft, Download, Phone, Mail, MapPin, IndianRupee, Calendar, FileText, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

interface SupplierLedgerProps {
  organizationId: string;
}

interface Supplier {
  id: string;
  supplier_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  opening_balance: number;
  totalPurchases: number;
  totalPaid: number;
  balance: number;
}

interface Transaction {
  id: string;
  date: string;
  type: 'bill' | 'payment';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export function SupplierLedger({ organizationId }: SupplierLedgerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  // Fetch all suppliers with their transaction summary
  const { data: suppliers, isLoading } = useQuery({
    queryKey: ["supplier-ledger", organizationId],
    queryFn: async () => {
      // Fetch all suppliers
      const { data: suppliersData, error: suppliersError } = await supabase
        .from("suppliers")
        .select("*")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("supplier_name");

      if (suppliersError) throw suppliersError;

      // Fetch all purchase bills
      const { data: purchaseBillsData, error: billsError } = await supabase
        .from("purchase_bills")
        .select("id, supplier_id, net_amount, paid_amount")
        .eq("organization_id", organizationId)
        .is("deleted_at", null);

      if (billsError) throw billsError;

      // Fetch voucher payments to suppliers
      const { data: voucherPayments, error: voucherError } = await supabase
        .from("voucher_entries")
        .select("reference_id, total_amount")
        .eq("organization_id", organizationId)
        .eq("reference_type", "supplier")
        .eq("voucher_type", "payment")
        .is("deleted_at", null);

      if (voucherError) throw voucherError;

      // Create a map of supplier ID -> total voucher payments
      const supplierVoucherPayments = new Map<string, number>();
      voucherPayments?.forEach((v: any) => {
        const current = supplierVoucherPayments.get(v.reference_id) || 0;
        supplierVoucherPayments.set(v.reference_id, current + (Number(v.total_amount) || 0));
      });

      // Calculate totals per supplier
      const supplierTotals = suppliersData.map((supplier: any) => {
        const supplierBills = purchaseBillsData?.filter((b: any) => b.supplier_id === supplier.id) || [];
        const totalPurchases = supplierBills.reduce((sum: number, b: any) => sum + (b.net_amount || 0), 0);
        const totalPaidOnBills = supplierBills.reduce((sum: number, b: any) => sum + (b.paid_amount || 0), 0);
        const voucherPaymentTotal = supplierVoucherPayments.get(supplier.id) || 0;
        const totalPaid = totalPaidOnBills + voucherPaymentTotal;
        const openingBalance = supplier.opening_balance || 0;
        // Balance = Opening Balance + Total Purchases - Total Paid
        const balance = openingBalance + totalPurchases - totalPaid;

        return {
          ...supplier,
          opening_balance: openingBalance,
          totalPurchases,
          totalPaid,
          balance,
        };
      });

      return supplierTotals;
    },
    enabled: !!organizationId,
  });

  // Fetch detailed transactions for selected supplier
  const { data: transactions } = useQuery({
    queryKey: ["supplier-transactions", selectedSupplier?.id, startDate, endDate],
    queryFn: async () => {
      if (!selectedSupplier) return [];

      // Build date filter for displayed bills
      let billsQuery = supabase
        .from("purchase_bills")
        .select("*")
        .eq("supplier_id", selectedSupplier.id)
        .is("deleted_at", null);

      if (startDate) {
        billsQuery = billsQuery.gte("bill_date", format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        billsQuery = billsQuery.lte("bill_date", format(endDate, 'yyyy-MM-dd'));
      }

      const { data: billsData, error: billsError } = await billsQuery.order("bill_date", { ascending: true });

      if (billsError) throw billsError;

      // Fetch voucher payments for this supplier
      let vouchersQuery = supabase
        .from("voucher_entries")
        .select("*")
        .eq("reference_type", "supplier")
        .eq("voucher_type", "payment")
        .is("deleted_at", null);

      // Get all bill IDs for this supplier to find related payments
      const { data: allBills } = await supabase
        .from("purchase_bills")
        .select("id")
        .eq("supplier_id", selectedSupplier.id)
        .is("deleted_at", null);

      const billIds = allBills?.map(b => b.id) || [];

      if (billIds.length > 0) {
        vouchersQuery = vouchersQuery.in("reference_id", billIds);
      } else {
        vouchersQuery = vouchersQuery.eq("reference_id", "00000000-0000-0000-0000-000000000000");
      }

      if (startDate) {
        vouchersQuery = vouchersQuery.gte("voucher_date", format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        vouchersQuery = vouchersQuery.lte("voucher_date", format(endDate, 'yyyy-MM-dd'));
      }

      const { data: vouchersData, error: vouchersError } = await vouchersQuery.order("voucher_date", { ascending: true });

      if (vouchersError) throw vouchersError;

      // Also fetch opening balance payments (reference_id = supplier_id)
      let openingBalanceQuery = supabase
        .from("voucher_entries")
        .select("*")
        .eq("reference_type", "supplier")
        .eq("reference_id", selectedSupplier.id)
        .eq("voucher_type", "payment")
        .is("deleted_at", null);

      if (startDate) {
        openingBalanceQuery = openingBalanceQuery.gte("voucher_date", format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        openingBalanceQuery = openingBalanceQuery.lte("voucher_date", format(endDate, 'yyyy-MM-dd'));
      }

      const { data: openingBalancePayments, error: openingError } = await openingBalanceQuery.order("voucher_date", { ascending: true });

      if (openingError) throw openingError;

      // Merge bill payments and opening balance payments
      const allVouchers = [...(vouchersData || []), ...(openingBalancePayments || [])];

      // Calculate total voucher payments per bill
      const voucherPaymentsByBillId: Record<string, number> = {};
      (vouchersData || []).forEach((voucher) => {
        if (voucher.reference_id) {
          voucherPaymentsByBillId[voucher.reference_id] = 
            (voucherPaymentsByBillId[voucher.reference_id] || 0) + (voucher.total_amount || 0);
        }
      });

      // Combine and sort transactions
      const allTransactions: Transaction[] = [];
      
      // Start with opening balance
      const openingBalance = selectedSupplier.opening_balance || 0;
      let runningBalance = openingBalance;

      // Add opening balance as first entry if it exists
      if (openingBalance !== 0) {
        allTransactions.push({
          id: 'opening-balance',
          date: '1900-01-01',
          type: 'bill',
          reference: 'Opening',
          description: 'Opening Balance (Carried Forward)',
          debit: 0,
          credit: openingBalance > 0 ? openingBalance : 0,
          balance: runningBalance,
        });
      }

      // Merge bills and payments chronologically
      const combined = [
        ...(billsData || []).map((bill) => ({
          date: bill.bill_date,
          type: 'bill' as const,
          data: bill,
        })),
        ...allVouchers.map((voucher) => ({
          date: voucher.voucher_date,
          type: 'payment' as const,
          data: voucher,
        })),
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      combined.forEach((item) => {
        if (item.type === 'bill') {
          const bill = item.data as any;
          runningBalance += bill.net_amount;
          
          allTransactions.push({
            id: bill.id,
            date: bill.bill_date,
            type: 'bill',
            reference: bill.supplier_invoice_no || bill.software_bill_no || 'N/A',
            description: `Purchase Bill - ${bill.payment_status || 'pending'}`,
            debit: 0,
            credit: bill.net_amount,
            balance: runningBalance,
          });

          // Calculate payment at purchase (exclude amounts paid via vouchers)
          const totalPaidOnBill = bill.paid_amount || 0;
          const voucherPayments = voucherPaymentsByBillId[bill.id] || 0;
          const paidAtPurchase = Math.max(0, totalPaidOnBill - voucherPayments);
          
          if (paidAtPurchase > 0) {
            runningBalance -= paidAtPurchase;
            
            allTransactions.push({
              id: `${bill.id}-payment-at-purchase`,
              date: bill.bill_date,
              type: 'payment',
              reference: bill.supplier_invoice_no || bill.software_bill_no || 'N/A',
              description: 'Payment at purchase',
              debit: paidAtPurchase,
              credit: 0,
              balance: runningBalance,
            });
          }
        } else {
          const voucher = item.data as any;
          runningBalance -= voucher.total_amount;
          
          const isOpeningBalancePayment = !billIds.includes(voucher.reference_id);
          const relatedBill = !isOpeningBalancePayment ? billsData?.find(b => b.id === voucher.reference_id) : null;
          const billRef = relatedBill ? ` - for ${relatedBill.supplier_invoice_no || relatedBill.software_bill_no}` : '';
          
          allTransactions.push({
            id: voucher.id,
            date: voucher.voucher_date,
            type: 'payment',
            reference: voucher.voucher_number,
            description: isOpeningBalancePayment 
              ? (voucher.description || 'Opening balance payment')
              : (voucher.description || 'Payment made') + billRef,
            debit: voucher.total_amount,
            credit: 0,
            balance: runningBalance,
          });
        }
      });

      return allTransactions;
    },
    enabled: !!selectedSupplier?.id,
  });

  // Filter suppliers based on search and payment status
  const filteredSuppliers = useMemo(() => {
    if (!suppliers) return [];
    
    return suppliers.filter((supplier) => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = (
        supplier.supplier_name.toLowerCase().includes(searchLower) ||
        supplier.phone?.toLowerCase().includes(searchLower) ||
        supplier.email?.toLowerCase().includes(searchLower)
      );

      let matchesPaymentStatus = true;
      if (paymentStatusFilter === "outstanding") {
        matchesPaymentStatus = supplier.balance > 0;
      } else if (paymentStatusFilter === "settled") {
        matchesPaymentStatus = supplier.balance === 0;
      } else if (paymentStatusFilter === "advance") {
        matchesPaymentStatus = supplier.balance < 0;
      }

      return matchesSearch && matchesPaymentStatus;
    });
  }, [suppliers, searchQuery, paymentStatusFilter]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    if (!filteredSuppliers) return { totalSuppliers: 0, totalOutstanding: 0, totalPayable: 0 };
    
    return {
      totalSuppliers: filteredSuppliers.length,
      totalOutstanding: filteredSuppliers.reduce((sum, s) => sum + Math.max(0, s.balance), 0),
      totalPayable: filteredSuppliers.reduce((sum, s) => sum + s.totalPurchases, 0),
    };
  }, [filteredSuppliers]);

  const handleExportToExcel = () => {
    if (!selectedSupplier || !transactions) return;

    const exportData = transactions.map((t) => ({
      Date: t.id === 'opening-balance' ? 'Opening' : format(new Date(t.date), "dd/MM/yyyy"),
      Type: t.type === 'bill' ? 'Bill' : 'Payment',
      Reference: t.reference,
      Description: t.description,
      Debit: t.debit > 0 ? t.debit.toFixed(2) : '',
      Credit: t.credit > 0 ? t.credit.toFixed(2) : '',
      Balance: t.balance.toFixed(2),
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Supplier Ledger");
    XLSX.writeFile(wb, `${selectedSupplier.supplier_name}_Ledger_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
  };

  if (selectedSupplier && transactions) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedSupplier(null)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Suppliers
          </Button>
          
          <div className="flex flex-col md:flex-row items-start md:items-center gap-2 w-full md:w-auto">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full md:w-[200px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "dd MMM yyyy") : "Start Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full md:w-[200px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, "dd MMM yyyy") : "End Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {(startDate || endDate) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setStartDate(undefined);
                  setEndDate(undefined);
                }}
              >
                Clear
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportToExcel}
            >
              <Download className="mr-2 h-4 w-4" />
              Export to Excel
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <CardTitle className="text-2xl">{selectedSupplier.supplier_name}</CardTitle>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {selectedSupplier.phone && (
                    <div className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {selectedSupplier.phone}
                    </div>
                  )}
                  {selectedSupplier.email && (
                    <div className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {selectedSupplier.email}
                    </div>
                  )}
                  {selectedSupplier.address && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {selectedSupplier.address}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground mb-1">Outstanding Payable</div>
                <div className={cn(
                  "text-3xl font-bold",
                  selectedSupplier.balance > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                )}>
                  ₹{Math.abs(selectedSupplier.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
                {selectedSupplier.balance > 0 && (
                  <Badge variant="destructive" className="mt-2">Payable</Badge>
                )}
                {selectedSupplier.balance < 0 && (
                  <Badge variant="default" className="mt-2 bg-green-600">Advance Paid</Badge>
                )}
                {selectedSupplier.balance === 0 && (
                  <Badge variant="outline" className="mt-2">Settled</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {selectedSupplier.opening_balance !== 0 && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground mb-1">Opening Balance</div>
                    <div className={cn(
                      "text-2xl font-bold",
                      selectedSupplier.opening_balance > 0 ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"
                    )}>
                      ₹{Math.abs(selectedSupplier.opening_balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selectedSupplier.opening_balance > 0 ? "Payable" : "Advance"}
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground mb-1">Total Purchases</div>
                  <div className="text-2xl font-bold">
                    ₹{selectedSupplier.totalPurchases.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground mb-1">Total Paid</div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    ₹{selectedSupplier.totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground mb-1">Payment Rate</div>
                  <div className="text-2xl font-bold">
                    {(selectedSupplier.totalPurchases + Math.max(0, selectedSupplier.opening_balance)) > 0
                      ? ((selectedSupplier.totalPaid / (selectedSupplier.totalPurchases + Math.max(0, selectedSupplier.opening_balance))) * 100).toFixed(1)
                      : '0.0'}%
                  </div>
                </CardContent>
              </Card>
            </div>

            <Separator className="my-6" />

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Debit (Paid)</TableHead>
                    <TableHead className="text-right">Credit (Bill)</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No transactions found
                      </TableCell>
                    </TableRow>
                  ) : (
                    transactions.map((transaction) => (
                      <TableRow key={transaction.id} className={transaction.id === 'opening-balance' ? 'bg-muted/50' : ''}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {transaction.id === 'opening-balance' 
                              ? <span className="font-semibold">Opening</span>
                              : format(new Date(transaction.date), "dd MMM yyyy")
                            }
                          </div>
                        </TableCell>
                        <TableCell>
                          {transaction.id === 'opening-balance' ? (
                            <Badge variant="outline" className="bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400">
                              B/F
                            </Badge>
                          ) : (
                            <Badge variant={transaction.type === 'bill' ? 'default' : 'secondary'}>
                              {transaction.type === 'bill' ? (
                                <><FileText className="h-3 w-3 mr-1" /> Bill</>
                              ) : (
                                <><IndianRupee className="h-3 w-3 mr-1" /> Payment</>
                              )}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{transaction.reference}</TableCell>
                        <TableCell className="text-muted-foreground">{transaction.description}</TableCell>
                        <TableCell className="text-right font-medium">
                          {transaction.debit > 0 && (
                            <span className="text-green-600 dark:text-green-400">
                              ₹{transaction.debit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {transaction.credit > 0 && (
                            <span className="text-red-600 dark:text-red-400">
                              ₹{transaction.credit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-bold",
                          transaction.balance > 0 ? "text-red-600 dark:text-red-400" : 
                          transaction.balance < 0 ? "text-green-600 dark:text-green-400" : 
                          "text-foreground"
                        )}>
                          ₹{Math.abs(transaction.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setPaymentStatusFilter("all")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Suppliers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary.totalSuppliers}</div>
            <p className="text-xs text-muted-foreground mt-1">Active supplier accounts</p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setPaymentStatusFilter("outstanding")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Payable</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600 dark:text-red-400">
              ₹{summary.totalOutstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Amount pending payment</p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setPaymentStatusFilter("all")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Purchases</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              ₹{summary.totalPayable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total purchase value</p>
          </CardContent>
        </Card>
      </div>

      {/* Supplier List */}
      <Card>
        <CardHeader>
          <CardTitle>Supplier Ledger</CardTitle>
          <CardDescription>View detailed transaction history for each supplier</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 mb-6">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Payment Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="outstanding">Outstanding</SelectItem>
                <SelectItem value="settled">Settled</SelectItem>
                <SelectItem value="advance">Advance Paid</SelectItem>
              </SelectContent>
            </Select>

            {paymentStatusFilter !== "all" && (
              <Button
                variant="ghost"
                onClick={() => setPaymentStatusFilter("all")}
                className="w-full md:w-auto"
              >
                Clear Filters
              </Button>
            )}
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Total Purchases</TableHead>
                  <TableHead className="text-right">Total Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Loading suppliers...
                    </TableCell>
                  </TableRow>
                ) : filteredSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No suppliers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSuppliers.map((supplier) => (
                    <TableRow 
                      key={supplier.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedSupplier(supplier)}
                    >
                      <TableCell className="font-medium">{supplier.supplier_name}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                          {supplier.phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {supplier.phone}
                            </div>
                          )}
                          {supplier.email && (
                            <div className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {supplier.email}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        ₹{supplier.totalPurchases.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right text-green-600 dark:text-green-400">
                        ₹{supplier.totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-bold",
                        supplier.balance > 0 ? "text-red-600 dark:text-red-400" : 
                        supplier.balance < 0 ? "text-green-600 dark:text-green-400" : 
                        "text-foreground"
                      )}>
                        ₹{Math.abs(supplier.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-center">
                        {supplier.balance > 0 && (
                          <Badge variant="destructive">Payable</Badge>
                        )}
                        {supplier.balance < 0 && (
                          <Badge variant="default" className="bg-green-600">Advance</Badge>
                        )}
                        {supplier.balance === 0 && (
                          <Badge variant="outline">Settled</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSupplier(supplier);
                          }}
                        >
                          View Ledger
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
