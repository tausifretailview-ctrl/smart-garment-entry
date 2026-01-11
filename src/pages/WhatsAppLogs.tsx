import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
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
  Download
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const WhatsAppLogs = () => {
  const { fetchMessageLogs, retryMessage, isRetrying, getMessageStats } = useWhatsAppAPI();
  
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLog, setSelectedLog] = useState<WhatsAppLog | null>(null);

  // Fetch logs
  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ['whatsapp-logs', statusFilter, typeFilter],
    queryFn: () => fetchMessageLogs({
      status: statusFilter,
      templateType: typeFilter,
      limit: 100,
    }),
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['whatsapp-stats'],
    queryFn: getMessageStats,
    refetchInterval: 30000,
  });

  const filteredLogs = logs?.filter(log => {
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
        return <Badge variant="default" className="bg-blue-500"><Send className="h-3 w-3 mr-1" /> Sent</Badge>;
      case 'delivered':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" /> Delivered</Badge>;
      case 'read':
        return <Badge variant="default" className="bg-green-600"><Eye className="h-3 w-3 mr-1" /> Read</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Failed</Badge>;
      case 'pending':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>;
      case 'retried':
        return <Badge variant="outline"><RefreshCw className="h-3 w-3 mr-1" /> Retried</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
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
              Track all WhatsApp messages sent via the Business API
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
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
                <div className="text-3xl font-bold">{stats?.todayTotal || 0}</div>
                <div className="text-sm text-muted-foreground">Today Total</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">{stats?.todaySent || 0}</div>
                <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                  <Send className="h-3 w-3" /> Sent
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{stats?.todayDelivered || 0}</div>
                <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Delivered
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-emerald-600">{stats?.todayRead || 0}</div>
                <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                  <Eye className="h-3 w-3" /> Read
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-600">{stats?.todayPending || 0}</div>
                <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3" /> Pending
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600">{stats?.todayFailed || 0}</div>
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
                      <TableHead>Status</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm')}
                        </TableCell>
                        <TableCell className="font-mono">{log.phone_number}</TableCell>
                        <TableCell>{getTypeBadge(log.template_type)}</TableCell>
                        <TableCell>{getStatusBadge(log.status)}</TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {log.message?.substring(0, 50)}...
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
                            {log.status === 'failed' && (
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
                    <pre className="mt-1 p-3 bg-muted rounded-lg text-xs overflow-auto max-h-[200px]">
                      {JSON.stringify(selectedLog.provider_response, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
      </Dialog>
    </div>
  );
};

export default WhatsAppLogs;
