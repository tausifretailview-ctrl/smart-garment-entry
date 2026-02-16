import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useBackup } from "@/hooks/useBackup";
import { CloudUpload, ExternalLink, Loader2, HardDrive, CheckCircle2, XCircle, Clock, Key, Eye, EyeOff, Save, Download, FileSpreadsheet, Trash2, AlertTriangle, Cloud, Mail, ChevronDown, Shield } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOrganization } from "@/contexts/OrganizationContext";
import OrganizationResetDialog from "./OrganizationResetDialog";

const BackupSettings = () => {
  const { organizationRole, currentOrganization } = useOrganization();
  const { 
    backupLogs, isLoadingLogs, isBackingUp, isDownloading, 
    startBackup, downloadBackup, downloadBackupAsExcel, formatFileSize,
    startCloudBackup, isCloudBackingUp, downloadCloudBackup
  } = useBackup();
  
  // Auto-backup settings
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [backupEmail, setBackupEmail] = useState("");
  const [retentionDays, setRetentionDays] = useState("30");
  const [lastAutoBackupAt, setLastAutoBackupAt] = useState<string | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Google Drive credentials (advanced)
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [showRefreshToken, setShowRefreshToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Load settings
  useEffect(() => {
    const loadSettings = async () => {
      if (!currentOrganization?.id) return;
      try {
        const { data } = await supabase
          .from('settings')
          .select('auto_backup_enabled, backup_email, backup_retention_days, last_auto_backup_at')
          .eq('organization_id', currentOrganization.id)
          .maybeSingle();
        
        if (data) {
          setAutoBackupEnabled((data as any).auto_backup_enabled || false);
          setBackupEmail((data as any).backup_email || "");
          setRetentionDays(String((data as any).backup_retention_days || 30));
          setLastAutoBackupAt((data as any).last_auto_backup_at);
        }
      } catch (e) {
        console.error('Failed to load backup settings:', e);
      } finally {
        setIsLoadingSettings(false);
      }
    };
    loadSettings();
  }, [currentOrganization?.id]);

  const handleSaveAutoBackupSettings = async (enabled?: boolean) => {
    if (!currentOrganization?.id) return;
    setIsSavingSettings(true);
    try {
      const updates: Record<string, any> = {
        auto_backup_enabled: enabled !== undefined ? enabled : autoBackupEnabled,
        backup_email: backupEmail.trim() || null,
        backup_retention_days: parseInt(retentionDays),
      };

      const { error } = await supabase
        .from('settings')
        .update(updates)
        .eq('organization_id', currentOrganization.id);

      if (error) throw error;
      toast.success("Backup settings saved!");
    } catch (error: any) {
      console.error('Failed to save backup settings:', error);
      toast.error("Failed to save settings");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleToggleAutoBackup = async (checked: boolean) => {
    setAutoBackupEnabled(checked);
    await handleSaveAutoBackupSettings(checked);
  };

  const handleSaveCredentials = async () => {
    if (!clientId.trim() || !clientSecret.trim() || !refreshToken.trim()) {
      toast.error("Please fill in all credential fields");
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase.functions.invoke('update-google-secrets', {
        body: { clientId: clientId.trim(), clientSecret: clientSecret.trim(), refreshToken: refreshToken.trim() }
      });
      if (error) throw error;
      toast.success("Google Drive credentials saved successfully!");
      setClientId(""); setClientSecret(""); setRefreshToken("");
    } catch (error: any) {
      toast.error(error.message || "Failed to save credentials.");
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
      {/* Cloud Auto-Backup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Cloud Auto-Backup
          </CardTitle>
          <CardDescription>
            Automatically backs up your data daily. No setup required.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingSettings ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <h4 className="font-medium">Enable Daily Auto-Backup</h4>
                  <p className="text-sm text-muted-foreground">
                    Backup runs automatically when you open the app each day
                  </p>
                </div>
                <Switch
                  checked={autoBackupEnabled}
                  onCheckedChange={handleToggleAutoBackup}
                  disabled={isSavingSettings}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="backupEmail" className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    Email Notification (optional)
                  </Label>
                  <Input
                    id="backupEmail"
                    type="email"
                    placeholder="admin@company.com"
                    value={backupEmail}
                    onChange={(e) => setBackupEmail(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Receive backup notifications at this email
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="retention" className="flex items-center gap-1">
                    <Shield className="h-3.5 w-3.5" />
                    Retention Period
                  </Label>
                  <Select value={retentionDays} onValueChange={setRetentionDays}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="60">60 days</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Older backups are automatically removed
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {lastAutoBackupAt ? (
                    <span>Last backup: {format(new Date(lastAutoBackupAt), 'dd MMM yyyy, hh:mm a')}</span>
                  ) : (
                    <span>No automatic backup yet</span>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={() => handleSaveAutoBackupSettings()}
                  disabled={isSavingSettings}
                  variant="outline"
                  className="gap-1"
                >
                  {isSavingSettings ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save Settings
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Manual Backup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Manual Backup
          </CardTitle>
          <CardDescription>
            Download or create a cloud backup on demand.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <Button onClick={downloadBackup} disabled={isDownloading} variant="outline" className="gap-2">
              {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download JSON
            </Button>
            <Button onClick={downloadBackupAsExcel} disabled={isDownloading} variant="outline" className="gap-2">
              {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Download Excel
            </Button>
            <Button onClick={startCloudBackup} disabled={isCloudBackingUp} className="gap-2">
              {isCloudBackingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
              Cloud Backup Now
            </Button>
          </div>

          <div className="text-sm text-muted-foreground">
            <p className="font-medium mb-1">Data included:</p>
            <p className="text-xs">
              Customers, Suppliers, Products, Sales, Purchases, Returns, Quotations, Sale Orders, Credit Notes, Vouchers, Ledgers, Employees, Settings
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Advanced: Google Drive */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <Card>
          <CollapsibleTrigger className="w-full">
            <CardHeader className="cursor-pointer">
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5" />
                  Advanced: Google Drive Setup
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <CardDescription>
                For power users: backup directly to Google Drive using OAuth credentials.
              </CardDescription>
              
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <h4 className="font-medium">Google Drive Backup</h4>
                  <p className="text-sm text-muted-foreground">Backup to your Google Drive account</p>
                </div>
                <Button onClick={startBackup} disabled={isBackingUp} className="gap-2">
                  {isBackingUp ? <><Loader2 className="h-4 w-4 animate-spin" />Backing up...</> : <><CloudUpload className="h-4 w-4" />Backup to Drive</>}
                </Button>
              </div>

              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="clientId">Client ID</Label>
                  <Input id="clientId" type="text" placeholder="xxxxx.apps.googleusercontent.com" value={clientId} onChange={(e) => setClientId(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientSecret">Client Secret</Label>
                  <div className="relative">
                    <Input id="clientSecret" type={showClientSecret ? "text" : "password"} placeholder="GOCSPX-xxxxxx" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
                    <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowClientSecret(!showClientSecret)}>
                      {showClientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="refreshToken">Refresh Token</Label>
                  <div className="relative">
                    <Input id="refreshToken" type={showRefreshToken ? "text" : "password"} placeholder="1//04xxxxxx" value={refreshToken} onChange={(e) => setRefreshToken(e.target.value)} />
                    <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowRefreshToken(!showRefreshToken)}>
                      {showRefreshToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Get credentials from{" "}
                    <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-primary underline">Google Cloud Console</a>
                    {" "}and{" "}
                    <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noopener noreferrer" className="text-primary underline">OAuth Playground</a>
                  </p>
                </div>
              </div>
              
              <Button onClick={handleSaveCredentials} disabled={isSaving || !clientId || !clientSecret || !refreshToken} className="gap-2">
                {isSaving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : <><Save className="h-4 w-4" />Save Credentials</>}
              </Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Backup History */}
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
              No backups yet. Enable auto-backup or create one manually.
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
                    <TableCell>{format(new Date(log.created_at), 'dd MMM yyyy, hh:mm a')}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{log.backup_type}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(log.status)}</TableCell>
                    <TableCell>{formatFileSize(log.file_size)}</TableCell>
                    <TableCell>{getTotalRecords(log.records_count as Record<string, number>)}</TableCell>
                    <TableCell className="flex gap-1">
                      {(log as any).storage_path && log.status === 'completed' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => downloadCloudBackup((log as any).storage_path, log.file_name)}
                          className="gap-1"
                        >
                          <Download className="h-4 w-4" />
                          Download
                        </Button>
                      )}
                      {log.drive_file_link && (
                        <Button variant="ghost" size="sm" onClick={() => window.open(log.drive_file_link!, '_blank')} className="gap-1">
                          <ExternalLink className="h-4 w-4" />
                          Drive
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

      {/* Reset Organization Data - Admin Only */}
      {organizationRole === "admin" && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Reset Organization Data
            </CardTitle>
            <CardDescription>
              Permanently delete all trial/test data and start fresh. This action cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium text-destructive">Danger Zone</p>
                  <p className="text-sm text-muted-foreground">
                    This will delete all products, customers, suppliers, sales, purchases, stock movements, 
                    and all other transaction data. Barcode and bill number sequences will be reset.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <OrganizationResetDialog />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BackupSettings;
