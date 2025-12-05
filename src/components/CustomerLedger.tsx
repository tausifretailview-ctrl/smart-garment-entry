import { useState, useMemo } from "react";
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

interface CustomerLedgerProps {
  organizationId: string;
}

interface Customer {
  id: string;
  customer_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  opening_balance: number;
  totalSales: number;
  totalPaid: number;
  balance: number;
}

interface Transaction {
  id: string;
  date: string;
  type: 'invoice' | 'payment';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  paymentBreakdown?: {
    cash?: number;
    card?: number;
    upi?: number;
    method?: string;
  };
}

export function CustomerLedger({ organizationId }: CustomerLedgerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  // Fetch all customers with their transaction summary
  const { data: customers, isLoading } = useQuery({
    queryKey: ["customer-ledger", organizationId],
    queryFn: async () => {
      // Fetch all customers
      const { data: customersData, error: customersError } = await supabase
        .from("customers")
        .select("*")
        .eq("organization_id", organizationId)
        .order("customer_name");

      if (customersError) throw customersError;

      // Fetch sales for each customer
      const { data: salesData, error: salesError } = await supabase
        .from("sales")
        .select("customer_id, net_amount, paid_amount")
        .eq("organization_id", organizationId);

      if (salesError) throw salesError;

      // Calculate totals per customer - using paid_amount directly from sales table
      const customerTotals = customersData.map((customer) => {
        const customerSales = salesData.filter((s) => s.customer_id === customer.id);
        const totalSales = customerSales.reduce((sum, s) => sum + (s.net_amount || 0), 0);
        // Use paid_amount from sales table (includes cash, card, upi from mixed payments)
        const totalPaid = customerSales.reduce((sum, s) => sum + (s.paid_amount || 0), 0);
        const openingBalance = customer.opening_balance || 0;
        // Balance = Opening Balance + Total Sales - Total Paid
        const balance = openingBalance + totalSales - totalPaid;

        return {
          ...customer,
          opening_balance: openingBalance,
          totalSales,
          totalPaid,
          balance,
        };
      });

      return customerTotals;
    },
    enabled: !!organizationId,
  });

  // Fetch detailed transactions for selected customer
  const { data: transactions } = useQuery({
    queryKey: ["customer-transactions", selectedCustomer?.id, startDate, endDate],
    queryFn: async () => {
      if (!selectedCustomer) return [];

      // First, get ALL sales for this customer (without date filter) to get all possible reference_ids
      const { data: allCustomerSales, error: allSalesError } = await supabase
        .from("sales")
        .select("id")
        .eq("customer_id", selectedCustomer.id);

      if (allSalesError) throw allSalesError;

      const allSaleIds = allCustomerSales?.map(s => s.id) || [];

      // Build date filter for displayed sales
      let salesQuery = supabase
        .from("sales")
        .select("*")
        .eq("customer_id", selectedCustomer.id);

      // Apply date filters - normalize dates to yyyy-MM-dd format for accurate comparison
      if (startDate) {
        const startDateStr = format(startDate, 'yyyy-MM-dd');
        salesQuery = salesQuery.gte("sale_date", startDateStr);
      }
      if (endDate) {
        const endDateStr = format(endDate, 'yyyy-MM-dd');
        salesQuery = salesQuery.lte("sale_date", endDateStr);
      }

      const { data: salesData, error: salesError } = await salesQuery.order("sale_date", { ascending: true });

      if (salesError) throw salesError;

      // Build voucher query - fetch all payments for ANY of this customer's invoices
      let vouchersQuery = supabase
        .from("voucher_entries")
        .select("*")
        .eq("voucher_type", "receipt")
        .in("reference_id", allSaleIds.length > 0 ? allSaleIds : ['00000000-0000-0000-0000-000000000000']);

      // Apply date filters to vouchers
      if (startDate) {
        const startDateStr = format(startDate, 'yyyy-MM-dd');
        vouchersQuery = vouchersQuery.gte("voucher_date", startDateStr);
      }
      if (endDate) {
        const endDateStr = format(endDate, 'yyyy-MM-dd');
        vouchersQuery = vouchersQuery.lte("voucher_date", endDateStr);
      }

      const { data: vouchersData, error: vouchersError } = await vouchersQuery.order("voucher_date", { ascending: true });

      if (vouchersError) throw vouchersError;

      console.log('Sales for customer:', salesData?.length || 0);
      console.log('All customer sale IDs:', allSaleIds.length);
      console.log('Payments found:', vouchersData?.length || 0);

      // Combine and sort transactions
      const allTransactions: Transaction[] = [];
      
      // Start with opening balance
      const openingBalance = selectedCustomer.opening_balance || 0;
      let runningBalance = openingBalance;

      // Add opening balance as first entry if it exists
      if (openingBalance !== 0) {
        allTransactions.push({
          id: 'opening-balance',
          date: '1900-01-01', // Will be shown as "Opening Balance"
          type: 'invoice',
          reference: 'Opening',
          description: 'Opening Balance (Carried Forward)',
          debit: openingBalance > 0 ? openingBalance : 0,
          credit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
          balance: runningBalance,
        });
      }

      // Merge sales and payments chronologically
      const combined = [
        ...salesData.map((sale) => ({
          date: sale.sale_date,
          type: 'invoice' as const,
          data: sale,
        })),
        ...(vouchersData || []).map((voucher) => ({
          date: voucher.voucher_date,
          type: 'payment' as const,
          data: voucher,
        })),
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      combined.forEach((item) => {
        if (item.type === 'invoice') {
          const sale = item.data as any;
          runningBalance += sale.net_amount;
          
          // Build payment breakdown for display
          const paymentBreakdown: any = {};
          if (sale.cash_amount && sale.cash_amount > 0) paymentBreakdown.cash = sale.cash_amount;
          if (sale.card_amount && sale.card_amount > 0) paymentBreakdown.card = sale.card_amount;
          if (sale.upi_amount && sale.upi_amount > 0) paymentBreakdown.upi = sale.upi_amount;
          
          allTransactions.push({
            id: sale.id,
            date: sale.sale_date,
            type: 'invoice',
            reference: sale.sale_number,
            description: `${sale.sale_type === 'pos' ? 'POS' : 'Invoice'} - ${sale.payment_status}`,
            debit: sale.net_amount,
            credit: 0,
            balance: runningBalance,
            paymentBreakdown: Object.keys(paymentBreakdown).length > 0 ? paymentBreakdown : undefined,
          });

          // Add credit entry for payment made at time of sale (mix payment, partial payment)
          const paidAtSale = sale.paid_amount || 0;
          if (paidAtSale > 0) {
            runningBalance -= paidAtSale;
            
            // Build payment description with breakdown
            const paymentParts: string[] = [];
            if (sale.cash_amount > 0) paymentParts.push(`Cash: ₹${sale.cash_amount.toLocaleString('en-IN')}`);
            if (sale.card_amount > 0) paymentParts.push(`Card: ₹${sale.card_amount.toLocaleString('en-IN')}`);
            if (sale.upi_amount > 0) paymentParts.push(`UPI: ₹${sale.upi_amount.toLocaleString('en-IN')}`);
            
            allTransactions.push({
              id: `${sale.id}-payment-at-sale`,
              date: sale.sale_date,
              type: 'payment',
              reference: sale.sale_number,
              description: `Payment at sale${paymentParts.length > 0 ? ' - ' + paymentParts.join(', ') : ''}`,
              debit: 0,
              credit: paidAtSale,
              balance: runningBalance,
              paymentBreakdown: {
                cash: sale.cash_amount || 0,
                card: sale.card_amount || 0,
                upi: sale.upi_amount || 0,
              },
            });
          }
        } else {
          const voucher = item.data as any;
          runningBalance -= voucher.total_amount;
          
          // Find related invoice number
          const relatedSale = salesData.find(s => s.id === voucher.reference_id);
          const invoiceRef = relatedSale ? ` for ${relatedSale.sale_number}` : '';
          
          allTransactions.push({
            id: voucher.id,
            date: voucher.voucher_date,
            type: 'payment',
            reference: voucher.voucher_number,
            description: (voucher.description || 'Payment received') + invoiceRef,
            debit: 0,
            credit: voucher.total_amount,
            balance: runningBalance,
            paymentBreakdown: voucher.metadata?.paymentMethod ? { method: voucher.metadata.paymentMethod } : undefined,
          });
        }
      });

      return allTransactions;
    },
    enabled: !!selectedCustomer?.id,
  });

  // Filter customers based on search, payment status, and date range
  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    
    return customers.filter((customer) => {
      // Search filter
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = (
        customer.customer_name.toLowerCase().includes(searchLower) ||
        customer.phone?.toLowerCase().includes(searchLower) ||
        customer.email?.toLowerCase().includes(searchLower)
      );

      // Payment status filter
      let matchesPaymentStatus = true;
      if (paymentStatusFilter === "outstanding") {
        matchesPaymentStatus = customer.balance > 0;
      } else if (paymentStatusFilter === "settled") {
        matchesPaymentStatus = customer.balance === 0;
      } else if (paymentStatusFilter === "advance") {
        matchesPaymentStatus = customer.balance < 0;
      }

      return matchesSearch && matchesPaymentStatus;
    });
  }, [customers, searchQuery, paymentStatusFilter]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    if (!filteredCustomers) return { totalCustomers: 0, totalOutstanding: 0, totalReceivable: 0 };
    
    return {
      totalCustomers: filteredCustomers.length,
      totalOutstanding: filteredCustomers.reduce((sum, c) => sum + Math.max(0, c.balance), 0),
      totalReceivable: filteredCustomers.reduce((sum, c) => sum + c.totalSales, 0),
    };
  }, [filteredCustomers]);

  const handleExportToExcel = () => {
    if (!selectedCustomer || !transactions) return;

    const exportData = transactions.map((t) => {
      const row: any = {
        Date: format(new Date(t.date), "dd/MM/yyyy"),
        Type: t.type === 'invoice' ? 'Invoice' : 'Payment',
        Reference: t.reference,
        Description: t.description,
        Debit: t.debit > 0 ? t.debit.toFixed(2) : '',
        Credit: t.credit > 0 ? t.credit.toFixed(2) : '',
      };

      // Add payment breakdown columns if available
      if (t.paymentBreakdown) {
        if (t.paymentBreakdown.cash !== undefined && t.paymentBreakdown.cash > 0) {
          row['Cash Amount'] = t.paymentBreakdown.cash.toFixed(2);
        }
        if (t.paymentBreakdown.card !== undefined && t.paymentBreakdown.card > 0) {
          row['Card Amount'] = t.paymentBreakdown.card.toFixed(2);
        }
        if (t.paymentBreakdown.upi !== undefined && t.paymentBreakdown.upi > 0) {
          row['UPI Amount'] = t.paymentBreakdown.upi.toFixed(2);
        }
        if (t.paymentBreakdown.method) {
          row['Payment Method'] = t.paymentBreakdown.method.toUpperCase();
        }
      }

      row.Balance = t.balance.toFixed(2);
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customer Ledger");
    XLSX.writeFile(wb, `${selectedCustomer.customer_name}_Ledger_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
  };

  if (selectedCustomer && transactions) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedCustomer(null)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Customers
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
                <CardTitle className="text-2xl">{selectedCustomer.customer_name}</CardTitle>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {selectedCustomer.phone && (
                    <div className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {selectedCustomer.phone}
                    </div>
                  )}
                  {selectedCustomer.email && (
                    <div className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {selectedCustomer.email}
                    </div>
                  )}
                  {selectedCustomer.address && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {selectedCustomer.address}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground mb-1">Outstanding Balance</div>
                <div className={cn(
                  "text-3xl font-bold",
                  selectedCustomer.balance > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                )}>
                  ₹{Math.abs(selectedCustomer.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
                {selectedCustomer.balance > 0 && (
                  <Badge variant="destructive" className="mt-2">Outstanding</Badge>
                )}
                {selectedCustomer.balance < 0 && (
                  <Badge variant="default" className="mt-2 bg-green-600">Advance</Badge>
                )}
                {selectedCustomer.balance === 0 && (
                  <Badge variant="outline" className="mt-2">Settled</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {selectedCustomer.opening_balance !== 0 && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground mb-1">Opening Balance</div>
                    <div className={cn(
                      "text-2xl font-bold",
                      selectedCustomer.opening_balance > 0 ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"
                    )}>
                      ₹{Math.abs(selectedCustomer.opening_balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selectedCustomer.opening_balance > 0 ? "Receivable" : "Advance"}
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground mb-1">Total Sales</div>
                  <div className="text-2xl font-bold">
                    ₹{selectedCustomer.totalSales.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground mb-1">Total Paid</div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    ₹{selectedCustomer.totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground mb-1">Collection Rate</div>
                  <div className="text-2xl font-bold">
                    {(selectedCustomer.totalSales + Math.max(0, selectedCustomer.opening_balance)) > 0
                      ? ((selectedCustomer.totalPaid / (selectedCustomer.totalSales + Math.max(0, selectedCustomer.opening_balance))) * 100).toFixed(1)
                      : '0.0'}%
                  </div>
                </CardContent>
              </Card>
            </div>

            <Separator className="my-6" />

            <h3 className="text-lg font-semibold mb-4">Transaction History</h3>
            
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
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
                            <Badge variant={transaction.type === 'invoice' ? 'default' : 'secondary'}>
                              {transaction.type === 'invoice' ? (
                                <><FileText className="h-3 w-3 mr-1" /> Invoice</>
                              ) : (
                                <><IndianRupee className="h-3 w-3 mr-1" /> Payment</>
                              )}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{transaction.reference}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="text-muted-foreground">{transaction.description}</div>
                            {transaction.paymentBreakdown && (
                              <div className="flex flex-wrap gap-2 mt-1">
                                {transaction.paymentBreakdown.cash !== undefined && transaction.paymentBreakdown.cash > 0 && (
                                  <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
                                    Cash: ₹{transaction.paymentBreakdown.cash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                  </Badge>
                                )}
                                {transaction.paymentBreakdown.card !== undefined && transaction.paymentBreakdown.card > 0 && (
                                  <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">
                                    Card: ₹{transaction.paymentBreakdown.card.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                  </Badge>
                                )}
                                {transaction.paymentBreakdown.upi !== undefined && transaction.paymentBreakdown.upi > 0 && (
                                  <Badge variant="outline" className="text-xs bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400">
                                    UPI: ₹{transaction.paymentBreakdown.upi.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                  </Badge>
                                )}
                                {transaction.paymentBreakdown.method && (
                                  <Badge variant="outline" className="text-xs">
                                    {transaction.paymentBreakdown.method.toUpperCase()}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {transaction.debit > 0 && (
                            <span className="text-red-600 dark:text-red-400">
                              ₹{transaction.debit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {transaction.credit > 0 && (
                            <span className="text-green-600 dark:text-green-400">
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
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary.totalCustomers}</div>
            <p className="text-xs text-muted-foreground mt-1">Active customer accounts</p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setPaymentStatusFilter("outstanding")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600 dark:text-red-400">
              ₹{summary.totalOutstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Amount pending collection</p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setPaymentStatusFilter("all")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Receivable</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              ₹{summary.totalReceivable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total sales value</p>
          </CardContent>
        </Card>
      </div>

      {/* Customer List */}
      <Card>
        <CardHeader>
          <CardTitle>Customer Ledger</CardTitle>
          <CardDescription>View detailed transaction history for each customer</CardDescription>
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
                <SelectItem value="advance">Advance</SelectItem>
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full md:w-[240px] justify-start text-left font-normal">
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
                <Button variant="outline" className="w-full md:w-[240px] justify-start text-left font-normal">
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

            {(startDate || endDate || paymentStatusFilter !== "all") && (
              <Button
                variant="ghost"
                onClick={() => {
                  setStartDate(undefined);
                  setEndDate(undefined);
                  setPaymentStatusFilter("all");
                }}
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
                  <TableHead>Customer Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Total Sales</TableHead>
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
                      Loading customers...
                    </TableCell>
                  </TableRow>
                ) : filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No customers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCustomers.map((customer) => (
                    <TableRow 
                      key={customer.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedCustomer(customer)}
                    >
                      <TableCell className="font-medium">{customer.customer_name}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                          {customer.phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {customer.phone}
                            </div>
                          )}
                          {customer.email && (
                            <div className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {customer.email}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        ₹{customer.totalSales.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right text-green-600 dark:text-green-400">
                        ₹{customer.totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-bold",
                        customer.balance > 0 ? "text-red-600 dark:text-red-400" : 
                        customer.balance < 0 ? "text-green-600 dark:text-green-400" : 
                        "text-foreground"
                      )}>
                        ₹{Math.abs(customer.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-center">
                        {customer.balance > 0 && (
                          <Badge variant="destructive">Outstanding</Badge>
                        )}
                        {customer.balance < 0 && (
                          <Badge variant="default" className="bg-green-600">Advance</Badge>
                        )}
                        {customer.balance === 0 && (
                          <Badge variant="outline">Settled</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCustomer(customer);
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
