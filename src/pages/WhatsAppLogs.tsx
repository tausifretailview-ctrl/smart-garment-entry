import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfDay, endOfDay } from "date-fns";
import { FullScreenLayout } from "@/components/FullScreenLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useWhatsAppAPI, WhatsAppLog } from "@/hooks/useWhatsAppAPI";
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
  Info
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { getWhatsAppErrorHint } from "@/utils/whatsappErrorHints";
import { getEffectiveWhatsAppLogStatus } from "@/utils/whatsappLogStatus";

/** @deprecated use getWhatsAppErrorHint — kept as alias for this file */
const getFriendlyErrorHint = (
  errorMessage?: string | null,
  providerResponse?: unknown,
  provider?: string | null,
) => getWhatsAppErrorHint(errorMessage, providerResponse, provider);

const getProviderBadge = (provider?: string | null) => {
  if (provider === 'wappconnect') {
    return <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300">WappConnect</Badge>;
  }
  if (provider === 'existing') {
    return <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-300">Meta/BSP</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground">Legacy</Badge>;
};

const getWappConnectLogDetails = (providerResponse?: Record<string, unknown> | null) => {
  if (!providerResponse) return null;
  const endpoint = String(providerResponse.endpoint || '');
  const requestUrl = String(providerResponse.requestUrl || '');
  if (!endpoint && !requestUrl) return null;
  return { endpoint, requestUrl };
};

const WhatsAppLogs = () => {
  const { fetchMessageLogs, retryMessage, isRetrying } = useWhatsAppAPI();
  
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLog, setSelectedLog] = useState<WhatsAppLog | null>(null);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Fetch logs with date filter
  const { data: logs, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['whatsapp-logs', statusFilter, typeFilter, providerFilter, selectedDate],
    queryFn: () => {
      const dateStart = startOfDay(new Date(selectedDate)).toISOString();
      const dateEnd = endOfDay(new Date(selectedDate)).toISOString();
      return fetchMessageLogs({
        status: statusFilter,
        templateType: typeFilter,
        limit: 500,
        startDate: dateStart,
        endDate: dateEnd,
      });
    },
  });

  // Calculate stats from the fetched logs for the selected date
  const stats = useMemo(() => {
    if (!logs) return null;
    const withEffectiveStatus = logs.map((log) => ({
      ...log,
      effectiveStatus: getEffectiveWhatsAppLogStatus(log),
    }));
    return {
      total: logs.length,
      sent: withEffectiveStatus.filter((l) => l.effectiveStatus === 'sent').length,
      delivered: withEffectiveStatus.filter((l) => l.effectiveStatus === 'delivered').length,
      read: withEffectiveStatus.filter((l) => l.effectiveStatus === 'read').length,
      failed: withEffectiveStatus.filter((l) => l.effectiveStatus === 'failed').length,
      pending: withEffectiveStatus.filter((l) => l.effectiveStatus === 'pending').length,
      retried: withEffectiveStatus.filter((l) => l.effectiveStatus === 'retried').length,
    };
  }, [logs]);

  const filteredLogs = logs?.filter(log => {
    if (providerFilter !== 'all') {
      const logProvider = log.provider || 'existing';
      if (providerFilter === 'wappconnect' && logProvider !== 'wappconnect') return false;
      if (providerFilter === 'existing' && logProvider !== 'existing') return false;
    }
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      log.phone_number.includes(query) ||
      log.message?.toLowerCase().includes(query) ||
      log.template_type.toLowerCase().includes(query)
    );
  }) || [];

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

  const handleRetry = (logId: string) => {
    retryMessage(logId);
  };

  const handleReload = async () => {
    await refetch();
    toast.success("Logs refreshed");
  };

  const handleExport = () => {
    if (!filteredLogs.length) {
      toast.error("No logs to export");
      return;
    }

    const exportData = filteredLogs.map(log => ({
      'Date': format(new Date(log.created_at), 'dd/MM/yyyy HH:mm'),
      'Phone': log.phone_number,
      'Type': log.template_type,
      'Status': log.status,
      'Provider': log.provider || 'existing',
      'Message': log.message?.substring(0, 100) || '',
      'Error': log.error_message || '',
      'Message ID': log.wamid || '',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "WhatsApp Logs");
    XLSX.writeFile(wb, `WhatsApp_Logs_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success("Logs exported successfully");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MessageSquare className="h-6 w-6 text-green-600" />
              WhatsApp Message Logs
            </h1>
            <p className="text-muted-foreground">
              Track WhatsApp messages — Meta/BSP and WappConnect sends
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void handleReload()} disabled={isFetching}>
              {isFetching ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Reload
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-center">
                <div className="text-3xl font-bold">{stats?.total || 0}</div>
                <div className="text-sm text-muted-foreground">Total</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">{stats?.sent || 0}</div>
                <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                  <Send className="h-3 w-3" /> Sent
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{stats?.delivered || 0}</div>
                <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Delivered
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-emerald-600">{stats?.read || 0}</div>
                <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                  <Eye className="h-3 w-3" /> Read
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-600">{stats?.pending || 0}</div>
                <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3" /> Pending
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600">{stats?.failed || 0}</div>
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
                  className="w-[160px]"
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by phone, message..."
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
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Providers</SelectItem>
                  <SelectItem value="wappconnect">WappConnect</SelectItem>
                  <SelectItem value="existing">Meta/BSP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Message History</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No messages found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date/Time</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log) => {
                      const effectiveStatus = getEffectiveWhatsAppLogStatus(log);
                      const errorHint = getFriendlyErrorHint(log.error_message, log.provider_response, log.provider);
                      return (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm')}
                        </TableCell>
                        <TableCell className="font-mono">{log.phone_number}</TableCell>
                        <TableCell>{getTypeBadge(log.template_type)}</TableCell>
                        <TableCell>{getProviderBadge(log.provider)}</TableCell>
                        <TableCell>{getStatusBadge(effectiveStatus)}</TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {effectiveStatus === 'failed' && errorHint ? (
                            <span className="text-red-600 text-xs flex items-center gap-1" title={errorHint.reason}>
                              <Info className="h-3 w-3 shrink-0" />
                              {errorHint.title}
                            </span>
                          ) : (
                            <>{log.message?.substring(0, 50)}...</>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedLog(log)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {effectiveStatus === 'failed' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRetry(log.id)}
                                disabled={isRetrying}
                              >
                                <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );})}
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
            {selectedLog && (() => {
              const effectiveStatus = getEffectiveWhatsAppLogStatus(selectedLog);
              return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Phone</label>
                    <p className="font-mono">{selectedLog.phone_number}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Status</label>
                    <div className="mt-1">{getStatusBadge(effectiveStatus)}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Type</label>
                    <div className="mt-1">{getTypeBadge(selectedLog.template_type)}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Provider</label>
                    <div className="mt-1">{getProviderBadge(selectedLog.provider)}</div>
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
                {selectedLog.status === 'retried' && (
                  <div>
                    <label className="text-sm font-medium text-amber-600">Retry Status</label>
                    <div className="mt-1 p-3 bg-amber-50 text-amber-800 rounded-lg text-sm">
                      ✅ This message was retried. A new message attempt has been created - check the logs for the new entry with the same phone number.
                    </div>
                  </div>
                )}
                {effectiveStatus === 'failed' && selectedLog.status !== 'retried' && (
                  <div>
                    <label className="text-sm font-medium text-red-600">Error</label>
                    <div className="mt-1 p-3 bg-red-50 text-red-800 rounded-lg text-sm">
                      {selectedLog.error_message || getFriendlyErrorHint(selectedLog.error_message, selectedLog.provider_response, selectedLog.provider)?.reason || 'WappConnect rejected the send.'}
                    </div>
                    {(() => {
                      const hint = getFriendlyErrorHint(selectedLog.error_message, selectedLog.provider_response, selectedLog.provider);
                      if (!hint) return null;
                      return (
                        <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm space-y-2">
                          <div className="flex items-start gap-2">
                            <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                            <div className="font-semibold text-amber-900">{hint.title}</div>
                          </div>
                          <div className="text-amber-800 pl-6">
                            <strong>Why:</strong> {hint.reason}
                          </div>
                          <div className="text-amber-800 pl-6">
                            <strong>What to do:</strong> {hint.action}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
                {selectedLog.error_message && selectedLog.status === 'retried' && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Original Error (before retry)</label>
                    <div className="mt-1 p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                      {selectedLog.error_message}
                    </div>
                  </div>
                )}
                {selectedLog.provider === 'wappconnect' && (() => {
                  const wc = getWappConnectLogDetails(selectedLog.provider_response as Record<string, unknown> | null);
                  if (!wc) return null;
                  return (
                    <div className="rounded-lg border bg-emerald-50/50 dark:bg-emerald-950/20 p-3 space-y-2">
                      <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">WappConnect send details</p>
                      {wc.endpoint && (
                        <div>
                          <label className="text-xs text-muted-foreground">API endpoint</label>
                          <p className="font-mono text-xs">{wc.endpoint}</p>
                        </div>
                      )}
                      {wc.requestUrl && (
                        <div>
                          <label className="text-xs text-muted-foreground">Request URL (instance id redacted)</label>
                          <p className="font-mono text-xs break-all">{wc.requestUrl}</p>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {selectedLog.provider_response && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">API Response</label>
                    <pre className="mt-1 p-3 bg-muted rounded-lg text-xs overflow-auto max-h-[200px]">
                      {JSON.stringify(selectedLog.provider_response, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );})()}
          </DialogContent>
      </Dialog>
    </div>
  );
};

export default WhatsAppLogs;
