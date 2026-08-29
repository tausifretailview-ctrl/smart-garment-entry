import { ArrowLeft, Cloud, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import BackupSettings from "@/components/BackupSettings";
import { useSettings } from "@/hooks/useSettings";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { DEFAULT_BACKUP_RETENTION_DAYS } from "@/utils/backupRetention";

/** Standalone Backup page — same workspace chrome as Settings, POS-style header + details. */
export default function BackupSettingsPage() {
  const { orgNavigate } = useOrgNavigation();
  const { data: cachedSettings } = useSettings();
  const row = cachedSettings as {
    auto_backup_enabled?: boolean;
    backup_email?: string | null;
    backup_retention_days?: number | null;
    last_auto_backup_at?: string | null;
  } | null;

  return (
    <div className="settings-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full">
      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-2">
        <div className="no-print flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-sm shrink-0 border-slate-200 bg-white"
              onClick={() => {
                if (window.history.length > 1) window.history.back();
                else orgNavigate("/");
              }}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-9 p-0 shrink-0 border-slate-200 bg-white"
              onClick={() => orgNavigate("/")}
              title="Home"
            >
              <Home className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-teal-700 tracking-tight leading-none flex items-center gap-2">
                <Cloud className="h-5 w-5 shrink-0" />
                Backup
              </h1>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                Daily cloud backup · 3-day retention · download history
              </p>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
          <BackupSettings
            autoBackupEnabled={row?.auto_backup_enabled !== false}
            backupEmail={row?.backup_email || ""}
            backupRetentionDays={row?.backup_retention_days ?? DEFAULT_BACKUP_RETENTION_DAYS}
            lastAutoBackupAt={row?.last_auto_backup_at ?? null}
          />
        </div>
      </div>
    </div>
  );
}
