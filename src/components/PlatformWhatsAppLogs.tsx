import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { 
  MessageSquare, 
  Send, 
  CheckCircle, 
  XCircle, 
  Clock,
  RefreshCw,
  Eye,
  Loader2,
  Search,
  FileText,
  Download,
  Calendar,
  Building2,
  Trash2,
  BarChart3
} from "lucide-react";
import { toast } from "sonner";
import { PlatformWhatsAppCredits } from "@/components/PlatformWhatsAppCredits";
import { PlatformWhatsAppOrgDashboard } from "@/components/PlatformWhatsAppOrgDashboard";
import type * as XLSXType from "xlsx";
/** Lazily loaded on export — keeps the xlsx bundle off this page's initial chunk. */
let xlsxModulePromise: Promise<typeof XLSXType> | null = null;
const loadXlsx = (): Promise<typeof XLSXType> => (xlsxModulePromise ??= import("xlsx"));

interface WhatsAppLog {
  id: string;
  organization_id: string;
  phone_number: string;
  message: string | null;
  template_name: string | null;
  template_type: string;
  status: string;
  wamid: string | null;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
  provider_response: any;
  organization_name?: string;
}

interface Organization {
  id: string;
  name: string;
}

type StatsPreset = "today" | "yesterday" | "last7" | "last30" | "this_month" | "last_month" | "all" | "custom";

const STATS_PRESET_LABELS: Record<StatsPreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  last30: "Last 30 days",
  this_month: "This month",
  last_month: "Last month",
  all: "All time",
  custom: "From – To",
};

const ymd = (d: Date) => format(d, "yyyy-MM-dd");

/** Inclusive yyyy-MM-dd range for the org stats; null ends = open. */
function statsRange(preset: StatsPreset, from: string, to: string, now = new Date()): { start: string | null; end: string | null } {
  switch (preset) {
    case "today":
      return { start: ymd(now), end: ymd(now) };
    case "yesterday":
      return { start: ymd(subDays(now, 1)), end: ymd(subDays(now, 1)) };
    case "last7":
      return { start: ymd(subDays(now, 6)), end: ymd(now) };
    case "last30":
      return { start: ymd(subDays(now, 29)), end: ymd(now) };
    case "this_month":
      return { start: ymd(startOfMonth(now)), end: ymd(now) };
    case "last_month": {
      const m = subMonths(now, 1);
      return { start: ymd(startOfMonth(m)), end: ymd(endOfMonth(m)) };
    }
    case "custom":
      return { start: from || null, end: to || null };
    default:
      return { start: null, end: null };
  }
}

interface OrgStats {
  organization_id: string;
  organization_name: string;
  total_count: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  pending_count: number;
}

export const PlatformWhatsAppLogs = () => {
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [orgFilter, setOrgFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLog, setSelectedLog] = useState<WhatsAppLog | null>(null);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
  const [statsPreset, setStatsPreset] = useState<StatsPreset>("this_month");
  const [statsFrom, setStatsFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [statsTo, setStatsTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [statsOrgSearch, setStatsOrgSearch] = useState("");
  const [dashboardOrgId, setDashboardOrgId] = useState("all");
  const queryClient = useQueryClient();

  // Fetch all organizations
  const { data: organizations = [] } = useQuery({
    queryKey: ['platform-organizations-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data as Organization[];
    },
  });

  const range = statsRange(statsPreset, statsFrom, statsTo);

  // Org-wise counts per day are kept in whatsapp_message_stats (detailed logs only 2 days)
  const { data: orgStats = [], isLoading: statsLoading, isFetching: statsFetching, refetch: refetchStats } = useQuery({
    queryKey: ['platform-whatsapp-org-stats', range.start, range.end],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_org_whatsapp_stats', {
        p_start_date: range.start ?? undefined,
        p_end_date: range.end ?? undefined,
      });
      if (error) throw error;
      return (data || []) as OrgStats[];
    },
    staleTime: 60000,
    placeholderData: (prev) => prev,
  });

  const visibleOrgStats = useMemo(() => {
    const q = statsOrgSearch.trim().toLowerCase();
    return q ? orgStats.filter((o) => o.organization_name?.toLowerCase().includes(q)) : orgStats;
  }, [orgStats, statsOrgSearch]);

  const rangeLabel = statsPreset === "all"
    ? "All time"
    : statsPreset === "custom"
      ? `${statsFrom ? format(new Date(statsFrom), 'dd/MM/yyyy') : 'start'} – ${statsTo ? format(new Date(statsTo), 'dd/MM/yyyy') : 'today'}`
      : `${STATS_PRESET_LABELS[statsPreset]}${range.start ? ` (${format(new Date(range.start), 'dd/MM')}${range.end && range.end !== range.start ? ` – ${format(new Date(range.end), 'dd/MM')}` : ''})` : ''}`;

  // Calculate max date (only allow last 2 days)
  const minDate = format(subDays(new Date(), 2), 'yyyy-MM-dd');
  const maxDate = format(new Date(), 'yyyy-MM-dd');

  // Fetch WhatsApp logs (only last 2 days available)
  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['platform-whatsapp-logs', statusFilter, typeFilter, orgFilter, selectedDate],
    queryFn: async () => {
      const dateStart = startOfDay(new Date(selectedDate)).toISOString();
      const dateEnd = endOfDay(new Date(selectedDate)).toISOString();
      
      let query = supabase
        .from('whatsapp_logs')
        .select('*')
        .gte('created_at', dateStart)
        .lte('created_at', dateEnd)
        .order('created_at', { ascending: false })
        .limit(500);
      
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (typeFilter !== 'all') {
        query = query.eq('template_type', typeFilter);
      }
      if (orgFilter !== 'all') {
        query = query.eq('organization_id', orgFilter);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Attach organization names
      const logsWithOrg = (data || []).map((log: any) => {
        const org = organizations.find(o => o.id === log.organization_id);
        return {
          ...log,
          organization_name: org?.name || 'Unknown'
        };
      });
      
      return logsWithOrg as WhatsAppLog[];
    },
    enabled: organizations.length > 0,
  });

  // Cleanup old logs mutation
  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('aggregate_and_cleanup_whatsapp_logs');
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Old logs cleaned up and aggregated successfully!');
      queryClient.invalidateQueries({ queryKey: ['platform-whatsapp-logs'] });
      queryClient.invalidateQueries({ queryKey: ['platform-whatsapp-org-stats'] });
      setShowCleanupConfirm(false);
    },
    onError: (error: any) => {
      toast.error(`Failed to cleanup logs: ${error.message}`);
    },
  });

  // Overall stats from today's logs
  const dailyStats = useMemo(() => {
    return {
      total: logs.length,
      sent: logs.filter(l => l.status === 'sent').length,
      delivered: logs.filter(l => l.status === 'delivered').length,
      read: logs.filter(l => l.status === 'read').length,
      failed: logs.filter(l => l.status === 'failed').length,
      pending: logs.filter(l => l.status === 'pending').length,
    };
  }, [logs]);

  // Totals for the selected stats range
  const totalStats = useMemo(() => {
    return visibleOrgStats.reduce((acc, org) => ({
      total: acc.total + Number(org.total_count),
      sent: acc.sent + Number(org.sent_count),
      delivered: acc.delivered + Number(org.delivered_count),
      read: acc.read + Number(org.read_count),
      failed: acc.failed + Number(org.failed_count),
      pending: acc.pending + Number(org.pending_count),
    }), { total: 0, sent: 0, delivered: 0, read: 0, failed: 0, pending: 0 });
  }, [visibleOrgStats]);

  const filteredLogs = logs.filter(log => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      log.phone_number.includes(query) ||
      log.message?.toLowerCase().includes(query) ||
      log.template_type.toLowerCase().includes(query) ||
      log.organization_name?.toLowerCase().includes(query)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent':
        return <Badge className="min-w-[80px] justify-center bg-blue-500 hover:bg-blue-600 text-white">Sent</Badge>;
      case 'delivered':
        return <Badge className="min-w-[80px] justify-center bg-green-500 hover:bg-green-600 text-white">Delivered</Badge>;
      case 'read':
        return <Badge className="min-w-[80px] justify-center bg-teal-500 hover:bg-teal-600 text-white">Read</Badge>;
      case 'failed':
        return <Badge className="min-w-[80px] justify-center bg-red-500 hover:bg-red-600 text-white">Failed</Badge>;
      case 'pending':
        return <Badge className="min-w-[80px] justify-center bg-pink-400 hover:bg-pink-500 text-white">Pending</Badge>;
      case 'retried':
        return <Badge className="min-w-[80px] justify-center bg-amber-500 hover:bg-amber-600 text-white">Retried</Badge>;
      default:
        return <Badge className="min-w-[80px] justify-center bg-gray-400 text-white">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    const typeColors: Record<string, string> = {
      'sales_invoice': 'bg-purple-100 text-purple-800',
      'quotation': 'bg-blue-100 text-blue-800',
      'sale_order': 'bg-orange-100 text-orange-800',
      'payment_reminder': 'bg-yellow-100 text-yellow-800',
      'test': 'bg-gray-100 text-gray-800',
    };
    return (
      <Badge variant="outline" className={typeColors[type] || ''}>
        {type.replace(/_/g, ' ')}
      </Badge>
    );
  };

  const handleExport = async () => {
    if (!filteredLogs.length) {
      toast.error("No logs to export");
      return;
    }

    const exportData = filteredLogs.map(log => ({
      'Organization': log.organization_name,
      'Date': format(new Date(log.created_at), 'dd/MM/yyyy HH:mm'),
      'Phone': log.phone_number,
      'Type': log.template_type,
      'Status': log.status,
      'Message': log.message?.substring(0, 100) || '',
      'Error': log.error_message || '',
      'Message ID': log.wamid || '',
    }));

    const XLSX = await loadXlsx();
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Platform WhatsApp Logs");
    XLSX.writeFile(wb, `Platform_WhatsApp_Logs_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success("Logs exported successfully");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-green-600" />
            WhatsApp Message Analytics
          </h3>
          <p className="text-sm text-muted-foreground">
            View aggregated stats per organization. Detailed logs retained for 2 days only.
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => setShowCleanupConfirm(true)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Cleanup Old Logs
          </Button>
          <Button variant="outline" onClick={() => { refetch(); refetchStats(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <PlatformWhatsAppOrgDashboard
        organizations={organizations}
        orgStats={orgStats}
        rangeLabel={rangeLabel}
        selectedOrgId={dashboardOrgId}
        onSelectOrg={setDashboardOrgId}
      />

      <PlatformWhatsAppCredits organizations={organizations} />

      {/* Organization stats for a date range (from daily aggregated table) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Message Stats by Organization
                {statsFetching && !statsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </CardTitle>
              <CardDescription>
                {rangeLabel}: {totalStats.total.toLocaleString()} messages from {visibleOrgStats.length} organizations
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={statsPreset} onValueChange={(v) => setStatsPreset(v as StatsPreset)}>
                <SelectTrigger className="w-[150px]">
                  <Calendar className="h-4 w-4 mr-1 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATS_PRESET_LABELS) as StatsPreset[]).map((k) => (
                    <SelectItem key={k} value={k}>{STATS_PRESET_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {statsPreset === "custom" && (
                <>
                  <Input
                    type="date"
                    value={statsFrom}
                    max={statsTo || maxDate}
                    onChange={(e) => setStatsFrom(e.target.value)}
                    className="w-[150px]"
                    aria-label="From date"
                  />
                  <span className="text-sm text-muted-foreground">to</span>
                  <Input
                    type="date"
                    value={statsTo}
                    min={statsFrom || undefined}
                    max={maxDate}
                    onChange={(e) => setStatsTo(e.target.value)}
                    className="w-[150px]"
                    aria-label="To date"
                  />
                </>
              )}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Find organization"
                  value={statsOrgSearch}
                  onChange={(e) => setStatsOrgSearch(e.target.value)}
                  className="pl-8 w-[180px]"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : visibleOrgStats.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No messages in this period</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-auto max-h-[480px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Sent</TableHead>
                    <TableHead className="text-center">Delivered</TableHead>
                    <TableHead className="text-center">Read</TableHead>
                    <TableHead className="text-center">Failed</TableHead>
                    <TableHead className="text-center">Pending</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleOrgStats.map((stat) => (
                    <TableRow
                      key={stat.organization_id}
                      className={`cursor-pointer ${dashboardOrgId === stat.organization_id ? "bg-primary/10" : ""}`}
                      onClick={() => {
                        setDashboardOrgId(stat.organization_id);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      title="Show this organization in the cards above"
                    >
                      <TableCell className="font-medium">{stat.organization_name}</TableCell>
                      <TableCell className="text-center font-bold">{Number(stat.total_count).toLocaleString()}</TableCell>
                      <TableCell className="text-center text-blue-600">{Number(stat.sent_count).toLocaleString()}</TableCell>
                      <TableCell className="text-center text-green-600">{Number(stat.delivered_count).toLocaleString()}</TableCell>
                      <TableCell className="text-center text-emerald-600">{Number(stat.read_count).toLocaleString()}</TableCell>
                      <TableCell className="text-center text-red-600">{Number(stat.failed_count).toLocaleString()}</TableCell>
                      <TableCell className="text-center text-yellow-600">{Number(stat.pending_count).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  {visibleOrgStats.length > 1 && (
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-center">{totalStats.total.toLocaleString()}</TableCell>
                      <TableCell className="text-center text-blue-600">{totalStats.sent.toLocaleString()}</TableCell>
                      <TableCell className="text-center text-green-600">{totalStats.delivered.toLocaleString()}</TableCell>
                      <TableCell className="text-center text-emerald-600">{totalStats.read.toLocaleString()}</TableCell>
                      <TableCell className="text-center text-red-600">{totalStats.failed.toLocaleString()}</TableCell>
                      <TableCell className="text-center text-yellow-600">{totalStats.pending.toLocaleString()}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-3xl font-bold">{dailyStats.total}</div>
              <div className="text-sm text-muted-foreground">
                {selectedDate === maxDate ? "Today's Total" : `Total ${format(new Date(selectedDate), 'dd/MM')}`}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">{dailyStats.sent}</div>
              <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                <Send className="h-3 w-3" /> Sent
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{dailyStats.delivered}</div>
              <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                <CheckCircle className="h-3 w-3" /> Delivered
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-emerald-600">{dailyStats.read}</div>
              <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                <Eye className="h-3 w-3" /> Read
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-600">{dailyStats.pending}</div>
              <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                <Clock className="h-3 w-3" /> Pending
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-red-600">{dailyStats.failed}</div>
              <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                <XCircle className="h-3 w-3" /> Failed
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                min={minDate}
                max={maxDate}
                className="w-[160px]"
              />
              <span className="text-xs text-muted-foreground">(Last 2 days only)</span>
            </div>
            <Select value={orgFilter} onValueChange={setOrgFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Organization" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Organizations</SelectItem>
                {organizations.map(org => (
                  <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by phone, message, org..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Message Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="sales_invoice">Sales Invoice</SelectItem>
                <SelectItem value="quotation">Quotation</SelectItem>
                <SelectItem value="sale_order">Sale Order</SelectItem>
                <SelectItem value="payment_reminder">Payment Reminder</SelectItem>
                <SelectItem value="test">Test</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Message History (Last 2 Days)</CardTitle>
          <CardDescription>
            Detailed logs are only available for the last 2 days. Older logs are aggregated into statistics.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No messages found for this date</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Date/Time</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium text-sm">
                        <Badge variant="outline">{log.organization_name}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm')}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{log.phone_number}</TableCell>
                      <TableCell>{getTypeBadge(log.template_type)}</TableCell>
                      <TableCell>{getStatusBadge(log.status)}</TableCell>
                      <TableCell className="max-w-[150px] truncate text-sm">
                        {log.message?.substring(0, 40)}...
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedLog(log)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Message Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Message Details
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Organization</label>
                  <p className="font-medium">{selectedLog.organization_name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Phone</label>
                  <p className="font-mono">{selectedLog.phone_number}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  <div className="mt-1">{getStatusBadge(selectedLog.status)}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Type</label>
                  <div className="mt-1">{getTypeBadge(selectedLog.template_type)}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Sent At</label>
                  <p>{selectedLog.sent_at ? format(new Date(selectedLog.sent_at), 'dd/MM/yyyy HH:mm:ss') : '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Delivered At</label>
                  <p className={selectedLog.delivered_at ? 'text-green-600' : ''}>
                    {selectedLog.delivered_at ? format(new Date(selectedLog.delivered_at), 'dd/MM/yyyy HH:mm:ss') : 'Not yet'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Read At</label>
                  <p className={selectedLog.read_at ? 'text-blue-600 font-medium' : ''}>
                    {selectedLog.read_at ? format(new Date(selectedLog.read_at), 'dd/MM/yyyy HH:mm:ss') : 'Not yet'}
                  </p>
                </div>
                {selectedLog.wamid && (
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-muted-foreground">WhatsApp Message ID</label>
                    <p className="font-mono text-xs break-all">{selectedLog.wamid}</p>
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Message</label>
                <div className="mt-1 p-3 bg-muted rounded-lg whitespace-pre-wrap text-sm">
                  {selectedLog.message}
                </div>
              </div>
              {selectedLog.error_message && (
                <div>
                  <label className="text-sm font-medium text-red-600">Error</label>
                  <div className="mt-1 p-3 bg-red-50 text-red-800 rounded-lg text-sm">
                    {selectedLog.error_message}
                  </div>
                </div>
              )}
              {selectedLog.provider_response && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">API Response</label>
                  <pre className="mt-1 p-3 bg-muted rounded-lg text-xs overflow-auto max-h-32">
                    {JSON.stringify(selectedLog.provider_response, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cleanup Confirmation Dialog */}
      <AlertDialog open={showCleanupConfirm} onOpenChange={setShowCleanupConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cleanup Old WhatsApp Logs?</AlertDialogTitle>
            <AlertDialogDescription>
              This will aggregate all logs older than 2 days into summary statistics and delete the detailed logs.
              The aggregated counts will be preserved in the stats table for reporting.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => cleanupMutation.mutate()}
              disabled={cleanupMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {cleanupMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Cleaning up...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Cleanup Logs
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
