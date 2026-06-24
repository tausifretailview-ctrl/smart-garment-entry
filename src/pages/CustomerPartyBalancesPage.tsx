import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Search,
  Users,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Loader2,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";

import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportSkeleton } from "@/components/ui/skeletons";
import { cn } from "@/lib/utils";
import { fetchAllCustomerPartyBalances, fetchCustomerPhoneMap } from "@/utils/fetchAllRows";
import {
  CUSTOMER_PARTY_BALANCES_PAGE_SIZE,
  clampPartyBalancePage,
  isPartyBalanceSettled,
  matchesPartyBalanceSearch,
  matchesPartyDirectionFilter,
  partyBalanceDirection,
  partyBalanceDisplayAmount,
  partyBalanceTotalPages,
  slicePartyBalancePage,
  type PartyDirectionFilter,
} from "@/utils/customerPartyBalanceDisplay";

export type CustomerPartyBalanceRow = {
  customer_id: string;
  customer_name: string;
  phone?: string;
  signed_balance: number;
  advance_available: number;
  direction: string;
  net_position: number;
  total_dr: number;
  total_cr: number;
  net_receivable: number;
};

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtAmt(n: number) {
  return inr.format(n);
}

export default function CustomerPartyBalancesPage() {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showSettled, setShowSettled] = useState(false);
  const [directionFilter, setDirectionFilter] = useState<PartyDirectionFilter>("all");
  const [page, setPage] = useState(1);

  const orgId = currentOrganization?.id;

  const { data: rows = [], isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["customer-party-balances", orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async () => {
      const [partyRows, phoneMap] = await Promise.all([
        fetchAllCustomerPartyBalances(orgId!),
        fetchCustomerPhoneMap(orgId!),
      ]);
      return partyRows.map((row) => ({
        ...row,
        phone: phoneMap.get(row.customer_id) ?? "",
      }));
    },
  });

  const orgTotals = useMemo(() => {
    const first = rows[0];
    return {
      totalDr: Number(first?.total_dr ?? 0),
      totalCr: Number(first?.total_cr ?? 0),
      netReceivable: Number(first?.net_receivable ?? 0),
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (!showSettled && isPartyBalanceSettled(row.signed_balance)) {
        return false;
      }
      if (!matchesPartyDirectionFilter(row, directionFilter)) {
        return false;
      }
      return matchesPartyBalanceSearch(row, search);
    });
  }, [rows, search, showSettled, directionFilter]);

  const totalPages = partyBalanceTotalPages(filteredRows.length);
  const currentPage = clampPartyBalancePage(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [search, showSettled, directionFilter]);

  const paginatedRows = useMemo(
    () => slicePartyBalancePage(filteredRows, currentPage),
    [filteredRows, currentPage],
  );

  const pageStart = filteredRows.length === 0 ? 0 : (currentPage - 1) * CUSTOMER_PARTY_BALANCES_PAGE_SIZE + 1;
  const pageEnd = Math.min(currentPage * CUSTOMER_PARTY_BALANCES_PAGE_SIZE, filteredRows.length);

  const openCustomerLedger = (customerId: string) => {
    orgNavigate(`/customer-ledger-report?customer=${customerId}`);
  };

  const exportToExcel = useCallback(() => {
    if (filteredRows.length === 0) {
      toast({
        title: "No data to export",
        description: "Adjust filters or search to include customers.",
        variant: "destructive",
      });
      return;
    }

    const orgName = currentOrganization?.name || "";
    const exportedAt = format(new Date(), "dd-MM-yyyy HH:mm");
    const filterLabel =
      directionFilter === "all" ? "All" : directionFilter === "Dr" ? "Debit only" : "Credit only";

    const sheetRows: (string | number)[][] = [
      ["Customer Balances"],
      [orgName],
      [`Exported: ${exportedAt}`],
      [`Filter: ${filterLabel}${showSettled ? "" : " · settled hidden"}`],
      [],
      ["Total Receivable (Dr)", fmtAmt(Math.abs(orgTotals.totalDr))],
      ["Total Credit (Cr)", fmtAmt(Math.abs(orgTotals.totalCr))],
      ["Net Receivable", fmtAmt(Math.abs(orgTotals.netReceivable))],
      [],
      ["Sr No", "Party Name", "Phone", "Amount", "Dr/Cr"],
      ...filteredRows.map((row, index) => [
        index + 1,
        row.customer_name,
        row.phone || "",
        partyBalanceDisplayAmount(row.signed_balance),
        partyBalanceDirection(row),
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    ws["!cols"] = [{ wch: 8 }, { wch: 36 }, { wch: 16 }, { wch: 14 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customer Balances");
    XLSX.writeFile(wb, `Customer_Balances_${format(new Date(), "yyyy-MM-dd")}.xlsx`);

    toast({
      title: "Exported",
      description: `${filteredRows.length.toLocaleString("en-IN")} parties exported to Excel`,
    });
  }, [filteredRows, currentOrganization?.name, directionFilter, showSettled, orgTotals, toast]);

  const exportToPdf = useCallback(() => {
    if (filteredRows.length === 0) {
      toast({
        title: "No data to export",
        description: "Adjust filters or search to include customers.",
        variant: "destructive",
      });
      return;
    }

    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 10;
    let y = 14;

    const addPageHeader = () => {
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Customer Balances", margin, y);
      y += 6;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`${currentOrganization?.name || ""} · ${format(new Date(), "dd-MM-yyyy HH:mm")}`, margin, y);
      y += 5;
      const filterLabel =
        directionFilter === "all" ? "All" : directionFilter === "Dr" ? "Debit only" : "Credit only";
      doc.text(
        `Filter: ${filterLabel}${showSettled ? "" : " · settled hidden"} · ${filteredRows.length.toLocaleString("en-IN")} parties`,
        margin,
        y,
      );
      y += 7;

      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("Sr.", margin, y);
      doc.text("Party Name", margin + 10, y);
      doc.text("Phone", pageWidth - 78, y);
      doc.text("Amount", pageWidth - 48, y, { align: "right" });
      doc.text("Dr/Cr", pageWidth - margin, y, { align: "right" });
      y += 1;
      doc.line(margin, y, pageWidth - margin, y);
      y += 4;
      doc.setFont("helvetica", "normal");
    };

    addPageHeader();

    filteredRows.forEach((row, index) => {
      if (y > 275) {
        doc.addPage();
        y = 14;
        addPageHeader();
      }

      const direction = partyBalanceDirection(row);
      const amount = partyBalanceDisplayAmount(row.signed_balance);
      const name = row.customer_name.length > 42 ? `${row.customer_name.slice(0, 42)}…` : row.customer_name;
      const phone = (row.phone || "").slice(0, 14);

      doc.setFontSize(8);
      doc.text(String(index + 1), margin, y);
      doc.text(name, margin + 10, y);
      doc.text(phone, pageWidth - 78, y);
      doc.text(fmtAmt(amount), pageWidth - 48, y, { align: "right" });
      doc.text(direction, pageWidth - margin, y, { align: "right" });
      y += 5;
    });

    if (y > 260) {
      doc.addPage();
      y = 14;
    }
    y += 3;
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.text("Total Receivable (Dr)", margin, y);
    doc.text(`₹${fmtAmt(Math.abs(orgTotals.totalDr))}`, pageWidth - margin, y, { align: "right" });
    y += 5;
    doc.text("Total Credit (Cr)", margin, y);
    doc.text(`₹${fmtAmt(Math.abs(orgTotals.totalCr))}`, pageWidth - margin, y, { align: "right" });
    y += 5;
    doc.text("Net Receivable", margin, y);
    doc.text(`₹${fmtAmt(Math.abs(orgTotals.netReceivable))}`, pageWidth - margin, y, { align: "right" });

    doc.save(`Customer_Balances_${format(new Date(), "yyyy-MM-dd")}.pdf`);

    toast({
      title: "Exported",
      description: `${filteredRows.length.toLocaleString("en-IN")} parties exported to PDF`,
    });
  }, [filteredRows, currentOrganization?.name, directionFilter, showSettled, orgTotals, toast]);

  const directionFilterOptions: { value: PartyDirectionFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "Dr", label: "Dr" },
    { value: "Cr", label: "Cr" },
  ];

  if (!orgId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Select an organization to view customer balances.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "customer-party-balances-workspace customer-party-balances-dashboard flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full",
      )}
    >
      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-2">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-sm shrink-0"
              onClick={() => orgNavigate("/accounts")}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Accounts
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-teal-700 tracking-tight leading-none flex items-center gap-2">
                <Users className="h-5 w-5 shrink-0" />
                Customer Balances
              </h1>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                {isFetching && !isLoading ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Refreshing…
                  </span>
                ) : (
                  <>
                    {rows.length.toLocaleString("en-IN")} parties loaded
                    {!showSettled ? " · settled hidden" : ""}
                  </>
                )}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-9 text-sm shrink-0"
          >
            <RefreshCw className={cn("h-4 w-4 mr-1.5", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* Org totals — compact strip */}
        <div className="grid grid-cols-3 gap-2 w-full shrink-0">
          <div className="rounded-lg bg-gradient-to-br from-red-500 to-red-600 px-3 py-2 min-w-0 shadow-sm">
            <p className="text-xs font-medium text-white/80 leading-none">Total Receivable (Dr)</p>
            <p className="text-base sm:text-lg font-black text-white tabular-nums leading-tight mt-1 truncate">
              ₹{fmtAmt(Math.abs(orgTotals.totalDr))}
            </p>
          </div>
          <div className="rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 px-3 py-2 min-w-0 shadow-sm">
            <p className="text-xs font-medium text-white/80 leading-none">Total Credit (Cr)</p>
            <p className="text-base sm:text-lg font-black text-white tabular-nums leading-tight mt-1 truncate">
              ₹{fmtAmt(Math.abs(orgTotals.totalCr))}
            </p>
          </div>
          <div className="rounded-lg bg-gradient-to-br from-slate-600 to-slate-700 px-3 py-2 min-w-0 shadow-sm">
            <p className="text-xs font-medium text-white/80 leading-none">Net Receivable</p>
            <p className="text-base sm:text-lg font-black text-white tabular-nums leading-tight mt-1 truncate">
              ₹{fmtAmt(Math.abs(orgTotals.netReceivable))}
            </p>
          </div>
        </div>

        {/* Party list — primary focus */}
        <Card className="rounded-lg border border-slate-200 shadow-sm overflow-hidden p-0 flex-1 min-h-0 flex flex-col">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-100 bg-white shrink-0">
            <div className="relative flex-1 min-w-[200px] max-w-lg">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or phone…"
                className="pl-10 h-10 text-base border-slate-200 bg-slate-50 focus:bg-white"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Switch id="show-settled" checked={showSettled} onCheckedChange={setShowSettled} />
              <Label htmlFor="show-settled" className="text-sm font-normal cursor-pointer whitespace-nowrap">
                Show settled (₹0)
              </Label>
            </div>
            <div className="flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 shrink-0">
              {directionFilterOptions.map(({ value, label }) => (
                <Button
                  key={value}
                  type="button"
                  variant={directionFilter === value ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-8 px-3 text-sm font-semibold",
                    directionFilter === value
                      ? value === "Dr"
                        ? "bg-red-600 hover:bg-red-600 text-white"
                        : value === "Cr"
                          ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                          : "bg-slate-700 hover:bg-slate-700 text-white"
                      : "text-slate-600",
                  )}
                  onClick={() => setDirectionFilter(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 ml-auto shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={exportToExcel}
                disabled={isLoading || filteredRows.length === 0}
                className="h-9 text-sm gap-1.5 border-slate-200"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Export Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportToPdf}
                disabled={isLoading || filteredRows.length === 0}
                className="h-9 text-sm gap-1.5 border-slate-200"
              >
                <FileText className="h-4 w-4" />
                Export PDF
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums pl-1">
                {filteredRows.length.toLocaleString("en-IN")} matching
              </span>
            </div>
          </div>

          {error ? (
            <div className="m-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              Failed to load balances: {(error as Error).message}
            </div>
          ) : isLoading ? (
            <div className="p-2">
              <ReportSkeleton />
            </div>
          ) : (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-white tab-scroll-stable">
                <Table className="[&_td]:px-4 [&_th]:px-4">
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow className="bg-slate-800 hover:bg-slate-800 border-none">
                      <TableHead className="h-10 w-[56px] text-xs font-bold uppercase tracking-wide text-white">
                        Sr.
                      </TableHead>
                      <TableHead className="h-10 text-xs font-bold uppercase tracking-wide text-white">
                        Party Name
                      </TableHead>
                      <TableHead className="h-10 text-right text-xs font-bold uppercase tracking-wide text-white w-[150px]">
                        Amount
                      </TableHead>
                      <TableHead className="h-10 text-center text-xs font-bold uppercase tracking-wide text-white w-[72px]">
                        Dr/Cr
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-20 text-center text-base text-muted-foreground">
                          {rows.length === 0 ? "No customers found." : "No matching customers."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedRows.map((row, index) => {
                        const direction = partyBalanceDirection(row);
                        const displayAmount = partyBalanceDisplayAmount(row.signed_balance);
                        const isDr = direction === "Dr";
                        const isCr = direction === "Cr";
                        const srNo = pageStart + index;

                        return (
                          <TableRow
                            key={row.customer_id}
                            className="h-11 cursor-pointer hover:bg-teal-50/80 dark:hover:bg-teal-950/20"
                            onClick={() => openCustomerLedger(row.customer_id)}
                            title="Open Customer Ledger"
                          >
                            <TableCell className="py-2.5 text-sm tabular-nums text-muted-foreground font-medium">
                              {srNo}
                            </TableCell>
                            <TableCell className="py-2.5 text-base font-medium">
                              {row.customer_name}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "py-2.5 text-right tabular-nums text-base font-semibold",
                                isDr && "text-red-600 dark:text-red-400",
                                isCr && "text-emerald-600 dark:text-emerald-400",
                              )}
                            >
                              {fmtAmt(displayAmount)}
                            </TableCell>
                            <TableCell className="py-2.5 text-center">
                              <span
                                className={cn(
                                  "inline-flex min-w-[2.75rem] justify-center rounded px-2 py-0.5 text-xs font-bold",
                                  isDr && "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
                                  isCr && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
                                  !isDr && !isCr && "bg-muted text-muted-foreground",
                                )}
                              >
                                {direction}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {filteredRows.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-slate-100 bg-white shrink-0">
                  <p className="text-sm text-slate-600 tabular-nums">
                    Showing {pageStart.toLocaleString("en-IN")}–{pageEnd.toLocaleString("en-IN")} of{" "}
                    {filteredRows.length.toLocaleString("en-IN")}
                    <span className="hidden sm:inline text-slate-400">
                      {" "}
                      · {CUSTOMER_PARTY_BALANCES_PAGE_SIZE} per page
                    </span>
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="h-9 text-sm px-3 border-slate-200"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <span className="text-sm text-slate-700 font-medium tabular-nums px-1">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="h-9 text-sm px-3 border-slate-200"
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
