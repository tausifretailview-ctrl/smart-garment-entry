import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useSettings } from "@/hooks/useSettings";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useToast } from "@/hooks/use-toast";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ERPTable } from "@/components/erp-table";
import { ColumnDef } from "@tanstack/react-table";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, subDays } from "date-fns";
import { Search, FileSpreadsheet, Loader2, RefreshCw, CheckCircle2, AlertTriangle, Clock, XCircle, Shield, Zap } from "lucide-react";
import * as XLSX from "xlsx";

type PeriodFilter = 'today' | 'yesterday' | 'last7' | 'last30' | 'this_month' | 'all';
type StatusFilter = 'all' | 'generated' | 'not_generated' | 'cancelled' | 'failed';

export default function EInvoiceReport() {
  const { currentOrganization } = useOrganization();
  const { data: settings } = useSettings();
  const { orgNavigate: navigate } = useOrgNavigation();
  const { toast } = useToast();

  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('this_month');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRetryingAll, setIsRetryingAll] = useState(false);

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

  const { data: invoices, isLoading, refetch } = useQuery({
    queryKey: ['einvoice-report', currentOrganization?.id, periodFilter],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      // Only fetch B2B invoices (those with customer GSTIN)
      const { data, error } = await supabase
        .from('sales')
        .select('id, sale_number, sale_date, customer_name, customer_phone, net_amount, irn, ack_no, ack_date, einvoice_status, einvoice_error, einvoice_qr_code, is_cancelled, customers:customer_id (gst_number)')
        .eq('organization_id', currentOrganization.id)
        .eq('sale_type', 'invoice')
        .eq('is_cancelled', false)
        .gte('sale_date', dateRange.start.toISOString())
        .lte('sale_date', dateRange.end.toISOString())
        .order('sale_date', { ascending: false });

      if (error) throw error;
      // Filter to B2B only (has GSTIN)
      return (data || []).filter((inv: any) => inv.customers?.gst_number);
    },
    enabled: !!currentOrganization?.id,
  });

  const filteredInvoices = useMemo(() => {
    if (!invoices) return [];
    let filtered = invoices;

    if (statusFilter !== 'all') {
      filtered = filtered.filter((inv: any) => {
        const status = inv.irn ? (inv.einvoice_status || 'generated') : (inv.einvoice_status === 'failed' ? 'failed' : 'not_generated');
        return status === statusFilter;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((inv: any) =>
        inv.sale_number?.toLowerCase().includes(q) ||
        inv.customer_name?.toLowerCase().includes(q) ||
        inv.irn?.toLowerCase().includes(q) ||
        inv.customers?.gst_number?.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [invoices, statusFilter, searchQuery]);

  const summary = useMemo(() => {
    if (!invoices) return { total: 0, generated: 0, pending: 0, failed: 0, cancelled: 0 };
    return {
      total: invoices.length,
      generated: invoices.filter((i: any) => i.irn && i.einvoice_status !== 'cancelled').length,
      pending: invoices.filter((i: any) => !i.irn && i.einvoice_status !== 'failed').length,
      failed: invoices.filter((i: any) => i.einvoice_status === 'failed').length,
      cancelled: invoices.filter((i: any) => i.einvoice_status === 'cancelled').length,
    };
  }, [invoices]);

  const handleRetryAllFailed = async () => {
    const failedInvoices = (invoices || []).filter((i: any) => i.einvoice_status === 'failed');
    if (failedInvoices.length === 0) return;
    setIsRetryingAll(true);
    const testMode = (settings?.sale_settings as any)?.einvoice_settings?.test_mode ?? true;
    let successCount = 0;
    for (const inv of failedInvoices) {
      try {
        const res = await supabase.functions.invoke('generate-einvoice', {
          body: { saleId: inv.id, organizationId: currentOrganization?.id, testMode },
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

  const handleExportExcel = () => {
    if (!filteredInvoices.length) return;
    const rows = filteredInvoices.map((inv: any, idx: number) => ({
      'S.No': idx + 1,
      'Invoice No': inv.sale_number,
      'Date': inv.sale_date ? format(new Date(inv.sale_date), 'dd/MM/yyyy') : '',
      'Customer': inv.customer_name,
      'GSTIN': inv.customers?.gst_number || '',
      'Amount': inv.net_amount,
      'IRN': inv.irn || '',
      'Ack No': inv.ack_no || '',
      'Ack Date': inv.ack_date ? format(new Date(inv.ack_date), 'dd/MM/yyyy HH:mm') : '',
      'Status': inv.irn ? (inv.einvoice_status === 'cancelled' ? 'Cancelled' : 'Generated') : (inv.einvoice_status === 'failed' ? 'Failed' : 'Pending'),
      'Error': inv.einvoice_error || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'E-Invoice Report');
    XLSX.writeFile(wb, `E-Invoice_Report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const getStatusBadge = (inv: any) => {
    if (inv.einvoice_status === 'cancelled') {
      return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Cancelled</Badge>;
    }
    if (inv.irn) {
      return <Badge className="gap-1 bg-green-100 text-green-800 border-green-200"><CheckCircle2 className="h-3 w-3" /> Generated</Badge>;
    }
    if (inv.einvoice_status === 'failed') {
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
      cell: ({ row }) => row.original.sale_date ? format(new Date(row.original.sale_date), 'dd/MM/yy') : '-',
      size: 90,
    },
    {
      accessorKey: 'customer_name',
      header: 'Customer',
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-sm">{row.original.customer_name}</div>
          <div className="text-xs text-muted-foreground font-mono">{row.original.customers?.gst_number}</div>
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
    {
      id: 'error',
      header: 'Error',
      cell: ({ row }) => row.original.einvoice_error
        ? <span className="text-xs text-destructive truncate max-w-[200px] block" title={row.original.einvoice_error}>{row.original.einvoice_error.substring(0, 40)}...</span>
        : null,
      size: 200,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const inv = row.original;
        if (inv.irn && inv.einvoice_status !== 'cancelled') {
          return <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(inv.irn); toast({ title: "Copied", description: "IRN copied to clipboard" }); }}>Copy IRN</Button>;
        }
        if (!inv.irn || inv.einvoice_status === 'failed') {
          return (
            <Button variant="outline" size="sm" onClick={async () => {
              const testMode = (settings?.sale_settings as any)?.einvoice_settings?.test_mode ?? true;
              const res = await supabase.functions.invoke('generate-einvoice', {
                body: { saleId: inv.id, organizationId: currentOrganization?.id, testMode },
              });
              if (res.data?.success) {
                toast({ title: "Generated", description: "E-Invoice generated" });
                refetch();
              } else {
                toast({ title: "Failed", description: res.data?.error, variant: "destructive" });
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
  ], [settings, currentOrganization]);

  const periods: { value: PeriodFilter; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'last7', label: 'Last 7 Days' },
    { value: 'last30', label: 'Last 30 Days' },
    { value: 'this_month', label: 'This Month' },
    { value: 'all', label: 'All Time' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <BackToDashboard />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">E-Invoice Report</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={!filteredInvoices.length}>
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Export Excel
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

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="cursor-pointer" onClick={() => setStatusFilter('all')}>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{summary.total}</div>
            <div className="text-xs text-muted-foreground">Total B2B</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer border-green-200" onClick={() => setStatusFilter('generated')}>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{summary.generated}</div>
            <div className="text-xs text-muted-foreground">Generated</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => setStatusFilter('not_generated')}>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-amber-600">{summary.pending}</div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer border-orange-200" onClick={() => setStatusFilter('failed')}>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-orange-600">{summary.failed}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => setStatusFilter('cancelled')}>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-destructive">{summary.cancelled}</div>
            <div className="text-xs text-muted-foreground">Cancelled</div>
          </CardContent>
        </Card>
      </div>

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
        {summary.failed > 0 && (
          <Button variant="outline" size="sm" onClick={handleRetryAllFailed} disabled={isRetryingAll}>
            {isRetryingAll ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Retry All Failed ({summary.failed})
          </Button>
        )}
      </div>

      {/* Table */}
      <ERPTable
        data={filteredInvoices}
        columns={columns as any}
        isLoading={isLoading}
        emptyMessage="No B2B invoices found for this period"
      />
    </div>
  );
}
