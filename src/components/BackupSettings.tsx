import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useBackup } from "@/hooks/useBackup";
import { CloudUpload, ExternalLink, Loader2, HardDrive, CheckCircle2, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";

const BackupSettings = () => {
  const { backupLogs, isLoadingLogs, isBackingUp, startBackup, formatFileSize } = useBackup();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-100 text-blue-800"><Loader2 className="w-3 h-3 mr-1 animate-spin" />In Progress</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  const getTotalRecords = (records: Record<string, number> | null): number => {
    if (!records) return 0;
    return Object.values(records).reduce((sum, count) => sum + count, 0);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Google Drive Backup
          </CardTitle>
          <CardDescription>
            Backup your organization data to Google Drive. All masters, transactions, and settings will be exported.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div>
              <h4 className="font-medium">Manual Backup</h4>
              <p className="text-sm text-muted-foreground">
                Create a backup of all organization data now
              </p>
            </div>
            <Button 
              onClick={startBackup} 
              disabled={isBackingUp}
              className="gap-2"
            >
              {isBackingUp ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Backing up...
                </>
              ) : (
                <>
                  <CloudUpload className="h-4 w-4" />
                  Backup Now
                </>
              )}
            </Button>
          </div>

          <div className="text-sm text-muted-foreground">
            <p className="font-medium mb-2">Data included in backup:</p>
            <ul className="grid grid-cols-2 md:grid-cols-4 gap-1">
              <li>• Customers</li>
              <li>• Suppliers</li>
              <li>• Products & Variants</li>
              <li>• Sales & Returns</li>
              <li>• Purchases & Returns</li>
              <li>• Quotations</li>
              <li>• Sale Orders</li>
              <li>• Credit Notes</li>
              <li>• Voucher Entries</li>
              <li>• Account Ledgers</li>
              <li>• Employees</li>
              <li>• Settings</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backup History</CardTitle>
          <CardDescription>Recent backups for your organization</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingLogs ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !backupLogs?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              No backups yet. Create your first backup above.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backupLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      {format(new Date(log.created_at), 'dd MMM yyyy, hh:mm a')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {log.backup_type}
                      </Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(log.status)}</TableCell>
                    <TableCell>{formatFileSize(log.file_size)}</TableCell>
                    <TableCell>{getTotalRecords(log.records_count as Record<string, number>)}</TableCell>
                    <TableCell>
                      {log.drive_file_link && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(log.drive_file_link!, '_blank')}
                          className="gap-1"
                        >
                          <ExternalLink className="h-4 w-4" />
                          View
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BackupSettings;
