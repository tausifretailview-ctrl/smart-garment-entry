import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Download, Upload, Eye, RotateCcw, History } from "lucide-react";
import { toast } from "sonner";
import { PrecisionLabelPreview } from "@/components/precision-barcode/PrecisionLabelPreview";
import type { LabelDesignConfig, LabelItem } from "@/types/labelTypes";
import type { ProductFieldsConfig } from "@/utils/productFieldSettingsForLabels";
import {
  backupAllPresetsBeforeImport,
  buildPrinterPresetExportFile,
  createManualPrinterPresetBackup,
  downloadPrinterPresetExport,
  fetchOrgPrinterPresets,
  fetchPrinterPresetBackups,
  formatBackupDateTime,
  importPrinterPresetExportFile,
  restorePrinterPresetFromBackup,
  validatePrinterPresetImportFile,
  type PrinterPresetBackupRow,
  type PrinterPresetExportFile,
} from "@/utils/printerPresetBackup";

type PresetOption = {
  id: string;
  name: string;
  width: number;
  height: number;
};

type PrinterPresetBackupDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | undefined;
  organizationName: string;
  presets: PresetOption[];
  activePresetName?: string | null;
  sampleItem?: LabelItem;
  productFieldSettings?: ProductFieldsConfig | null;
  onPresetsChanged?: () => void | Promise<void>;
};

const PREVIEW_SAMPLE: LabelItem = {
  product_name: "Sample Product Name",
  brand: "BRAND",
  category: "Category",
  color: "Blue",
  style: "ST-01",
  size: "M",
  sale_price: 999,
  mrp: 1299,
  barcode: "8901234567890",
  bill_number: "PB-001",
  purchase_code: "ABC12",
  qty: 1,
  uom: "NOS",
  businessName: "My Store",
};

export function PrinterPresetBackupDialog({
  open,
  onOpenChange,
  organizationId,
  organizationName,
  presets,
  activePresetName,
  sampleItem,
  productFieldSettings,
  onPresetsChanged,
}: PrinterPresetBackupDialogProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState("backups");
  const [previewBackup, setPreviewBackup] = useState<PrinterPresetBackupRow | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<PrinterPresetBackupRow | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<PrinterPresetExportFile | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const defaultPresetId = useMemo(() => {
    const cleanActive = activePresetName?.replace(/^preset:/, "") ?? "";
    const match = presets.find((p) => p.name === cleanActive);
    return match?.id ?? presets[0]?.id ?? "";
  }, [activePresetName, presets]);

  const [selectedPresetId, setSelectedPresetId] = useState(defaultPresetId);
  const [manualNote, setManualNote] = useState("");

  useEffect(() => {
    if (open) {
      setSelectedPresetId(defaultPresetId);
      setManualNote("");
      setImportPreview(null);
      setImportError(null);
      setPreviewBackup(null);
      setRestoreTarget(null);
    }
  }, [open, defaultPresetId]);

  const {
    data: backups = [],
    isLoading: backupsLoading,
    refetch: refetchBackups,
  } = useQuery({
    queryKey: ["printer-preset-backups", organizationId],
    queryFn: () => fetchPrinterPresetBackups(organizationId!),
    enabled: open && !!organizationId,
    staleTime: 30_000,
  });

  const previewItem = sampleItem ?? PREVIEW_SAMPLE;

  const invalidateAndRefresh = useCallback(async () => {
    if (organizationId) {
      await queryClient.invalidateQueries({ queryKey: ["printer-preset-backups", organizationId] });
      await refetchBackups();
    }
    await onPresetsChanged?.();
  }, [organizationId, onPresetsChanged, queryClient, refetchBackups]);

  const handleCreateBackup = async () => {
    if (!organizationId || !selectedPresetId) {
      toast.error("Select a preset to back up");
      return;
    }
    setIsCreating(true);
    try {
      await createManualPrinterPresetBackup(organizationId, selectedPresetId, manualNote);
      toast.success("Manual backup created");
      setManualNote("");
      await invalidateAndRefresh();
      setTab("backups");
    } catch (err) {
      console.error(err);
      toast.error("Failed to create backup");
    } finally {
      setIsCreating(false);
    }
  };

  const handleRestore = async () => {
    if (!organizationId || !restoreTarget) return;
    setIsRestoring(true);
    try {
      await restorePrinterPresetFromBackup(organizationId, restoreTarget);
      toast.success(`Restored "${restoreTarget.name}" from backup`);
      setRestoreTarget(null);
      await invalidateAndRefresh();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to restore backup");
    } finally {
      setIsRestoring(false);
    }
  };

  const handleExportAll = async () => {
    if (!organizationId) return;
    setIsExporting(true);
    try {
      const rows = await fetchOrgPrinterPresets(organizationId);
      if (rows.length === 0) {
        toast.error("No presets to export");
        return;
      }
      const file = buildPrinterPresetExportFile(organizationId, organizationName, rows);
      downloadPrinterPresetExport(organizationName, file);
      toast.success(`Exported ${rows.length} design(s)`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to export designs");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFile = async (file: File) => {
    setImportError(null);
    setImportPreview(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const validated = validatePrinterPresetImportFile(parsed);
      if (!validated.ok) {
        setImportError(validated.error);
        return;
      }
      setImportPreview(validated.data);
    } catch {
      setImportError("Invalid JSON file — could not parse");
    }
  };

  const handleConfirmImport = async () => {
    if (!organizationId || !importPreview) return;
    setIsImporting(true);
    try {
      const count = await importPrinterPresetExportFile(organizationId, importPreview);
      toast.success(`Imported ${count} design(s). Previous presets were backed up first.`);
      setImportPreview(null);
      await invalidateAndRefresh();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Backup &amp; Restore
            </DialogTitle>
            <DialogDescription>
              Protect label designs with automatic backups on every change, manual snapshots, and JSON export.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 pb-2 flex flex-wrap gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={!organizationId || isExporting}
              onClick={() => void handleExportAll()}
            >
              {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Export All Designs
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={!organizationId || isImporting}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              Import Designs
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

            <TabsContent value="backups" className="flex-1 min-h-0 mt-3 data-[state=inactive]:hidden">
              {backupsLoading ? (
                <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading backups…
                </div>
              ) : backups.length === 0 ? (
                <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No backups yet. Backups are created automatically whenever you change a design.
                </div>
              ) : (
                <ScrollArea className="h-[min(52vh,420px)] rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10">
                      <tr className="border-b text-left">
                        <th className="p-2 font-medium">Name</th>
                        <th className="p-2 font-medium">Size</th>
                        <th className="p-2 font-medium">Type</th>
                        <th className="p-2 font-medium">Note</th>
                        <th className="p-2 font-medium">Date</th>
                        <th className="p-2 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backups.map((row) => (
                        <tr key={row.backup_id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-2 font-medium">{row.name || "—"}</td>
                          <td className="p-2 tabular-nums whitespace-nowrap">
                            {row.label_width ?? "?"}×{row.label_height ?? "?"}mm
                          </td>
                          <td className="p-2">
                            <Badge variant={row.backup_type === "manual" ? "default" : "secondary"} className="text-[10px]">
                              {row.backup_type === "manual" ? "Manual" : "Auto"}
                            </Badge>
                          </td>
                          <td className="p-2 text-muted-foreground max-w-[140px] truncate" title={row.note ?? ""}>
                            {row.note || "—"}
                          </td>
                          <td className="p-2 whitespace-nowrap text-muted-foreground">
                            {formatBackupDateTime(row.created_at)}
                          </td>
                          <td className="p-2">
                            <div className="flex justify-end gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => setPreviewBackup(row)}
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                Preview
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => setRestoreTarget(row)}
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Restore
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              )}
            </TabsContent>

            <TabsContent value="create" className="mt-3 space-y-4 data-[state=inactive]:hidden">
              {presets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No printer presets found for this organization.</p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs">Preset to back up</Label>
                    <Select value={selectedPresetId} onValueChange={setSelectedPresetId}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select preset" />
                      </SelectTrigger>
                      <SelectContent>
                        {presets.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({p.width}×{p.height}mm)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Note (optional)</Label>
                    <Textarea
                      value={manualNote}
                      onChange={(e) => setManualNote(e.target.value)}
                      placeholder="Before Diwali redesign"
                      className="min-h-[72px] text-sm"
                    />
                  </div>
                  <Button
                    type="button"
                    disabled={!selectedPresetId || isCreating}
                    onClick={() => void handleCreateBackup()}
                  >
                    {isCreating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Create Backup
                  </Button>
                </>
              )}
            </TabsContent>
          </Tabs>

          {importError && (
            <div className="mx-6 mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {importError}
            </div>
          )}

          {importPreview && (
            <div className="mx-6 mb-4 rounded-md border bg-muted/30 p-4 space-y-3">
              <p className="text-sm font-medium">Import preview</p>
              <p className="text-xs text-muted-foreground">
                {importPreview.presets.length} preset(s) from{" "}
                {importPreview.organizationName || "export file"} — exported{" "}
                {formatBackupDateTime(importPreview.exportedAt)}. Current presets will be backed up before import.
              </p>
              <ul className="text-xs space-y-1 max-h-32 overflow-y-auto">
                {importPreview.presets.map((p) => (
                  <li key={p.name}>
                    • {p.name} ({p.label_width}×{p.label_height}mm)
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={isImporting}
                  onClick={() => void handleConfirmImport()}
                >
                  {isImporting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                  Apply Import
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setImportPreview(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewBackup} onOpenChange={(v) => !v && setPreviewBackup(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Backup preview — {previewBackup?.name}</DialogTitle>
            <DialogDescription>
              Read-only preview. This design is not applied until you click Restore.
            </DialogDescription>
          </DialogHeader>
          {previewBackup && (
            <div className="flex justify-center py-2 bg-muted/20 rounded-md overflow-auto">
              <PrecisionLabelPreview
                item={previewItem}
                width={Number(previewBackup.label_width) || 50}
                height={Number(previewBackup.label_height) || 25}
                xOffset={Number(previewBackup.x_offset) || 0}
                yOffset={Number(previewBackup.y_offset) || 0}
                config={(previewBackup.label_config as LabelDesignConfig) ?? undefined}
                scaleFactor={2.5}
                productFieldSettings={productFieldSettings}
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPreviewBackup(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!restoreTarget} onOpenChange={(v) => !v && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore label design?</AlertDialogTitle>
            <AlertDialogDescription>
              {restoreTarget && (
                <>
                  Restore &quot;{restoreTarget.name}&quot; from {formatBackupDateTime(restoreTarget.created_at)}?
                  Your current design will be backed up first.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRestoring}
              onClick={(e) => {
                e.preventDefault();
                void handleRestore();
              }}
            >
              {isRestoring && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
