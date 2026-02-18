import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Clock, AlertTriangle, AlertCircle, XCircle, 
  Search, Download, TrendingUp, Users, IndianRupee,
  ArrowUpDown, ArrowDown, ArrowUp, Phone, FileDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInDays } from "date-fns";
import { fetchAllCustomers, fetchAllSalesSummary } from "@/utils/fetchAllRows";
import * as XLSX from "xlsx";
import { toast } from "sonner";

interface OutstandingDashboardTabProps {
  organizationId: string;
}

interface AgingBucket {
  label: string;
  range: string;
  count: number;
  amount: number;
  icon: React.ReactNode;
  colorClass: string;
  bgClass: string;
}

interface CustomerOutstanding {
  id: string;
  name: string;
  phone: string | null;
  totalOutstanding: number;
  invoiceCount: number;
  oldestDays: number;
  aging: { current: number; d30: number; d60: number; d90: number; d90plus: number };
}

type SortField = "name" | "totalOutstanding" | "invoiceCount" | "oldestDays";
type SortDir = "asc" | "desc";

export function OutstandingDashboardTab({ organizationId }: OutstandingDashboardTabProps) {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("totalOutstanding");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [minAmount, setMinAmount] = useState<string>("all");

  // Fetch all outstanding invoices (pending + partial)
  const { data: outstandingData, isLoading } = useQuery({
    queryKey: ["outstanding-dashboard", organizationId],
    queryFn: async () => {
      const [customersData, salesData] = await Promise.all([
        fetchAllCustomers(organizationId),
        fetchAllSalesSummary(organizationId),
      ]);

      // Fetch voucher payments for accurate outstanding calc
      const { data: allVouchers } = await supabase
        .from("voucher_entries")
        .select("reference_id, reference_type, total_amount")
        .eq("organization_id", organizationId)
        .eq("voucher_type", "receipt")
        .is("deleted_at", null);

      // Build voucher payment map (sale_id -> total paid via vouchers)
      const invoiceVoucherPayments = new Map<string, number>();
      const openingBalancePayments = new Map<string, number>();
      const saleToCustomerMap = new Map<string, string>();

      salesData.forEach((s: any) => {
        if (s.customer_id) saleToCustomerMap.set(s.id, s.customer_id);
      });

      allVouchers?.forEach((v: any) => {
        if (!v.reference_id) return;
        const customerId = saleToCustomerMap.get(v.reference_id);
        if (v.reference_type === "sale" || customerId) {
          invoiceVoucherPayments.set(
            v.reference_id,
            (invoiceVoucherPayments.get(v.reference_id) || 0) + (Number(v.total_amount) || 0)
          );
        } else if (v.reference_type === "customer") {
          openingBalancePayments.set(
            v.reference_id,
            (openingBalancePayments.get(v.reference_id) || 0) + (Number(v.total_amount) || 0)
          );
        }
      });

      const customerMap = new Map<string, any>();
      customersData.forEach((c: any) => customerMap.set(c.id, c));

      const today = new Date();

      // Build per-customer outstanding data
      const customerOutstandings = new Map<string, CustomerOutstanding>();

      // Process invoices
      salesData.forEach((sale: any) => {
        if (!sale.customer_id) return;
        const netAmount = sale.net_amount || 0;
        const salePaid = sale.paid_amount || 0;
        const voucherPaid = invoiceVoucherPayments.get(sale.id) || 0;
        const effectivePaid = Math.max(salePaid, voucherPaid);
        const outstanding = Math.max(0, netAmount - effectivePaid);

        if (outstanding <= 0) return;

        const daysOld = differenceInDays(today, new Date(sale.sale_date));
        const customer = customerMap.get(sale.customer_id);
        if (!customer) return;

        let entry = customerOutstandings.get(sale.customer_id);
        if (!entry) {
          entry = {
            id: sale.customer_id,
            name: customer.customer_name,
            phone: customer.phone,
            totalOutstanding: 0,
            invoiceCount: 0,
            oldestDays: 0,
            aging: { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 },
          };
          customerOutstandings.set(sale.customer_id, entry);
        }

        entry.totalOutstanding += outstanding;
        entry.invoiceCount += 1;
        entry.oldestDays = Math.max(entry.oldestDays, daysOld);

        if (daysOld <= 7) entry.aging.current += outstanding;
        else if (daysOld <= 30) entry.aging.d30 += outstanding;
        else if (daysOld <= 60) entry.aging.d60 += outstanding;
        else if (daysOld <= 90) entry.aging.d90 += outstanding;
        else entry.aging.d90plus += outstanding;
      });

      // Add opening balances as 90+ day outstanding
      customersData.forEach((c: any) => {
        const ob = c.opening_balance || 0;
        const obPaid = openingBalancePayments.get(c.id) || 0;
        const obOutstanding = Math.max(0, ob - obPaid);
        if (obOutstanding <= 0) return;

        let entry = customerOutstandings.get(c.id);
        if (!entry) {
          entry = {
            id: c.id,
            name: c.customer_name,
            phone: c.phone,
            totalOutstanding: 0,
            invoiceCount: 0,
            oldestDays: 999,
            aging: { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 },
          };
          customerOutstandings.set(c.id, entry);
        }
        entry.totalOutstanding += obOutstanding;
        entry.aging.d90plus += obOutstanding;
        entry.oldestDays = Math.max(entry.oldestDays, 365);
      });

      return Array.from(customerOutstandings.values());
    },
    enabled: !!organizationId,
    staleTime: 60000,
  });

  const customers = outstandingData || [];

  // Compute aging buckets
  const agingBuckets: AgingBucket[] = useMemo(() => {
    const totals = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
    const counts = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
    customers.forEach((c) => {
      if (c.aging.current > 0) { totals.current += c.aging.current; counts.current++; }
      if (c.aging.d30 > 0) { totals.d30 += c.aging.d30; counts.d30++; }
      if (c.aging.d60 > 0) { totals.d60 += c.aging.d60; counts.d60++; }
      if (c.aging.d90 > 0) { totals.d90 += c.aging.d90; counts.d90++; }
      if (c.aging.d90plus > 0) { totals.d90plus += c.aging.d90plus; counts.d90plus++; }
    });
    return [
      { label: "Current", range: "0–7 days", count: counts.current, amount: totals.current, icon: <Clock className="h-5 w-5" />, colorClass: "text-success", bgClass: "bg-success/10 border-success/20" },
      { label: "30 Days", range: "8–30 days", count: counts.d30, amount: totals.d30, icon: <TrendingUp className="h-5 w-5" />, colorClass: "text-info", bgClass: "bg-info/10 border-info/20" },
      { label: "60 Days", range: "31–60 days", count: counts.d60, amount: totals.d60, icon: <AlertTriangle className="h-5 w-5" />, colorClass: "text-warning", bgClass: "bg-warning/10 border-warning/20" },
      { label: "90 Days", range: "61–90 days", count: counts.d90, amount: totals.d90, icon: <AlertCircle className="h-5 w-5" />, colorClass: "text-destructive/80", bgClass: "bg-destructive/5 border-destructive/20" },
      { label: "90+ Days", range: "> 90 days", count: counts.d90plus, amount: totals.d90plus, icon: <XCircle className="h-5 w-5" />, colorClass: "text-destructive", bgClass: "bg-destructive/10 border-destructive/30" },
    ];
  }, [customers]);

  const totalOutstanding = customers.reduce((sum, c) => sum + c.totalOutstanding, 0);
  const totalCustomers = customers.length;
  const totalInvoices = customers.reduce((sum, c) => sum + c.invoiceCount, 0);

  // Filter & sort
  const filteredCustomers = useMemo(() => {
    let list = [...customers];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.phone?.includes(q));
    }
    if (minAmount !== "all") {
      const min = parseInt(minAmount);
      list = list.filter((c) => c.totalOutstanding >= min);
    }
    list.sort((a, b) => {
      const aVal = a[sortField] ?? "";
      const bVal = b[sortField] ?? "";
      if (typeof aVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return list;
  }, [customers, search, sortField, sortDir, minAmount]);

  const topDefaulters = useMemo(() => {
    return [...customers].sort((a, b) => b.totalOutstanding - a.totalOutstanding).slice(0, 10);
  }, [customers]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const handleExport = () => {
    const rows = filteredCustomers.map((c) => ({
      "Customer Name": c.name,
      "Phone": c.phone || "-",
      "Total Outstanding": Math.round(c.totalOutstanding),
      "Invoice Count": c.invoiceCount,
      "Oldest Days": c.oldestDays,
      "Current (0-7d)": Math.round(c.aging.current),
      "8-30 Days": Math.round(c.aging.d30),
      "31-60 Days": Math.round(c.aging.d60),
      "61-90 Days": Math.round(c.aging.d90),
      "90+ Days": Math.round(c.aging.d90plus),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Outstanding");
    XLSX.writeFile(wb, `Outstanding_Report_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
    toast.success("Outstanding report exported");
  };

  const getAgingBadge = (days: number) => {
    if (days <= 7) return <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-xs">Current</Badge>;
    if (days <= 30) return <Badge variant="outline" className="bg-info/10 text-info border-info/30 text-xs">30d</Badge>;
    if (days <= 60) return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-xs">60d</Badge>;
    if (days <= 90) return <Badge variant="outline" className="bg-destructive/10 text-destructive/80 border-destructive/30 text-xs">90d</Badge>;
    return <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/40 text-xs font-semibold">90d+</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading outstanding data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-destructive">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <IndianRupee className="h-4 w-4" /> Total Outstanding
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">
              ₹{Math.round(totalOutstanding).toLocaleString("en-IN")}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{totalInvoices} unpaid invoices</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-warning">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" /> Customers with Dues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">{totalCustomers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Avg ₹{totalCustomers > 0 ? Math.round(totalOutstanding / totalCustomers).toLocaleString("en-IN") : 0} per customer
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Overdue (&gt;30 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums text-destructive">
              ₹{Math.round(
                agingBuckets.slice(2).reduce((s, b) => s + b.amount, 0)
              ).toLocaleString("en-IN")}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {agingBuckets.slice(2).reduce((s, b) => s + b.count, 0)} customers overdue
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Aging Buckets */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Aging Analysis</CardTitle>
          <CardDescription>Outstanding amounts grouped by invoice age</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {agingBuckets.map((bucket) => (
              <div
                key={bucket.label}
                className={cn(
                  "rounded-lg border p-4 transition-all",
                  bucket.bgClass
                )}
              >
                <div className={cn("flex items-center gap-2 mb-2", bucket.colorClass)}>
                  {bucket.icon}
                  <span className="text-sm font-medium">{bucket.label}</span>
                </div>
                <div className={cn("text-xl font-bold tabular-nums", bucket.colorClass)}>
                  ₹{Math.round(bucket.amount).toLocaleString("en-IN")}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {bucket.count} customers · {bucket.range}
                </div>
                {totalOutstanding > 0 && (
                  <Progress
                    value={(bucket.amount / totalOutstanding) * 100}
                    className="mt-2 h-1.5"
                  />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Defaulters */}
      {topDefaulters.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" /> Top 10 Defaulters
            </CardTitle>
            <CardDescription>Customers with highest outstanding balances</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topDefaulters.map((c, idx) => {
                const pct = totalOutstanding > 0 ? (c.totalOutstanding / totalOutstanding) * 100 : 0;
                return (
                  <div key={c.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                    <span className="text-sm font-bold text-muted-foreground w-6 text-center">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{c.name}</span>
                        {getAgingBadge(c.oldestDays)}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <Progress value={pct} className="flex-1 h-1.5" />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold tabular-nums">
                        ₹{Math.round(c.totalOutstanding).toLocaleString("en-IN")}
                      </div>
                      <div className="text-xs text-muted-foreground">{c.invoiceCount} inv.</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full Customer Outstanding Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Customer-wise Outstanding</CardTitle>
              <CardDescription>Detailed breakdown with aging columns</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search customer..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-52"
                />
              </div>
              <Select value={minAmount} onValueChange={setMinAmount}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Min amount" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All amounts</SelectItem>
                  <SelectItem value="1000">≥ ₹1,000</SelectItem>
                  <SelectItem value="5000">≥ ₹5,000</SelectItem>
                  <SelectItem value="10000">≥ ₹10,000</SelectItem>
                  <SelectItem value="50000">≥ ₹50,000</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
                <FileDown className="h-4 w-4" /> Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("name")}>
                    <div className="flex items-center">Customer <SortIcon field="name" /></div>
                  </TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="cursor-pointer select-none text-right" onClick={() => handleSort("totalOutstanding")}>
                    <div className="flex items-center justify-end">Outstanding <SortIcon field="totalOutstanding" /></div>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none text-right" onClick={() => handleSort("invoiceCount")}>
                    <div className="flex items-center justify-end">Invoices <SortIcon field="invoiceCount" /></div>
                  </TableHead>
                  <TableHead className="text-right">0-7d</TableHead>
                  <TableHead className="text-right">8-30d</TableHead>
                  <TableHead className="text-right">31-60d</TableHead>
                  <TableHead className="text-right">61-90d</TableHead>
                  <TableHead className="text-right">90d+</TableHead>
                  <TableHead className="cursor-pointer select-none text-right" onClick={() => handleSort("oldestDays")}>
                    <div className="flex items-center justify-end">Oldest <SortIcon field="oldestDays" /></div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      {search ? "No customers match your search" : "No outstanding balances found"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCustomers.map((c) => (
                    <TableRow key={c.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium max-w-[200px] truncate">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {c.phone ? (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {c.phone}
                          </span>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        ₹{Math.round(c.totalOutstanding).toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{c.invoiceCount}</TableCell>
                      <TableCell className="text-right tabular-nums text-success">
                        {c.aging.current > 0 ? `₹${Math.round(c.aging.current).toLocaleString("en-IN")}` : "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-info">
                        {c.aging.d30 > 0 ? `₹${Math.round(c.aging.d30).toLocaleString("en-IN")}` : "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-warning">
                        {c.aging.d60 > 0 ? `₹${Math.round(c.aging.d60).toLocaleString("en-IN")}` : "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-destructive/80">
                        {c.aging.d90 > 0 ? `₹${Math.round(c.aging.d90).toLocaleString("en-IN")}` : "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-destructive font-semibold">
                        {c.aging.d90plus > 0 ? `₹${Math.round(c.aging.d90plus).toLocaleString("en-IN")}` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {getAgingBadge(c.oldestDays)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            Showing {filteredCustomers.length} of {customers.length} customers
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
