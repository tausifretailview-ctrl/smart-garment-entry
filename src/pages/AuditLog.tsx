import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BackToDashboard } from "@/components/BackToDashboard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertCircle, FileText, CalendarIcon, Filter, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AuditLog {
  id: string;
  created_at: string;
  user_email: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: any;
  new_values: any;
  metadata: any;
}

export default function AuditLog() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterEntityType, setFilterEntityType] = useState<string>("all");
  const [filterUser, setFilterUser] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      const { data, error } = await query;

      if (error) throw error;

      setLogs(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load audit logs",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getActionBadgeVariant = (action: string) => {
    if (action.includes("CREATE") || action.includes("ASSIGNED")) return "default";
    if (action.includes("UPDATE")) return "secondary";
    if (action.includes("DELETE") || action.includes("REMOVED")) return "destructive";
    if (action.includes("STOCK")) return "outline";
    return "secondary";
  };

  const getEntityTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      product: "Product",
      sale: "Sale",
      purchase_bill: "Purchase",
      stock_movement: "Stock Movement",
      user_role: "User Role",
    };
    return labels[type] || type;
  };

  const filteredLogs = logs.filter((log) => {
    if (filterAction !== "all" && log.action !== filterAction) return false;
    if (filterEntityType !== "all" && log.entity_type !== filterEntityType) return false;
    if (filterUser && !log.user_email?.toLowerCase().includes(filterUser.toLowerCase())) return false;
    if (dateFrom && new Date(log.created_at) < dateFrom) return false;
    if (dateTo && new Date(log.created_at) > dateTo) return false;
    return true;
  });

  const uniqueActions = Array.from(new Set(logs.map((l) => l.action))).sort();
  const uniqueEntityTypes = Array.from(new Set(logs.map((l) => l.entity_type))).sort();

  const handleViewDetails = (log: AuditLog) => {
    setSelectedLog(log);
    setShowDetailsDialog(true);
  };

  const handleClearFilters = () => {
    setFilterAction("all");
    setFilterEntityType("all");
    setFilterUser("");
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <BackToDashboard />
        
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">Audit Logs</h1>
          </div>
          <Button onClick={fetchLogs} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This log tracks all critical operations including stock changes, sales, purchases, and user actions for accountability and troubleshooting.
          </AlertDescription>
        </Alert>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <Label>Action</Label>
                <Select value={filterAction} onValueChange={setFilterAction}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Actions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Actions</SelectItem>
                    {uniqueActions.map((action) => (
                      <SelectItem key={action} value={action}>
                        {action}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Entity Type</Label>
                <Select value={filterEntityType} onValueChange={setFilterEntityType}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {uniqueEntityTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {getEntityTypeLabel(type)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>User Email</Label>
                <Input
                  placeholder="Search by user..."
                  value={filterUser}
                  onChange={(e) => setFilterUser(e.target.value)}
                />
              </div>

              <div>
                <Label>Date From</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateFrom && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFrom ? format(dateFrom, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label>Date To</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateTo && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateTo ? format(dateTo, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="mt-4">
              <Button onClick={handleClearFilters} variant="ghost" size="sm">
                Clear All Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <Card>
          <CardHeader>
            <CardTitle>
              Activity Log ({filteredLogs.length} {filteredLogs.length === 1 ? "entry" : "entries"})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading logs...</div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No audit logs found</div>
            ) : (
              <ScrollArea className="h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Entity Type</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(log.created_at), "PPp")}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{log.user_email || "System"}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getActionBadgeVariant(log.action)}>{log.action}</Badge>
                        </TableCell>
                        <TableCell>{getEntityTypeLabel(log.entity_type)}</TableCell>
                        <TableCell className="max-w-md">
                          {log.new_values && (
                            <div className="text-sm text-muted-foreground truncate">
                              {log.new_values.sale_number && `Sale: ${log.new_values.sale_number}`}
                              {log.new_values.supplier_name && `Supplier: ${log.new_values.supplier_name}`}
                              {log.new_values.product_name && `Product: ${log.new_values.product_name}`}
                              {log.new_values.product_info?.product_name &&
                                `Product: ${log.new_values.product_info.product_name}`}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewDetails(log)}
                          >
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Details Dialog */}
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Audit Log Details</DialogTitle>
              <DialogDescription>
                Complete information about this audit log entry
              </DialogDescription>
            </DialogHeader>
            {selectedLog && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Timestamp</Label>
                    <p className="text-sm font-medium">
                      {format(new Date(selectedLog.created_at), "PPpp")}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">User</Label>
                    <p className="text-sm font-medium">{selectedLog.user_email || "System"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Action</Label>
                    <div className="mt-1">
                      <Badge variant={getActionBadgeVariant(selectedLog.action)}>
                        {selectedLog.action}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Entity Type</Label>
                    <p className="text-sm font-medium">
                      {getEntityTypeLabel(selectedLog.entity_type)}
                    </p>
                  </div>
                </div>

                {selectedLog.old_values && (
                  <div>
                    <Label className="text-muted-foreground">Old Values</Label>
                    <pre className="mt-1 p-3 bg-muted rounded-md text-xs overflow-x-auto">
                      {JSON.stringify(selectedLog.old_values, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedLog.new_values && (
                  <div>
                    <Label className="text-muted-foreground">New Values</Label>
                    <pre className="mt-1 p-3 bg-muted rounded-md text-xs overflow-x-auto">
                      {JSON.stringify(selectedLog.new_values, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedLog.metadata && (
                  <div>
                    <Label className="text-muted-foreground">Metadata</Label>
                    <pre className="mt-1 p-3 bg-muted rounded-md text-xs overflow-x-auto">
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
