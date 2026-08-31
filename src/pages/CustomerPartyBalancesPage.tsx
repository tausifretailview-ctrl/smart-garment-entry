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
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import type * as XLSXType from "xlsx";
/** Lazily loaded on export — keeps the xlsx bundle off this page's initial chunk. */
let xlsxModulePromise: Promise<typeof XLSXType> | null = null;
const loadXlsx = (): Promise<typeof XLSXType> => (xlsxModulePromise ??= import("xlsx"));

import type jsPDFType from "jspdf";
/** Lazily loaded on export — keeps jsPDF/html2canvas off this page's initial chunk. */
let jsPdfPromise: Promise<typeof jsPDFType> | null = null;
const loadJsPdf = (): Promise<typeof jsPDFType> =>
  (jsPdfPromise ??= import("jspdf").then((m) => m.default));

import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { MobileCustomerLedgerList } from "@/components/mobile/MobileCustomerLedgerList";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { STALE_REFERENCE } from "@/lib/queryStaleTimes";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportSkeleton } from "@/components/ui/skeletons";
import { ListPageSkeleton } from "@/components/skeletons/ListPageSkeleton";
import { QuietRefreshHint } from "@/components/QuietRefreshBar";
import { cn } from "@/lib/utils";
import {
  fetchCustomerPartyBalancesPayload,
  enrichPartyRowsWithCanonicalBalance,
  PARTY_BALANCE_CANONICAL_ENRICH_MAX,
  partyBalanceRowFacets,
  type CustomerPartyBalanceAlignedRow,
} from "@/utils/customerPartyBalanceSnapshot";
import { useOrganizationReceivablesSummary } from "@/hooks/useOrganizationReceivablesSummary";
import { CustomerLedger } from "@/components/CustomerLedger";
import {
  CUSTOMER_PARTY_BALANCES_PAGE_SIZE,
  clampPartyBalancePage,
  filterPartyBalanceRows,
  includeSettledInPartyBalanceList,
  partyBalanceDirection,
  partyBalanceTotalPages,
  slicePartyBalancePage,
  type PartyDirectionFilter,
} from "@/utils/customerPartyBalanceDisplay";
import {
  formatNetFacetLabel,
  summarizeAccountFacets,
} from "@/utils/customerAccountFacets";
import { useVisibilityInvalidate } from "@/hooks/useVisibilityRefetch";
import { getMoneyViewVisibilityQueryKeys } from "@/utils/moneyViewFreshnessInvalidation";

export type CustomerPartyBalanceRow = CustomerPartyBalanceAlignedRow;

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtAmt(n: number) {
  return inr.format(n);
}

export default function CustomerPartyBalancesPage() {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <MobileCustomerPartyBalancesScreen />;
  }
  return <CustomerPartyBalancesDesktop />;
}

function MobileCustomerPartyBalancesScreen() {
  const { currentOrganization } = useOrganization();
  return (
    <div className="flex flex-col min-h-screen bg-muted/30 pb-24">
      <MobilePageHeader title="Customer Balances" backTo="/" />
      <div className="px-2 pt-3 flex-1 min-h-0">
        <MobileCustomerLedgerList orgId={currentOrganization?.id} />
      </div>
      <MobileBottomNav />
    </div>
  );
}

function CustomerPartyBalancesDesktop() {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showSettled, setShowSettled] = useState(false);
  const [directionFilter, setDirectionFilter] = useState<PartyDirectionFilter>("all");
  const [page, setPage] = useState(1);
  const [ledgerCustomerId, setLedgerCustomerId] = useState<string | null>(null);
  const [ledgerCustomerName, setLedgerCustomerName] = useState("");
  const [ledgerCustomerPhone, setLedgerCustomerPhone] = useState<string | undefined>();

  const orgId = currentOrganization?.id;
  const moneyViewVisibilityKeys = useMemo(
    () => (orgId ? getMoneyViewVisibilityQueryKeys(orgId) : []),
    [orgId],
  );
  useVisibilityInvalidate(moneyViewVisibilityKeys);

  /** Profile fetch before embedded ledger — avoids CustomerLedger stub with opening_balance=0. */
  const {
    data: ledgerCustomerProfile,
    isLoading: ledgerProfileLoading,
    error: ledgerProfileError,
  } = useQuery({
    queryKey: ["party-balances-ledger-customer", orgId, ledgerCustomerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, customer_name, phone, address, opening_balance, created_at")
        .eq("organization_id", orgId!)
        .eq("id", ledgerCustomerId!)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId && !!ledgerCustomerId,
    staleTime: STALE_REFERENCE,
    refetchOnWindowFocus: false,
  });

  /** Non-zero OB: omit name/phone so CustomerLedger loads profile before building transactions. */
  const ledgerOpeningBalance = Number(ledgerCustomerProfile?.opening_balance ?? 0);
  const deferLedgerCustomerStub = ledgerOpeningBalance !== 0;

  const { data: partyPayload, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["customer-party-balances", orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async () => fetchCustomerPartyBalancesPayload(orgId!),
  });

  const rows = partyPayload?.rows ?? [];
  const partyBalancesComplete = partyPayload?.partyBalancesComplete !== false;

  const { summary: orgReceivablesSummary } = useOrganizationReceivablesSummary(orgId, {
    enabled: !!orgId && !partyBalancesComplete,
  });

  /** Outstanding (unnetted) / Credit pool / Net — same facets as Customer Ledger. */
  const orgTotals = useMemo(() => {
    if (!partyBalancesComplete) {
      return {
        totalOutstandingDr: orgReceivablesSummary.grossReceivableDr,
        totalCreditPoolCr: orgReceivablesSummary.customerCreditPoolCr,
        netReceivable: orgReceivablesSummary.netReceivable,
      };
    }
    const facets = rows.map((r) => partyBalanceRowFacets(r));
    const t = summarizeAccountFacets(facets);
    return {
      totalOutstandingDr: t.totalOutstandingDr,
      totalCreditPoolCr: t.totalCreditPoolCr,
      netReceivable: t.netReceivable,
    };
  }, [rows, partyBalancesComplete, orgReceivablesSummary]);

  const filteredRows = useMemo(
    () =>
      filterPartyBalanceRows(rows, {
        search,
        showSettled,
        directionFilter,
      }),
    [rows, search, showSettled, directionFilter],
  );
  const searchIncludesSettled =
    !showSettled && includeSettledInPartyBalanceList(showSettled, search);

  const totalPages = partyBalanceTotalPages(filteredRows.length);
  const currentPage = clampPartyBalancePage(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [search, showSettled, directionFilter]);

  const filteredRowKey = useMemo(
    () => filteredRows.map((r) => r.customer_id).join(","),
    [filteredRows],
  );

  /** When search/filter narrows the list, enrich all filtered rows once (Hanif bhai search). */
  const enrichFilteredSubset = filteredRows.length > 0 && filteredRows.length <= PARTY_BALANCE_CANONICAL_ENRICH_MAX;
  const { data: canonicalFilteredRows } = useQuery({
    queryKey: ["customer-party-balances-canonical-filtered", orgId, filteredRowKey],
    enabled: Boolean(orgId && enrichFilteredSubset),
    staleTime: 30_000,
    queryFn: () => enrichPartyRowsWithCanonicalBalance(orgId!, filteredRows),
  });

  const rowsForList = enrichFilteredSubset ? (canonicalFilteredRows ?? filteredRows) : filteredRows;

  const paginatedRows = useMemo(
    () => slicePartyBalancePage(rowsForList, currentPage),
    [rowsForList, currentPage],
  );

  const paginatedRowKey = useMemo(
    () => paginatedRows.map((r) => r.customer_id).join(","),
    [paginatedRows],
  );

  /** Large org: enrich visible page only (subset search uses canonicalFilteredRows above). */
  const { data: displayPaginatedRows } = useQuery({
    queryKey: ["customer-party-balances-canonical-page", orgId, paginatedRowKey],
    enabled: Boolean(orgId && !enrichFilteredSubset && paginatedRows.length > 0),
    staleTime: 30_000,
    queryFn: () => enrichPartyRowsWithCanonicalBalance(orgId!, paginatedRows),
  });

  const tableRows = enrichFilteredSubset ? paginatedRows : (displayPaginatedRows ?? paginatedRows);

  const pageStart = filteredRows.length === 0 ? 0 : (currentPage - 1) * CUSTOMER_PARTY_BALANCES_PAGE_SIZE + 1;
  const pageEnd = Math.min(currentPage * CUSTOMER_PARTY_BALANCES_PAGE_SIZE, filteredRows.length);

  const openCustomerLedger = (row: CustomerPartyBalanceRow) => {
    setLedgerCustomerId(row.customer_id);
    setLedgerCustomerName(row.customer_name);
    setLedgerCustomerPhone(row.phone);
  };

  const closeCustomerLedger = () => {
    setLedgerCustomerId(null);
    setLedgerCustomerName("");
    setLedgerCustomerPhone(undefined);
  };

  useEffect(() => {
    if (!ledgerCustomerId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      closeCustomerLedger();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ledgerCustomerId]);

  const exportToExcel = useCallback(async () => {
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
      ["Total Outstanding (Dr)", fmtAmt(orgTotals.totalOutstandingDr)],
      ["Total Credit / Advances (Cr)", fmtAmt(orgTotals.totalCreditPoolCr)],
      ["Net Receivable", fmtAmt(orgTotals.netReceivable)],
      [],
      ["Sr No", "Party Name", "Phone", "Outstanding", "Advance", "Net", "Dr/Cr"],
      ...filteredRows.map((row, index) => {
        const f = partyBalanceRowFacets(row);
        return [
          index + 1,
          row.customer_name,
          row.phone || "",
          f.outstanding,
          f.unusedAdvance,
          f.netPosition,
          partyBalanceDirection(row),
        ];
      }),
    ];

    const XLSX = await loadXlsx();
    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    ws["!cols"] = [{ wch: 8 }, { wch: 36 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customer Balances");
    XLSX.writeFile(wb, `Customer_Balances_${format(new Date(), "yyyy-MM-dd")}.xlsx`);

    toast({
      title: "Exported",
      description: `${filteredRows.length.toLocaleString("en-IN")} parties exported to Excel`,
    });
  }, [filteredRows, currentOrganization?.name, directionFilter, showSettled, orgTotals, toast]);

  const exportToPdf = useCallback(async () => {
    if (filteredRows.length === 0) {
      toast({
        title: "No data to export",
        description: "Adjust filters or search to include customers.",
        variant: "destructive",
      });
      return;
    }

    const jsPDF = await loadJsPdf();
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

      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text("Sr.", margin, y);
      doc.text("Party", margin + 8, y);
      doc.text("Outst.", pageWidth - 72, y, { align: "right" });
      doc.text("Adv.", pageWidth - 50, y, { align: "right" });
      doc.text("Net", pageWidth - 28, y, { align: "right" });
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
      const f = partyBalanceRowFacets(row);
      const name = row.customer_name.length > 28 ? `${row.customer_name.slice(0, 28)}…` : row.customer_name;

      doc.setFontSize(7);
      doc.text(String(index + 1), margin, y);
      doc.text(name, margin + 8, y);
      doc.text(fmtAmt(f.outstanding), pageWidth - 72, y, { align: "right" });
      doc.text(fmtAmt(f.unusedAdvance), pageWidth - 50, y, { align: "right" });
      doc.text(fmtAmt(Math.abs(f.netPosition)), pageWidth - 28, y, { align: "right" });
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
    doc.text("Total Outstanding (Dr)", margin, y);
    doc.text(`₹${fmtAmt(orgTotals.totalOutstandingDr)}`, pageWidth - margin, y, { align: "right" });
    y += 5;
    doc.text("Total Credit / Advances (Cr)", margin, y);
    doc.text(`₹${fmtAmt(orgTotals.totalCreditPoolCr)}`, pageWidth - margin, y, { align: "right" });
    y += 5;
    doc.text("Net Receivable", margin, y);
    doc.text(`₹${fmtAmt(orgTotals.netReceivable)}`, pageWidth - margin, y, { align: "right" });

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

  if (ledgerCustomerId) {
    const ledgerDisplayName =
      ledgerCustomerProfile?.customer_name?.trim() || ledgerCustomerName || "Customer";

    return (
      <div
        className={cn(
          "customer-party-balances-workspace customer-party-balances-dashboard flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full",
        )}
      >
        <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-2">
          <div className="flex flex-wrap items-center gap-2 shrink-0 px-1">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-sm shrink-0"
              onClick={closeCustomerLedger}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Balances
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-teal-700 tracking-tight truncate flex items-center gap-2">
                <Users className="h-5 w-5 shrink-0" />
                {ledgerDisplayName}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">Customer ledger</p>
            </div>
          </div>
          <div className="customer-party-balances-ledger-panel flex-1 min-h-0 flex flex-col overflow-hidden w-full">
            {ledgerProfileLoading ? (
              <ListPageSkeleton
                rows={6}
                columns={4}
                showToolbar={false}
                className="flex-1 min-h-[12rem]"
              />
            ) : ledgerProfileError ? (
              <div className="m-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-4 text-sm text-destructive">
                Failed to load customer: {(ledgerProfileError as Error).message}
              </div>
            ) : (
              <CustomerLedger
                key={`${ledgerCustomerId}-${deferLedgerCustomerStub ? "ob" : "std"}`}
                organizationId={orgId!}
                preSelectedCustomerId={ledgerCustomerId}
                preSelectedCustomerName={
                  deferLedgerCustomerStub
                    ? undefined
                    : ledgerCustomerProfile?.customer_name?.trim() || ledgerCustomerName
                }
                preSelectedCustomerPhone={
                  deferLedgerCustomerStub
                    ? undefined
                    : ledgerCustomerProfile?.phone ?? ledgerCustomerPhone
                }
                embedMode
                skipUrlSync
                embeddedBackLabel="Back to Balances"
                onEmbeddedBack={closeCustomerLedger}
              />
            )}
          </div>
        </div>
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
                <QuietRefreshHint
                  queryKey={["customer-party-balances", orgId]}
                  idle={
                    <>
                      {rows.length.toLocaleString("en-IN")} parties loaded
                      {searchIncludesSettled
                        ? " · search includes settled"
                        : !showSettled
                          ? " · list hides settled · cards are all parties"
                          : ""}
                    </>
                  }
                />
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
            <p className="text-xs font-medium text-white/80 leading-none">Total Outstanding (Dr)</p>
            <p className="text-base sm:text-lg font-black text-white tabular-nums leading-tight mt-1 truncate">
              ₹{fmtAmt(orgTotals.totalOutstandingDr)}
            </p>
            <p className="text-[10px] text-white/70 mt-0.5 truncate">Gross — advance on the same party is not netted</p>
          </div>
          <div className="rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 px-3 py-2 min-w-0 shadow-sm">
            <p className="text-xs font-medium text-white/80 leading-none">Total Credit (Cr)</p>
            <p className="text-base sm:text-lg font-black text-white tabular-nums leading-tight mt-1 truncate">
              ₹{fmtAmt(orgTotals.totalCreditPoolCr)}
            </p>
            <p className="text-[10px] text-white/70 mt-0.5 truncate">Unused advances + invoice credits (CN / overpay)</p>
          </div>
          <div className="rounded-lg bg-gradient-to-br from-slate-600 to-slate-700 px-3 py-2 min-w-0 shadow-sm">
            <p className="text-xs font-medium text-white/80 leading-none">Net Receivable</p>
            <p className="text-base sm:text-lg font-black text-white tabular-nums leading-tight mt-1 truncate">
              {formatNetFacetLabel(orgTotals.netReceivable)}
            </p>
            <p className="text-[10px] text-white/70 mt-0.5 truncate">All parties, including settled</p>
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
          ) : !partyBalancesComplete ? (
            <div className="mx-2 mt-2 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Full balance totals are still loading for this organization. You can search parties by name or phone;
              per-party amounts may show opening balance only until you tap Refresh.
            </div>
          ) : null}

          {error ? null : isLoading ? (
            <div className="p-2">
              <ReportSkeleton />
            </div>
          ) : (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-white tab-scroll-stable">
                <Table className="[&_td]:px-4 [&_th]:px-4">
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow className="bg-slate-800 hover:bg-slate-800 border-none">
                      <TableHead className="h-10 w-[48px] text-xs font-bold uppercase tracking-wide text-white">
                        Sr.
                      </TableHead>
                      <TableHead className="h-10 text-xs font-bold uppercase tracking-wide text-white">
                        Party Name
                      </TableHead>
                      <TableHead className="h-10 text-right text-xs font-bold uppercase tracking-wide text-white w-[120px]">
                        Outstanding
                      </TableHead>
                      <TableHead className="h-10 text-right text-xs font-bold uppercase tracking-wide text-white w-[110px]">
                        Advance
                      </TableHead>
                      <TableHead className="h-10 text-right text-xs font-bold uppercase tracking-wide text-white w-[130px]">
                        Net
                      </TableHead>
                      <TableHead className="h-10 text-center text-xs font-bold uppercase tracking-wide text-white w-[72px]">
                        Dr/Cr
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-20 text-center text-base text-muted-foreground">
                          {rows.length === 0 ? "No customers found." : "No matching customers."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      tableRows.map((row, index) => {
                        const direction = partyBalanceDirection(row);
                        const f = partyBalanceRowFacets(row);
                        const isDr = direction === "Dr";
                        const isCr = direction === "Cr";
                        const srNo = pageStart + index;

                        return (
                          <TableRow
                            key={row.customer_id}
                            className="h-11 cursor-pointer hover:bg-teal-50/80 dark:hover:bg-teal-950/20 active:bg-teal-100/80 dark:active:bg-teal-950/40"
                            onClick={() => openCustomerLedger(row)}
                            title="Open customer ledger"
                          >
                            <TableCell className="py-2.5 text-sm tabular-nums text-muted-foreground font-medium">
                              {srNo}
                            </TableCell>
                            <TableCell className="py-2.5 text-base font-medium">
                              {row.customer_name}
                            </TableCell>
                            <TableCell className="py-2.5 text-right tabular-nums text-sm font-medium text-red-600 dark:text-red-400">
                              {fmtAmt(Math.abs(f.outstanding))}
                            </TableCell>
                            <TableCell className="py-2.5 text-right tabular-nums text-sm font-medium text-emerald-600 dark:text-emerald-400">
                              {fmtAmt(f.unusedAdvance)}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "py-2.5 text-right tabular-nums text-base font-semibold",
                                isDr && "text-red-600 dark:text-red-400",
                                isCr && "text-emerald-600 dark:text-emerald-400",
                              )}
                            >
                              ₹{fmtAmt(Math.abs(f.netPosition))}
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
                                {direction === "Settled" ? "—" : direction}
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
