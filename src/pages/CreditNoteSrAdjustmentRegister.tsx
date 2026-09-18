import { useMemo, useRef, useState } from "react";
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, subMonths } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  FileSpreadsheet,
  Printer,
  RotateCcw,
  IndianRupee,
  Wallet,
  Search,
} from "lucide-react";
import type * as XLSXType from "xlsx";
let xlsxModulePromise: Promise<typeof XLSXType> | null = null;
const loadXlsx = (): Promise<typeof XLSXType> => (xlsxModulePromise ??= import("xlsx"));

import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { restoreDashboardFilters, WINDOW_FILTER_IDS } from "@/lib/dashboardFilterPersistence";
import { ResetPersistedFiltersButton } from "@/components/ResetPersistedFiltersButton";
import { ReportPageSkeleton } from "@/components/skeletons/ReportPageSkeleton";
import { ReportKpiCards, type ReportKpiItem } from "@/components/reports/ReportKpiCards";
import { QuietRefreshBar } from "@/components/QuietRefreshBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useReactToPrint } from "@/hooks/useGuardedReactToPrint";
import { fetchCreditNoteSrRegisterSource } from "@/utils/creditNoteSrRegisterData";
import {
  buildCreditNoteSrRegisterRows,
  creditNoteSrRegisterCsvHeader,
  creditNoteSrRegisterCsvRow,
  creditNoteSrRegisterKpis,
  filterCreditNoteSrRegisterRows,
  type CreditNoteSrDateBasis,
} from "@/utils/creditNoteSrRegister";
import { csvField } from "@/utils/reportCsvExport";

type PeriodType = "custom" | "this-month" | "last-month" | "this-quarter" | "this-fy";

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n: number) => `₹${inr.format(n || 0)}`;

function currentFy(today: Date) {
  const month = today.getMonth();
  const year = today.getFullYear();
  if (month >= 3) return { start: new Date(year, 3, 1), end: new Date(year + 1, 2, 31) };
  return { start: new Date(year - 1, 3, 1), end: new Date(year, 2, 31) };
}

export default function CreditNoteSrAdjustmentRegister() {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);
  const today = new Date();

  const [fromDate, setFromDate] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(endOfMonth(today), "yyyy-MM-dd"));
  const [periodType, setPeriodType] = useState<PeriodType>("this-month");
  const [dateBasis, setDateBasis] = useState<CreditNoteSrDateBasis>("return_date");
  const [customerQuery, setCustomerQuery] = useState("");
  const [showSettled, setShowSettled] = useState(false);

  const { clearPersistedFilters } = useDashboardFilterPersistence(
    WINDOW_FILTER_IDS.cnSrAdjustmentRegister,
    currentOrganization?.id,
    useMemo(
      () => ({ fromDate, toDate, periodType, dateBasis, customerQuery, showSettled }),
      [fromDate, toDate, periodType, dateBasis, customerQuery, showSettled],
    ),
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [
          ["fromDate", setFromDate],
          ["toDate", setToDate],
          ["periodType", (v) => setPeriodType(v as PeriodType)],
          ["dateBasis", (v) => setDateBasis(v as CreditNoteSrDateBasis)],
          ["customerQuery", setCustomerQuery],
        ],
        booleans: [["showSettled", setShowSettled]],
      });
    },
  );

  const defaultFrom = format(startOfMonth(today), "yyyy-MM-dd");
  const defaultTo = format(endOfMonth(today), "yyyy-MM-dd");
  const filtersDirty =
    periodType !== "this-month" ||
    fromDate !== defaultFrom ||
    toDate !== defaultTo ||
    dateBasis !== "return_date" ||
    customerQuery.trim() !== "" ||
    showSettled;

  const orgId = currentOrganization?.id || "";
  const query = useQuery({
    queryKey: ["cn-sr-adjustment-register", orgId],
    enabled: Boolean(orgId),
    queryFn: () => fetchCreditNoteSrRegisterSource(orgId),
    staleTime: 30_000,
  });

  const allRows = useMemo(
    () => (query.data ? buildCreditNoteSrRegisterRows(query.data) : []),
    [query.data],
  );

  const rows = useMemo(
    () =>
      filterCreditNoteSrRegisterRows(allRows, {
        fromDate,
        toDate,
        dateBasis,
        customerQuery,
        showSettled,
      }),
    [allRows, fromDate, toDate, dateBasis, customerQuery, showSettled],
  );

  const kpis = useMemo(() => creditNoteSrRegisterKpis(rows), [rows]);

  const kpiItems: ReportKpiItem[] = [
    {
      label: "Returns",
      value: kpis.count.toLocaleString("en-IN"),
      sub: showSettled ? "including settled" : "pending only",
      gradient: "bg-gradient-to-br from-slate-600 to-slate-700",
      icon: RotateCcw,
    },
    {
      label: "Net Return",
      value: fmt(kpis.netReturn),
      gradient: "bg-gradient-to-br from-indigo-500 to-indigo-600",
      icon: IndianRupee,
    },
    {
      label: "Applied / Adjusted",
      value: fmt(kpis.applied),
      gradient: "bg-gradient-to-br from-teal-500 to-teal-600",
      icon: Wallet,
    },
    {
      label: "Remaining / Pending",
      value: fmt(kpis.remaining),
      gradient: "bg-gradient-to-br from-amber-500 to-amber-600",
      icon: IndianRupee,
      highlight: kpis.remaining > 0.5,
    },
  ];

  const handlePeriodChange = (value: PeriodType) => {
    setPeriodType(value);
    const fy = currentFy(today);
    let start = startOfMonth(today);
    let end = endOfMonth(today);
    if (value === "last-month") {
      const last = subMonths(today, 1);
      start = startOfMonth(last);
      end = endOfMonth(last);
    } else if (value === "this-quarter") {
      start = startOfQuarter(today);
      end = endOfQuarter(today);
    } else if (value === "this-fy") {
      start = fy.start;
      end = fy.end;
    }
    if (value !== "custom") {
      setFromDate(format(start, "yyyy-MM-dd"));
      setToDate(format(end, "yyyy-MM-dd"));
    }
  };

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `CN-SR-Register-${fromDate}-${toDate}`,
  });

  const handleExportExcel = async () => {
    try {
      const XLSX = await loadXlsx();
      const header = creditNoteSrRegisterCsvHeader();
      const body = rows.map((r) => creditNoteSrRegisterCsvRow(r));
      const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "CN SR Register");
      XLSX.writeFile(wb, `cn-sr-adjustment-register-${fromDate}-to-${toDate}.xlsx`);
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export Excel",
        variant: "destructive",
      });
    }
  };

  const handleExportCsv = () => {
    const header = creditNoteSrRegisterCsvHeader().map(csvField).join(",");
    const lines = rows.map((r) => creditNoteSrRegisterCsvRow(r).map(csvField).join(","));
    const blob = new Blob([[header, ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cn-sr-adjustment-register-${fromDate}-to-${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="outline" size="sm" onClick={() => orgNavigate("/reports")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Reports
        </Button>
        <div>
          <h1 className="text-lg font-semibold">CN / S-R Adjustment Register</h1>
          <p className="text-xs text-muted-foreground">
            Remaining uses allocated credit-note FIFO (same as Customer Ledger). Default hides fully
            settled / memo returns.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => void handleExportExcel()}>
            <FileSpreadsheet className="h-4 w-4 mr-1" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => handlePrint()}>
            <Printer className="h-4 w-4 mr-1" />
            Print / PDF
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2 print:hidden">
        <div className="space-y-1">
          <Label className="text-xs">Period</Label>
          <Select value={periodType} onValueChange={(v) => handlePeriodChange(v as PeriodType)}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this-month">This month</SelectItem>
              <SelectItem value="last-month">Last month</SelectItem>
              <SelectItem value="this-quarter">This quarter</SelectItem>
              <SelectItem value="this-fy">This FY</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            className="h-9 w-[150px]"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPeriodType("custom");
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            className="h-9 w-[150px]"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setPeriodType("custom");
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Date basis</Label>
          <Select value={dateBasis} onValueChange={(v) => setDateBasis(v as CreditNoteSrDateBasis)}>
            <SelectTrigger className="h-9 w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="return_date">Return date</SelectItem>
              <SelectItem value="cn_applied">CN applied date</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 min-w-[200px] flex-1">
          <Label className="text-xs">Customer</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="h-9 pl-8"
              placeholder="Name, phone, or return no"
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 h-9">
          <Switch id="cn-sr-show-settled" checked={showSettled} onCheckedChange={setShowSettled} />
          <Label htmlFor="cn-sr-show-settled" className="text-sm">
            Show settled
          </Label>
        </div>
        {filtersDirty ? (
          <ResetPersistedFiltersButton
            onReset={() => {
              setFromDate(defaultFrom);
              setToDate(defaultTo);
              setPeriodType("this-month");
              setDateBasis("return_date");
              setCustomerQuery("");
              setShowSettled(false);
              clearPersistedFilters();
            }}
          />
        ) : null}
      </div>

      {query.isError ? (
        <p className="text-sm text-destructive print:hidden">
          {query.error instanceof Error ? query.error.message : "Failed to load register"}
        </p>
      ) : null}

      {query.isFetching ? <QuietRefreshBar /> : null}

      {query.isLoading ? (
        <ReportPageSkeleton />
      ) : (
        <div ref={printRef} className="space-y-3">
          <div className="hidden print:block text-center border-b pb-2">
            <h2 className="text-lg font-bold">CN / S-R Adjustment Register</h2>
            <p className="text-sm">
              {currentOrganization?.name} · {fromDate} to {toDate} ·{" "}
              {dateBasis === "cn_applied" ? "CN applied date" : "Return date"}
              {showSettled ? " · including settled" : " · pending only"}
            </p>
          </div>
          <ReportKpiCards items={kpiItems} />
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Return No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Linked Invoice(s)</TableHead>
                  <TableHead className="text-right">Net Return</TableHead>
                  <TableHead>Credit Note</TableHead>
                  <TableHead className="text-right">Applied</TableHead>
                  <TableHead>Applied To</TableHead>
                  <TableHead>CN Date</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                      No credit-note / S-R adjustments in this range
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id} className={row.isMemo ? "text-muted-foreground" : undefined}>
                      <TableCell className="font-medium whitespace-nowrap">{row.returnNumber}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.returnDate}</TableCell>
                      <TableCell>
                        <div className="font-medium">{row.customerName}</div>
                        {row.customerPhone ? (
                          <div className="text-xs text-muted-foreground">{row.customerPhone}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>{row.linkedInvoiceNumbers}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {fmt(row.netReturnAmount)}
                      </TableCell>
                      <TableCell>
                        {row.creditNoteNumber || "—"}
                        {row.creditNoteNumber ? (
                          <div className="text-xs text-muted-foreground font-mono tabular-nums">
                            {fmt(row.creditNoteAmount)}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {fmt(row.appliedAmount)}
                      </TableCell>
                      <TableCell>{row.appliedToInvoices || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.cnAppliedDate || "—"}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums font-semibold">
                        {fmt(row.remainingAmount)}
                      </TableCell>
                      <TableCell className="text-xs">{row.statusLabel}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {rows.length > 0 ? (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4}>Total · {kpis.count.toLocaleString("en-IN")} returns</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{fmt(kpis.netReturn)}</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-mono tabular-nums">{fmt(kpis.applied)}</TableCell>
                    <TableCell colSpan={2} />
                    <TableCell className="text-right font-mono tabular-nums">{fmt(kpis.remaining)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              ) : null}
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
