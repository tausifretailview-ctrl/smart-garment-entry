import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, History, Loader2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  buildSaleInvoiceFormatExportFile,
  createSaleInvoiceFormatLocalBackup,
  downloadSaleInvoiceFormatExport,
  formatSaleInvoiceBackupDateTime,
  listSaleInvoiceFormatLocalBackups,
  mergeSaleInvoiceFormatSlice,
  pickSaleInvoiceFormatSlice,
  validateSaleInvoiceFormatImportFile,
  type SaleInvoiceFormatExportFile,
  type SaleInvoiceFormatLocalBackup,
} from "@/utils/saleInvoiceFormatBackup";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  organizationName: string;
  saleSettings: Record<string, unknown> | null | undefined;
  onApplyFormat: (nextSaleSettings: Record<string, unknown>) => void;
};

export function SaleInvoiceFormatBackupDialog({
  open,
  onOpenChange,
  organizationId,
  organizationName,
  saleSettings,
  onApplyFormat,
}: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState("backups");
  const [backups, setBackups] = useState<SaleInvoiceFormatLocalBackup[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [manualNote, setManualNote] = useState("");
  const [pendingImport, setPendingImport] = useState<SaleInvoiceFormatExportFile | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<SaleInvoiceFormatLocalBackup | null>(null);

  const reloadBackups = useCallback(() => {
    if (!organizationId) {
      setBackups([]);
      return;
    }
    setBackups(listSaleInvoiceFormatLocalBackups(organizationId));
  }, [organizationId]);

  useEffect(() => {
    if (open) reloadBackups();
  }, [open, reloadBackups]);

  const handleExport = () => {
    if (!organizationId) return;
    setIsExporting(true);
    try {
      const file = buildSaleInvoiceFormatExportFile(organizationId, organizationName, saleSettings);
      downloadSaleInvoiceFormatExport(organizationName, file);
      toast({
        title: "Export ready",
        description: "Invoice format JSON downloaded. Keep this file to restore later.",
      });
    } catch (e: any) {
      toast({
        title: "Export failed",
        description: e?.message || "Could not export invoice format",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleCreateManualBackup = () => {
    if (!organizationId) return;
    createSaleInvoiceFormatLocalBackup(
      organizationId,
      organizationName,
      saleSettings,
      manualNote.trim() || "manual backup",
    );
    setManualNote("");
    reloadBackups();
    toast({ title: "Backup saved", description: "Local snapshot stored on this device." });
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const validated = validateSaleInvoiceFormatImportFile(parsed);
      if (!validated.ok) {
        toast({ title: "Invalid file", description: validated.error, variant: "destructive" });
        return;
      }
      setPendingImport(validated.data);
    } catch {
      toast({
        title: "Invalid file",
        description: "Could not read JSON export file",
        variant: "destructive",
      });
    }
  };

  const applyFormatSlice = (slice: SaleInvoiceFormatExportFile["saleInvoiceFormat"], note: string) => {
    createSaleInvoiceFormatLocalBackup(
      organizationId,
      organizationName,
      saleSettings,
      note,
    );
    const merged = mergeSaleInvoiceFormatSlice(saleSettings as Record<string, unknown>, slice);
    onApplyFormat(merged);
    reloadBackups();
  };

  const handleApplyImport = () => {
    if (!pendingImport) return;
    applyFormatSlice(pendingImport.saleInvoiceFormat, "before import");
    const keyCount = Object.keys(pendingImport.saleInvoiceFormat).length;
    setPendingImport(null);
    toast({
      title: "Format imported",
      description: `${keyCount} settings applied. Click Save Settings to persist.`,
    });
  };

  const handleConfirmRestore = () => {
    if (!restoreTarget) return;
    applyFormatSlice(restoreTarget.saleInvoiceFormat, "before restore");
    setRestoreTarget(null);
    toast({
      title: "Backup restored",
      description: "Invoice format restored. Click Save Settings to persist.",
    });
  };

  const currentKeyCount = Object.keys(pickSaleInvoiceFormatSlice(saleSettings)).length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Invoice Format Backup &amp; Restore
            </DialogTitle>
            <DialogDescription>
              Export / import sale &amp; POS invoice look settings (template, paper, terms, display
              options) — same idea as barcode label backup.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 pb-2 flex flex-wrap gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={!organizationId || isExporting}
              onClick={handleExport}
            >
              {isExporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Export Format
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={!organizationId}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              Import Format
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImportFile(f);
                e.target.value = "";
              }}
            />
          </div>

          <Tabs value={tab} onValueChange={setTab} className="flex-1 min-h-0 flex flex-col px-6 pb-6">
            <TabsList className="shrink-0 w-full sm:w-auto">
              <TabsTrigger value="backups">Backups</TabsTrigger>
              <TabsTrigger value="create">Create Backup</TabsTrigger>
            </TabsList>

            <TabsContent value="backups" className="flex-1 min-h-0 overflow-y-auto mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Current format has {currentKeyCount} saved fields. Local backups stay on this
                device (before import / restore / manual).
              </p>
              {backups.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No local backups yet. Create one or export a JSON file.
                </div>
              ) : (
                backups.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between gap-2 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{b.note || "Backup"}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatSaleInvoiceBackupDateTime(b.createdAt)} ·{" "}
                        {Object.keys(b.saleInvoiceFormat).length} fields
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0"
                      onClick={() => setRestoreTarget(b)}
                    >
                      Restore
                    </Button>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="create" className="mt-3 space-y-3">
              <div className="space-y-2">
                <Label htmlFor="invoice-format-backup-note">Note (optional)</Label>
                <Input
                  id="invoice-format-backup-note"
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  placeholder="e.g. Before retail-erp A5 change"
                />
              </div>
              <Button type="button" onClick={handleCreateManualBackup} disabled={!organizationId}>
                Save local backup now
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingImport} onOpenChange={(o) => !o && setPendingImport(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apply imported format?</DialogTitle>
            <DialogDescription>
              From {pendingImport?.organizationName || "export"} ·{" "}
              {pendingImport ? Object.keys(pendingImport.saleInvoiceFormat).length : 0} fields.
              Current format will be backed up locally first.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setPendingImport(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleApplyImport}>
              Apply Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!restoreTarget} onOpenChange={(o) => !o && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this backup?</AlertDialogTitle>
            <AlertDialogDescription>
              {restoreTarget
                ? `${restoreTarget.note} — ${formatSaleInvoiceBackupDateTime(restoreTarget.createdAt)}. Current format will be backed up first. Click Save Settings afterward.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRestore}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
