import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { MobileReportSearchBar } from "@/components/mobile/MobileReportSearchBar";
import { MobileReportTable, type ReportTableColumn } from "@/components/mobile/MobileReportTable";
import { ReportExportButton } from "@/components/mobile/ReportExportButton";
import { MetricCard } from "@/components/mobile/MobileReportMetricCard";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { withMobileQueryTimeout } from "@/lib/mobileQueryTimeout";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useOrganizationReceivablesSummary } from "@/hooks/useOrganizationReceivablesSummary";
import { buildCsvFromReportTable } from "@/utils/reportCsvExport";
import {
  fetchCustomerPartyBalancesPayload,
  enrichPartyRowsWithCanonicalBalance,
  PARTY_BALANCE_CANONICAL_ENRICH_MAX,
  partyBalanceRowFacets,
  type CustomerPartyBalanceAlignedRow,
} from "@/utils/customerPartyBalanceSnapshot";
import {
  filterPartyBalanceRows,
  partyBalanceDirection,
  type PartyDirectionFilter,
} from "@/utils/customerPartyBalanceDisplay";
import { formatNetFacetLabel, summarizeAccountFacets } from "@/utils/customerAccountFacets";

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtAmt(n: number) {
  return inr.format(n);
}

const LoadingRows = () => (
  <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
);

export function MobileCustomerLedgerList({ orgId }: { orgId?: string }) {
  const { orgNavigate } = useOrgNavigation();
  const [search, setSearch] = useState("");
  const [showSettled, setShowSettled] = useState(false);
  const [directionFilter, setDirectionFilter] = useState<PartyDirectionFilter>("all");
  const tableRef = useRef<HTMLDivElement>(null);

  const { data: partyPayload, isLoading, isError, refetch } = useQuery({
    queryKey: ["customer-party-balances", orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    retry: 1,
    queryFn: () => withMobileQueryTimeout(() => fetchCustomerPartyBalancesPayload(orgId!), 25_000),
  });

  const rows = partyPayload?.rows ?? [];
  const partyBalancesComplete = partyPayload?.partyBalancesComplete !== false;

  const { summary: orgReceivablesSummary } = useOrganizationReceivablesSummary(orgId, {
    enabled: !!orgId && !partyBalancesComplete,
  });

  const orgTotals = useMemo(() => {
    if (!partyBalancesComplete) {
      return {
        totalOutstandingDr: orgReceivablesSummary.grossReceivableDr,
        totalCreditPoolCr: orgReceivablesSummary.customerCreditPoolCr,
        netReceivable: orgReceivablesSummary.netReceivable,
      };
    }
    const t = summarizeAccountFacets(rows.map((r) => partyBalanceRowFacets(r)));
    return {
      totalOutstandingDr: t.totalOutstandingDr,
      totalCreditPoolCr: t.totalCreditPoolCr,
      netReceivable: t.netReceivable,
    };
  }, [rows, partyBalancesComplete, orgReceivablesSummary]);

  const filteredRows = useMemo(
    () => filterPartyBalanceRows(rows, { search, showSettled, directionFilter }),
    [rows, search, showSettled, directionFilter],
  );

  const filteredRowKey = useMemo(
    () => filteredRows.map((r) => r.customer_id).join(","),
    [filteredRows],
  );

  const enrichFilteredSubset = filteredRows.length > 0 && filteredRows.length <= PARTY_BALANCE_CANONICAL_ENRICH_MAX;
  const { data: canonicalFilteredRows } = useQuery({
    queryKey: ["customer-party-balances-canonical-filtered", orgId, filteredRowKey],
    enabled: Boolean(orgId && enrichFilteredSubset),
    staleTime: 30_000,
    queryFn: () => enrichPartyRowsWithCanonicalBalance(orgId!, filteredRows),
  });

  const listRows = useMemo(() => {
    const source = enrichFilteredSubset ? (canonicalFilteredRows ?? filteredRows) : filteredRows;
    return source.slice(0, 400);
  }, [enrichFilteredSubset, canonicalFilteredRows, filteredRows]);

  const columns: ReportTableColumn<CustomerPartyBalanceAlignedRow>[] = [
    {
      key: "name",
      header: "Name",
      sticky: true,
      minWidth: "min-w-[120px]",
      csvText: (r) => r.customer_name,
      render: (r) => (
        <div className="min-w-[120px] max-w-[160px]">
          <p className="font-semibold truncate">{r.customer_name}</p>
          {partyBalanceDirection(r) === "Settled" ? (
            <span className="text-[10px] font-medium text-muted-foreground">Settled</span>
          ) : null}
        </div>
      ),
    },
    {
      key: "phone",
      header: "Phone",
      csvText: (r) => r.phone || "",
      render: (r) => <span className="text-muted-foreground">{r.phone || "—"}</span>,
    },
    {
      key: "outstanding",
      header: "Outstanding",
      align: "right",
      csvText: (r) => fmtAmt(partyBalanceRowFacets(r).outstanding),
      render: (r) => {
        const f = partyBalanceRowFacets(r);
        return (
          <span className={cn(f.outstanding > 0.5 && "text-destructive font-semibold")}>
            {fmtAmt(f.outstanding)}
          </span>
        );
      },
    },
    {
      key: "advance",
      header: "Advance",
      align: "right",
      csvText: (r) => fmtAmt(partyBalanceRowFacets(r).unusedAdvance),
      render: (r) => {
        const f = partyBalanceRowFacets(r);
        return (
          <span className={cn(f.unusedAdvance > 0.5 && "text-emerald-600 font-semibold")}>
            {fmtAmt(f.unusedAdvance)}
          </span>
        );
      },
    },
    {
      key: "net",
      header: "Net",
      align: "right",
      csvText: (r) => formatNetFacetLabel(partyBalanceRowFacets(r).netPosition),
      render: (r) => {
        const net = partyBalanceRowFacets(r).netPosition;
        return (
          <span
            className={cn(
              "font-bold",
              net > 0.5 ? "text-destructive" : net < -0.5 ? "text-emerald-600" : "text-muted-foreground",
            )}
          >
            {formatNetFacetLabel(net)}
          </span>
        );
      },
    },
  ];

  const openLedger = (row: CustomerPartyBalanceAlignedRow) => {
    orgNavigate(`/customer-ledger-report?customer=${encodeURIComponent(row.customer_id)}`);
  };

  return (
    <div className="space-y-3">
      <MobileReportSearchBar value={search} onChange={setSearch} placeholder="Search name or phone…" />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-border/40 p-0.5 w-fit">
          {([
            { value: "all" as const, label: "All" },
            { value: "Dr" as const, label: "Dr" },
            { value: "Cr" as const, label: "Cr" },
          ]).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDirectionFilter(opt.value)}
              className={cn(
                "px-2.5 py-1.5 rounded-md text-xs font-semibold touch-manipulation",
                directionFilter === opt.value ? "bg-primary/10 text-primary" : "text-muted-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground touch-manipulation">
          <input
            type="checkbox"
            checked={showSettled}
            onChange={(e) => setShowSettled(e.target.checked)}
            className="rounded border-border"
          />
          Show settled (₹0)
        </label>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-sky-700">Summary</p>
        {listRows.length ? (
          <ReportExportButton
            fileBaseName={`customer-balances-${format(new Date(), "ddMMyyyy")}`}
            buildCsv={() => buildCsvFromReportTable(columns, listRows)}
            tableRef={tableRef}
          />
        ) : null}
      </div>
      {isLoading ? (
        <LoadingRows />
      ) : isError ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-muted-foreground text-sm">Could not load customer balances.</p>
          <button type="button" onClick={() => refetch()} className="text-sm font-semibold text-primary">
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            <MetricCard label="Outstanding" value={`₹${fmtAmt(orgTotals.totalOutstandingDr)}`} color="text-destructive" />
            <MetricCard label="Advance / Credit" value={`₹${fmtAmt(orgTotals.totalCreditPoolCr)}`} color="text-emerald-600" />
            <MetricCard label="Net" value={formatNetFacetLabel(orgTotals.netReceivable)} />
          </div>
          {!listRows.length ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-sm">No parties match these filters</p>
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold text-sky-700">
                Parties ({listRows.length}{filteredRows.length > listRows.length ? ` of ${filteredRows.length}` : ""})
              </p>
              <MobileReportTable
                ref={tableRef}
                variant="statement"
                columns={columns}
                rows={listRows}
                rowKey={(r) => r.customer_id}
                onRowClick={openLedger}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
