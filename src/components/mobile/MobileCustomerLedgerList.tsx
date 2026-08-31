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
import { buildCsvFromReportTable } from "@/utils/reportCsvExport";
import {
  fetchCustomerPartyBalancesPayload,
  type CustomerPartyBalanceAlignedRow,
} from "@/utils/customerPartyBalanceSnapshot";
import { matchesPartyBalanceSearch } from "@/utils/customerPartyBalanceDisplay";

const fmt = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);

const LoadingRows = () => (
  <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
);

export function MobileCustomerLedgerList({
  orgId,
  onSelectParty,
}: {
  orgId?: string;
  onSelectParty: (row: CustomerPartyBalanceAlignedRow) => void;
}) {
  const [search, setSearch] = useState("");
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

  const visibleRows = useMemo(
    () => rows.filter((r) => matchesPartyBalanceSearch(r, search)),
    [rows, search],
  );

  const totals = useMemo(() => {
    let outstanding = 0;
    let advance = 0;
    for (const r of visibleRows) {
      const os = Number(r.gross_outstanding) || 0;
      if (os > 0) outstanding += os;
      advance += Number(r.advance_available) || 0;
    }
    return { outstanding, advance };
  }, [visibleRows]);

  const columns: ReportTableColumn<CustomerPartyBalanceAlignedRow>[] = [
    {
      key: "name",
      header: "Name",
      sticky: true,
      minWidth: "min-w-[120px]",
      csvText: (r) => (r.phone ? `${r.customer_name} — ${r.phone}` : r.customer_name),
      render: (r) => (
        <div className="min-w-[120px] max-w-[160px]">
          <p className="font-semibold truncate">{r.customer_name}</p>
          {r.phone ? <p className="text-[11px] text-muted-foreground truncate">{r.phone}</p> : null}
        </div>
      ),
    },
    {
      key: "outstanding",
      header: "Outstanding",
      align: "right",
      csvText: (r) => fmt(Number(r.gross_outstanding) || 0),
      render: (r) => {
        const n = Number(r.gross_outstanding) || 0;
        return <span className={cn(n > 0 && "text-destructive")}>{fmt(n)}</span>;
      },
    },
    {
      key: "advance",
      header: "Advance",
      align: "right",
      csvText: (r) => fmt(Number(r.advance_available) || 0),
      render: (r) => {
        const n = Number(r.advance_available) || 0;
        return <span className={cn(n > 0 && "text-emerald-600")}>{fmt(n)}</span>;
      },
    },
    {
      key: "net",
      header: "Net",
      align: "right",
      csvText: (r) => fmt(Number(r.net_position) || 0),
      render: (r) => <span className="font-bold">{fmt(Number(r.net_position) || 0)}</span>,
    },
  ];

  return (
    <div className="space-y-3 overflow-x-hidden">
      <MobileReportSearchBar value={search} onChange={setSearch} placeholder="Search name or phone…" />
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-sky-700">Summary</p>
        {visibleRows.length ? (
          <ReportExportButton
            fileBaseName={`customer-balances-${format(new Date(), "ddMMyyyy")}`}
            buildCsv={() => buildCsvFromReportTable(columns, visibleRows)}
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
            <MetricCard label="Customers" value={String(visibleRows.length)} />
            <MetricCard label="Total Outstanding" value={fmt(totals.outstanding)} color="text-destructive" />
            <MetricCard label="Total Advance" value={fmt(totals.advance)} color="text-emerald-600" />
          </div>
          {!partyBalancesComplete ? (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200/80 rounded-lg px-3 py-2">
              Showing directory balances — full totals timed out, try refining your search
            </p>
          ) : null}
          {!visibleRows.length ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-sm">No parties match this search</p>
            </div>
          ) : (
            <MobileReportTable
              ref={tableRef}
              variant="statement"
              columns={columns}
              rows={visibleRows}
              rowKey={(r) => r.customer_id}
              onRowClick={onSelectParty}
            />
          )}
        </>
      )}
    </div>
  );
}
