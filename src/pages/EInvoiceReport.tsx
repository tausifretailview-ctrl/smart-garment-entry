import { useState, useMemo } from "react";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { restoreDashboardFilters, WINDOW_FILTER_IDS } from "@/lib/dashboardFilterPersistence";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useSettings } from "@/hooks/useSettings";
import { useIndustrialMode } from "@/hooks/useIndustrialMode";
import { useEwayBillOn } from "@/hooks/useEwayBillOn";
import { isExportSupply, saleSupplyShortLabel, saleSupplyTypeOf } from "@/utils/industrialMode";
import { invokeSaleEInvoice } from "@/utils/saleEInvoiceRoute";
import { useEwayBillsForSales } from "@/hooks/useSaleEwayBills";
import { ewbValidity, formatEwbNo } from "@/utils/ewayBill";
import { SaleEwayBillDialog } from "@/components/ewaybill/SaleEwayBillDialog";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useToast } from "@/hooks/use-toast";
import { BackToDashboard } from "@/components/BackToDashboard";
import { ReportKpiCards, type ReportKpiItem } from "@/components/reports/ReportKpiCards";
import { ResetPersistedFiltersButton } from "@/components/ResetPersistedFiltersButton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ERPTable } from "@/components/erp-table";
import { ColumnDef } from "@tanstack/react-table";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, subDays } from "date-fns";
import { Search, FileSpreadsheet, Loader2, RefreshCw, CheckCircle2, AlertTriangle, Clock, XCircle, Shield, Zap, Truck } from "lucide-react";
import type * as XLSXType from "xlsx";
/** Lazily loaded on export — keeps the xlsx bundle off this page's initial chunk. */
let xlsxModulePromise: Promise<typeof XLSXType> | null = null;
const loadXlsx = (): Promise<typeof XLSXType> => (xlsxModulePromise ??= import("xlsx"));

const safeErrorString = (val: any): string => {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    return val.ErrorMessage || val.message || val.error || JSON.stringify(val);
  }
  return String(val);
};

type PeriodFilter = 'today' | 'yesterday' | 'last7' | 'last30' | 'this_month' | 'all';
type StatusFilter = 'all' | 'generated' | 'not_generated' | 'cancelled' | 'failed';

type EInvoiceRecord = {
  id: string;
  sale_number: string | null;
  sale_date: string | null;
  created_at: string | null;
  cancelled_at: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  net_amount: number | null;
  irn: string | null;
  ack_no: string | null;
  ack_date: string | null;
  einvoice_status: string | null;
  einvoice_error: any;
  einvoice_qr_code: string | null;
  is_cancelled: boolean | null;
  customers?: {
    gst_number?: string | null;
  } | null;
  /** Read only with Industrial mode on (export / SEZ supply type). */
  b2b_details?: unknown;
  /** Read only with Industrial mode on (e-way bill environment). */
  einvoice_test_mode?: boolean | null;
};

const getEffectiveStatus = (invoice: EInvoiceRecord): Exclude<StatusFilter, 'all'> => {
  if (invoice.is_cancelled || invoice.einvoice_status === 'cancelled') return 'cancelled';
  if (invoice.einvoice_status === 'failed') return 'failed';
  if (invoice.irn || invoice.einvoice_status === 'generated') return 'generated';
  return 'not_generated';
};

const getActivityDate = (invoice: EInvoiceRecord): string | null => {
  const status = getEffectiveStatus(invoice);

  if (status === 'cancelled') {
    return invoice.cancelled_at || invoice.ack_date || invoice.sale_date || invoice.created_at;
  }

  if (status === 'generated') {
    return invoice.ack_date || invoice.sale_date || invoice.created_at;
  }

  return invoice.sale_date || invoice.created_at;
};

const getStatusLabel = (invoice: EInvoiceRecord) => {
  const status = getEffectiveStatus(invoice);

  switch (status) {
    case 'cancelled':
      return 'Cancelled';
    case 'generated':
      return 'Generated';
    case 'failed':
      return 'Failed';
    default:
      return 'Pending';
  }
};

export default function EInvoiceReport() {
  const { currentOrganization } = useOrganization();
  const { data: settings } = useSettings();
  // Industrial mode, Phase 2 step 3: export bills (buyer abroad, no GSTIN) are listed too and
  // export / SEZ bills get their IRN from einvoice-note. Other shops: same query and calls as before.
  const industrialMode = useIndustrialMode();
  const industrialIrn = industrialMode.enabled;
  // E-way bill column: any shop with the E-Way Bill switch on (Settings > Sale > E-Invoice).
  const ewbOn = useEwayBillOn();
  const { orgNavigate: navigate } = useOrgNavigation();
  const { toast } = useToast();

  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('this_month');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRetryingAll, setIsRetryingAll] = useState(false);

  const { clearPersistedFilters } = useDashboardFilterPersistence(
    WINDOW_FILTER_IDS.einvoiceReport,
    currentOrganization?.id,
    useMemo(
      () => ({ periodFilter, statusFilter, searchQuery }),
      [periodFilter, statusFilter, searchQuery],
    ),
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [
          ["periodFilter", (v) => setPeriodFilter(v as PeriodFilter)],
          ["statusFilter", (v) => setStatusFilter(v as StatusFilter)],
          ["searchQuery", setSearchQuery],
        ],
      });
    },
  );

  const einvoiceFiltersDirty =
    periodFilter !== "this_month" || statusFilter !== "all" || searchQuery !== "";

  const resetEinvoiceFilters = () => {
    setPeriodFilter("this_month");
    setStatusFilter("all");
    setSearchQuery("");
    clearPersistedFilters();
  };

  const getDateRange = (period: PeriodFilter) => {
    const now = new Date();
    switch (period) {
      case 'today': return { start: startOfDay(now), end: endOfDay(now) };
      case 'yesterday': { const y = subDays(now, 1); return { start: startOfDay(y), end: endOfDay(y) }; }
      case 'last7': return { start: startOfDay(subDays(now, 7)), end: endOfDay(now) };
      case 'last30': return { start: startOfDay(subDays(now, 30)), end: endOfDay(now) };
      case 'this_month': return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'all': return { start: new Date('2020-01-01'), end: endOfDay(now) };
    }
  };

  const dateRange = getDateRange(periodFilter);

  const { data: invoices = [], isLoading, refetch } = useQuery<EInvoiceRecord[]>({
    queryKey: ['einvoice-report', currentOrganization?.id, industrialIrn, ewbOn],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      const baseSelect = 'id, sale_number, sale_date, created_at, cancelled_at, customer_name, customer_phone, net_amount, irn, ack_no, ack_date, einvoice_status, einvoice_error, einvoice_qr_code, is_cancelled, customers:customer_id (gst_number)';
      const { data, error } = await supabase
        .from('sales')
        .select(
          industrialIrn
            ? `${baseSelect}, b2b_details, einvoice_test_mode`
            : ewbOn
              ? `${baseSelect}, einvoice_test_mode`
              : baseSelect,
        )
        .eq('organization_id', currentOrganization.id)
        .in('sale_type', ['invoice', 'pos'])
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return ((data || []) as unknown as EInvoiceRecord[]).filter((inv: EInvoiceRecord) => 
        !!(inv.customers?.gst_number) || (industrialIrn && isExportSupply(saleSupplyTypeOf(inv.b2b_details)))
      );
    },
    enabled: !!currentOrganization?.id,
  });

  const periodInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (periodFilter === 'all') return true;

      const activityDate = getActivityDate(inv);
      if (!activityDate) return false;

      const reportDate = new Date(activityDate);
      return reportDate >= dateRange.start && reportDate <= dateRange.end;
    });
  }, [invoices, periodFilter, dateRange]);

  const filteredInvoices = useMemo(() => {
    let filtered = periodInvoices;

    if (statusFilter !== 'all') {
      filtered = filtered.filter((inv) => getEffectiveStatus(inv) === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((inv) =>
        inv.sale_number?.toLowerCase().includes(q) ||
        inv.customer_name?.toLowerCase().includes(q) ||
        inv.irn?.toLowerCase().includes(q) ||
        inv.customers?.gst_number?.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [periodInvoices, statusFilter, searchQuery]);

  // E-way bill of each bill with an active IRN (E-Way Bill switch on).
  const ewbSaleIds = useMemo(
    () => (ewbOn ? filteredInvoices.filter((i) => i.irn && i.einvoice_status === 'generated').map((i) => i.id) : []),
    [ewbOn, filteredInvoices],
  );
  const ewb = useEwayBillsForSales(currentOrganization?.id, ewbSaleIds, ewbOn);
  const [ewbInvoice, setEwbInvoice] = useState<EInvoiceRecord | null>(null);

  const summary = useMemo(() => {
    if (!periodInvoices.length) return { total: 0, generated: 0, pending: 0, failed: 0, cancelled: 0 };

    return {
      total: periodInvoices.length,
      generated: periodInvoices.filter((i) => getEffectiveStatus(i) === 'generated').length,
      pending: periodInvoices.filter((i) => getEffectiveStatus(i) === 'not_generated').length,
      failed: periodInvoices.filter((i) => getEffectiveStatus(i) === 'failed').length,
      cancelled: periodInvoices.filter((i) => getEffectiveStatus(i) === 'cancelled').length,
    };
  }, [periodInvoices]);

  const handleRetryAllFailed = async () => {
    const failedInvoices = periodInvoices.filter((i) => getEffectiveStatus(i) === 'failed');
    if (failedInvoices.length === 0) return;
    setIsRetryingAll(true);
    const testMode = (settings?.sale_settings as any)?.einvoice_settings?.test_mode ?? true;
    let successCount = 0;
    for (const inv of failedInvoices) {
      try {
        const res = await invokeSaleEInvoice({
          saleId: inv.id,
          organizationId: currentOrganization?.id ?? '',
          testMode,
          industrial: industrialIrn,
          supplyType: industrialIrn ? saleSupplyTypeOf(inv.b2b_details) : null,
        });
        if (res.data?.success) successCount++;
      } catch { /* continue */ }
    }
    toast({
      title: "Retry Complete",
      description: `${successCount} of ${failedInvoices.length} e-Invoices generated successfully.`,
    });
    refetch();
    setIsRetryingAll(false);
  };

  const handleExportExcel = async () => {
    if (!filteredInvoices.length) return;
    const rows = filteredInvoices.map((inv, idx: number) => ({
      'S.No': idx + 1,
      'Invoice No': inv.sale_number,
      'Date': getActivityDate(inv) ? format(new Date(getActivityDate(inv)!), 'dd/MM/yyyy') : '',
      'Customer': inv.customer_name,
      'GSTIN': inv.customers?.gst_number || (industrialIrn && isExportSupply(saleSupplyTypeOf(inv.b2b_details)) ? 'URP' : ''),
      'Amount': inv.net_amount,
      'IRN': inv.irn || '',
      'Ack No': inv.ack_no || '',
      'Ack Date': inv.ack_date ? format(new Date(inv.ack_date), 'dd/MM/yyyy HH:mm') : '',
      'Status': getStatusLabel(inv),
      ...(ewbOn
        ? { 'E-Way Bill No': ewb.rows.get(inv.id)?.status === 'active' ? ewb.rows.get(inv.id)!.ewb_no : '' }
        : {}),
      'Error': inv.einvoice_error || '',
    }));
    const XLSX = await loadXlsx();
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'E-Invoice Report');
    XLSX.writeFile(wb, `E-Invoice_Report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const getStatusBadge = (inv: EInvoiceRecord) => {
    const status = getEffectiveStatus(inv);

    if (status === 'cancelled') {
      return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Cancelled</Badge>;
    }
    if (status === 'generated') {
      return <Badge className="gap-1 bg-green-100 text-green-800 border-green-200"><CheckCircle2 className="h-3 w-3" /> Generated</Badge>;
    }
    if (status === 'failed') {
      return <Badge variant="outline" className="gap-1 border-orange-300 text-orange-700 bg-orange-50"><AlertTriangle className="h-3 w-3" /> Failed</Badge>;
    }
    return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
  };

  const columns: ColumnDef<any, any>[] = useMemo(() => [
    {
      accessorKey: 'sale_number',
      header: 'Invoice #',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.sale_number}</span>,
      size: 150,
    },
    {
      accessorKey: 'sale_date',
      header: 'Date',
      cell: ({ row }) => {
        const activityDate = getActivityDate(row.original);
        return activityDate ? format(new Date(activityDate), 'dd/MM/yy') : '-';
      },
      size: 90,
    },
    {
      accessorKey: 'customer_name',
      header: 'Customer',
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-sm">{row.original.customer_name}</div>
          <div className="text-xs text-muted-foreground font-mono">
            {row.original.customers?.gst_number}
            {industrialIrn && saleSupplyShortLabel(saleSupplyTypeOf(row.original.b2b_details)) ? (
              <span className="ml-1 font-sans font-semibold text-sky-700">
                {row.original.customers?.gst_number ? "· " : ""}
                {saleSupplyShortLabel(saleSupplyTypeOf(row.original.b2b_details))}
              </span>
            ) : null}
          </div>
        </div>
      ),
      size: 200,
    },
    {
      accessorKey: 'net_amount',
      header: 'Amount',
      cell: ({ row }) => <span className="font-medium">₹{Number(row.original.net_amount).toLocaleString('en-IN')}</span>,
      size: 110,
    },
    {
      id: 'status',
      header: 'IRN Status',
      cell: ({ row }) => getStatusBadge(row.original),
      size: 130,
    },
    {
      accessorKey: 'irn',
      header: 'IRN',
      cell: ({ row }) => row.original.irn
        ? <span className="text-xs font-mono truncate max-w-[200px] block" title={row.original.irn}>{row.original.irn.substring(0, 25)}...</span>
        : <span className="text-muted-foreground text-xs">-</span>,
      size: 220,
    },
    {
      accessorKey: 'ack_no',
      header: 'Ack No',
      cell: ({ row }) => <span className="text-xs">{row.original.ack_no || '-'}</span>,
      size: 120,
    },
    ...(ewbOn
      ? [
          {
            id: 'ewb',
            header: 'E-way bill',
            cell: ({ row }) => {
              const inv = row.original as EInvoiceRecord;
              if (!inv.irn || inv.einvoice_status !== 'generated') return <span className="text-muted-foreground text-xs">-</span>;
              const bill = ewb.rows.get(inv.id);
              if (bill?.status === 'active') {
                const v = ewbValidity(bill);
                return (
                  <button type="button" onClick={() => setEwbInvoice(inv)} className="text-left">
                    <span className="block font-mono text-xs font-semibold text-teal-700 hover:underline">{formatEwbNo(bill.ewb_no)}</span>
                    <span className={`block text-[11px] ${v.tone === 'expired' ? 'text-red-600' : v.tone === 'ok' ? 'text-slate-500' : 'text-amber-700'}`}>{v.label}</span>
                  </button>
                );
              }
              return (
                <Button variant="outline" size="sm" className="h-7 gap-1 border-teal-200 text-teal-700 hover:bg-teal-50" onClick={() => setEwbInvoice(inv)}>
                  <Truck className="h-3 w-3" /> Get EWB
                </Button>
              );
            },
            size: 150,
          } as ColumnDef<any, any>,
        ]
      : []),
    {
      id: 'error',
      header: 'Error',
      cell: ({ row }) => {
        const errVal = row.original.einvoice_error;
        if (!errVal) return null;
        const errStr = safeErrorString(errVal);
        return (
          <span className="text-xs text-destructive truncate max-w-[200px] block" title={errStr}>
            {errStr.substring(0, 40)}...
          </span>
        );
      },
      size: 200,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const inv = row.original;
        const status = getEffectiveStatus(inv);

        if (inv.irn && status !== 'cancelled') {
          return <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(inv.irn); toast({ title: "Copied", description: "IRN copied to clipboard" }); }}>Copy IRN</Button>;
        }
        if (status !== 'cancelled' && (!inv.irn || status === 'failed')) {
          return (
            <Button variant="outline" size="sm" onClick={async () => {
              try {
                const testMode = (settings?.sale_settings as any)?.einvoice_settings?.test_mode ?? true;
                const res = await invokeSaleEInvoice({
                  saleId: inv.id,
                  organizationId: currentOrganization?.id ?? '',
                  testMode,
                  industrial: industrialIrn,
                  supplyType: industrialIrn ? saleSupplyTypeOf(inv.b2b_details) : null,
                });
                if (res.error) throw new Error(res.error.message);
                if (res.data?.success) {
                  toast({ title: "Generated", description: "E-Invoice generated successfully" });
                  refetch();
                } else {
                  toast({
                    title: "E-Invoice Failed",
                    description: safeErrorString(res.data?.error) || "Generation failed",
                    variant: "destructive",
                  });
                }
              } catch (err: any) {
                toast({
                  title: "Error",
                  description: safeErrorString(err?.message) || "Failed to generate e-Invoice",
                  variant: "destructive",
                });
              }
            }}>
              <Zap className="h-3 w-3 mr-1" /> Generate
            </Button>
          );
        }
        return null;
      },
      size: 120,
    },
  ], [settings, currentOrganization, industrialIrn, ewbOn, ewb.rows]);

  const einvoiceKpiItems = useMemo((): ReportKpiItem[] => [
    {
      label: "Total B2B",
      value: summary.total.toLocaleString("en-IN"),
      gradient: "bg-gradient-to-br from-blue-500 to-blue-600",
      icon: Shield,
      highlight: statusFilter === "all",
    },
    {
      label: "Generated",
      value: summary.generated.toLocaleString("en-IN"),
      gradient: "bg-gradient-to-br from-emerald-500 to-emerald-600",
      icon: CheckCircle2,
      highlight: statusFilter === "generated",
    },
    {
      label: "Pending",
      value: summary.pending.toLocaleString("en-IN"),
      gradient: "bg-gradient-to-br from-amber-500 to-amber-600",
      icon: Clock,
      highlight: statusFilter === "not_generated",
    },
    {
      label: "Failed",
      value: summary.failed.toLocaleString("en-IN"),
      gradient: "bg-gradient-to-br from-orange-500 to-orange-600",
      icon: AlertTriangle,
      highlight: statusFilter === "failed",
    },
    {
      label: "Cancelled",
      value: summary.cancelled.toLocaleString("en-IN"),
      gradient: "bg-gradient-to-br from-red-500 to-red-600",
      icon: XCircle,
      highlight: statusFilter === "cancelled",
    },
  ], [summary, statusFilter]);

  const periods: { value: PeriodFilter; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'last7', label: 'Last 7 Days' },
    { value: 'last30', label: 'Last 30 Days' },
    { value: 'this_month', label: 'This Month' },
    { value: 'all', label: 'All Time' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 space-y-5 w-full">
      <BackToDashboard />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-blue-600 tracking-tight">E-Invoice Report</h1>
          <p className="text-slate-400 text-base mt-0.5">B2B e-invoice generation status</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-10 border-slate-300 gap-2" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" className="h-10 border-slate-300 gap-2" onClick={handleExportExcel} disabled={!filteredInvoices.length}>
            <FileSpreadsheet className="h-4 w-4" /> Export Excel
          </Button>
        </div>
      </div>

      {/* Period chips */}
      <div className="flex flex-wrap gap-2">
        {periods.map((p) => (
          <Button
            key={p.value}
            variant={periodFilter === p.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriodFilter(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <ReportKpiCards items={einvoiceKpiItems} />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoice, customer, GSTIN, IRN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="generated">✅ Generated</SelectItem>
            <SelectItem value="not_generated">⏳ Pending</SelectItem>
            <SelectItem value="failed">⚠️ Failed</SelectItem>
            <SelectItem value="cancelled">❌ Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <ResetPersistedFiltersButton
          visible={einvoiceFiltersDirty}
          onReset={resetEinvoiceFilters}
        />
        {summary.failed > 0 && (
          <Button variant="outline" size="sm" onClick={handleRetryAllFailed} disabled={isRetryingAll}>
            {isRetryingAll ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Retry All Failed ({summary.failed})
          </Button>
        )}
      </div>

      {ewbOn && currentOrganization?.id ? (
        <SaleEwayBillDialog
          open={!!ewbInvoice}
          onOpenChange={(v) => {
            if (!v) setEwbInvoice(null);
          }}
          organizationId={currentOrganization.id}
          sale={
            ewbInvoice
              ? {
                  id: ewbInvoice.id,
                  sale_number: String(ewbInvoice.sale_number ?? ''),
                  sale_date: String(ewbInvoice.sale_date ?? ''),
                  net_amount: ewbInvoice.net_amount,
                  customer_name: ewbInvoice.customer_name,
                  irn: ewbInvoice.irn,
                  einvoice_status: ewbInvoice.einvoice_status,
                  einvoice_test_mode: ewbInvoice.einvoice_test_mode ?? null,
                }
              : null
          }
          ewayBill={ewbInvoice ? ewb.rows.get(ewbInvoice.id) ?? null : null}
          missingSql={ewb.missingSql}
          onChanged={() => void ewb.refetch()}
        />
      ) : null}

      {/* Table */}
      <ERPTable
        tableId="einvoice-report"
        data={filteredInvoices}
        columns={columns as any}
        isLoading={isLoading}
        emptyMessage="No e-invoice records found for the selected filters"
      />
    </div>
  );
}
