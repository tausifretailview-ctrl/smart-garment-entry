import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CalendarIcon,
  FileSpreadsheet,
  Printer,
  TrendingDown,
  Wallet,
  IndianRupee,
  Layers,
  Loader2,
} from "lucide-react";
import { AccountsHistoryPanel } from "@/components/accounts/AccountsHistoryPanel";
import {
  accountsHistoryTableClass,
  accountsHistoryThClass,
} from "@/components/accounts/accountsHistoryUi";
import { CardDescription } from "@/components/ui/card";
import {
  fetchExpenseSalaryReportRows,
  type ExpenseSalaryReportRow,
} from "@/utils/expenseSalaryReportData";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths, eachDayOfInterval } from "date-fns";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { useReactToPrint } from "react-to-print";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { toast } from "sonner";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(n || 0);

const CHART_PALETTE = [
  "#3b82f6",
  "#10b981",
  "#a855f7",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#06b6d4",
  "#eab308",
  "#14b8a6",
  "#f97316",
];

const PAGE_SIZE = 50;

type DatePreset = "today" | "this_week" | "this_month" | "last_month" | "custom";
type EntryTypeFilter = "all" | "expense" | "salary";
type SortDirection = "asc" | "desc";

type ReportRow = ExpenseSalaryReportRow;

const getPresetRange = (preset: DatePreset) => {
  const today = new Date();
  if (preset === "today") return { from: today, to: today };
  if (preset === "this_week") return { from: startOfWeek(today, { weekStartsOn: 1 }), to: endOfWeek(today, { weekStartsOn: 1 }) };
  if (preset === "last_month") {
    const d = subMonths(today, 1);
    return { from: startOfMonth(d), to: endOfMonth(d) };
  }
  // default this_month
  return { from: startOfMonth(today), to: today };
};

export default function ExpenseSalaryReport() {
  const { currentOrganization } = useOrganization();
  const printRef = useRef<HTMLDivElement>(null);

  const [preset, setPreset] = useState<DatePreset>("this_month");
  const initialRange = useMemo(() => getPresetRange("this_month"), []);
  const [customFrom, setCustomFrom] = useState<Date | undefined>(initialRange.from);
  const [customTo, setCustomTo] = useState<Date | undefined>(initialRange.to);

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<EntryTypeFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const activeRange = useMemo(() => {
    if (preset === "custom") {
      return {
        from: customFrom || initialRange.from,
        to: customTo || customFrom || initialRange.to,
      };
    }
    return getPresetRange(preset);
  }, [preset, customFrom, customTo, initialRange]);

  const fromDateStr = format(activeRange.from, "yyyy-MM-dd");
  const toDateStr = format(activeRange.to, "yyyy-MM-dd");

  const handlePresetChange = (value: DatePreset) => {
    setPreset(value);
    setCurrentPage(1);
    if (value !== "custom") {
      const next = getPresetRange(value);
      setCustomFrom(next.from);
      setCustomTo(next.to);
    }
  };

  const { data: reportRows = [], isLoading } = useQuery({
    queryKey: ["expense-salary-report", currentOrganization?.id, fromDateStr, toDateStr],
    enabled: !!currentOrganization?.id,
    queryFn: () =>
      fetchExpenseSalaryReportRows(currentOrganization!.id, fromDateStr, toDateStr, supabase),
  });

  const { data: pnlExpenseTotal } = useQuery({
    queryKey: ["expense-salary-pnl-check", currentOrganization?.id, fromDateStr, toDateStr],
    enabled: !!currentOrganization?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_expense_by_category", {
        p_org_id: currentOrganization!.id,
        p_from_date: fromDateStr,
        p_to_date: toDateStr,
      });
      if (error) throw error;
      return ((data as Array<{ amount?: number }>) || []).reduce(
        (sum, row) => sum + Number(row.amount || 0),
        0,
      );
    },
    staleTime: 60_000,
  });

  const categories = useMemo(() => {
    const set = new Set(
      reportRows
        .filter((r) => r.type === "Expense")
        .map((r) => r.categoryOrEmployee)
    );
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [reportRows]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const rows = reportRows.filter((row) => {
      if (typeFilter === "expense" && row.type !== "Expense") return false;
      if (typeFilter === "salary" && row.type !== "Salary") return false;
      if (categoryFilter !== "all" && row.type === "Expense" && row.categoryOrEmployee !== categoryFilter) return false;
      if (paymentMethodFilter !== "all" && row.paymentMethod !== paymentMethodFilter) return false;
      if (!q) return true;
      return (
        row.description.toLowerCase().includes(q) ||
        row.categoryOrEmployee.toLowerCase().includes(q) ||
        row.voucherNumber.toLowerCase().includes(q)
      );
    });

    rows.sort((a, b) => {
      const left = new Date(a.date).getTime();
      const right = new Date(b.date).getTime();
      return sortDirection === "asc" ? left - right : right - left;
    });

    return rows;
  }, [reportRows, typeFilter, categoryFilter, paymentMethodFilter, searchQuery, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, currentPage]);

  const kpis = useMemo(() => {
    const expenses = filteredRows.filter((r) => r.type === "Expense");
    const salary = filteredRows.filter((r) => r.type === "Salary");

    const totalExpenses = expenses.reduce((sum, r) => sum + r.amount, 0);
    const totalSalary = salary.reduce((sum, r) => sum + r.amount, 0);
    const combined = totalExpenses + totalSalary;

    const byCategory = new Map<string, number>();
    expenses.forEach((r) => {
      byCategory.set(r.categoryOrEmployee, (byCategory.get(r.categoryOrEmployee) || 0) + r.amount);
    });

    let topCategory = "N/A";
    let topCategoryAmount = 0;
    byCategory.forEach((amt, key) => {
      if (amt > topCategoryAmount) {
        topCategoryAmount = amt;
        topCategory = key;
      }
    });

    return { totalExpenses, totalSalary, combined, topCategory, topCategoryAmount };
  }, [filteredRows]);

  const expensePieData = useMemo(() => {
    const byCategory = new Map<string, number>();
    filteredRows
      .filter((r) => r.type === "Expense")
      .forEach((r) => byCategory.set(r.categoryOrEmployee, (byCategory.get(r.categoryOrEmployee) || 0) + r.amount));

    return Array.from(byCategory.entries()).map(([name, value], idx) => ({
      name,
      value,
      color: CHART_PALETTE[idx % CHART_PALETTE.length],
    }));
  }, [filteredRows]);

  const dailyTrendData = useMemo(() => {
    const days = eachDayOfInterval({ start: activeRange.from, end: activeRange.to });
    const byDay = new Map<string, { expense: number; salary: number }>();
    days.forEach((day) => byDay.set(format(day, "yyyy-MM-dd"), { expense: 0, salary: 0 }));

    filteredRows.forEach((row) => {
      const key = row.date;
      const current = byDay.get(key) || { expense: 0, salary: 0 };
      if (row.type === "Expense") current.expense += row.amount;
      else current.salary += row.amount;
      byDay.set(key, current);
    });

    return Array.from(byDay.entries()).map(([date, vals]) => ({
      date,
      label: format(new Date(date), "dd MMM"),
      Expense: vals.expense,
      Salary: vals.salary,
    }));
  }, [filteredRows, activeRange]);

  const visibleTotal = useMemo(
    () => paginatedRows.reduce((sum, row) => sum + row.amount, 0),
    [paginatedRows]
  );

  const filteredTotal = useMemo(
    () => filteredRows.reduce((sum, row) => sum + row.amount, 0),
    [filteredRows]
  );

  const resetFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setPaymentMethodFilter("all");
    setTypeFilter("all");
    setCurrentPage(1);
  };

  const handleExportExcel = () => {
    const rows = filteredRows.map((r) => ({
      Date: format(new Date(r.date), "dd/MM/yyyy"),
      Type: r.type,
      "Category / Employee": r.categoryOrEmployee,
      Description: r.description,
      "Payment Method": r.paymentMethod,
      Amount: r.amount,
      "Voucher #": r.voucherNumber,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ExpenseSalaryReport");
    XLSX.writeFile(wb, `Expense_Salary_Report_${fromDateStr}_to_${toDateStr}.xlsx`);
  };

  const handlePrint = useReactToPrint({ contentRef: printRef });

  const reportExpenseTotal = useMemo(
    () => reportRows.filter((r) => r.type === "Expense").reduce((s, r) => s + r.amount, 0),
    [reportRows],
  );
  const pnlExpenseAligned =
    pnlExpenseTotal == null || Math.abs(reportExpenseTotal - pnlExpenseTotal) <= 0.01;

  return (
    <div className="min-h-screen bg-slate-50 px-2 sm:px-3 md:px-4 lg:px-5 py-4 pb-24 lg:pb-6 print:bg-white print:p-0">
      <div ref={printRef} className="space-y-4 print:space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap print:hidden">
        <div className="space-y-1">
          <BackToDashboard />
          <div className="pt-2">
            <h1 className="text-3xl font-extrabold text-blue-600 tracking-tight leading-tight">
              Expense &amp; Salary Report
            </h1>
            <p className="text-slate-400 text-base mt-0.5">
              {format(activeRange.from, "dd MMM yyyy")} – {format(activeRange.to, "dd MMM yyyy")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={preset} onValueChange={(v: DatePreset) => handlePresetChange(v)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="custom">Custom...</SelectItem>
            </SelectContent>
          </Select>
          {preset === "custom" && (
            <>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[150px] justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customFrom ? format(customFrom, "dd MMM yyyy") : "From"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar mode="single" selected={customFrom} onSelect={(d) => d && setCustomFrom(d)} initialFocus />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[150px] justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customTo ? format(customTo, "dd MMM yyyy") : "To"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar mode="single" selected={customTo} onSelect={(d) => d && setCustomTo(d)} initialFocus />
                </PopoverContent>
              </Popover>
            </>
          )}
          <Button variant="outline" onClick={handleExportExcel}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Export to Excel
          </Button>
          <Button variant="outline" onClick={() => handlePrint()}>
            <Printer className="mr-2 h-4 w-4" />
            Print Report
          </Button>
        </div>
      </div>

        <div className="hidden print:block text-center border-b pb-3">
          <h2 className="text-lg font-bold">Expense &amp; Salary Report</h2>
          <p className="text-sm">
            {format(activeRange.from, "dd MMM yyyy")} - {format(activeRange.to, "dd MMM yyyy")}
          </p>
        </div>

        {!pnlExpenseAligned && !isLoading && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 print:hidden">
            Expense total on this report ({fmt(reportExpenseTotal)}) differs from P&amp;L expense RPC (
            {fmt(pnlExpenseTotal ?? 0)}). Refresh the page; if it persists, check for deleted vouchers in range.
          </p>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 print:hidden">
          <Card className="border-0 shadow-md rounded-xl bg-gradient-to-br from-rose-500 to-rose-600">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-2 px-2.5">
              <CardDescription className="text-xs font-medium text-white/80">Total Expenses</CardDescription>
              <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
                <TrendingDown className="h-3.5 w-3.5 text-white" />
              </div>
            </CardHeader>
            <CardContent className="px-2.5 pb-2 pt-0">
              <div className="text-lg xl:text-xl font-black text-white tabular-nums">{fmt(kpis.totalExpenses)}</div>
              <p className="text-xs text-white/65">voucher_type = expense</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-2 px-2.5">
              <CardDescription className="text-xs font-medium text-white/80">Total Salary Paid</CardDescription>
              <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
                <Wallet className="h-3.5 w-3.5 text-white" />
              </div>
            </CardHeader>
            <CardContent className="px-2.5 pb-2 pt-0">
              <div className="text-lg xl:text-xl font-black text-white tabular-nums">{fmt(kpis.totalSalary)}</div>
              <p className="text-xs text-white/65">Employee salary vouchers</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-2 px-2.5">
              <CardDescription className="text-xs font-medium text-white/80">Combined Total</CardDescription>
              <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
                <Layers className="h-3.5 w-3.5 text-white" />
              </div>
            </CardHeader>
            <CardContent className="px-2.5 pb-2 pt-0">
              <div className="text-lg xl:text-xl font-black text-white tabular-nums">{fmt(kpis.combined)}</div>
              <p className="text-xs text-white/65">Matches P&amp;L outflows</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md rounded-xl bg-gradient-to-br from-amber-500 to-amber-600">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-2 px-2.5">
              <CardDescription className="text-xs font-medium text-white/80">Top Category</CardDescription>
              <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
                <IndianRupee className="h-3.5 w-3.5 text-white" />
              </div>
            </CardHeader>
            <CardContent className="px-2.5 pb-2 pt-0">
              <div className="text-sm font-bold text-white truncate">{kpis.topCategory}</div>
              <div className="text-lg xl:text-xl font-black text-white tabular-nums">{fmt(kpis.topCategoryAmount)}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 print:hidden">
          <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <CardHeader><CardTitle className="text-base">Expenses by Category</CardTitle></CardHeader>
            <CardContent className="h-[300px]">
              {expensePieData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No expense categories in range</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expensePieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={92}
                      onClick={(entry: any) => {
                        if (!entry?.name) return;
                        setCategoryFilter(entry.name);
                        setCurrentPage(1);
                        toast.info(`Filtered category: ${entry.name}`);
                      }}
                    >
                      {expensePieData.map((item) => (
                        <Cell key={item.name} fill={item.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(value: number, name: string) => [fmt(Number(value || 0)), name]} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <CardHeader><CardTitle className="text-base">Daily Expense Trend</CardTitle></CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                  <RechartsTooltip formatter={(value: number, name: string) => [fmt(Number(value || 0)), name]} />
                  <Legend />
                  <Bar dataKey="Expense" fill="#ef4444" />
                  <Bar dataKey="Salary" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <AccountsHistoryPanel
          className="print:border print:shadow-none"
          title="Transactions"
          toolbar={
            <span className="text-xs text-muted-foreground tabular-nums">
              {filteredRows.length} rows · Page {currentPage} of {totalPages}
            </span>
          }
          searchPlaceholder="Search description, narration, employee…"
          searchValue={searchQuery}
          onSearchChange={(v) => {
            setSearchQuery(v);
            setCurrentPage(1);
          }}
          filters={
            <>
              <Select value={categoryFilter} onValueChange={(value) => { setCategoryFilter(value); setCurrentPage(1); }}>
                <SelectTrigger className="w-[140px] h-9 text-sm border-slate-200 bg-slate-50">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c === "all" ? "All Categories" : c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={paymentMethodFilter} onValueChange={(value) => { setPaymentMethodFilter(value); setCurrentPage(1); }}>
                <SelectTrigger className="w-[130px] h-9 text-sm border-slate-200 bg-slate-50">
                  <SelectValue placeholder="Method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="Card">Card</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
              <Tabs value={typeFilter} onValueChange={(v) => { setTypeFilter(v as EntryTypeFilter); setCurrentPage(1); }}>
                <TabsList className="h-9">
                  <TabsTrigger value="all" className="text-xs px-2">All</TabsTrigger>
                  <TabsTrigger value="expense" className="text-xs px-2">Exp</TabsTrigger>
                  <TabsTrigger value="salary" className="text-xs px-2">Sal</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button variant="outline" size="sm" className="h-9" onClick={resetFilters}>
                Reset
              </Button>
              <Button variant="outline" size="sm" className="h-9 gap-1" onClick={handleExportExcel}>
                <FileSpreadsheet className="h-3.5 w-3.5" />
                CSV
              </Button>
            </>
          }
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2 w-full">
              <span>
                Filtered total: <strong className="tabular-nums">{fmt(filteredTotal)}</strong>
                {filteredRows.length !== reportRows.length && (
                  <span className="text-muted-foreground"> (of {reportRows.length} in period)</span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>
                  Next
                </Button>
              </div>
            </div>
          }
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              Loading transactions…
            </div>
          ) : (
            <Table className={accountsHistoryTableClass}>
              <TableHeader>
                <TableRow className="bg-slate-900 hover:bg-slate-900">
                  <TableHead className={cn(accountsHistoryThClass, "text-white bg-slate-900")}>
                    <button
                      type="button"
                      className="text-white hover:underline"
                      onClick={() => setSortDirection((p) => (p === "asc" ? "desc" : "asc"))}
                    >
                      Date {sortDirection === "asc" ? "↑" : "↓"}
                    </button>
                  </TableHead>
                  <TableHead className={cn(accountsHistoryThClass, "text-white bg-slate-900")}>Type</TableHead>
                  <TableHead className={cn(accountsHistoryThClass, "text-white bg-slate-900")}>Category / Employee</TableHead>
                  <TableHead className={cn(accountsHistoryThClass, "text-white bg-slate-900")}>Description</TableHead>
                  <TableHead className={cn(accountsHistoryThClass, "text-white bg-slate-900")}>Method</TableHead>
                  <TableHead className={cn(accountsHistoryThClass, "text-white bg-slate-900 text-right")}>Amount</TableHead>
                  <TableHead className={cn(accountsHistoryThClass, "text-white bg-slate-900")}>Voucher #</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                      No transactions in this period or filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedRows.map((row) => (
                    <TableRow key={row.id} className="hover:bg-slate-50/80">
                      <TableCell>{format(new Date(row.date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded-full font-medium",
                            row.type === "Salary" ? "bg-blue-100 text-blue-700" : "bg-rose-100 text-rose-700",
                          )}
                        >
                          {row.type}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">{row.categoryOrEmployee}</TableCell>
                      <TableCell className="max-w-[280px] truncate" title={row.description}>
                        {row.description || "—"}
                      </TableCell>
                      <TableCell>{row.paymentMethod}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{fmt(row.amount)}</TableCell>
                      <TableCell className="font-mono text-xs">{row.voucherNumber}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {paginatedRows.length > 0 && (
                <TableFooter>
                  <TableRow className="bg-slate-50">
                    <TableCell colSpan={5} className="text-right font-semibold">
                      Page subtotal ({paginatedRows.length} rows)
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{fmt(visibleTotal)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          )}
        </AccountsHistoryPanel>
      </div>
    </div>
  );
}

