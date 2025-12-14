import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBackup } from "@/hooks/useBackup";
import { CloudUpload, ExternalLink, Loader2, HardDrive, CheckCircle2, XCircle, Clock, Key, Eye, EyeOff, Save, Download, FileSpreadsheet } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const BackupSettings = () => {
  const { backupLogs, isLoadingLogs, isBackingUp, isDownloading, startBackup, downloadBackup, downloadBackupAsExcel, formatFileSize } = useBackup();
  
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [showRefreshToken, setShowRefreshToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveCredentials = async () => {
    if (!clientId.trim() || !clientSecret.trim() || !refreshToken.trim()) {
      toast.error("Please fill in all credential fields");
      return;
    }

    setIsSaving(true);
    try {
      // Call an edge function to update the secrets
      const { error } = await supabase.functions.invoke('update-google-secrets', {
        body: {
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
          refreshToken: refreshToken.trim()
        }
      });

      if (error) throw error;

      toast.success("Google Drive credentials saved successfully!");
      // Clear the form after successful save
      setClientId("");
      setClientSecret("");
      setRefreshToken("");
    } catch (error: any) {
      console.error("Failed to save credentials:", error);
      toast.error(error.message || "Failed to save credentials. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

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
      {/* Local Download Backup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Local Backup
          </CardTitle>
          <CardDescription>
            Download your organization data as a JSON file to your local machine.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div>
              <h4 className="font-medium">Download Backup</h4>
              <p className="text-sm text-muted-foreground">
                Export all organization data to a JSON file
              </p>
            </div>
            <Button 
              onClick={downloadBackup} 
              disabled={isDownloading}
              className="gap-2"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Downloading...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Download Backup
                </>
              )}
            </Button>
          </div>

          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div>
              <h4 className="font-medium">Download as Excel</h4>
              <p className="text-sm text-muted-foreground">
                Export all data to Excel for analysis in spreadsheet software
              </p>
            </div>
            <Button 
              onClick={downloadBackupAsExcel} 
              disabled={isDownloading}
              variant="outline"
              className="gap-2"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Downloading...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="h-4 w-4" />
                  Download Excel
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

      {/* Google Drive Backup */}
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
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Google Drive Credentials
          </CardTitle>
          <CardDescription>
            Configure your Google API credentials for Drive backup. Get these from 
            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-primary ml-1 underline">
              Google Cloud Console
            </a>
            {" "}and{" "}
            <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noopener noreferrer" className="text-primary underline">
              OAuth Playground
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="clientId">Client ID</Label>
              <Input
                id="clientId"
                type="text"
                placeholder="xxxxx.apps.googleusercontent.com"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="clientSecret">Client Secret</Label>
              <div className="relative">
                <Input
                  id="clientSecret"
                  type={showClientSecret ? "text" : "password"}
                  placeholder="GOCSPX-xxxxxx"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowClientSecret(!showClientSecret)}
                >
                  {showClientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="refreshToken">Refresh Token</Label>
              <div className="relative">
                <Input
                  id="refreshToken"
                  type={showRefreshToken ? "text" : "password"}
                  placeholder="1//04xxxxxx"
                  value={refreshToken}
                  onChange={(e) => setRefreshToken(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowRefreshToken(!showRefreshToken)}
                >
                  {showRefreshToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Get this from OAuth Playground after authorizing with Google Drive API scope
              </p>
            </div>
          </div>
          
          <Button 
            onClick={handleSaveCredentials} 
            disabled={isSaving || !clientId || !clientSecret || !refreshToken}
            className="gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Credentials
              </>
            )}
          </Button>
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
