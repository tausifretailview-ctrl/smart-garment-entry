import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { AlertTriangle, Eye, FileSpreadsheet, Loader2, Printer, RefreshCw, Search, Truck, X } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useEwayBillOn } from "@/hooks/useEwayBillOn";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useToast } from "@/hooks/use-toast";
import { useTabCacheLayout } from "@/contexts/TabCacheLayoutContext";
import { useSharedAppShell } from "@/contexts/SharedAppShellContext";
import { useEwayBillAlerts } from "@/hooks/useEwayBillAlerts";
import { useEwayBillPrinter } from "@/hooks/useEwayBillPrinter";
import { ErpDashboardKpiCard } from "@/components/dashboard/ErpDashboardKpiCard";
import { SaleEwayBillDialog } from "@/components/ewaybill/SaleEwayBillDialog";
import { ChallanEwayBillDialog } from "@/components/ewaybill/ChallanEwayBillDialog";
import { ListTableSkeleton } from "@/components/skeletons/ListPageSkeleton";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  ewbAlertKind,
  ewbCancelUntil,
  ewbDdMmYyyy,
  ewbDocOf,
  ewbExtendUntil,
  ewbInRegisterView,
  ewbMatchesSearch,
  ewbModeName,
  ewbRegisterExcelRows,
  ewbValidity,
  fetchEwayBillRegister,
  formatEwbNo,
  formatIstDateTime,
  isEwbAlertView,
  parseEwbRegisterView,
  summarizeEwbAlerts,
  type EwayBillRegisterRow,
  type EwbRegisterView,
} from "@/utils/ewayBill";
import type * as XLSXType from "xlsx";

let xlsxModulePromise: Promise<typeof XLSXType> | null = null;
const loadXlsx = (): Promise<typeof XLSXType> => (xlsxModulePromise ??= import("xlsx"));

const VIEW_LABEL: Record<EwbRegisterView, string> = {
  all: "All",
  active: "Valid",
  soon: "Expiring within 8 hours",
  extend: "Lapsed, can still extend",
  partA: "Vehicle not added",
  expired: "Expired",
  cancelled: "Cancelled",
};

const TONE_CLASS: Record<string, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  soon: "border-amber-200 bg-amber-50 text-amber-800",
  expired: "border-red-200 bg-red-50 text-red-700",
  partA: "border-sky-200 bg-sky-50 text-sky-800",
  cancelled: "border-slate-200 bg-slate-100 text-slate-500",
};

function inr0(n: number | null | undefined): string {
  return `₹${Math.round(Number(n ?? 0)).toLocaleString("en-IN")}`;
}

/** Every e-way bill, what lapses soon, and a print for the driver (E-Way Bill switch on). */
export default function EwayBillRegister() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? "";
  const ewbOn = useEwayBillOn();
  const { orgNavigate } = useOrgNavigation();
  const inTabCache = useTabCacheLayout();
  const sharedShell = useSharedAppShell();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseEwbRegisterView(searchParams.get("view"));
  const setView = (v: EwbRegisterView) => {
    const next = new URLSearchParams(searchParams);
    if (v === "all") next.delete("view");
    else next.set("view", v);
    setSearchParams(next, { replace: true });
  };

  const [dateFrom, setDateFrom] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [search, setSearch] = useState("");
  const [openRow, setOpenRow] = useState<EwayBillRegisterRow | null>(null);
  const [exporting, setExporting] = useState(false);

  // Validity changes with the clock, so the page re-checks it each minute.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const register = useQuery({
    queryKey: ["eway-bill-register", orgId, dateFrom, dateTo],
    queryFn: () => fetchEwayBillRegister(orgId, dateFrom, dateTo),
    enabled: !!orgId && ewbOn,
    staleTime: 30_000,
  });
  const alerts = useEwayBillAlerts(orgId, !!orgId && ewbOn);
  const printer = useEwayBillPrinter(orgId);

  const periodRows = register.data?.rows ?? [];
  const missingSql = !!register.data?.missingSql || alerts.missingSql;
  const alertSummary = useMemo(() => summarizeEwbAlerts(alerts.rows, now), [alerts.rows, now]);

  const kpi = useMemo(() => {
    let active = 0;
    let expired = 0;
    let cancelled = 0;
    for (const r of periodRows) {
      const tone = ewbValidity(r, now).tone;
      if (tone === "ok" || tone === "soon") active += 1;
      else if (tone === "expired") expired += 1;
      else if (tone === "cancelled") cancelled += 1;
    }
    return { total: periodRows.length, active, expired, cancelled };
  }, [periodRows, now]);

  // Alert views follow the live alerts (any date); the rest follow the date range.
  const alertView = isEwbAlertView(view);
  const rows = useMemo(() => {
    const source = alertView ? alerts.rows : periodRows;
    return source.filter((r) => ewbInRegisterView(r, view, now) && ewbMatchesSearch(r, search));
  }, [alertView, alerts.rows, periodRows, view, now, search]);

  const refresh = () => {
    void register.refetch();
    void alerts.refetch();
  };
  const onChanged = () => {
    refresh();
    void queryClient.invalidateQueries({ queryKey: ["sale-eway-bills", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["eway-bills-for-sales", orgId] });
  };

  const exportExcel = async () => {
    if (exporting || rows.length === 0) return;
    setExporting(true);
    try {
      const XLSX = await loadXlsx();
      const ws = XLSX.utils.json_to_sheet(ewbRegisterExcelRows(rows, now));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "E-Way Bills");
      XLSX.writeFile(wb, `E-Way_Bills_${dateFrom}_to_${dateTo}.xlsx`);
    } catch (e) {
      toast({ variant: "destructive", title: "Excel not saved", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setExporting(false);
    }
  };

  if (!ewbOn) {
    return (
      <div className="flex h-full w-full items-start justify-center bg-slate-50 p-6">
        <Card className="max-w-lg border-slate-200 p-6 text-sm text-slate-600 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-base font-semibold text-slate-800">
            <Truck className="h-5 w-5 text-teal-600" />
            E-way bills
          </div>
          E-way bills are off for this shop. Turn on E-Way Bill in Settings &gt; Sale to make e-way bills of your bills.
        </Card>
      </div>
    );
  }

  const isLoading = alertView ? false : register.isLoading;
  const fetching = register.isFetching;

  return (
    <div
      className={cn(
        "purchase-dashboard-workspace flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50 px-2 py-2 sm:px-3",
        !inTabCache && !sharedShell && "h-[calc(100vh-3.5rem)]",
      )}
    >
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold leading-none tracking-tight text-teal-800">
              <Truck className="h-4 w-4 shrink-0 opacity-70" />
              E-Way Bills
            </h1>
            <p className="mt-1 text-sm text-slate-500">Every e-way bill of your bills, and what lapses soon</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" className="h-9 gap-1.5 border-slate-200 text-sm" onClick={refresh} disabled={fetching}>
              {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 border-slate-200 text-sm"
              onClick={() => void exportExcel()}
              disabled={exporting || rows.length === 0}
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Excel
            </Button>
            <Button
              size="sm"
              className="h-9 gap-1.5 bg-teal-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
              onClick={() => orgNavigate("/sales-invoice-dashboard")}
              title="Open an e-invoiced bill and press the truck button"
            >
              <Truck className="h-4 w-4" />
              New from a bill
            </Button>
          </div>
        </div>

        {missingSql ? (
          <div className="flex shrink-0 items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Run the Phase 2 step 4 SQL first: it adds the e-way bill table.
          </div>
        ) : null}

        <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 lg:gap-3">
          <ErpDashboardKpiCard
            title="E-way bills"
            subtitle={`${kpi.active} valid · in date range`}
            value={kpi.total.toLocaleString("en-IN")}
            shellClass="bg-teal-50 border-teal-200/70 hover:bg-teal-100/80"
            valueClass="text-teal-800"
            active={view === "all" || view === "active"}
            onClick={() => setView("all")}
          />
          <ErpDashboardKpiCard
            title="Expiring soon"
            subtitle={alertSummary.nextExpiry ? `Next ${formatIstDateTime(alertSummary.nextExpiry).slice(11)}` : "Within 8 hours"}
            value={alertSummary.soon.toLocaleString("en-IN")}
            shellClass="bg-amber-50 border-amber-200/70 hover:bg-amber-100/80"
            valueClass="text-amber-800"
            active={view === "soon"}
            onClick={() => setView("soon")}
          />
          <ErpDashboardKpiCard
            title="Lapsed, can extend"
            subtitle="Within 8 h of lapsing"
            value={alertSummary.extend.toLocaleString("en-IN")}
            shellClass="bg-rose-50 border-rose-200/70 hover:bg-rose-100/80"
            valueClass="text-rose-700"
            active={view === "extend"}
            onClick={() => setView("extend")}
          />
          <ErpDashboardKpiCard
            title="Vehicle not added"
            subtitle="Part A only"
            value={alertSummary.partA.toLocaleString("en-IN")}
            shellClass="bg-sky-50 border-sky-200/70 hover:bg-sky-100/80"
            valueClass="text-sky-800"
            active={view === "partA"}
            onClick={() => setView("partA")}
          />
          <ErpDashboardKpiCard
            title="Expired"
            subtitle="In date range"
            value={kpi.expired.toLocaleString("en-IN")}
            shellClass="bg-slate-50 border-slate-200/70 hover:bg-slate-100/80"
            valueClass="text-slate-700"
            active={view === "expired"}
            onClick={() => setView("expired")}
          />
          <ErpDashboardKpiCard
            title="Cancelled"
            subtitle="In date range"
            value={kpi.cancelled.toLocaleString("en-IN")}
            shellClass="bg-white border-slate-200/70 hover:bg-slate-50"
            valueClass="text-slate-500"
            active={view === "cancelled"}
            onClick={() => setView("cancelled")}
          />
        </div>

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 p-0 shadow-sm">
          <div className="flex shrink-0 flex-wrap items-center gap-2 overflow-x-auto border-b border-slate-100 bg-white px-3 py-2.5">
            <div className="relative min-w-[180px] max-w-full flex-1 sm:max-w-md md:max-w-lg">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="EWB no, bill no, customer, vehicle, transporter..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="no-uppercase h-9 border-slate-200 bg-slate-50 pl-9 text-sm focus:bg-white"
              />
            </div>
            {alertView ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                {VIEW_LABEL[view]} · any date
                <button type="button" onClick={() => setView("all")} aria-label="Show all" className="rounded-full hover:bg-amber-100">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ) : (
              <>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => e.target.value && setDateFrom(e.target.value)}
                  className="h-9 w-[150px] border-slate-200 bg-slate-50 text-sm"
                  aria-label="From date"
                />
                <span className="text-xs text-slate-400">to</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => e.target.value && setDateTo(e.target.value)}
                  className="h-9 w-[150px] border-slate-200 bg-slate-50 text-sm"
                  aria-label="To date"
                />
                {view !== "all" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                    {VIEW_LABEL[view]}
                    <button type="button" onClick={() => setView("all")} aria-label="Show all" className="rounded-full hover:bg-slate-200">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ) : null}
              </>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {isLoading ? (
              <ListTableSkeleton />
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center text-sm text-slate-500">
                <Truck className="h-8 w-8 text-slate-300" />
                {search.trim()
                  ? "No e-way bill matches the search."
                  : alertView
                    ? "Nothing here right now."
                    : "No e-way bills in this period. Make one with the truck button on the Sales Invoice or Delivery Challan list."}
              </div>
            ) : (
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-slate-50">
                  <TableRow>
                    <TableHead className="w-[170px]">EWB No</TableHead>
                    <TableHead className="w-[130px]">Bill</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Transport</TableHead>
                    <TableHead className="w-[220px]">Validity</TableHead>
                    <TableHead className="w-[96px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const v = ewbValidity(r, now);
                    const kind = ewbAlertKind(r, now);
                    const extendUntil = kind === "extend" ? ewbExtendUntil(r.valid_till) : null;
                    const cancelUntil = ewbCancelUntil(r, now);
                    const mode = ewbModeName(r.trans_mode);
                    const doc = ewbDocOf(r);
                    const canOpen = !!r.sales || !!r.delivery_challans;
                    return (
                      <TableRow key={r.id} className="text-sm">
                        <TableCell>
                          <button
                            type="button"
                            className="font-mono font-semibold tracking-wide text-teal-800 hover:underline disabled:no-underline"
                            onClick={() => canOpen && setOpenRow(r)}
                            disabled={!canOpen}
                          >
                            {formatEwbNo(r.ewb_no)}
                          </button>
                          <div className="flex items-center gap-1.5 text-xs text-slate-400">
                            {formatIstDateTime(r.ewb_date)}
                            {r.test_mode ? (
                              <span className="rounded bg-amber-100 px-1 text-[9px] font-semibold uppercase text-amber-700">Sandbox</span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-slate-800">{doc.number || "—"}</div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-400">
                            {ewbDdMmYyyy(doc.date)}
                            {doc.kind === "challan" ? (
                              <span className="rounded bg-sky-50 px-1 text-[9px] font-semibold uppercase text-sky-700 ring-1 ring-sky-200">Challan</span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate font-medium text-slate-700">{doc.party || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums text-slate-800">{doc.value !== null ? inr0(doc.value) : "—"}</TableCell>
                        <TableCell>
                          <div className="font-mono text-xs font-semibold text-slate-800">
                            {r.vehicle_no || (r.trans_doc_no ? `${r.trans_doc_no}` : "—")}
                          </div>
                          <div className="max-w-[220px] truncate text-xs text-slate-400">
                            {[mode, r.distance_km ? `${r.distance_km} km` : "", r.transporter_name || r.transporter_id || ""].filter(Boolean).join(" · ")}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium", TONE_CLASS[v.tone])}>{v.label}</span>
                          {extendUntil ? (
                            <div className="mt-0.5 text-[11px] font-medium text-red-600">Extend by {formatIstDateTime(extendUntil)}</div>
                          ) : cancelUntil ? (
                            <div className="mt-0.5 text-[11px] text-slate-400">Can cancel till {formatIstDateTime(cancelUntil).slice(11)}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-500 hover:text-teal-700"
                              onClick={() => setOpenRow(r)}
                              disabled={!canOpen}
                              title="Open"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-500 hover:text-teal-700"
                              onClick={() => void printer.print(r)}
                              disabled={printer.printingId === r.id || r.status === "cancelled"}
                              title="Print e-way bill"
                            >
                              {printer.printingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
          {rows.length > 0 ? (
            <div className="shrink-0 border-t border-slate-100 bg-white px-3 py-1.5 text-xs text-slate-500">
              {rows.length.toLocaleString("en-IN")} e-way bill{rows.length === 1 ? "" : "s"}
              {!alertView && periodRows.length >= 2000 ? " (first 2000; narrow the dates)" : ""}
            </div>
          ) : null}
        </Card>
      </div>

      {printer.printNode}

      {orgId ? (
        <SaleEwayBillDialog
          open={!!openRow && !openRow.delivery_challans}
          onOpenChange={(o) => {
            if (!o) setOpenRow(null);
          }}
          organizationId={orgId}
          sale={
            openRow?.sales && !openRow.delivery_challans
              ? {
                  id: openRow.sales.id,
                  sale_number: openRow.sales.sale_number,
                  sale_date: String(openRow.sales.sale_date ?? ""),
                  net_amount: openRow.sales.net_amount,
                  customer_name: openRow.sales.customer_name,
                  irn: openRow.sales.irn,
                  einvoice_status: openRow.sales.einvoice_status,
                  einvoice_test_mode: openRow.sales.einvoice_test_mode ?? openRow.test_mode,
                }
              : null
          }
          ewayBill={openRow}
          missingSql={missingSql}
          onChanged={onChanged}
        />
      ) : null}

      {orgId ? (
        <ChallanEwayBillDialog
          open={!!openRow?.delivery_challans}
          onOpenChange={(o) => {
            if (!o) setOpenRow(null);
          }}
          organizationId={orgId}
          challan={
            openRow?.delivery_challans
              ? {
                  id: openRow.delivery_challans.id,
                  challan_number: openRow.delivery_challans.challan_number,
                  challan_date: String(openRow.delivery_challans.challan_date ?? ""),
                  challan_type: openRow.delivery_challans.challan_type,
                  net_amount: openRow.delivery_challans.net_amount,
                  customer_name: openRow.delivery_challans.customer_name,
                }
              : null
          }
          ewayBill={openRow}
          missingSql={false}
          onChanged={onChanged}
        />
      ) : null}
    </div>
  );
}
