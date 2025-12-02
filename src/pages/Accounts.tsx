import { useState } from "react";
import { Layout } from "@/components/Layout";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, TrendingUp, TrendingDown, DollarSign, Wallet } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { cn } from "@/lib/utils";
import { CustomerLedger } from "@/components/CustomerLedger";

export default function Accounts() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState("customer-ledger");
  
  // Form states
  const [voucherDate, setVoucherDate] = useState<Date>(new Date());
  const [voucherType, setVoucherType] = useState("payment");
  const [referenceType, setReferenceType] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");

  // Fetch customer outstanding balance
  const { data: customerBalance } = useQuery({
    queryKey: ["customer-balance", referenceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("net_amount")
        .eq("customer_id", referenceId)
        .in("payment_status", ["pending", "partial"]);
      
      if (error) throw error;
      
      const totalOutstanding = data?.reduce((sum, sale) => sum + (sale.net_amount || 0), 0) || 0;
      return totalOutstanding;
    },
    enabled: !!referenceId && referenceType === "customer",
  });

  // Fetch supplier outstanding balance
  const { data: supplierBalance } = useQuery({
    queryKey: ["supplier-balance", referenceId],
    queryFn: async () => {
      const { data: bills, error: billsError } = await supabase
        .from("purchase_bills")
        .select("id, net_amount")
        .eq("supplier_id", referenceId);
      
      if (billsError) throw billsError;

      // Get all payments made for these bills
      const billIds = bills?.map(b => b.id) || [];
      const { data: payments, error: paymentsError } = await supabase
        .from("voucher_entries")
        .select("total_amount, reference_id")
        .eq("reference_type", "supplier")
        .in("reference_id", billIds);
      
      if (paymentsError) throw paymentsError;

      const totalBills = bills?.reduce((sum, bill) => sum + (bill.net_amount || 0), 0) || 0;
      const totalPaid = payments?.reduce((sum, payment) => sum + (payment.total_amount || 0), 0) || 0;
      
      return totalBills - totalPaid;
    },
    enabled: !!referenceId && referenceType === "supplier",
  });

  // Fetch customers
  const { data: customers } = useQuery({
    queryKey: ["customers", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("organization_id", currentOrganization?.id)
        .order("customer_name");
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch suppliers
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("organization_id", currentOrganization?.id)
        .order("supplier_name");
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch employees
  const { data: employees } = useQuery({
    queryKey: ["employees", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("organization_id", currentOrganization?.id)
        .order("employee_name");
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch account ledgers
  const { data: accountLedgers } = useQuery({
    queryKey: ["account-ledgers", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_ledgers")
        .select("*")
        .eq("organization_id", currentOrganization?.id)
        .order("account_name");
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch voucher entries
  const { data: vouchers } = useQuery({
    queryKey: ["voucher-entries", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voucher_entries")
        .select("*")
        .eq("organization_id", currentOrganization?.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch sales data for P&L calculation
  const { data: sales } = useQuery({
    queryKey: ["sales", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .eq("organization_id", currentOrganization?.id);
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Calculate dashboard metrics
  const dashboardMetrics = {
    totalReceivables: vouchers
      ?.filter((v) => v.reference_type === "customer" && v.voucher_type === "receipt")
      .reduce((sum, v) => sum + Number(v.total_amount), 0) || 0,
    
    totalPayables: vouchers
      ?.filter((v) => (v.reference_type === "supplier" || v.reference_type === "employee") && v.voucher_type === "payment")
      .reduce((sum, v) => sum + Number(v.total_amount), 0) || 0,
    
    monthlyExpenses: vouchers
      ?.filter((v) => {
        const voucherDate = new Date(v.voucher_date);
        const now = new Date();
        return (
          v.reference_type === "expense" &&
          voucherDate >= startOfMonth(now) &&
          voucherDate <= endOfMonth(now)
        );
      })
      .reduce((sum, v) => sum + Number(v.total_amount), 0) || 0,
    
    currentMonthPL: (() => {
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      
      // Calculate revenue from sales
      const revenue = sales
        ?.filter((s) => {
          const saleDate = new Date(s.sale_date);
          return saleDate >= monthStart && saleDate <= monthEnd;
        })
        .reduce((sum, s) => sum + Number(s.net_amount), 0) || 0;
      
      // Calculate expenses
      const expenses = vouchers
        ?.filter((v) => {
          const voucherDate = new Date(v.voucher_date);
          return (
            v.voucher_type === "payment" &&
            voucherDate >= monthStart &&
            voucherDate <= monthEnd
          );
        })
        .reduce((sum, v) => sum + Number(v.total_amount), 0) || 0;
      
      return revenue - expenses;
    })(),
  };

  // Create voucher mutation
  const createVoucher = useMutation({
    mutationFn: async (voucherData: any) => {
      // Generate voucher number
      const { data: voucherNumber, error: numberError } = await supabase.rpc(
        "generate_voucher_number",
        { p_type: voucherType, p_date: format(voucherDate, "yyyy-MM-dd") }
      );
      if (numberError) throw numberError;

      // Create voucher entry
      const { data: voucher, error: voucherError } = await supabase
        .from("voucher_entries")
        .insert({
          organization_id: currentOrganization?.id,
          voucher_number: voucherNumber,
          voucher_type: voucherType,
          voucher_date: format(voucherDate, "yyyy-MM-dd"),
          reference_type: referenceType,
          reference_id: referenceId || null,
          description: description,
          total_amount: parseFloat(amount),
        })
        .select()
        .single();

      if (voucherError) throw voucherError;

      return voucher;
    },
    onSuccess: () => {
      toast.success("Voucher created successfully");
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      resetForm();
    },
    onError: (error: any) => {
      toast.error(`Failed to create voucher: ${error.message}`);
    },
  });

  const resetForm = () => {
    setVoucherDate(new Date());
    setReferenceType("");
    setReferenceId("");
    setDescription("");
    setAmount("");
    setAccountId("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    createVoucher.mutate({});
  };

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <BackToDashboard />

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Accounts Management
            </h1>
            <p className="text-muted-foreground mt-2">
              Manage payments, expenses, vouchers and financial reports
            </p>
          </div>
        </div>

        {/* Dashboard Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-green-200 dark:border-green-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-900 dark:text-green-100">
                Total Receivables
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-900 dark:text-green-100">
                ₹{dashboardMetrics.totalReceivables.toFixed(2)}
              </div>
              <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                Customer payments received
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-red-900 border-red-200 dark:border-red-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-red-900 dark:text-red-100">
                Total Payables
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-900 dark:text-red-100">
                ₹{dashboardMetrics.totalPayables.toFixed(2)}
              </div>
              <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                Supplier & employee payments
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900 border-orange-200 dark:border-orange-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-orange-900 dark:text-orange-100">
                Monthly Expenses
              </CardTitle>
              <DollarSign className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                ₹{dashboardMetrics.monthlyExpenses.toFixed(2)}
              </div>
              <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                Current month expenses
              </p>
            </CardContent>
          </Card>

          <Card className={cn(
            "bg-gradient-to-br border-2",
            dashboardMetrics.currentMonthPL >= 0
              ? "from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800"
              : "from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 border-purple-200 dark:border-purple-800"
          )}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className={cn(
                "text-sm font-medium",
                dashboardMetrics.currentMonthPL >= 0
                  ? "text-blue-900 dark:text-blue-100"
                  : "text-purple-900 dark:text-purple-100"
              )}>
                Current Month P/L
              </CardTitle>
              <Wallet className={cn(
                "h-4 w-4",
                dashboardMetrics.currentMonthPL >= 0
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-purple-600 dark:text-purple-400"
              )} />
            </CardHeader>
            <CardContent>
              <div className={cn(
                "text-2xl font-bold",
                dashboardMetrics.currentMonthPL >= 0
                  ? "text-blue-900 dark:text-blue-100"
                  : "text-purple-900 dark:text-purple-100"
              )}>
                ₹{dashboardMetrics.currentMonthPL.toFixed(2)}
              </div>
              <p className={cn(
                "text-xs mt-1",
                dashboardMetrics.currentMonthPL >= 0
                  ? "text-blue-700 dark:text-blue-300"
                  : "text-purple-700 dark:text-purple-300"
              )}>
                {dashboardMetrics.currentMonthPL >= 0 ? "Profit" : "Loss"} for {format(new Date(), "MMMM yyyy")}
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
            <TabsTrigger value="customer-ledger">Customer Ledger</TabsTrigger>
            <TabsTrigger value="customer-payment">Customer Payment</TabsTrigger>
            <TabsTrigger value="supplier-payment">Supplier Payment</TabsTrigger>
            <TabsTrigger value="employee-salary">Employee Salary</TabsTrigger>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="voucher-entry">Voucher Entry</TabsTrigger>
            <TabsTrigger value="pl-report">P&L Report</TabsTrigger>
            <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
          </TabsList>

          {/* Customer Ledger Tab */}
          <TabsContent value="customer-ledger" className="space-y-6">
            {currentOrganization?.id && <CustomerLedger organizationId={currentOrganization.id} />}
          </TabsContent>

          {/* Customer Payment Tab */}
          <TabsContent value="customer-payment" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Customer Payment Receipt (RCP)</CardTitle>
                <CardDescription>Record payment received from customers</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !voucherDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {voucherDate ? format(voucherDate, "PPP") : <span>Pick a date</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={voucherDate}
                            onSelect={(date) => date && setVoucherDate(date)}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>Customer</Label>
                      <Select value={referenceId} onValueChange={(val) => {
                        setReferenceId(val);
                        setReferenceType("customer");
                        setVoucherType("receipt");
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select customer" />
                        </SelectTrigger>
                        <SelectContent>
                          {customers?.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.customer_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {referenceId && referenceType === "customer" && customerBalance !== undefined && (
                        <div className="mt-2 p-3 bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900 border border-amber-200 dark:border-amber-800 rounded-md">
                          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                            Outstanding Balance: <span className="text-lg font-bold">₹{customerBalance.toFixed(2)}</span>
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Amount</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Enter amount"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        placeholder="Payment description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full md:w-auto">
                    <Plus className="mr-2 h-4 w-4" />
                    Record Payment
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Customer Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Voucher No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vouchers
                      ?.filter((v) => v.reference_type === "customer" && v.voucher_type === "receipt")
                      .slice(0, 10)
                      .map((voucher) => (
                        <TableRow key={voucher.id}>
                          <TableCell className="font-medium">{voucher.voucher_number}</TableCell>
                          <TableCell>{format(new Date(voucher.voucher_date), "dd/MM/yyyy")}</TableCell>
                          <TableCell>
                            {customers?.find((c) => c.id === voucher.reference_id)?.customer_name || "-"}
                          </TableCell>
                          <TableCell>₹{voucher.total_amount.toFixed(2)}</TableCell>
                          <TableCell className="max-w-xs truncate">{voucher.description}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Supplier Payment Tab */}
          <TabsContent value="supplier-payment" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Supplier Payment (PAY)</CardTitle>
                <CardDescription>Record payment made to suppliers</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !voucherDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {voucherDate ? format(voucherDate, "PPP") : <span>Pick a date</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={voucherDate}
                            onSelect={(date) => date && setVoucherDate(date)}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>Supplier</Label>
                      <Select value={referenceId} onValueChange={(val) => {
                        setReferenceId(val);
                        setReferenceType("supplier");
                        setVoucherType("payment");
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select supplier" />
                        </SelectTrigger>
                        <SelectContent>
                          {suppliers?.map((supplier) => (
                            <SelectItem key={supplier.id} value={supplier.id}>
                              {supplier.supplier_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {referenceId && referenceType === "supplier" && supplierBalance !== undefined && (
                        <div className="mt-2 p-3 bg-gradient-to-r from-rose-50 to-rose-100 dark:from-rose-950 dark:to-rose-900 border border-rose-200 dark:border-rose-800 rounded-md">
                          <p className="text-sm font-medium text-rose-900 dark:text-rose-100">
                            Outstanding Balance: <span className="text-lg font-bold">₹{supplierBalance.toFixed(2)}</span>
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Amount</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Enter amount"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        placeholder="Payment description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full md:w-auto">
                    <Plus className="mr-2 h-4 w-4" />
                    Record Payment
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Supplier Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Voucher No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vouchers
                      ?.filter((v) => v.reference_type === "supplier" && v.voucher_type === "payment")
                      .slice(0, 10)
                      .map((voucher) => (
                        <TableRow key={voucher.id}>
                          <TableCell className="font-medium">{voucher.voucher_number}</TableCell>
                          <TableCell>{format(new Date(voucher.voucher_date), "dd/MM/yyyy")}</TableCell>
                          <TableCell>
                            {suppliers?.find((s) => s.id === voucher.reference_id)?.supplier_name || "-"}
                          </TableCell>
                          <TableCell>₹{voucher.total_amount.toFixed(2)}</TableCell>
                          <TableCell className="max-w-xs truncate">{voucher.description}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Employee Salary Tab */}
          <TabsContent value="employee-salary" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Employee Salary Payment</CardTitle>
                <CardDescription>Record salary payment to employees</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !voucherDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {voucherDate ? format(voucherDate, "PPP") : <span>Pick a date</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={voucherDate}
                            onSelect={(date) => date && setVoucherDate(date)}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>Employee</Label>
                      <Select value={referenceId} onValueChange={(val) => {
                        setReferenceId(val);
                        setReferenceType("employee");
                        setVoucherType("payment");
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select employee" />
                        </SelectTrigger>
                        <SelectContent>
                          {employees?.map((employee) => (
                            <SelectItem key={employee.id} value={employee.id}>
                              {employee.employee_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Amount</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Enter salary amount"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        placeholder="Salary month/year"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full md:w-auto">
                    <Plus className="mr-2 h-4 w-4" />
                    Record Salary Payment
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Salary Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Voucher No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vouchers
                      ?.filter((v) => v.reference_type === "employee" && v.voucher_type === "payment")
                      .slice(0, 10)
                      .map((voucher) => (
                        <TableRow key={voucher.id}>
                          <TableCell className="font-medium">{voucher.voucher_number}</TableCell>
                          <TableCell>{format(new Date(voucher.voucher_date), "dd/MM/yyyy")}</TableCell>
                          <TableCell>
                            {employees?.find((e) => e.id === voucher.reference_id)?.employee_name || "-"}
                          </TableCell>
                          <TableCell>₹{voucher.total_amount.toFixed(2)}</TableCell>
                          <TableCell className="max-w-xs truncate">{voucher.description}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Business Expenses Tab */}
          <TabsContent value="expenses" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Business Expenses (EXP)</CardTitle>
                <CardDescription>Record business expenses and costs</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !voucherDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {voucherDate ? format(voucherDate, "PPP") : <span>Pick a date</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={voucherDate}
                            onSelect={(date) => date && setVoucherDate(date)}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>Expense Category</Label>
                      <Input
                        placeholder="e.g., Rent, Utilities, Travel"
                        value={description}
                        onChange={(e) => {
                          setDescription(e.target.value);
                          setReferenceType("expense");
                          setVoucherType("expense");
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Amount</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Enter amount"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full md:w-auto">
                    <Plus className="mr-2 h-4 w-4" />
                    Record Expense
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Expenses</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Voucher No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vouchers
                      ?.filter((v) => v.reference_type === "expense")
                      .slice(0, 10)
                      .map((voucher) => (
                        <TableRow key={voucher.id}>
                          <TableCell className="font-medium">{voucher.voucher_number}</TableCell>
                          <TableCell>{format(new Date(voucher.voucher_date), "dd/MM/yyyy")}</TableCell>
                          <TableCell className="max-w-xs truncate">{voucher.description}</TableCell>
                          <TableCell>₹{voucher.total_amount.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Voucher Entry Tab */}
          <TabsContent value="voucher-entry" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>All Voucher Entries</CardTitle>
                <CardDescription>View all accounting vouchers</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Voucher No</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vouchers?.map((voucher) => (
                      <TableRow key={voucher.id}>
                        <TableCell className="font-medium">{voucher.voucher_number}</TableCell>
                        <TableCell className="uppercase">{voucher.voucher_type}</TableCell>
                        <TableCell>{format(new Date(voucher.voucher_date), "dd/MM/yyyy")}</TableCell>
                        <TableCell className="capitalize">{voucher.reference_type || "-"}</TableCell>
                        <TableCell>₹{voucher.total_amount.toFixed(2)}</TableCell>
                        <TableCell className="max-w-xs truncate">{voucher.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* P&L Report Tab */}
          <TabsContent value="pl-report" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Profit & Loss Report</CardTitle>
                <CardDescription>View income and expenses summary</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-center text-muted-foreground">
                    P&L Report will be calculated based on sales revenue and expenses
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Balance Sheet Tab */}
          <TabsContent value="balance-sheet" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Balance Sheet</CardTitle>
                <CardDescription>View assets, liabilities and equity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-center text-muted-foreground">
                    Balance Sheet will show current financial position
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
