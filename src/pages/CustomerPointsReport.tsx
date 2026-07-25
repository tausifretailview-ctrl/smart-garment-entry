import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import * as XLSX from "xlsx";
import {
  ArrowLeft,
  CalendarIcon,
  Check,
  ChevronsUpDown,
  Coins,
  FileSpreadsheet,
  Gift,
  Printer,
  Search,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useSettings } from "@/hooks/useSettings";
import { getIndianFinancialYearBounds } from "@/utils/paymentVoucherFilters";
import { fetchAllCustomers } from "@/utils/fetchAllRows";
import { cn } from "@/lib/utils";
import { ReportKpiCards, type ReportKpiItem } from "@/components/reports/ReportKpiCards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type TxType = "earned" | "redeemed" | "adjusted" | "expired" | "all";

type HistoryRow = {
  id: string;
  customer_id: string;
  transaction_type: string;
  points: number;
  invoice_amount: number | null;
  description: string | null;
  created_at: string | null;
  sale_id: string | null;
};

type SaleLite = { id: string; sale_number: string | null };

type SummaryRow = {
  customer_id: string;
  customer_name: string;
  phone: string | null;
  earned: number;
  redeemed: number;
  adjusted: number;
  expired: number;
  current_balance: number;
  history_sum: number;
  drift: number;
};

const PAGE_SIZE = 1000;

const TX_BADGE: Record<string, string> = {
  earned: "bg-emerald-100 text-emerald-800 border-emerald-200",
  redeemed: "bg-amber-100 text-amber-800 border-amber-200",
  adjusted: "bg-sky-100 text-sky-800 border-sky-200",
  expired: "bg-slate-100 text-slate-700 border-slate-200",
};

async function fetchAllPointsHistory(
  organizationId: string,
  opts: {
    fromIso?: string | null;
    toIso?: string | null;
    customerId?: string | null;
    txType?: TxType;
  } = {},
): Promise<HistoryRow[]> {
  const all: HistoryRow[] = [];
  let offset = 0;

  while (true) {
    let q = supabase
      .from("customer_points_history")
      .select(
        "id, customer_id, transaction_type, points, invoice_amount, description, created_at, sale_id",
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (opts.customerId) q = q.eq("customer_id", opts.customerId);
    if (opts.txType && opts.txType !== "all") q = q.eq("transaction_type", opts.txType);
    if (opts.fromIso) q = q.gte("created_at", opts.fromIso);
    if (opts.toIso) q = q.lte("created_at", opts.toIso);

    const { data, error } = await q;
    if (error) throw error;
    const page = (data || []) as HistoryRow[];
    if (page.length === 0) break;
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}

async function fetchSalesByIds(organizationId: string, saleIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(saleIds.filter(Boolean))];
  for (let i = 0; i < unique.length; i += PAGE_SIZE) {
    const chunk = unique.slice(i, i + PAGE_SIZE);
    const { data, error } = await supabase
      .from("sales")
      .select("id, sale_number")
      .eq("organization_id", organizationId)
      .in("id", chunk);
    if (error) throw error;
    for (const s of (data || []) as SaleLite[]) {
      map.set(s.id, s.sale_number || "");
    }
  }
  return map;
}

function dayStartIso(d: Date): string {
  return `${format(d, "yyyy-MM-dd")}T00:00:00.000`;
}

function dayEndIso(d: Date): string {
  return `${format(d, "yyyy-MM-dd")}T23:59:59.999`;
}

export default function CustomerPointsReport() {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const { data: orgSettings } = useSettings();
  const saleSettings = (orgSettings as { sale_settings?: Record<string, unknown> } | null)?.sale_settings;
  const enablePointsSystem = !!saleSettings?.enable_points_system;
  const redemptionValue = Number(saleSettings?.points_redemption_value ?? 1) || 1;

  const fyBounds = useMemo(() => getIndianFinancialYearBounds(new Date()), []);
  const [fromDate, setFromDate] = useState<Date>(() => parseISO(fyBounds.start));
  const [toDate, setToDate] = useState<Date>(() => parseISO(fyBounds.end));
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [txType, setTxType] = useState<TxType>("all");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [drillCustomerId, setDrillCustomerId] = useState<string | null>(null);

  const orgId = currentOrganization?.id;
  const fromIso = dayStartIso(fromDate);
  const toIso = dayEndIso(toDate);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-for-points-report", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const rows = await fetchAllCustomers(orgId!);
      return rows.map((c: { id: string; customer_name: string; phone?: string | null; points_balance?: number | null }) => ({
        id: c.id,
        customer_name: c.customer_name,
        phone: c.phone ?? null,
        points_balance: Number(c.points_balance || 0),
      }));
    },
  });

  const customerById = useMemo(() => {
    const m = new Map(customers.map((c) => [c.id, c]));
    return m;
  }, [customers]);

  const { data: reportData, isFetching, error } = useQuery({
    queryKey: ["customer-points-report", orgId, fromIso, toIso, customerId, txType],
    enabled: !!orgId && enablePointsSystem,
    queryFn: async () => {
      const customerRows = await fetchAllCustomers(orgId!);
      const customerMap = new Map(
        customerRows.map((c: { id: string; customer_name: string; phone?: string | null; points_balance?: number | null }) => [
          c.id,
          {
            customer_name: c.customer_name,
            phone: c.phone ?? null,
            points_balance: Number(c.points_balance || 0),
          },
        ]),
      );

      // In-range rows drive earned/redeemed/adjusted/expired.
      // All-time history (separate fetch, not date-filtered) drives drift vs points_balance.
      const [inRange, allHistory] = await Promise.all([
        fetchAllPointsHistory(orgId!, {
          fromIso,
          toIso,
          customerId,
          txType,
        }),
        fetchAllPointsHistory(orgId!, {
          customerId: customerId || undefined,
        }),
      ]);

      const historySumByCustomer = new Map<string, number>();
      for (const row of allHistory) {
        historySumByCustomer.set(
          row.customer_id,
          (historySumByCustomer.get(row.customer_id) || 0) + Number(row.points || 0),
        );
      }

      const agg = new Map<
        string,
        { earned: number; redeemed: number; adjusted: number; expired: number }
      >();
      for (const row of inRange) {
        const cur = agg.get(row.customer_id) || {
          earned: 0,
          redeemed: 0,
          adjusted: 0,
          expired: 0,
        };
        const pts = Number(row.points || 0);
        const t = String(row.transaction_type || "").toLowerCase();
        if (t === "earned") cur.earned += pts;
        else if (t === "redeemed") cur.redeemed += Math.abs(pts);
        else if (t === "adjusted") cur.adjusted += pts;
        else if (t === "expired") cur.expired += pts;
        agg.set(row.customer_id, cur);
      }

      const summary: SummaryRow[] = [...agg.keys()]
        .map((id) => {
          const c = customerMap.get(id);
          const a = agg.get(id)!;
          const current_balance = Number(c?.points_balance ?? 0);
          const history_sum = historySumByCustomer.get(id) || 0;
          return {
            customer_id: id,
            customer_name: c?.customer_name || "Unknown",
            phone: c?.phone ?? null,
            earned: a.earned,
            redeemed: a.redeemed,
            adjusted: a.adjusted,
            expired: a.expired,
            current_balance,
            history_sum,
            drift: current_balance - history_sum,
          };
        })
        .sort((a, b) => a.customer_name.localeCompare(b.customer_name));

      // Liability: all-time sum of points_balance across all customers (not just in-range)
      const outstandingLiability = customerRows.reduce(
        (s, c: { points_balance?: number | null }) => s + Number(c.points_balance || 0),
        0,
      );

      return {
        summary,
        inRange,
        outstandingLiability,
        driftCount: summary.filter((r) => r.drift !== 0).length,
        totalEarned: summary.reduce((s, r) => s + r.earned, 0),
        totalRedeemed: summary.reduce((s, r) => s + r.redeemed, 0),
      };
    },
  });

  const { data: drillRows = [], isFetching: drillLoading } = useQuery({
    queryKey: ["customer-points-drill", orgId, drillCustomerId, fromIso, toIso, txType],
    enabled: !!orgId && !!drillCustomerId,
    queryFn: async () => {
      const rows = await fetchAllPointsHistory(orgId!, {
        fromIso,
        toIso,
        customerId: drillCustomerId!,
        txType,
      });
      const saleMap = await fetchSalesByIds(
        orgId!,
        rows.map((r) => r.sale_id || "").filter(Boolean),
      );
      return rows
        .slice()
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
        .map((r) => ({
          ...r,
          sale_number: r.sale_id ? saleMap.get(r.sale_id) || "" : "",
        }));
    },
  });

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 80);
    return customers
      .filter(
        (c) =>
          c.customer_name.toLowerCase().includes(q) ||
          (c.phone || "").toLowerCase().includes(q),
      )
      .slice(0, 80);
  }, [customers, customerSearch]);

  const selectedCustomer = customerId ? customerById.get(customerId) : null;
  const drillCustomer = drillCustomerId ? customerById.get(drillCustomerId) : null;

  const kpiItems: ReportKpiItem[] = useMemo(() => {
    const earned = reportData?.totalEarned ?? 0;
    const redeemed = reportData?.totalRedeemed ?? 0;
    const liabilityPts = reportData?.outstandingLiability ?? 0;
    const liabilityRs = liabilityPts * redemptionValue;
    const drifts = reportData?.driftCount ?? 0;
    return [
      {
        label: "Total Earned",
        value: Math.round(earned).toLocaleString("en-IN"),
        sub: "In date range",
        gradient: "bg-gradient-to-br from-emerald-600 to-emerald-700",
        icon: Gift,
      },
      {
        label: "Total Redeemed",
        value: Math.round(redeemed).toLocaleString("en-IN"),
        sub: "In date range",
        gradient: "bg-gradient-to-br from-amber-600 to-amber-700",
        icon: Coins,
      },
      {
        label: "Points Liability",
        value: Math.round(liabilityPts).toLocaleString("en-IN"),
        sub: `≈ ₹${Math.round(liabilityRs).toLocaleString("en-IN")} @ ₹${redemptionValue}/pt`,
        gradient: "bg-gradient-to-br from-sky-600 to-sky-700",
        icon: Coins,
        highlight: true,
      },
      {
        label: "Drift Customers",
        value: String(drifts),
        sub: "Balance ≠ history sum",
        gradient:
          drifts > 0
            ? "bg-gradient-to-br from-amber-500 to-orange-600"
            : "bg-gradient-to-br from-slate-600 to-slate-700",
        icon: AlertTriangle,
      },
    ];
  }, [reportData, redemptionValue]);

  const exportToExcel = () => {
    if (drillCustomerId && drillRows.length > 0) {
      const exportData = drillRows.map((r, i) => ({
        "Sr No": i + 1,
        Date: r.created_at ? format(new Date(r.created_at), "yyyy-MM-dd HH:mm") : "",
        Type: r.transaction_type,
        Points: Number(r.points || 0),
        "Invoice Amount": r.invoice_amount ?? "",
        "Invoice No": r.sale_number || "",
        Description: r.description || "",
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Points History");
      XLSX.writeFile(
        wb,
        `customer-points-${drillCustomer?.customer_name || "detail"}-${format(fromDate, "yyyy-MM-dd")}.xlsx`,
      );
      return;
    }
    const rows = reportData?.summary || [];
    const exportData = rows.map((r, i) => ({
      "Sr No": i + 1,
      Customer: r.customer_name,
      Phone: r.phone || "",
      Earned: r.earned,
      Redeemed: r.redeemed,
      Adjusted: r.adjusted,
      Expired: r.expired,
      "Current Balance": r.current_balance,
      "History Sum": r.history_sum,
      Drift: r.drift,
      Status: r.drift === 0 ? "OK" : `Drift: ${r.drift}`,
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customer Points");
    XLSX.writeFile(wb, `customer-points-${format(fromDate, "yyyy-MM-dd")}.xlsx`);
  };

  if (!enablePointsSystem) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 bg-slate-50 p-6">
        <Coins className="h-10 w-10 text-muted-foreground" />
        <p className="text-base font-medium text-foreground">Customer Points is disabled</p>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          Enable the points system in Settings → Sale Settings to use this report.
        </p>
        <Button variant="outline" onClick={() => orgNavigate("/reports")}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to Reports
        </Button>
      </div>
    );
  }

  return (
    <div className="customer-points-report flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50 px-2 py-2 sm:px-3 print:min-h-screen print:h-auto print:overflow-visible print:bg-white print:p-4">
      <div className="print:hidden shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 border-slate-300"
            onClick={() => (drillCustomerId ? setDrillCustomerId(null) : orgNavigate("/reports"))}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            {drillCustomerId ? "Summary" : "Reports"}
          </Button>
          <h1 className="text-lg font-bold tracking-tight text-blue-700 truncate">
            {drillCustomerId
              ? `Points — ${drillCustomer?.customer_name || "Customer"}`
              : "Customer Points"}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-slate-300"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-slate-300"
            onClick={exportToExcel}
            disabled={!reportData?.summary?.length && !drillRows.length}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
        </div>
      </div>

      <div className="print:hidden shrink-0 mt-2">
        <ReportKpiCards items={kpiItems} />
      </div>

      <div className="print:hidden shrink-0 mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        <div className="space-y-1">
          <label className="text-[11px] font-semibold uppercase text-slate-500">From</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 w-[148px] justify-start border-slate-300 font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(fromDate, "dd MMM yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={fromDate} onSelect={(d) => d && setFromDate(d)} initialFocus />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-semibold uppercase text-slate-500">To</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 w-[148px] justify-start border-slate-300 font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(toDate, "dd MMM yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={toDate} onSelect={(d) => d && setToDate(d)} initialFocus />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1 min-w-[200px] flex-1">
          <label className="text-[11px] font-semibold uppercase text-slate-500">Customer</label>
          <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="h-9 w-full justify-between border-slate-300 font-normal"
              >
                <span className="truncate">
                  {selectedCustomer?.customer_name || "All customers"}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Search name or phone…"
                  value={customerSearch}
                  onValueChange={setCustomerSearch}
                />
                <CommandList>
                  <CommandEmpty>No customer found.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="__all__"
                      onSelect={() => {
                        setCustomerId(null);
                        setCustomerOpen(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", !customerId ? "opacity-100" : "opacity-0")} />
                      All customers
                    </CommandItem>
                    {filteredCustomers.map((c) => (
                      <CommandItem
                        key={c.id}
                        value={c.id}
                        onSelect={() => {
                          setCustomerId(c.id);
                          setCustomerOpen(false);
                        }}
                      >
                        <Check
                          className={cn("mr-2 h-4 w-4", customerId === c.id ? "opacity-100" : "opacity-0")}
                        />
                        <span className="truncate">{c.customer_name}</span>
                        {c.phone ? (
                          <span className="ml-2 text-xs text-muted-foreground">{c.phone}</span>
                        ) : null}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1 w-[160px]">
          <label className="text-[11px] font-semibold uppercase text-slate-500">Type</label>
          <Select value={txType} onValueChange={(v) => setTxType(v as TxType)}>
            <SelectTrigger className="h-9 border-slate-300">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="earned">Earned</SelectItem>
              <SelectItem value="redeemed">Redeemed</SelectItem>
              <SelectItem value="adjusted">Adjusted</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {(error as Error).message || "Failed to load points report"}
        </div>
      ) : null}

      <div className="mt-2 min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm print:overflow-visible print:border-0 print:shadow-none">
        {drillCustomerId ? (
          <div className="h-full min-h-0 overflow-auto tab-scroll-stable print:overflow-visible">
            {drillLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Loading history…</div>
            ) : drillRows.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No points history in this range.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-none bg-slate-800 hover:bg-slate-800">
                    <TableHead className="text-white text-xs font-bold uppercase">Date</TableHead>
                    <TableHead className="text-white text-xs font-bold uppercase">Type</TableHead>
                    <TableHead className="text-white text-xs font-bold uppercase text-right">Points</TableHead>
                    <TableHead className="text-white text-xs font-bold uppercase text-right">Invoice Amt</TableHead>
                    <TableHead className="text-white text-xs font-bold uppercase">Invoice No</TableHead>
                    <TableHead className="text-white text-xs font-bold uppercase">Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drillRows.map((r) => (
                    <TableRow key={r.id} className="hover:bg-teal-50/80">
                      <TableCell className="text-sm whitespace-nowrap">
                        {r.created_at ? format(new Date(r.created_at), "dd MMM yyyy HH:mm") : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[11px] uppercase",
                            TX_BADGE[String(r.transaction_type).toLowerCase()] || "",
                          )}
                        >
                          {r.transaction_type}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-sm text-right tabular-nums font-semibold",
                          Number(r.points) < 0 ? "text-amber-700" : "text-emerald-700",
                        )}
                      >
                        {Number(r.points || 0).toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-sm text-right tabular-nums">
                        {r.invoice_amount != null
                          ? Number(r.invoice_amount).toLocaleString("en-IN")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm font-mono">{r.sale_number || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[280px] truncate">
                        {r.description || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        ) : (
          <div className="h-full min-h-0 overflow-auto tab-scroll-stable print:overflow-visible">
            {isFetching && !reportData ? (
              <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
                <Search className="h-4 w-4 animate-pulse" />
                Loading customer points…
              </div>
            ) : !reportData?.summary?.length ? (
              <div className="p-6 text-sm text-muted-foreground">
                No customers with points activity in this range.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-none bg-slate-800 hover:bg-slate-800">
                    <TableHead className="text-white text-xs font-bold uppercase">Customer</TableHead>
                    <TableHead className="text-white text-xs font-bold uppercase">Phone</TableHead>
                    <TableHead className="text-white text-xs font-bold uppercase text-right">Earned</TableHead>
                    <TableHead className="text-white text-xs font-bold uppercase text-right">Redeemed</TableHead>
                    <TableHead className="text-white text-xs font-bold uppercase text-right">Adjusted</TableHead>
                    <TableHead className="text-white text-xs font-bold uppercase text-right">Expired</TableHead>
                    <TableHead className="text-white text-xs font-bold uppercase text-right">
                      Current Balance
                    </TableHead>
                    <TableHead className="text-white text-xs font-bold uppercase">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.summary.map((row) => (
                    <TableRow key={row.customer_id} className="hover:bg-teal-50/80">
                      <TableCell>
                        <button
                          type="button"
                          className="text-sm font-semibold text-blue-700 hover:underline text-left"
                          onClick={() => setDrillCustomerId(row.customer_id)}
                        >
                          {row.customer_name}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">{row.phone || "—"}</TableCell>
                      <TableCell className="text-sm text-right tabular-nums font-medium text-emerald-700">
                        {Math.round(row.earned).toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-sm text-right tabular-nums font-medium text-amber-700">
                        {Math.round(row.redeemed).toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-sm text-right tabular-nums">
                        {Math.round(row.adjusted).toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-sm text-right tabular-nums">
                        {Math.round(row.expired).toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-sm text-right tabular-nums font-bold">
                        {Math.round(row.current_balance).toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell>
                        {row.drift === 0 ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            OK
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-900 border-amber-200 hover:bg-amber-100 gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Drift: {row.drift > 0 ? "+" : ""}
                            {row.drift}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
