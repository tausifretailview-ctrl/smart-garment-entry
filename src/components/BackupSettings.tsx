import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SettingsFieldBlock, SettingsRow, SettingsSection } from "@/components/settings/settingsLayout";
import { useBackup } from "@/hooks/useBackup";
import type { BackupLog } from "@/hooks/useBackup";
import { CloudUpload, ExternalLink, Loader2, HardDrive, CheckCircle2, XCircle, Clock, Eye, EyeOff, Save, Download, FileSpreadsheet, Trash2, AlertTriangle, ChevronDown, RotateCcw } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOrganization } from "@/contexts/OrganizationContext";
import { isStatementTimeout } from "@/utils/statementTimeout";
import OrganizationResetDialog from "./OrganizationResetDialog";
import {
  BACKUP_RETENTION_OPTIONS,
  DEFAULT_BACKUP_RETENTION_DAYS,
  normalizeBackupRetentionDays,
} from "@/utils/backupRetention";

interface BackupSettingsProps {
  autoBackupEnabled?: boolean;
  backupEmail?: string;
  backupRetentionDays?: number;
  lastAutoBackupAt?: string | null;
  /** Keep Settings page local state aligned with optimistic toggle. */
  onAutoBackupEnabledChange?: (enabled: boolean) => void;
}

const BackupSettings = ({
  backupEmail: backupEmailProp = "",
  backupRetentionDays: backupRetentionDaysProp = DEFAULT_BACKUP_RETENTION_DAYS,
  lastAutoBackupAt: lastAutoBackupAtProp = null,
  onAutoBackupEnabledChange,
}: BackupSettingsProps) => {
  const { organizationRole, currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const { 
    backupLogs, isLoadingLogs, isBackingUp, isDownloading, 
    startBackup, downloadBackup, downloadBackupAsExcel, formatFileSize,
    startCloudBackup, isCloudBackingUp, downloadCloudBackup
  } = useBackup();
  
  // Auto-backup settings
  const [backupEmail, setBackupEmail] = useState("");
  const [retentionDays, setRetentionDays] = useState(String(DEFAULT_BACKUP_RETENTION_DAYS));
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
  const [restoreTarget, setRestoreTarget] = useState<BackupLog | null>(null);

  useEffect(() => {
    setBackupEmail(backupEmailProp);
    setRetentionDays(() => {
      const n = normalizeBackupRetentionDays(backupRetentionDaysProp);
      return (BACKUP_RETENTION_OPTIONS as readonly number[]).includes(n)
        ? String(n)
        : String(DEFAULT_BACKUP_RETENTION_DAYS);
    });
    setLastAutoBackupAt(lastAutoBackupAtProp);
    setIsLoadingSettings(false);
  }, [backupEmailProp, backupRetentionDaysProp, lastAutoBackupAtProp]);

  const handleSaveAutoBackupSettings = async () => {
    if (!currentOrganization?.id) return;
    setIsSavingSettings(true);
    try {
      const { error } = await supabase
        .from("settings")
        .update({
          auto_backup_enabled: true,
          backup_email: backupEmail.trim() || null,
          backup_retention_days: normalizeBackupRetentionDays(retentionDays),
        })
        .eq("organization_id", currentOrganization.id);

      if (error) throw error;
      onAutoBackupEnabledChange?.(true);
      void queryClient.invalidateQueries({ queryKey: ["org-settings", currentOrganization.id] });
      toast.success("Backup settings saved!");
    } catch (error: unknown) {
      console.error("Failed to save backup settings:", error);
      if (!isStatementTimeout(error)) {
        toast.error("Failed to save settings");
      }
    } finally {
      setIsSavingSettings(false);
    }
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

  // Prefer latest completed automatic from history; fall back to settings.last_auto_backup_at.
  const lastCompletedAutoAt = (() => {
    const fromLogs = backupLogs?.find(
      (log) => log.status === "completed" && String(log.backup_type).toLowerCase() === "automatic",
    )?.created_at;
    return fromLogs || lastAutoBackupAt;
  })();

  const AUTO_BACKUP_OVERDUE_MS = 36 * 60 * 60 * 1000; // >1 missed night
  const autoBackupOverdue =
    !lastCompletedAutoAt ||
    Date.now() - new Date(lastCompletedAutoAt).getTime() > AUTO_BACKUP_OVERDUE_MS;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 items-start">
      <Card className="h-fit settings-panel-card">
        <CardHeader>
          <CardTitle>Backup Settings</CardTitle>
          <CardDescription>
            Nightly cloud backup, retention, and on-demand downloads. Same saved keys as before — only the page moved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoadingSettings ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {autoBackupOverdue && (
                <div
                  role="alert"
                  className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
                >
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">Automatic backup is overdue</p>
                    <p className="text-muted-foreground">
                      {lastCompletedAutoAt
                        ? `Last completed automatic backup: ${format(new Date(lastCompletedAutoAt), "dd MMM yyyy, hh:mm a")}. `
                        : "No completed automatic backup found. "}
                      Nightly runs are expected at 11:00 PM IST. Use{" "}
                      <span className="font-medium text-foreground">Run Cloud Backup Now</span> for
                      an immediate backup.
                    </p>
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
                Every organization is backed up every night at <strong className="text-foreground">11:00 PM IST</strong>.
                Files older than the retention window are removed after each run.
              </div>

              <SettingsSection title="Daily auto-backup">
                <SettingsRow
                  label="Nightly cloud backup"
                  description="Always on for every organization. Cannot be turned off."
                >
                  <Badge className="bg-green-100 text-green-800">Always on</Badge>
                </SettingsRow>
                <SettingsFieldBlock
                  label="Notification email (coming soon)"
                  htmlFor="backupEmail"
                  description="Email delivery is not active yet."
                >
                  <Input
                    id="backupEmail"
                    type="email"
                    placeholder="admin@company.com"
                    value={backupEmail}
                    onChange={(e) => setBackupEmail(e.target.value)}
                  />
                </SettingsFieldBlock>

                <SettingsFieldBlock
                  label="Delete backups older than"
                  htmlFor="backupRetention"
                  description="After each nightly backup, files and history older than this are removed. Default and minimum 3 days."
                >
                  <Select value={retentionDays} onValueChange={setRetentionDays}>
                    <SelectTrigger id="backupRetention" className="max-w-xs">
                      <SelectValue placeholder="Choose retention" />
                    </SelectTrigger>
                    <SelectContent>
                      {BACKUP_RETENTION_OPTIONS.map((days) => (
                        <SelectItem key={days} value={String(days)}>
                          {days} days
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingsFieldBlock>
                <SettingsRow
                  label="Last automatic backup"
                  description={
                    lastCompletedAutoAt
                      ? `${format(new Date(lastCompletedAutoAt), "dd MMM yyyy, hh:mm a")}${autoBackupOverdue ? " (overdue)" : ""}`
                      : "No automatic backup yet"
                  }
                >
                  <Button
                    size="sm"
                    onClick={() => void handleSaveAutoBackupSettings()}
                    disabled={isSavingSettings}
                    variant="outline"
                    className="gap-1"
                  >
                    {isSavingSettings ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Save Settings
                  </Button>
                </SettingsRow>
              </SettingsSection>

              <SettingsSection title="Manual backup">
                <SettingsFieldBlock
                  label="On-demand backup"
                  description="Customers, Suppliers, Products, Sales, Purchases, Returns, Quotations, Sale Orders, Credit Notes, Vouchers, Ledgers, Employees, Settings"
                >
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={downloadBackup} disabled={isDownloading} variant="outline" className="gap-2">
                      {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      Download JSON
                    </Button>
                    <Button onClick={downloadBackupAsExcel} disabled={isDownloading} variant="outline" className="gap-2">
                      {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                      Download Excel
                    </Button>
                    <Button
                      onClick={() => void startCloudBackup()}
                      disabled={isCloudBackingUp}
                      className="gap-2"
                    >
                      {isCloudBackingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
                      Run Cloud Backup Now
                    </Button>
                  </div>
                </SettingsFieldBlock>
              </SettingsSection>

              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <SettingsSection title="Google Drive (advanced)">
                  <CollapsibleTrigger className="w-full">
                    <SettingsRow
                      label="Google Drive setup"
                      description="Backup directly to Google Drive using OAuth credentials."
                    >
                      <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
                    </SettingsRow>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SettingsFieldBlock label="Client ID" htmlFor="clientId">
                      <Input id="clientId" type="text" placeholder="xxxxx.apps.googleusercontent.com" value={clientId} onChange={(e) => setClientId(e.target.value)} />
                    </SettingsFieldBlock>
                    <SettingsFieldBlock label="Client Secret" htmlFor="clientSecret">
                      <div className="relative">
                        <Input id="clientSecret" type={showClientSecret ? "text" : "password"} placeholder="GOCSPX-xxxxxx" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
                        <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowClientSecret(!showClientSecret)}>
                          {showClientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </SettingsFieldBlock>
                    <SettingsFieldBlock
                      label="Refresh Token"
                      htmlFor="refreshToken"
                      description={
                        <>
                          Get credentials from{" "}
                          <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-primary underline">Google Cloud Console</a>
                          {" "}and{" "}
                          <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noopener noreferrer" className="text-primary underline">OAuth Playground</a>
                        </>
                      }
                    >
                      <div className="relative">
                        <Input id="refreshToken" type={showRefreshToken ? "text" : "password"} placeholder="1//04xxxxxx" value={refreshToken} onChange={(e) => setRefreshToken(e.target.value)} />
                        <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowRefreshToken(!showRefreshToken)}>
                          {showRefreshToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </SettingsFieldBlock>
                    <SettingsRow label="Google Drive backup" description="Save credentials, then run a Drive backup.">
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={handleSaveCredentials} disabled={isSaving || !clientId || !clientSecret || !refreshToken} variant="outline" className="gap-2">
                          {isSaving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : <><Save className="h-4 w-4" />Save</>}
                        </Button>
                        <Button onClick={startBackup} disabled={isBackingUp} className="gap-2">
                          {isBackingUp ? <><Loader2 className="h-4 w-4 animate-spin" />Backing up...</> : <><HardDrive className="h-4 w-4" />Backup to Drive</>}
                        </Button>
                      </div>
                    </SettingsRow>
                  </CollapsibleContent>
                </SettingsSection>
              </Collapsible>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit settings-panel-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Backup History
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
          </CardTitle>
          <CardDescription>Recent backups for this organization — updates as new files land.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingLogs ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !backupLogs?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              No backups yet. A nightly backup runs for every organization, or create one manually.
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
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => downloadCloudBackup((log as any).storage_path, log.file_name)}
                            className="gap-1"
                          >
                            <Download className="h-4 w-4" />
                            Download
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                            onClick={() => setRestoreTarget(log)}
                          >
                            <RotateCcw className="h-4 w-4" />
                            Restore
                          </Button>
                        </>
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
      </div>

      {/* Reset Organization Data - Admin Only */}
      {organizationRole === "admin" && (
        <Card className="border-destructive/50 settings-panel-card">
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
      <AlertDialog
        open={!!restoreTarget}
        onOpenChange={(open) => { if (!open) setRestoreTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Restore from Backup?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>You are about to restore data from:</p>
                <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                  <div>
                    <span className="font-medium">Backup date: </span>
                    {restoreTarget && format(new Date(restoreTarget.created_at), 'dd MMM yyyy, hh:mm a')}
                  </div>
                  <div>
                    <span className="font-medium">Records: </span>
                    {restoreTarget && Object.values(restoreTarget.records_count || {}).reduce((s: number, n) => s + (n as number), 0).toLocaleString()} total records
                  </div>
                  <div>
                    <span className="font-medium">File: </span>
                    {restoreTarget?.file_name}
                  </div>
                </div>
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive space-y-1">
                  <p className="font-semibold flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" /> Warning — This action cannot be undone
                  </p>
                  <ul className="list-disc list-inside space-y-0.5 text-xs">
                    <li>All current sales, purchases and customers will be overwritten</li>
                    <li>Any data created after this backup date will be lost</li>
                    <li>Take a fresh manual backup before restoring</li>
                  </ul>
                </div>
                <p className="text-sm font-medium">
                  Type <span className="font-mono bg-muted px-1 rounded">RESTORE</span> to confirm:
                </p>
                <Input
                  id="restore-confirm-input"
                  placeholder="Type RESTORE to confirm"
                  className="font-mono"
                  onChange={(e) => {
                    const btn = document.getElementById('restore-confirm-btn') as HTMLButtonElement | null;
                    if (btn) btn.disabled = e.target.value !== 'RESTORE';
                  }}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRestoreTarget(null)}>
              Cancel — Keep Current Data
            </AlertDialogCancel>
            <AlertDialogAction
              id="restore-confirm-btn"
              disabled={true}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                toast.info("Restore feature coming soon. Please download the backup file and contact support to restore.", {
                  duration: 6000,
                });
                setRestoreTarget(null);
              }}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Confirm Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BackupSettings;
