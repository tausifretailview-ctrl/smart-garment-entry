import { useState, useEffect, useMemo } from "react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { 
  Loader2, Download, Printer, TrendingUp, TrendingDown, Wallet, PieChart, 
  FileSpreadsheet, Scale, Calculator, AlertTriangle, Calendar, Building2, Clock, ExternalLink, RefreshCw, BookText, Landmark, BarChart3, Table2, Users, Wallet, Info
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import {
  calculateTrialBalance,
  calculateGlTrialBalance,
  calculateGlTrialBalanceForRange,
  calculateGlAccountLedger,
  GL_CUMULATIVE_FROM_DATE,
  fetchProfitAndLoss,
  fetchGlBalanceSheet as loadGlBalanceSheetReport,
  calculateProfitLoss,
  calculateBalanceSheet,
  calculateNetProfitSummary,
  getIndiaFinancialYear,
  getAllIndiaFYQuarters,
  TrialBalanceEntry,
  GlTrialBalanceEntry,
  GlProfitAndLossReport,
  GlBalanceSheetReport,
  GlAccountLedgerRow,
  ProfitLossData,
  BalanceSheetData,
  NetProfitSummary,
} from "@/utils/accountingReportUtils";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);
};

// Report Header Component
const ReportHeader = ({ 
  title, 
  subtitle, 
  organization, 
  generatedAt 
}: { 
  title: string; 
  subtitle: string; 
  organization?: { name: string }; 
  generatedAt?: string;
}) => (
  <div className="text-center mb-6 print:mb-4 border-b pb-4">
    <div className="flex items-center justify-center gap-2 mb-2">
      <Building2 className="h-8 w-8 text-primary print:text-black" />
    </div>
    <h1 className="text-2xl font-bold print:text-xl">{organization?.name || "Organization"}</h1>
    <h2 className="text-xl font-semibold text-primary print:text-black mt-1">{title}</h2>
    <p className="text-muted-foreground print:text-gray-600">{subtitle}</p>
    {generatedAt && (
      <p className="text-xs text-muted-foreground mt-2 flex items-center justify-center gap-1">
        <Clock className="h-3 w-3" />
        Generated: {generatedAt}
      </p>
    )}
  </div>
);

// Period Selector Component
const PeriodSelector = ({
  periodType,
  setPeriodType,
  fromDate,
  toDate,
  setFromDate,
  setToDate,
}: {
  periodType: "monthly" | "quarterly" | "yearly" | "custom";
  setPeriodType: (v: "monthly" | "quarterly" | "yearly" | "custom") => void;
  fromDate: string;
  toDate: string;
  setFromDate: (v: string) => void;
  setToDate: (v: string) => void;
}) => {
  const pills: Array<{ value: "monthly" | "quarterly" | "yearly" | "custom"; label: string }> = [
    { value: "monthly", label: "Monthly" },
    { value: "quarterly", label: "Quarterly" },
    { value: "yearly", label: "Yearly" },
    { value: "custom", label: "Custom" },
  ];

  const setThisMonth = () => { setFromDate(format(startOfMonth(new Date()), "yyyy-MM-dd")); setToDate(format(endOfMonth(new Date()), "yyyy-MM-dd")); };
  const setLastMonth = () => { const d = subMonths(new Date(), 1); setFromDate(format(startOfMonth(d), "yyyy-MM-dd")); setToDate(format(endOfMonth(d), "yyyy-MM-dd")); };

  // Generate month buttons for current FY
  const fy = getIndiaFinancialYear(0);
  const fyStartYear = new Date(fy.fromDate).getFullYear();
  const monthButtons = Array.from({ length: 12 }, (_, i) => {
    const monthIdx = (3 + i) % 12; // Start from April
    const year = monthIdx < 3 ? fyStartYear + 1 : fyStartYear;
    const d = new Date(year, monthIdx, 1);
    return {
      label: format(d, "MMM"),
      from: format(startOfMonth(d), "yyyy-MM-dd"),
      to: format(endOfMonth(d), "yyyy-MM-dd"),
    };
  });

  const quarters = getAllIndiaFYQuarters();
  const fyPresets = [0, -1, -2].map(offset => getIndiaFinancialYear(offset));

  const isActive = (f: string, t: string) => fromDate === f && toDate === t;

  return (
    <div className="space-y-2 print:hidden">
      {/* Pills */}
      <div className="flex gap-1.5 flex-wrap">
        {pills.map(p => (
          <Button
            key={p.value}
            variant={periodType === p.value ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setPeriodType(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* Contextual presets */}
      <div className="flex gap-2 flex-wrap">
        {periodType === "monthly" && (
          <>
            <Button variant={isActive(format(startOfMonth(new Date()), "yyyy-MM-dd"), format(endOfMonth(new Date()), "yyyy-MM-dd")) ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={setThisMonth}>This Month</Button>
            <Button variant={isActive(format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"), format(endOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd")) ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={setLastMonth}>Last Month</Button>
            <Separator orientation="vertical" className="h-7" />
            {monthButtons.map(m => (
              <Button key={m.from} variant={isActive(m.from, m.to) ? "default" : "outline"} size="sm" className="h-7 text-xs px-2" onClick={() => { setFromDate(m.from); setToDate(m.to); }}>
                {m.label}
              </Button>
            ))}
          </>
        )}
        {periodType === "quarterly" && quarters.map(q => (
          <Button key={q.label} variant={isActive(q.fromDate, q.toDate) ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => { setFromDate(q.fromDate); setToDate(q.toDate); }}>
            {q.isCurrent ? `● ${q.label}` : q.label}
          </Button>
        ))}
        {periodType === "yearly" && fyPresets.map(fy => (
          <Button key={fy.label} variant={isActive(fy.fromDate, fy.toDate) ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => { setFromDate(fy.fromDate); setToDate(fy.toDate); }}>
            {fy.label}
          </Button>
        ))}
        {periodType === "custom" && (
          <>
            <div className="flex items-center gap-2">
              <Label className="text-xs">From:</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36 h-7 text-xs" />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">To:</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36 h-7 text-xs" />
            </div>
          </>
        )}
      </div>

      {/* Period display */}
      <p className="text-xs text-muted-foreground">
        Period: {format(new Date(fromDate), "d MMM yyyy")} – {format(new Date(toDate), "d MMM yyyy")}
      </p>
    </div>
  );
};

// As-of date presets
const AsOfDatePresets = ({ asOfDate, setAsOfDate }: { asOfDate: string; setAsOfDate: (v: string) => void }) => {
  const fy = getIndiaFinancialYear(0);
  return (
    <div className="space-y-2 print:hidden">
      <div className="flex items-center gap-2">
        <Label className="text-xs whitespace-nowrap">As of Date:</Label>
        <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="w-40 h-8 text-xs" />
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAsOfDate(format(new Date(), "yyyy-MM-dd"))}>Today</Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAsOfDate(format(endOfMonth(new Date()), "yyyy-MM-dd"))}>End of This Month</Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAsOfDate(format(endOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"))}>End of Last Month</Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAsOfDate(fy.toDate)}>End of {fy.label}</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        As of: {format(new Date(asOfDate), "d MMM yyyy")}
      </p>
    </div>
  );
};

export default function AccountingReports() {
  const { currentOrganization } = useOrganization();
  const { orgNavigate, getOrgPath } = useOrgNavigation();
  const [activeTab, setActiveTab] = useState("trial-balance");
  const [loading, setLoading] = useState(false);
  const [periodType, setPeriodType] = useState<"monthly" | "quarterly" | "yearly" | "custom">("monthly");

  // Date filters
  const [asOfDate, setAsOfDate] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [fromDate, setFromDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));

  // Report data
  const [trialBalance, setTrialBalance] = useState<TrialBalanceEntry[]>([]);
  const [profitLoss, setProfitLoss] = useState<ProfitLossData | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetData | null>(null);
  const [netProfitSummary, setNetProfitSummary] = useState<NetProfitSummary | null>(null);
  const [glTrialBalance, setGlTrialBalance] = useState<GlTrialBalanceEntry[]>([]);
  const [glTrialMode, setGlTrialMode] = useState<"cumulative" | "period">("cumulative");
  const [glPnlReport, setGlPnlReport] = useState<GlProfitAndLossReport | null>(null);
  const [glBsReport, setGlBsReport] = useState<GlBalanceSheetReport | null>(null);
  const [glLedgerOpen, setGlLedgerOpen] = useState(false);
  const [glLedgerAccount, setGlLedgerAccount] = useState<GlTrialBalanceEntry | null>(null);
  const [glLedgerRows, setGlLedgerRows] = useState<GlAccountLedgerRow[]>([]);
  const [glLedgerLoading, setGlLedgerLoading] = useState(false);

  const fetchTrialBalance = async () => {
    if (!currentOrganization?.id) return;
    setLoading(true);
    try {
      const data = await calculateTrialBalance(currentOrganization.id, asOfDate);
      setTrialBalance(data);
    } catch (error) {
      toast.error("Failed to load Trial Balance");
      console.error(error);
    }
    setLoading(false);
  };

  const fetchProfitLoss = async () => {
    if (!currentOrganization?.id) return;
    setLoading(true);
    try {
      const data = await calculateProfitLoss(currentOrganization.id, fromDate, toDate);
      setProfitLoss(data);
    } catch (error) {
      toast.error("Failed to load Profit & Loss");
      console.error(error);
    }
    setLoading(false);
  };

  const fetchBalanceSheet = async () => {
    if (!currentOrganization?.id) return;
    setLoading(true);
    try {
      const data = await calculateBalanceSheet(currentOrganization.id, asOfDate);
      setBalanceSheet(data);
    } catch (error) {
      toast.error("Failed to load Balance Sheet");
      console.error(error);
    }
    setLoading(false);
  };

  const fetchNetProfitSummary = async () => {
    if (!currentOrganization?.id) return;
    setLoading(true);
    try {
      const data = await calculateNetProfitSummary(currentOrganization.id, fromDate, toDate);
      setNetProfitSummary(data);
    } catch (error) {
      toast.error("Failed to load Net Profit Summary");
      console.error(error);
    }
    setLoading(false);
  };

  const fetchGlTrialBalance = async () => {
    if (!currentOrganization?.id) return;
    setLoading(true);
    try {
      if (glTrialMode === "period") {
        if (fromDate > toDate) {
          toast.error("From date must be on or before To date.");
          setGlTrialBalance([]);
          setLoading(false);
          return;
        }
        const data = await calculateGlTrialBalanceForRange(currentOrganization.id, fromDate, toDate);
        setGlTrialBalance(data);
      } else {
        const data = await calculateGlTrialBalance(currentOrganization.id, asOfDate);
        setGlTrialBalance(data);
      }
    } catch (error) {
      toast.error("Failed to load GL trial balance");
      console.error(error);
    }
    setLoading(false);
  };

  const fetchGlPnl = async () => {
    if (!currentOrganization?.id) return;
    setLoading(true);
    try {
      if (fromDate > toDate) {
        toast.error("Invalid period.");
        setGlPnlReport(null);
        setLoading(false);
        return;
      }
      const data = await fetchProfitAndLoss(currentOrganization.id, fromDate, toDate, supabase);
      setGlPnlReport(data);
    } catch (error) {
      toast.error("Failed to load GL P&L");
      console.error(error);
      setGlPnlReport(null);
    }
    setLoading(false);
  };

  const fetchGlBalanceSheet = async () => {
    if (!currentOrganization?.id) return;
    setLoading(true);
    try {
      const data = await loadGlBalanceSheetReport(currentOrganization.id, asOfDate, supabase);
      setGlBsReport(data);
    } catch (error) {
      toast.error("Failed to load GL balance sheet");
      console.error(error);
      setGlBsReport(null);
    }
    setLoading(false);
  };

  // Auto-load reports when tab, dates, or org changes
  useEffect(() => {
    if (!currentOrganization?.id) return;
    if (activeTab === "trial-balance" || activeTab === "balance-sheet") {
      if (activeTab === "trial-balance") fetchTrialBalance();
      else fetchBalanceSheet();
    } else if (activeTab === "gl-trial-balance") {
      fetchGlTrialBalance();
    } else if (activeTab === "gl-profit-loss") {
      fetchGlPnl();
    } else if (activeTab === "gl-balance-sheet") {
      fetchGlBalanceSheet();
    } else {
      if (activeTab === "profit-loss") fetchProfitLoss();
      else if (activeTab === "net-profit") fetchNetProfitSummary();
    }
  }, [activeTab, currentOrganization?.id, fromDate, toDate, asOfDate, glTrialMode]);

  const glLedgerDateRange = useMemo(() => {
    if (!glLedgerAccount) return null;
    if (glTrialMode === "cumulative") {
      return { from: GL_CUMULATIVE_FROM_DATE, to: asOfDate };
    }
    return { from: fromDate, to: toDate };
  }, [glLedgerAccount, glTrialMode, asOfDate, fromDate, toDate]);

  useEffect(() => {
    if (!glLedgerOpen || !currentOrganization?.id || !glLedgerAccount || !glLedgerDateRange) return;
    let cancelled = false;
    (async () => {
      setGlLedgerLoading(true);
      setGlLedgerRows([]);
      try {
        const rows = await calculateGlAccountLedger(
          currentOrganization.id,
          glLedgerAccount.accountId,
          glLedgerDateRange.from,
          glLedgerDateRange.to
        );
        if (!cancelled) setGlLedgerRows(rows);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setGlLedgerRows([]);
          toast.error("Could not load account ledger");
        }
      } finally {
        if (!cancelled) setGlLedgerLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [glLedgerOpen, currentOrganization?.id, glLedgerAccount?.accountId, glLedgerDateRange?.from, glLedgerDateRange?.to]);

  const handleRefresh = () => {
    if (activeTab === "trial-balance") fetchTrialBalance();
    else if (activeTab === "profit-loss") fetchProfitLoss();
    else if (activeTab === "balance-sheet") fetchBalanceSheet();
    else if (activeTab === "net-profit") fetchNetProfitSummary();
    else if (activeTab === "gl-trial-balance") fetchGlTrialBalance();
    else if (activeTab === "gl-profit-loss") fetchGlPnl();
    else if (activeTab === "gl-balance-sheet") fetchGlBalanceSheet();
  };

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    if (activeTab === "trial-balance" && trialBalance.length > 0) {
      const data = trialBalance.map((e) => ({
        "Account Name": e.accountName,
        "Account Type": e.accountType,
        "Debit (₹)": e.debit,
        "Credit (₹)": e.credit,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, "Trial Balance");
    } else if (activeTab === "profit-loss" && profitLoss) {
      const data = [
        { Particulars: "REVENUE", Amount: "" },
        { Particulars: "Gross Sales (Excl. GST)", Amount: profitLoss.grossSales },
        { Particulars: "Less: Sales Returns", Amount: -profitLoss.salesReturns },
        { Particulars: "NET SALES", Amount: profitLoss.netSales },
        { Particulars: "", Amount: "" },
        { Particulars: "COST OF GOODS SOLD", Amount: "" },
        { Particulars: "Opening Stock", Amount: profitLoss.openingStock },
        { Particulars: "Add: Purchases (Excl. GST)", Amount: profitLoss.purchases },
        { Particulars: "Less: Purchase Returns", Amount: -profitLoss.purchaseReturns },
        { Particulars: "Less: Closing Stock", Amount: -profitLoss.closingStock },
        { Particulars: "TOTAL COGS", Amount: profitLoss.cogs },
        { Particulars: "", Amount: "" },
        { Particulars: profitLoss.isGrossLoss ? "GROSS LOSS" : "GROSS PROFIT", Amount: Math.abs(profitLoss.grossProfit) },
        { Particulars: "", Amount: "" },
        { Particulars: "OPERATING EXPENSES", Amount: "" },
        ...profitLoss.expensesByCategory.map(e => ({ Particulars: `  ${e.category}`, Amount: e.amount })),
        { Particulars: "TOTAL EXPENSES", Amount: profitLoss.totalExpenses },
        { Particulars: "", Amount: "" },
        { Particulars: profitLoss.isNetLoss ? "NET LOSS" : "NET PROFIT", Amount: Math.abs(profitLoss.netProfit) },
        { Particulars: "Profit Margin %", Amount: `${profitLoss.profitMargin.toFixed(2)}%` },
      ];
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, "Profit & Loss");
    } else if (activeTab === "balance-sheet" && balanceSheet) {
      const data = [
        { Particulars: "ASSETS", Amount: "" },
        { Particulars: "Cash & Bank", Amount: balanceSheet.assets.cashBank },
        { Particulars: "Accounts Receivable", Amount: balanceSheet.assets.accountsReceivable },
        { Particulars: "Inventory", Amount: balanceSheet.assets.inventory },
        { Particulars: "Total Assets", Amount: balanceSheet.assets.totalAssets },
        { Particulars: "", Amount: "" },
        { Particulars: "LIABILITIES", Amount: "" },
        { Particulars: "Accounts Payable", Amount: balanceSheet.liabilities.accountsPayable },
        ...(balanceSheet.liabilities.gstPayable > 0 ? [{ Particulars: "GST Payable", Amount: balanceSheet.liabilities.gstPayable }] : []),
        { Particulars: "Total Liabilities", Amount: balanceSheet.liabilities.totalLiabilities },
        { Particulars: "", Amount: "" },
        { Particulars: "OWNER'S EQUITY", Amount: "" },
        { Particulars: "Closing Capital", Amount: balanceSheet.equity.closingCapital },
      ];
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, "Balance Sheet");
    } else if (activeTab === "gl-trial-balance" && glTrialBalance.length > 0) {
      const data = glTrialBalance.map((e) => ({
        Code: e.accountCode,
        "Account Name": e.accountName,
        Type: e.accountType,
        "Debit (₹)": e.debit,
        "Credit (₹)": e.credit,
        "Posted Dr": e.movementDebit,
        "Posted Cr": e.movementCredit,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, "GL Trial Balance");
    } else if (activeTab === "gl-profit-loss" && glPnlReport) {
      const rows: { Particulars: string; Amount: number | string }[] = [
        { Particulars: "REVENUE (GL)", Amount: "" },
        ...glPnlReport.revenueLines.map((l) => ({ Particulars: `${l.accountCode} ${l.accountName}`, Amount: l.amount })),
        { Particulars: "Total revenue", Amount: glPnlReport.totalRevenue },
        { Particulars: "", Amount: "" },
        { Particulars: "EXPENSES (GL)", Amount: "" },
        ...glPnlReport.expenseLines.map((l) => ({ Particulars: `${l.accountCode} ${l.accountName}`, Amount: l.amount })),
        { Particulars: "Total expenses", Amount: glPnlReport.totalExpenses },
        { Particulars: "", Amount: "" },
        { Particulars: glPnlReport.isNetLoss ? "NET LOSS" : "NET PROFIT", Amount: Math.abs(glPnlReport.netProfit) },
      ];
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "GL P&L");
    } else if (activeTab === "gl-balance-sheet" && glBsReport) {
      const eqRows = [
        ...glBsReport.equityLinesPosted.map((l) => ({
          Section: "",
          Particulars: `${l.accountCode} ${l.accountName}`,
          Amount: l.amount,
        })),
        {
          Section: "",
          Particulars: `${glBsReport.retainedEarningsLine.accountCode} ${glBsReport.retainedEarningsLine.accountName}`,
          Amount: glBsReport.retainedEarningsLine.amount,
        },
      ];
      const rows = [
        { Section: "ASSETS", Particulars: "", Amount: "" as number | string },
        ...glBsReport.assetLines.map((l) => ({ Section: "", Particulars: `${l.accountCode} ${l.accountName}`, Amount: l.amount })),
        { Section: "", Particulars: "Total assets", Amount: glBsReport.totalAssets },
        { Section: "LIABILITIES", Particulars: "", Amount: "" },
        ...glBsReport.liabilityLines.map((l) => ({ Section: "", Particulars: `${l.accountCode} ${l.accountName}`, Amount: l.amount })),
        { Section: "", Particulars: "Total liabilities", Amount: glBsReport.totalLiabilities },
        { Section: "EQUITY", Particulars: "", Amount: "" },
        ...eqRows,
        { Section: "", Particulars: "Total equity", Amount: glBsReport.totalEquity },
      ];
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "GL Balance Sheet");
    }

    if (!wb.SheetNames?.length) {
      toast.error("Nothing to export — load the report or add rows first.");
      return;
    }
    XLSX.writeFile(wb, `${activeTab}-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast.success("Report exported successfully");
  };

  const handlePrint = () => {
    window.print();
  };

  // Calculate totals for trial balance
  const tbTotals = trialBalance.reduce(
    (acc, e) => ({ debit: acc.debit + e.debit, credit: acc.credit + e.credit }),
    { debit: 0, credit: 0 }
  );

  const glTbTotals = glTrialBalance.reduce(
    (acc, e) => ({ debit: acc.debit + e.debit, credit: acc.credit + e.credit }),
    { debit: 0, credit: 0 }
  );

  const glCashBankRows = glTrialBalance.filter(
    (e) => e.accountCode >= "1000" && e.accountCode < "1100"
  );
  const glCashBankNet =
    glCashBankRows.reduce((s, e) => s + e.debit - e.credit, 0);

  const glTrialSubtitle =
    glTrialMode === "period"
      ? `Period: ${format(new Date(fromDate), "dd MMM yyyy")} – ${format(new Date(toDate), "dd MMM yyyy")}`
      : `Cumulative through ${format(new Date(asOfDate), "dd MMM yyyy")}`;

  const journalVouchersHref = `${getOrgPath("/journal-vouchers")}?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`;

  return (
    <div className="space-y-6 p-6 print:p-0">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calculator className="h-6 w-6 text-primary" />
            Accounting Reports
          </h1>
          <p className="text-muted-foreground max-w-2xl">
            P&L, balance sheet, and trial balance from your live sales, purchases, stock, and vouchers (operational
            tabs). Chart-led views (GL tabs) use posted journals when the accounting engine is on—treat older periods as
            needing an audit before sign-off.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={loading} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" onClick={exportToExcel}>
            <Download className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
        </div>
      </div>

      <Alert className="print:hidden border-amber-200 bg-amber-50/80 dark:bg-amber-950/30 dark:border-amber-800">
        <Info className="h-4 w-4 text-amber-700 dark:text-amber-400" />
        <AlertTitle className="text-amber-900 dark:text-amber-100">Existing businesses — review before you rely on numbers</AlertTitle>
        <AlertDescription className="text-amber-900/90 dark:text-amber-100/90 text-sm space-y-2">
          <p>
            Your team can already use <strong className="font-medium">Trial Balance</strong>, <strong className="font-medium">P&L</strong>, and{" "}
            <strong className="font-medium">Balance Sheet</strong> on the operational tabs: they reflect data already captured in the app
            (invoices, bills, returns, expenses, etc.).
          </p>
          <p>
            <strong className="font-medium">GL</strong> tabs and <strong className="font-medium">Journal vouchers</strong> only include periods where
            double-entry journals were posted. If the accounting engine was off for part of your history, or vouchers were edited before journals
            existed, GL totals may not match operational totals until you reconcile or use a clear cut-over date.
          </p>
          <p className="font-medium text-foreground">Suggested audit for an existing organization</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Pick a reporting period and an &quot;as of&quot; date you care about (e.g. end of last month).</li>
            <li>Run operational Trial Balance and GL Trial for the same date; investigate any large differences via Journal vouchers.</li>
            <li>Spot-check high-value customers and cash using Customer account statement and Daily cash tally.</li>
            <li>Use Tally export for a parallel check or import if you already run Tally.</li>
          </ol>
          <p className="text-xs pt-1 opacity-90">
            Positioning: this product gives strong operational and GST reporting plus optional double-entry GL—it is not a replacement for every
            statutory or enterprise-ERP workflow without your own review (auditors, partners, or internal sign-off still apply).
          </p>
        </AlertDescription>
      </Alert>

      <Card className="print:hidden border-primary/20 bg-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Table2 className="h-5 w-5 text-primary" />
            Tally and reconcile your accounts
          </CardTitle>
          <CardDescription>
            Operational tabs (Trial Balance, P&L, Balance Sheet) summarise transactions and stock. GL tabs follow posted
            journals when the accounting engine is on. Use the links below with your reports to match Tally ledgers, the day
            book, and customer balances.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" asChild>
              <Link to={getOrgPath("/tally-export")} className="gap-1.5 inline-flex items-center">
                <FileSpreadsheet className="h-4 w-4" />
                Tally export (Excel)
              </Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link to={journalVouchersHref} className="gap-1.5 inline-flex items-center">
                <BookText className="h-4 w-4" />
                Journal vouchers
              </Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link to={getOrgPath("/chart-of-accounts")} className="gap-1.5 inline-flex items-center">
                <Landmark className="h-4 w-4" />
                Chart of accounts
              </Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link to={getOrgPath("/daily-tally")} className="gap-1.5 inline-flex items-center">
                <Wallet className="h-4 w-4" />
                Daily cash tally
              </Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link to={getOrgPath("/customer-account-statement")} className="gap-1.5 inline-flex items-center">
                <Users className="h-4 w-4" />
                Customer account statement
              </Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link to={getOrgPath("/gst-reports")} className="gap-1.5 inline-flex items-center">
                <Calculator className="h-4 w-4" />
                GST reports
              </Link>
            </Button>
          </div>
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1.5 max-w-3xl">
            <li>
              <span className="font-medium text-foreground">Tally export</span> builds ledger masters and voucher-style
              worksheets (sales, purchases, receipts, payments) for the period you choose there—ideal for import or manual
              posting in Tally.
            </li>
            <li>
              <span className="font-medium text-foreground">Journal vouchers</span> lists every auto-posted double entry;
              open an account from the GL Trial tab (Lines) to trace balances, then cross-check here for the same dates.
            </li>
            <li>
              <span className="font-medium text-foreground">Customer account statement</span> ties receivables to invoices
              and receipts—use it when operational AR does not match a debtor ledger in Tally.
            </li>
            <li>
              <span className="font-medium text-foreground">Daily cash tally</span> records physical cash vs expected drawer
              cash; pair it with the GL cash/bank bucket (codes 1000–1099) on the GL Trial tab.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex w-full flex-wrap gap-1 h-auto print:hidden justify-start">
          <TabsTrigger value="trial-balance" className="flex items-center gap-2 shrink-0">
            <Scale className="h-4 w-4" />
            Trial Balance
          </TabsTrigger>
          <TabsTrigger value="gl-trial-balance" className="flex items-center gap-2 shrink-0">
            <BookText className="h-4 w-4" />
            GL Trial
          </TabsTrigger>
          <TabsTrigger value="gl-profit-loss" className="flex items-center gap-2 shrink-0">
            <BarChart3 className="h-4 w-4" />
            GL P&L
          </TabsTrigger>
          <TabsTrigger value="gl-balance-sheet" className="flex items-center gap-2 shrink-0">
            <Landmark className="h-4 w-4" />
            GL Balance
          </TabsTrigger>
          <TabsTrigger value="profit-loss" className="flex items-center gap-2 shrink-0">
            <TrendingUp className="h-4 w-4" />
            Profit & Loss
          </TabsTrigger>
          <TabsTrigger value="balance-sheet" className="flex items-center gap-2 shrink-0">
            <FileSpreadsheet className="h-4 w-4" />
            Balance Sheet
          </TabsTrigger>
          <TabsTrigger value="net-profit" className="flex items-center gap-2 shrink-0">
            <PieChart className="h-4 w-4" />
            Net Profit
          </TabsTrigger>
        </TabsList>

        {/* Trial Balance */}
        <TabsContent value="trial-balance" className="space-y-4">
          <Card className="print:shadow-none print:border-0">
            <CardHeader className="print:pb-2">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2 print:hidden">
                  <Scale className="h-5 w-5" />
                  Trial Balance
                </CardTitle>
              </div>
              <AsOfDatePresets asOfDate={asOfDate} setAsOfDate={setAsOfDate} />
              <div className="hidden print:block">
                <ReportHeader 
                  title="Trial Balance" 
                  subtitle={`As of: ${format(new Date(asOfDate), "dd MMM yyyy")}`}
                  organization={currentOrganization || undefined}
                  generatedAt={format(new Date(), "dd MMM yyyy, hh:mm a")}
                />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Debit (₹)</TableHead>
                      <TableHead className="text-right">Credit (₹)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trialBalance.map((entry, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{entry.accountName}</TableCell>
                        <TableCell>{entry.accountType}</TableCell>
                        <TableCell className="text-right">
                          {entry.debit > 0 ? formatCurrency(entry.debit) : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.credit > 0 ? formatCurrency(entry.credit) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {trialBalance.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          No data available. Select a date to load the report.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                  {trialBalance.length > 0 && (
                    <TableFooter>
                      <TableRow className="font-bold bg-muted/50">
                        <TableCell colSpan={2}>Total</TableCell>
                        <TableCell className="text-right">{formatCurrency(tbTotals.debit)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(tbTotals.credit)}</TableCell>
                      </TableRow>
                      {Math.abs(tbTotals.debit - tbTotals.credit) > 0.01 && (
                        <>
                          <TableRow className="text-destructive">
                            <TableCell colSpan={4} className="text-center">
                              ⚠️ Trial Balance does not match. Difference: {formatCurrency(Math.abs(tbTotals.debit - tbTotals.credit))}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-xs text-muted-foreground">
                              Note: Trial balance differences may indicate unrecorded transactions.
                            </TableCell>
                          </TableRow>
                        </>
                      )}
                    </TableFooter>
                  )}
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* GL Trial Balance — from journal_lines / chart_of_accounts */}
        <TabsContent value="gl-trial-balance" className="space-y-4">
          <Card className="print:shadow-none print:border-0">
            <CardHeader className="print:pb-2">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2 print:hidden">
                  <BookText className="h-5 w-5" />
                  GL Trial Balance
                  <Badge variant="secondary" className="ml-1 font-normal">
                    Posted journals
                  </Badge>
                </CardTitle>
              </div>
              <div className="flex flex-wrap gap-2 print:hidden">
                <Button
                  type="button"
                  size="sm"
                  variant={glTrialMode === "cumulative" ? "default" : "outline"}
                  className="h-8"
                  onClick={() => setGlTrialMode("cumulative")}
                >
                  Cumulative
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={glTrialMode === "period" ? "default" : "outline"}
                  className="h-8"
                  onClick={() => setGlTrialMode("period")}
                >
                  Period only
                </Button>
              </div>
              <div className="flex flex-col gap-2 print:hidden">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Cumulative</span> adds up every posted line from the beginning
                  through the as-of date (not just today). For <span className="font-medium text-foreground">only sales and
                  other activity inside one month or one financial year</span>, switch to{" "}
                  <span className="font-medium text-foreground">Period only</span> or use a quick range below.
                </p>
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs text-muted-foreground">Quick period:</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setGlTrialMode("period");
                      const d = new Date();
                      setFromDate(format(startOfMonth(d), "yyyy-MM-dd"));
                      setToDate(format(endOfMonth(d), "yyyy-MM-dd"));
                    }}
                  >
                    This calendar month
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setGlTrialMode("period");
                      const d = new Date(asOfDate);
                      setFromDate(format(startOfMonth(d), "yyyy-MM-dd"));
                      setToDate(format(endOfMonth(d), "yyyy-MM-dd"));
                    }}
                  >
                    Month of as-of date
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setGlTrialMode("period");
                      const fy = getIndiaFinancialYear(0);
                      setFromDate(fy.fromDate);
                      setToDate(fy.toDate);
                    }}
                  >
                    Current FY (Apr–Mar)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setGlTrialMode("period");
                      const fy = getIndiaFinancialYear(-1);
                      setFromDate(fy.fromDate);
                      setToDate(fy.toDate);
                    }}
                  >
                    Previous FY
                  </Button>
                </div>
              </div>
              {glTrialMode === "cumulative" ? (
                <AsOfDatePresets asOfDate={asOfDate} setAsOfDate={setAsOfDate} />
              ) : (
                <PeriodSelector
                  periodType={periodType}
                  setPeriodType={setPeriodType}
                  fromDate={fromDate}
                  toDate={toDate}
                  setFromDate={setFromDate}
                  setToDate={setToDate}
                />
              )}
              <Alert className="print:hidden">
                <AlertDescription className="text-sm">
                  Built from <strong>journal_entries</strong> ({glTrialMode === "cumulative" ? "all history through as-of" : "inclusive period only — monthly/yearly here"}).
                  Operational totals stay on the first tab. Codes <strong>1000–1099</strong> are summarized as cash / bank style liquidity.
                </AlertDescription>
              </Alert>
              <div className="hidden print:block">
                <ReportHeader
                  title="GL Trial Balance"
                  subtitle={glTrialSubtitle}
                  organization={currentOrganization || undefined}
                  generatedAt={format(new Date(), "dd MMM yyyy, hh:mm a")}
                />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-4">
                  {glCashBankRows.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                      <span className="font-medium text-muted-foreground">Cash / bank bucket (codes 1000–1099)</span>
                      <span className="font-mono font-semibold">
                        Net (Dr − Cr): {formatCurrency(glCashBankNet)}
                      </span>
                    </div>
                  )}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[88px]">Code</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Debit (₹)</TableHead>
                        <TableHead className="text-right">Credit (₹)</TableHead>
                        <TableHead className="w-[100px] text-right print:hidden">Ledger</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {glTrialBalance.map((entry) => (
                        <TableRow key={entry.accountId}>
                          <TableCell className="font-mono text-muted-foreground">{entry.accountCode}</TableCell>
                          <TableCell className="font-medium">{entry.accountName}</TableCell>
                          <TableCell>{entry.accountType}</TableCell>
                          <TableCell className="text-right">
                            {entry.debit > 0 ? formatCurrency(entry.debit) : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {entry.credit > 0 ? formatCurrency(entry.credit) : "—"}
                          </TableCell>
                          <TableCell className="text-right print:hidden">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => {
                                setGlLedgerAccount(entry);
                                setGlLedgerOpen(true);
                              }}
                            >
                              Lines
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {glTrialBalance.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            No posted journal lines for this view. Enable the accounting engine, widen the period, or pick a later as-of date.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                    {glTrialBalance.length > 0 && (
                      <TableFooter>
                        <TableRow className="font-bold bg-muted/50">
                          <TableCell colSpan={3}>Total</TableCell>
                          <TableCell className="text-right">{formatCurrency(glTbTotals.debit)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(glTbTotals.credit)}</TableCell>
                          <TableCell className="print:hidden" />
                        </TableRow>
                        {Math.abs(glTbTotals.debit - glTbTotals.credit) > 0.01 && (
                          <TableRow className="text-destructive">
                            <TableCell colSpan={6} className="text-center">
                              Trial debits and credits differ by {formatCurrency(Math.abs(glTbTotals.debit - glTbTotals.credit))}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableFooter>
                    )}
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* GL P&L — period-only Revenue & Expense from journal_lines */}
        <TabsContent value="gl-profit-loss" className="space-y-4">
          <Card className="print:shadow-none print:border-0">
            <CardHeader className="print:pb-2">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2 print:hidden">
                  <BarChart3 className="h-5 w-5" />
                  GL Profit & Loss
                  <Badge variant="secondary" className="ml-1 font-normal">
                    Posted journals
                  </Badge>
                </CardTitle>
              </div>
              <PeriodSelector
                periodType={periodType}
                setPeriodType={setPeriodType}
                fromDate={fromDate}
                toDate={toDate}
                setFromDate={setFromDate}
                setToDate={setToDate}
              />
              <Alert className="print:hidden">
                <AlertDescription className="text-sm">
                  <strong>Period only</strong> — includes journal lines whose voucher date falls between the selected dates
                  (inclusive). Revenue: credits minus debits per account. Expenses: debits minus credits. Net profit is revenue minus
                  total expenses (operational GST P&amp;L stays on other tabs).
                </AlertDescription>
              </Alert>
              <div className="hidden print:block">
                <ReportHeader
                  title="GL Profit & Loss"
                  subtitle={glPnlReport?.periodLabel || `${format(new Date(fromDate), "dd MMM yyyy")} – ${format(new Date(toDate), "dd MMM yyyy")}`}
                  organization={currentOrganization || undefined}
                  generatedAt={glPnlReport?.generatedAt || format(new Date(), "dd MMM yyyy, hh:mm a")}
                />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : glPnlReport ? (
                <div className="max-w-2xl mx-auto space-y-4">
                  <div className="border rounded-lg p-4">
                    <h3 className="font-semibold text-lg mb-3 text-primary flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Revenue
                    </h3>
                    <div className="space-y-2">
                      {glPnlReport.revenueLines.map((l) => (
                        <div key={l.accountCode} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            <span className="font-mono mr-2">{l.accountCode}</span>
                            {l.accountName}
                          </span>
                          <span className="font-mono">{formatCurrency(l.amount)}</span>
                        </div>
                      ))}
                      {glPnlReport.revenueLines.length === 0 && (
                        <p className="text-sm text-muted-foreground">No revenue accounts with movement in this period.</p>
                      )}
                      <Separator />
                      <div className="flex justify-between font-semibold">
                        <span>Total revenue</span>
                        <span className="font-mono">{formatCurrency(glPnlReport.totalRevenue)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h3 className="font-semibold text-lg mb-3 flex items-center gap-2 text-destructive">
                      <TrendingDown className="h-5 w-5" />
                      Expenses
                    </h3>
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {glPnlReport.expenseLines.map((l) => (
                        <div key={l.accountCode} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            <span className="font-mono mr-2">{l.accountCode}</span>
                            {l.accountName}
                          </span>
                          <span className="font-mono">{formatCurrency(l.amount)}</span>
                        </div>
                      ))}
                      {glPnlReport.expenseLines.length === 0 && (
                        <p className="text-sm text-muted-foreground">No expense accounts with movement in this period.</p>
                      )}
                      <Separator />
                      <div className="flex justify-between font-semibold">
                        <span>Total expenses</span>
                        <span className="font-mono">{formatCurrency(glPnlReport.totalExpenses)}</span>
                      </div>
                    </div>
                  </div>

                  <div
                    className={`rounded-lg border-2 p-5 ${
                      glPnlReport.isNetLoss ? "border-destructive bg-destructive/10" : "border-green-600 bg-green-50 dark:bg-green-950/30"
                    }`}
                  >
                    <div className="flex justify-between items-center gap-4">
                      <span className="text-lg font-bold">{glPnlReport.isNetLoss ? "Net loss" : "Net profit"}</span>
                      <span className={`text-xl font-mono font-bold tabular-nums ${glPnlReport.isNetLoss ? "text-destructive" : "text-green-600"}`}>
                        {glPnlReport.isNetLoss ? "−" : ""}
                        {formatCurrency(Math.abs(glPnlReport.netProfit))}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Choose a period and load the report. If nothing appears, post journals for that range or widen the dates.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* GL Balance sheet — cumulative A/L/E from journal_lines + P&amp;L equity plug */}
        <TabsContent value="gl-balance-sheet" className="space-y-4">
          <Card className="print:shadow-none print:border-0">
            <CardHeader className="print:pb-2">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2 print:hidden">
                  <Landmark className="h-5 w-5" />
                  GL Balance Sheet
                  <Badge variant="secondary" className="ml-1 font-normal">
                    Asset / Liability / Equity
                  </Badge>
                </CardTitle>
              </div>
              <AsOfDatePresets asOfDate={asOfDate} setAsOfDate={setAsOfDate} />
              <Alert className="print:hidden">
                <AlertDescription className="text-sm">
                  <strong>Cumulative</strong> through as-of: all posted lines on Asset, Liability, and Equity accounts from the
                  earliest journals through the date above. Revenue and Expense are rolled into equity as{" "}
                  <strong>Retained earnings / current year profit</strong> (cumulative unclosed P&amp;L through as-of;{" "}
                  {glBsReport?.currentYearFyLabel ?? "FY"} profit is shown for reference).
                </AlertDescription>
              </Alert>
              <div className="hidden print:block">
                <ReportHeader
                  title="GL Balance Sheet"
                  subtitle={`As of: ${format(new Date(asOfDate), "dd MMM yyyy")}`}
                  organization={currentOrganization || undefined}
                  generatedAt={glBsReport?.generatedAt || format(new Date(), "dd MMM yyyy, hh:mm a")}
                />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : glBsReport ? (
                <div className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="border rounded-lg p-4 space-y-3 md:order-1">
                      <h3 className="font-semibold text-lg text-primary">Assets</h3>
                      {glBsReport.assetLines.map((l) => (
                        <div key={l.accountCode} className="flex justify-between text-sm">
                          <span>
                            <span className="font-mono text-muted-foreground mr-2">{l.accountCode}</span>
                            {l.accountName}
                          </span>
                          <span className="font-mono">{formatCurrency(l.amount)}</span>
                        </div>
                      ))}
                      {glBsReport.assetLines.length === 0 && (
                        <p className="text-sm text-muted-foreground">No asset balances.</p>
                      )}
                      <Separator />
                      <div className="flex justify-between font-bold">
                        <span>Total assets</span>
                        <span className="font-mono text-primary">{formatCurrency(glBsReport.totalAssets)}</span>
                      </div>
                    </div>
                    <div className="space-y-4 md:order-2">
                      <div className="border rounded-lg p-4 space-y-3">
                        <h3 className="font-semibold text-lg text-destructive">Liabilities</h3>
                        {glBsReport.liabilityLines.map((l) => (
                          <div key={l.accountCode} className="flex justify-between text-sm">
                            <span>
                              <span className="font-mono text-muted-foreground mr-2">{l.accountCode}</span>
                              {l.accountName}
                            </span>
                            <span className="font-mono">{formatCurrency(l.amount)}</span>
                          </div>
                        ))}
                        {glBsReport.liabilityLines.length === 0 && (
                          <p className="text-sm text-muted-foreground">No liability balances.</p>
                        )}
                        <Separator />
                        <div className="flex justify-between font-bold">
                          <span>Total liabilities</span>
                          <span className="font-mono">{formatCurrency(glBsReport.totalLiabilities)}</span>
                        </div>
                      </div>
                      <div className="border rounded-lg p-4 space-y-3">
                        <h3 className="font-semibold text-lg text-green-700 dark:text-green-400">Equity</h3>
                        {glBsReport.equityLinesPosted.map((l) => (
                          <div key={l.accountCode} className="flex justify-between text-sm">
                            <span>
                              <span className="font-mono text-muted-foreground mr-2">{l.accountCode}</span>
                              {l.accountName}
                            </span>
                            <span className="font-mono">{formatCurrency(l.amount)}</span>
                          </div>
                        ))}
                        <Separator className="my-2" />
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground italic">
                            <span className="font-mono mr-2">{glBsReport.retainedEarningsLine.accountCode}</span>
                            {glBsReport.retainedEarningsLine.accountName}
                          </span>
                          <span className="font-mono">{formatCurrency(glBsReport.retainedEarningsLine.amount)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {glBsReport.currentYearFyLabel} profit (FY start → as-of):{" "}
                          <span className="font-mono">{formatCurrency(glBsReport.currentYearProfit)}</span>
                        </p>
                        {glBsReport.equityLinesPosted.length === 0 &&
                          Math.abs(glBsReport.retainedEarningsLine.amount) < 0.0001 && (
                            <p className="text-sm text-muted-foreground">No posted equity accounts.</p>
                          )}
                        <Separator />
                        <div className="flex justify-between font-bold">
                          <span>Total equity</span>
                          <span className="font-mono">{formatCurrency(glBsReport.totalEquity)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-3">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Accounting equation: </span>
                      <span className="font-mono font-medium">Assets</span>
                      <span className="text-muted-foreground"> = </span>
                      <span className="font-mono font-medium">Liabilities + Equity</span>
                      <span className="text-muted-foreground"> → </span>
                      <span className="font-mono">{formatCurrency(glBsReport.totalAssets)}</span>
                      <span className="text-muted-foreground"> vs </span>
                      <span className="font-mono">
                        {formatCurrency(glBsReport.totalLiabilities + glBsReport.totalEquity)}
                      </span>
                    </div>
                    {glBsReport.isBalanced ? (
                      <Badge className="bg-green-600 hover:bg-green-600 text-white w-fit shrink-0">Balanced</Badge>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="destructive" className="w-fit shrink-0">
                          Not balanced
                        </Badge>
                        <span className="text-xs text-destructive">
                          Difference {formatCurrency(Math.abs(glBsReport.balanceDifference))}
                        </span>
                      </div>
                    )}
                  </div>
                  {!glBsReport.isBalanced && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-sm">
                        Totals differ — check for manual journals, opening balances not mirrored in the GL, or mixed sign
                        conventions. Plug line uses cumulative Revenue − Expense through as-of.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Could not load GL balance sheet. Check your connection and try again.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Profit & Loss - Enhanced GST-Compliant */}
        <TabsContent value="profit-loss" className="space-y-4">
          <Card className="print:shadow-none print:border-0">
            <CardHeader className="print:pb-2">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2 print:hidden">
                  <TrendingUp className="h-5 w-5" />
                  Profit & Loss Statement
                  <Badge variant="outline" className="ml-2">GST Compliant</Badge>
                </CardTitle>
              </div>
              <PeriodSelector periodType={periodType} setPeriodType={setPeriodType} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} />
              {/* Print Header */}
              <div className="hidden print:block">
                <ReportHeader 
                  title="Profit & Loss Statement" 
                  subtitle={profitLoss?.periodLabel || `${format(new Date(fromDate), "dd MMM yyyy")} - ${format(new Date(toDate), "dd MMM yyyy")}`}
                  organization={currentOrganization || undefined}
                  generatedAt={profitLoss?.generatedAt}
                />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : profitLoss ? (
                <div className="space-y-6">
                  {/* Warnings */}
                  {profitLoss.warnings.length > 0 && (
                    <div className="space-y-2 print:hidden">
                      {profitLoss.warnings.map((warning, idx) => (
                        <Alert key={idx} variant="destructive" className="bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          <AlertDescription className="text-amber-800 dark:text-amber-200">
                            {warning}
                          </AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  )}

                  {/* GST Notice */}
                  <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800 print:hidden">
                    <AlertDescription className="text-blue-800 dark:text-blue-200 text-sm">
                      ℹ️ All amounts are GST-exclusive. GST data is reported separately in GST Reports.
                    </AlertDescription>
                  </Alert>

                  {/* Revenue Section */}
                  <div className="border rounded-lg p-4 print:border-black">
                    <h3 className="font-semibold text-lg mb-3 text-primary print:text-black flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      REVENUE
                    </h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Gross Sales (Excl. GST)</span>
                        <span className="text-right font-mono">{formatCurrency(profitLoss.grossSales)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground print:text-gray-600">
                        <span>Less: Sales Returns</span>
                        <span className="text-right font-mono text-destructive">({formatCurrency(profitLoss.salesReturns)})</span>
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between font-semibold text-lg">
                        <span>NET SALES</span>
                        <span className="text-right font-mono">{formatCurrency(profitLoss.netSales)}</span>
                      </div>
                    </div>
                  </div>

                  {/* COGS Section */}
                  <div className="border rounded-lg p-4 print:border-black">
                    <h3 className="font-semibold text-lg mb-3 text-primary print:text-black flex items-center gap-2">
                      <FileSpreadsheet className="h-5 w-5" />
                      COST OF GOODS SOLD
                    </h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Opening Stock</span>
                        <span className="text-right font-mono">
                          {formatCurrency(profitLoss.openingStock)}
                          {profitLoss.openingStock === 0 && <span className="text-xs text-muted-foreground ml-1">(Estimated from transaction history)</span>}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Add: Purchases (Excl. GST)</span>
                        <span className="text-right font-mono">{formatCurrency(profitLoss.purchases)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground print:text-gray-600">
                        <span>Less: Purchase Returns</span>
                        <span className="text-right font-mono text-destructive">({formatCurrency(profitLoss.purchaseReturns)})</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground print:text-gray-600">
                        <span>Less: Closing Stock</span>
                        <span className="text-right font-mono text-destructive">
                          ({formatCurrency(profitLoss.closingStock)})
                          {profitLoss.closingStock === 0 && <span className="text-xs ml-1">(Estimated from transaction history)</span>}
                        </span>
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between font-semibold text-lg">
                        <span>TOTAL COGS</span>
                        <span className="text-right font-mono">{formatCurrency(profitLoss.cogs)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Gross Profit */}
                  <div className={`border-2 rounded-lg p-4 ${
                    profitLoss.isGrossLoss 
                      ? 'border-destructive bg-destructive/10 dark:bg-destructive/20' 
                      : 'border-green-500 bg-green-50 dark:bg-green-950'
                  }`}>
                    <div className="flex justify-between font-bold text-xl">
                      <span className="flex items-center gap-2">
                        {profitLoss.isGrossLoss ? (
                          <TrendingDown className="h-6 w-6 text-destructive" />
                        ) : (
                          <TrendingUp className="h-6 w-6 text-green-600" />
                        )}
                        {profitLoss.isGrossLoss ? 'GROSS LOSS' : 'GROSS PROFIT'}
                      </span>
                      <span className={`font-mono ${profitLoss.isGrossLoss ? 'text-destructive' : 'text-green-600'}`}>
                        {profitLoss.isGrossLoss && '-'}{formatCurrency(Math.abs(profitLoss.grossProfit))}
                      </span>
                    </div>
                  </div>

                  {/* Expenses Section */}
                  <div className="border rounded-lg p-4 print:border-black">
                    <h3 className="font-semibold text-lg mb-3 text-primary print:text-black flex items-center gap-2">
                      <Wallet className="h-5 w-5" />
                      OPERATING EXPENSES
                    </h3>
                    <div className="space-y-2">
                      {profitLoss.expensesByCategory.length > 0 ? (
                        profitLoss.expensesByCategory.map((expense, idx) => (
                          <div key={idx} className="flex justify-between pl-4">
                            <span>{expense.category}</span>
                            <span className="text-right font-mono">{formatCurrency(expense.amount)}</span>
                          </div>
                        ))
                      ) : (
                        <div className="flex justify-between text-muted-foreground pl-4">
                          <span>No expenses recorded</span>
                          <span className="text-right font-mono">{formatCurrency(0)}</span>
                        </div>
                      )}
                      <Separator className="my-2" />
                      <div className="flex justify-between font-semibold text-lg">
                        <span>TOTAL EXPENSES</span>
                        <span className="text-right font-mono text-destructive">{formatCurrency(profitLoss.totalExpenses)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Net Profit */}
                  <div className={`border-4 rounded-lg p-6 ${
                    profitLoss.isNetLoss 
                      ? 'border-destructive bg-destructive/10 dark:bg-destructive/20' 
                      : 'border-green-500 bg-green-50 dark:bg-green-950'
                  }`}>
                    <div className="flex justify-between font-bold text-2xl">
                      <span className="flex items-center gap-3">
                        {profitLoss.isNetLoss ? (
                          <TrendingDown className="h-8 w-8 text-destructive" />
                        ) : (
                          <TrendingUp className="h-8 w-8 text-green-600" />
                        )}
                        {profitLoss.isNetLoss ? 'NET LOSS' : 'NET PROFIT'}
                      </span>
                      <span className={`font-mono ${profitLoss.isNetLoss ? 'text-destructive' : 'text-green-600'}`}>
                        {profitLoss.isNetLoss && '-'}{formatCurrency(Math.abs(profitLoss.netProfit))}
                      </span>
                    </div>
                    <Separator className="my-3" />
                    <div className="flex justify-between text-lg">
                      <span className="text-muted-foreground">Profit Margin</span>
                      <span className={`font-mono font-semibold ${
                        profitLoss.profitMargin < 0 ? 'text-destructive' : 'text-green-600'
                      }`}>
                        {profitLoss.profitMargin.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No data available. Select a period to load the report.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Balance Sheet */}
        <TabsContent value="balance-sheet" className="space-y-4">
          <Card className="print:shadow-none print:border-0">
            <CardHeader className="print:pb-2">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2 print:hidden">
                  <FileSpreadsheet className="h-5 w-5" />
                  Balance Sheet
                </CardTitle>
              </div>
              <AsOfDatePresets asOfDate={asOfDate} setAsOfDate={setAsOfDate} />
              <div className="hidden print:block">
                <ReportHeader 
                  title="Balance Sheet" 
                  subtitle={`As of: ${format(new Date(asOfDate), "dd MMM yyyy")}`}
                  organization={currentOrganization || undefined}
                  generatedAt={format(new Date(), "dd MMM yyyy, hh:mm a")}
                />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : balanceSheet ? (
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Assets */}
                  <div className="space-y-4">
                    <div className="border rounded-lg p-4">
                      <h3 className="font-semibold text-lg mb-3 text-primary flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        ASSETS
                      </h3>
                      <div className="space-y-3">
                        <div className="text-sm font-medium text-muted-foreground">Current Assets</div>
                        <div className="flex justify-between pl-4">
                          <span>Cash & Bank</span>
                          <span className="font-mono">{formatCurrency(balanceSheet.assets.cashBank)}</span>
                        </div>
                        <div className="flex justify-between pl-4">
                          <span>Accounts Receivable</span>
                          <span className="font-mono">{formatCurrency(balanceSheet.assets.accountsReceivable)}</span>
                        </div>
                        <div className="flex justify-between pl-4">
                          <span>Inventory</span>
                          <span className="font-mono">{formatCurrency(balanceSheet.assets.inventory)}</span>
                        </div>
                        <div className="flex justify-between font-bold border-t pt-2 text-lg">
                          <span>Total Assets</span>
                          <span className="text-primary font-mono">{formatCurrency(balanceSheet.assets.totalAssets)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Liabilities & Equity */}
                  <div className="space-y-4">
                    <div className="border rounded-lg p-4">
                      <h3 className="font-semibold text-lg mb-3 text-destructive flex items-center gap-2">
                        <TrendingDown className="h-5 w-5" />
                        LIABILITIES
                      </h3>
                      <div className="space-y-3">
                        <div className="text-sm font-medium text-muted-foreground">Current Liabilities</div>
                        <div className="flex justify-between pl-4">
                          <span>Accounts Payable</span>
                          <span className="font-mono">{formatCurrency(balanceSheet.liabilities.accountsPayable)}</span>
                        </div>
                        {balanceSheet.liabilities.gstPayable > 0 && (
                          <div className="flex justify-between pl-4">
                            <span>GST Payable</span>
                            <span className="font-mono">{formatCurrency(balanceSheet.liabilities.gstPayable)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold border-t pt-2">
                          <span>Total Liabilities</span>
                          <span className="font-mono">{formatCurrency(balanceSheet.liabilities.totalLiabilities)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="border rounded-lg p-4">
                      <h3 className="font-semibold text-lg mb-3 text-green-600 flex items-center gap-2">
                        <Wallet className="h-5 w-5" />
                        OWNER'S EQUITY
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between font-bold border-t pt-2">
                          <span>Closing Capital</span>
                          <span className={`font-mono ${balanceSheet.equity.closingCapital >= 0 ? 'text-green-600' : 'text-destructive'}`}>{formatCurrency(balanceSheet.equity.closingCapital)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="border-2 border-primary rounded-lg p-4 bg-primary/5">
                      <div className="flex justify-between font-bold text-lg">
                        <span>Total Liabilities + Equity</span>
                        <span className="text-primary font-mono">
                          {formatCurrency(balanceSheet.liabilities.totalLiabilities + balanceSheet.equity.closingCapital)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No data available. Select a date to load the report.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Net Profit Summary - Income Statement Format */}
        <TabsContent value="net-profit" className="space-y-4">
          <Card className="print:shadow-none print:border-0">
            <CardHeader className="print:pb-2">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2 print:hidden">
                  <PieChart className="h-5 w-5" />
                  Income Statement
                  <Badge variant="outline" className="ml-2">Net Profit Report</Badge>
                </CardTitle>
              </div>
              <PeriodSelector periodType={periodType} setPeriodType={setPeriodType} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} />
              <div className="hidden print:block">
                <ReportHeader 
                  title="Income Statement" 
                  subtitle={`Period: ${format(new Date(fromDate), "dd MMM yyyy")} - ${format(new Date(toDate), "dd MMM yyyy")}`}
                  organization={currentOrganization || undefined}
                  generatedAt={format(new Date(), "dd MMM yyyy, hh:mm a")}
                />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : netProfitSummary ? (
                <div className="max-w-2xl mx-auto space-y-4">
                  {/* REVENUE SECTION */}
                  <div className="border rounded-lg p-4">
                    <h3 className="font-semibold text-lg mb-3 text-blue-600 dark:text-blue-400 flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      REVENUE
                    </h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Total Sales</span>
                        <span className="font-mono">{formatCurrency(netProfitSummary.totalSales)}</span>
                      </div>
                      <div className="flex justify-between text-destructive">
                        <span>Less: Sales Returns</span>
                        <span className="font-mono">({formatCurrency(netProfitSummary.salesReturns)})</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-bold">
                        <span>Net Revenue</span>
                        <span className="font-mono text-blue-600 dark:text-blue-400">{formatCurrency(netProfitSummary.netRevenue)}</span>
                      </div>
                    </div>
                  </div>

                  {/* COGS SECTION */}
                  <div className="border rounded-lg p-4">
                    <h3 className="font-semibold text-lg mb-3 text-amber-600 dark:text-amber-400 flex items-center gap-2">
                      <FileSpreadsheet className="h-5 w-5" />
                      COST OF GOODS SOLD
                    </h3>
                    <div className="flex justify-between font-bold">
                      <span>Purchase Cost of Items Sold</span>
                      <span className="font-mono text-destructive">({formatCurrency(netProfitSummary.cogsFromSaleItems)})</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Calculated from pur_price × quantity of all items sold
                    </p>
                  </div>

                  {/* GROSS PROFIT */}
                  <div className={`border-2 rounded-lg p-4 ${netProfitSummary.isGrossLoss ? 'border-destructive bg-destructive/10 dark:bg-destructive/20' : 'border-purple-500 bg-purple-50 dark:bg-purple-950/30'}`}>
                    <div className="flex justify-between font-bold text-lg">
                      <span>{netProfitSummary.isGrossLoss ? 'GROSS LOSS' : 'GROSS PROFIT'}</span>
                      <span className={`font-mono ${netProfitSummary.isGrossLoss ? 'text-destructive' : 'text-purple-600 dark:text-purple-400'}`}>
                        {netProfitSummary.isGrossLoss && '-'}{formatCurrency(Math.abs(netProfitSummary.grossProfit))}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Net Revenue - Cost of Goods Sold
                    </p>
                  </div>

                  {/* GST INFORMATION */}
                  <div className="border rounded-lg p-4">
                    <h3 className="font-semibold text-lg mb-1 text-orange-600 dark:text-orange-400 flex items-center gap-2">
                      <Calculator className="h-5 w-5" />
                      GST INFORMATION
                    </h3>
                    <p className="text-xs text-muted-foreground mb-3">(Pass-through tax — not deducted from profit)</p>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Output GST (Sales)</span>
                        <span className="font-mono">{formatCurrency(netProfitSummary.outputGST)}</span>
                      </div>
                      <div className="flex justify-between text-green-600 dark:text-green-400">
                        <span>Less: Input GST (Purchases)</span>
                        <span className="font-mono">({formatCurrency(netProfitSummary.inputGST)})</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-bold">
                        <span>{netProfitSummary.netGSTLiability >= 0 ? 'Net GST Payable' : 'Net GST Receivable'}</span>
                        <span className={`font-mono ${netProfitSummary.netGSTLiability >= 0 ? 'text-destructive' : 'text-green-600 dark:text-green-400'}`}>
                          {netProfitSummary.netGSTLiability >= 0 ? formatCurrency(netProfitSummary.netGSTLiability) : `(${formatCurrency(Math.abs(netProfitSummary.netGSTLiability))})`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* EXPENSES */}
                  <div className="border rounded-lg p-4">
                    <h3 className="font-semibold text-lg mb-3 text-orange-600 dark:text-orange-400 flex items-center gap-2">
                      <TrendingDown className="h-5 w-5" />
                      OPERATING EXPENSES
                    </h3>
                    <div className="flex justify-between font-bold">
                      <span>Total Expenses</span>
                      <span className="font-mono text-destructive">({formatCurrency(netProfitSummary.totalExpenses)})</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      From expense vouchers recorded in the period
                    </p>
                  </div>

                  {/* FINAL NET PROFIT CARD */}
                  <div className={`border-4 rounded-lg p-6 ${netProfitSummary.isNetLoss ? 'border-destructive bg-destructive/10 dark:bg-destructive/20' : 'border-green-600 bg-green-100 dark:bg-green-950/50'}`}>
                    <div className="flex justify-between items-center">
                      <div>
                        <h2 className="text-2xl font-bold">{netProfitSummary.isNetLoss ? 'NET LOSS' : 'NET PROFIT'}</h2>
                        <p className="text-sm text-muted-foreground">Take-home Profit After All Deductions</p>
                      </div>
                      <div className="text-right">
                        <span className={`text-3xl font-bold font-mono ${netProfitSummary.isNetLoss ? 'text-destructive' : 'text-green-600'}`}>
                          {netProfitSummary.isNetLoss && '-'}{formatCurrency(Math.abs(netProfitSummary.netProfit))}
                        </span>
                        <p className={`text-sm ${netProfitSummary.profitMarginPercent < 0 ? 'text-destructive' : 'text-green-600'}`}>
                          Margin: {netProfitSummary.profitMarginPercent.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* SUMMARY TABLE */}
                  <Card className="mt-6">
                    <CardHeader className="py-3">
                      <CardTitle className="text-lg">Summary Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Component</TableHead>
                            <TableHead>Calculation</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell className="font-medium">Actual Sales</TableCell>
                            <TableCell className="text-sm text-muted-foreground">Total Sales - Returns</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(netProfitSummary.netRevenue)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Gross Profit</TableCell>
                            <TableCell className="text-sm text-muted-foreground">Revenue - Purchase Cost of Goods</TableCell>
                            <TableCell className={`text-right font-mono ${netProfitSummary.isGrossLoss ? 'text-destructive' : ''}`}>
                              {formatCurrency(netProfitSummary.grossProfit)}
                            </TableCell>
                          </TableRow>
                          <TableRow className="font-bold bg-muted/50">
                            <TableCell>Net Profit</TableCell>
                            <TableCell className="text-sm">Gross Profit - Operating Expenses</TableCell>
                            <TableCell className={`text-right font-mono ${netProfitSummary.isNetLoss ? 'text-destructive' : 'text-green-600'}`}>
                              {formatCurrency(netProfitSummary.netProfit)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  {/* PERIOD INFO */}
                  <div className="text-center text-sm text-muted-foreground pt-4 border-t">
                    <p>Report Period: {netProfitSummary.periodLabel}</p>
                    <p>Generated: {netProfitSummary.generatedAt}</p>
                  </div>

                  {/* LINK TO DETAILED ANALYSIS PAGE */}
                  <div className="mt-6 text-center">
                    <Button 
                      variant="outline" 
                      onClick={() => orgNavigate("/net-profit-analysis")}
                      className="gap-2"
                    >
                      <PieChart className="h-4 w-4" />
                      View Supplier-wise & Product-wise Analysis
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      Open full-page detailed profit breakdown by supplier and product
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No data available. Select a period to load the report.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Sheet
        open={glLedgerOpen}
        onOpenChange={(open) => {
          setGlLedgerOpen(open);
          if (!open) setGlLedgerAccount(null);
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="pr-8">
              {glLedgerAccount ? (
                <>
                  <span className="font-mono text-muted-foreground">{glLedgerAccount.accountCode}</span>{" "}
                  {glLedgerAccount.accountName}
                </>
              ) : (
                "Account ledger"
              )}
            </SheetTitle>
            <SheetDescription>
              {glLedgerDateRange
                ? `${format(new Date(glLedgerDateRange.from), "dd MMM yyyy")} – ${format(new Date(glLedgerDateRange.to), "dd MMM yyyy")}`
                : ""}
              {glLedgerAccount &&
                (glLedgerAccount.accountType === "Asset" || glLedgerAccount.accountType === "Expense"
                  ? " · Balance increases with debit."
                  : " · Balance increases with credit.")}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {glLedgerLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : glLedgerRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6">No lines in this range.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[96px]">Date</TableHead>
                    <TableHead>Ref / note</TableHead>
                    <TableHead className="text-right w-[88px]">Dr</TableHead>
                    <TableHead className="text-right w-[88px]">Cr</TableHead>
                    <TableHead className="text-right w-[100px]">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {glLedgerRows.map((row) => (
                    <TableRow key={`${row.lineSeq}-${row.journalLineId ?? "ob"}`}>
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {format(new Date(row.entryDate), "dd/MM/yy")}
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px]">
                        <div className="truncate" title={row.description ?? ""}>
                          {row.referenceType === "_opening"
                            ? "Opening"
                            : `${row.referenceType}${row.referenceId ? ` · ${String(row.referenceId).slice(0, 8)}` : ""}`}
                        </div>
                        {row.description && row.referenceType !== "_opening" && (
                          <div className="text-xs text-muted-foreground truncate" title={row.description}>
                            {row.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {row.debitAmount > 0 ? formatCurrency(row.debitAmount) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {row.creditAmount > 0 ? formatCurrency(row.creditAmount) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">
                        {formatCurrency(row.runningBalance)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-sm"
              onClick={() => {
                if (!glLedgerDateRange) {
                  orgNavigate("/journal-vouchers");
                  setGlLedgerOpen(false);
                  return;
                }
                const q = new URLSearchParams({
                  from: glLedgerDateRange.from,
                  to: glLedgerDateRange.to,
                });
                orgNavigate(`/journal-vouchers?${q.toString()}`);
                setGlLedgerOpen(false);
              }}
            >
              Open journal vouchers (same date range)
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
