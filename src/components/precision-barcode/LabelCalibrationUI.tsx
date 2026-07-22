import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { HelpCircle, Minus, Plus, Save, Trash2, RefreshCw, Star, History } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { PrecisionThermalRowPreview } from "./PrecisionThermalRowPreview";
import { PrecisionLabelCell } from "./PrecisionLabelCell";
import { LabelDesignConfig, LabelItem, LabelTemplate } from "@/types/labelTypes";
import { cn } from "@/lib/utils";
import type { PrecisionPrintMode } from "@/utils/precisionThermalModes";
import { presetMatchesPrintMode, getPrecisionPrintModeDisplayName, inferPrecisionPrintMode } from "@/utils/precisionThermalModes";
import { getThermalPreviewCols } from "@/utils/precisionThermalModes";

export interface CalibrationValues {
  xOffset: number;
  yOffset: number;
  vGap: number;
  hGap: number;
  labelWidth: number;
  labelHeight: number;
  thermalCols?: number;
}

export interface CalibrationPreset {
  id?: string;
  name: string;
  xOffset: number;
  yOffset: number;
  vGap: number;
  hGap?: number;
  width: number;
  height: number;
  a4Cols?: number;
  a4Rows?: number;
  printMode?: PrecisionPrintMode;
  labelConfig?: LabelDesignConfig | null;
  isDefault?: boolean;
  thermalCols?: number;
}

const BUILT_IN_PRESETS: CalibrationPreset[] = [
  { name: "50×38mm Thermal", xOffset: 0, yOffset: 1, vGap: 0, width: 50, height: 38 },
  { name: "50×25mm Thermal", xOffset: 0, yOffset: 0, vGap: 2, width: 50, height: 25 },
  { name: "38×25mm Jewellery", xOffset: 1, yOffset: 0.5, vGap: 1, width: 38, height: 25 },
  { name: "38×25mm 2-Up", xOffset: 0, yOffset: 0, vGap: 2, width: 38, height: 25, thermalCols: 2, printMode: "thermal2up" },
  { name: "32×19mm 3-Up", xOffset: 0, yOffset: 0, vGap: 3, width: 32, height: 19, thermalCols: 3, printMode: "thermal3up" },
  { name: "75×50mm 1-Up", xOffset: 0, yOffset: 0, vGap: 2, width: 75, height: 50 },
  { name: "100×50mm Shipping", xOffset: 0, yOffset: 0, vGap: 3, width: 100, height: 50 },
  { name: "40×30mm Compact", xOffset: 0, yOffset: 0, vGap: 2, width: 40, height: 30 },
  { name: "60×40mm Standard", xOffset: 0, yOffset: 0, vGap: 2, width: 60, height: 40 },
];

const A4_SHEET_PRESETS = [
  { name: "Novajet 40 (52×30mm, 4×10)", width: 52, height: 30, cols: 4, rows: 10, xOffset: 1, yOffset: 5, vGap: 0 },
  { name: "Novajet 24 (64×34mm, 3×8)", width: 64, height: 34, cols: 3, rows: 8, xOffset: 5, yOffset: 5, vGap: 0 },
  { name: "Novajet 12 (100×44mm, 2×6)", width: 100, height: 44, cols: 2, rows: 6, xOffset: 5, yOffset: 5, vGap: 0 },
  { name: "39×35mm (4×7)", width: 39, height: 35, cols: 4, rows: 7, xOffset: 13, yOffset: 11, vGap: 3.5 },
  { name: "A4 48-Sheet (48×24mm, 4×12)", width: 48, height: 24, cols: 4, rows: 12, xOffset: 0, yOffset: 0, vGap: 0 },
  { name: "48×25mm (4×11)", width: 48, height: 25, cols: 4, rows: 11, xOffset: 5, yOffset: 5, vGap: 0 },
  { name: "65×38mm (3×7)", width: 65, height: 38, cols: 3, rows: 7, xOffset: 5, yOffset: 10, vGap: 2 },
  { name: "A4 Custom", width: 50, height: 25, cols: 4, rows: 12, xOffset: 5, yOffset: 5, vGap: 2 },
];

const SAMPLE_ITEM: LabelItem = {
  product_name: "Cotton Casual Shirt",
  brand: "StyleWear",
  category: "Shirts",
  color: "Blue",
  style: "CS-001",
  size: "40",
  sale_price: 599,
  mrp: 799,
  barcode: "8901234567890",
  bill_number: "PB-001",
};

interface NudgeFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}

function NudgeField({ label, value, onChange, min, max, step = 0.5, unit = "mm" }: NudgeFieldProps) {
  const nudge = (delta: number) => {
    const next = Math.round((value + delta) * 10) / 10;
    if (next >= min && next <= max) onChange(next);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="h-8 w-8 p-0 shrink-0"
          onClick={() => nudge(-step)}
          disabled={value <= min}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <div className="relative flex-1">
          <Input
            type="number"
            step={step}
            min={min}
            max={max}
            value={value}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v) && v >= min && v <= max) onChange(v);
            }}
            className="h-8 text-center text-xs pr-8"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
            {unit}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="h-8 w-8 p-0 shrink-0"
          onClick={() => nudge(step)}
          disabled={value >= max}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(Math.round(v * 10) / 10)}
        min={min}
        max={max}
        step={step}
        className="mt-1"
      />
    </div>
  );
}

interface LabelCalibrationUIProps {
  values: CalibrationValues;
  onChange: (values: CalibrationValues) => void;
  presets?: CalibrationPreset[];
  onSavePreset?: (preset: CalibrationPreset) => Promise<void> | void;
  onDeletePreset?: (presetId: string) => Promise<void> | void;
  onLoadPreset?: (preset: CalibrationPreset) => void;
  onSetDefault?: (presetId: string, presetName: string, printMode: PrecisionPrintMode) => Promise<void> | void;
  onSetTemplateDefault?: (templateName: string) => Promise<void> | void;
  defaultTemplateName?: string | null;
  labelConfig?: LabelDesignConfig;
  compact?: boolean;
  /** Full-page Precision Pro tab: stretch controls + live preview vertically */
  fullWorkspace?: boolean;
  sampleItem?: LabelItem;
  savedTemplates?: LabelTemplate[];
  printMode?: PrecisionPrintMode;
  a4Cols?: number;
  a4Rows?: number;
  onPrintModeChange?: (mode: PrecisionPrintMode) => void;
  onA4ColsChange?: (cols: number) => void;
  onA4RowsChange?: (rows: number) => void;
  /** Controlled active preset/template name - persists across tab switches */
  activePresetValue?: string | null;
  /** Open label design backup & restore dialog */
  onOpenBackupRestore?: () => void;
  /** Shown when the active print mode has no default preset saved. */
  noDefaultForModeHint?: string | null;
  onPresetsChange?: (presets: CalibrationPreset[]) => void;
}

export function LabelCalibrationUI({
  values,
  onChange,
  presets = [],
  onSavePreset,
  onLoadPreset,
  onSetDefault,
  onSetTemplateDefault,
  defaultTemplateName,
  onPresetsChange,
  labelConfig,
  compact = false,
  fullWorkspace = false,
  sampleItem,
  savedTemplates = [],
  printMode = 'thermal',
  a4Cols = 4,
  a4Rows = 12,
  onPrintModeChange,
  onA4ColsChange,
  onA4RowsChange,
  activePresetValue,
  onOpenBackupRestore,
  noDefaultForModeHint,
}: LabelCalibrationUIProps) {
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [newPresetWidth, setNewPresetWidth] = useState<number>(values.labelWidth);
  const [newPresetHeight, setNewPresetHeight] = useState<number>(values.labelHeight);
  const [newPresetCols, setNewPresetCols] = useState<number>(1);
  const [newPresetMode, setNewPresetMode] = useState<PrecisionPrintMode>(printMode || 'thermal');
  // Track the loaded DB preset name with a ref to persist across parent re-renders
  const [localActivePresetName, setLocalActivePresetName] = useState<string | null>(null);
  const loadedDbPresetRef = useRef<string | null>(null);
  // Use controlled value only when it's a non-null string; otherwise use local state (for printer presets)
  // Strip "preset:" prefix if present (used by auto-load default logic)
  const resolvedActivePresetValue = (activePresetValue !== undefined && activePresetValue !== null)
    ? (activePresetValue.startsWith("preset:") ? activePresetValue.replace("preset:", "") : activePresetValue)
    : null;
  const activePresetName = resolvedActivePresetValue !== null ? resolvedActivePresetValue : localActivePresetName;
  const setActivePresetName = (name: string | null) => {
    setLocalActivePresetName(name);
    // Track DB preset name separately
    if (name && presets.some(p => p.name === name)) {
      loadedDbPresetRef.current = name;
    } else if (name === null) {
      loadedDbPresetRef.current = null;
    }
  };
  const [saving, setSaving] = useState(false);
  const [saveA4Open, setSaveA4Open] = useState(false);
  const [newA4PresetName, setNewA4PresetName] = useState("");
  const [activeA4PresetName, setActiveA4PresetName] = useState<string | null>(null);
  const [showAllModes, setShowAllModes] = useState(false);

  const modeFilteredBuiltInPresets = BUILT_IN_PRESETS.filter((p) =>
    presetMatchesPrintMode(p, printMode),
  );
  const visibleUserPresets = showAllModes
    ? presets
    : presets.filter((p) => presetMatchesPrintMode(p, printMode));
  const builtInWithoutDbOverrides = modeFilteredBuiltInPresets.filter(
    (builtin) => !presets.some((p) => p.name === builtin.name),
  );
  const allPresets = [...builtInWithoutDbOverrides, ...visibleUserPresets];
  const a4UserPresets = presets.filter((p) => presetMatchesPrintMode(p, "a4"));
  const modeFilteredTemplates =
    printMode === "thermal"
      ? savedTemplates.filter((t) => !presets.some((p) => p.name === t.name))
      : printMode === "a4"
        ? savedTemplates.filter((t) => !presets.some((p) => p.name === t.name))
        : [];
  const isA4UserPreset = activeA4PresetName ? a4UserPresets.some(p => p.name === activeA4PresetName) : false;

  // Check both active name and ref for DB preset detection
  const effectivePresetName = activePresetName || loadedDbPresetRef.current;
  const isUserPreset = effectivePresetName ? presets.some((p) => p.name === effectivePresetName) : false;
  const isActiveTemplate = !isUserPreset && effectivePresetName ? savedTemplates.some((t) => t.name === effectivePresetName) : false;

  // Presets win when a name exists in both printer_presets and label templates (mirrored saves).
  const selectValue = (() => {
    const name = effectivePresetName;
    if (!name) return undefined;
    if (allPresets.some((p) => p.name === name)) return name;
    if (savedTemplates.some((t) => t.name === name)) return `template_${name}`;
    return undefined;
  })();

  const update = (partial: Partial<CalibrationValues>) => {
    onChange({ ...values, ...partial });
  };

  const loadPreset = (name: string) => {
    // Check if it's a saved label template
    if (name.startsWith("template_")) {
      const templateName = name.replace("template_", "");
      const template = savedTemplates.find((t) => t.name === templateName);
      if (template) {
        // Apply template's label config; if template has dimensions, also apply those
        if (template.labelWidth && template.labelHeight) {
          onChange({
            ...values,
            labelWidth: template.labelWidth,
            labelHeight: template.labelHeight,
          });
        }
        onLoadPreset?.({ name: templateName, xOffset: values.xOffset, yOffset: values.yOffset, vGap: values.vGap, hGap: values.hGap, width: template.labelWidth || values.labelWidth, height: template.labelHeight || values.labelHeight, labelConfig: template.config });
        // Set local active name to the template name so it persists in the dropdown
        setActivePresetName(templateName);
      }
      return;
    }

    const preset = allPresets.find((p) => p.name === name);
    if (preset) {
      onChange({
        xOffset: preset.xOffset,
        yOffset: preset.yOffset,
        vGap: preset.vGap,
        hGap: preset.hGap ?? 0,
        labelWidth: preset.width,
        labelHeight: preset.height,
        thermalCols: preset.thermalCols,
      });
      setActivePresetName(name);
      onLoadPreset?.(preset);
    }
  };

  const updatePreset = async () => {
    const presetName = effectivePresetName;
    if (!presetName || !isUserPreset) return;
    const existing = presets.find((p) => p.name === presetName);
    if (!existing) return;

    const updatedPreset: CalibrationPreset = {
      ...existing,
      xOffset: values.xOffset,
      yOffset: values.yOffset,
      vGap: values.vGap,
      hGap: values.hGap,
      width: values.labelWidth,
      height: values.labelHeight,
      // Bind to the currently selected print mode so "Update" re-homes the preset
      // (e.g. Thermal 1-Up designs mis-saved under A4 show up in the 1-Up list).
      printMode,
      thermalCols:
        printMode === "thermal3up" ? 3 : printMode === "thermal2up" ? 2 : 1,
      labelConfig: labelConfig || null,
    };

    if (onSavePreset) {
      setSaving(true);
      try { await onSavePreset(updatedPreset); } finally { setSaving(false); }
      setActivePresetName(presetName);
      loadedDbPresetRef.current = presetName;
    } else if (onPresetsChange) {
      const updated = presets.map((p) => p.name === presetName ? updatedPreset : p);
      onPresetsChange(updated);
    }
  };

  const savePreset = async () => {
    if (!newPresetName.trim()) return;
    const newPreset: CalibrationPreset = {
      name: newPresetName.trim(),
      xOffset: values.xOffset,
      yOffset: values.yOffset,
      vGap: values.vGap,
      hGap: values.hGap,
      width: newPresetWidth,
      height: newPresetHeight,
      printMode: newPresetMode,
      thermalCols: newPresetMode === 'thermal3up' ? 3 : newPresetMode === 'thermal2up' ? 2 : 1,
      labelConfig: labelConfig || null,
    };

    if (onSavePreset) {
      setSaving(true);
      try {
        await onSavePreset(newPreset);
        setActivePresetName(newPreset.name);
        loadedDbPresetRef.current = newPreset.name;
        setNewPresetName("");
        setSavePresetOpen(false);
      } finally { setSaving(false); }
    } else if (onPresetsChange) {
      const updated = presets.filter((p) => p.name !== newPreset.name);
      updated.push(newPreset);
      onPresetsChange(updated);
      setNewPresetName("");
      setSavePresetOpen(false);
    }
  };

  const previewScale = compact ? 2 : 2.5;
  const showHGap =
    printMode === "thermal2up" ||
    printMode === "thermal3up" ||
    (printMode === "a4" && a4Cols > 1);

  return (
    <div
      className={cn(
        fullWorkspace && "flex flex-col min-h-0 h-full gap-3",
        !fullWorkspace && (compact ? "space-y-3" : "space-y-4"),
      )}
    >
      {/* Presets Row */}
      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex-1 min-w-[160px] space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">Load Preset</Label>
            <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
              <Checkbox
                checked={showAllModes}
                onCheckedChange={(v) => setShowAllModes(v === true)}
                className="h-3.5 w-3.5"
              />
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">Show all modes</span>
            </label>
          </div>
          <Select value={selectValue} onValueChange={loadPreset}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select a preset..." />
            </SelectTrigger>
            <SelectContent>
              {modeFilteredTemplates.length === 0 && allPresets.length === 0 ? (
                <div className="px-2 py-2 text-xs text-muted-foreground">
                  No presets for this print mode.
                </div>
              ) : (
                <>
              {modeFilteredTemplates.map((t) => (
                  <SelectItem key={`template-${t.name}`} value={`template_${t.name}`} className="text-xs">
                    📐 {t.name}
                    {t.labelWidth && t.labelHeight && (
                      <span className="ml-1 text-muted-foreground">
                        ({t.labelWidth}×{t.labelHeight})
                      </span>
                    )}
                  </SelectItem>
                ))}
              {modeFilteredTemplates.length > 0 &&
                visibleUserPresets.length > 0 && (
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 mt-1">
                    🖨️ Printer Presets
                  </div>
                )}
              {allPresets.map((p) => (
                <SelectItem key={p.name} value={p.name} className="text-xs">
                  {p.isDefault && presetMatchesPrintMode(p, printMode) && (
                    <Badge variant="secondary" className="mr-1 h-4 px-1 text-[9px] font-semibold align-middle">
                      Default
                    </Badge>
                  )}
                  {p.name}
                  <span className="ml-1 text-muted-foreground">
                    ({p.width}×{p.height})
                  </span>
                  {showAllModes && !presetMatchesPrintMode(p, printMode) && (
                    <span className="ml-1 text-muted-foreground">
                      · {getPrecisionPrintModeDisplayName(inferPrecisionPrintMode(p))}
                    </span>
                  )}
                </SelectItem>
              ))}
                </>
              )}
            </SelectContent>
          </Select>
        </div>

        {isUserPreset && (onSavePreset || onPresetsChange) && (
          <Button 
            type="button" 
            variant="default" 
            size="xs" 
            className="h-8 bg-primary text-primary-foreground hover:bg-primary/90" 
            onClick={updatePreset} 
            disabled={saving}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            {saving ? "Updating..." : `Update "${effectivePresetName}"`}
          </Button>
        )}

        {isUserPreset && onSetDefault && (() => {
          const activePreset = presets.find(p => p.name === effectivePresetName);
          // Always set default for the *currently selected* print mode so users can
          // reassign a mis-tagged preset (e.g. Bling Jewellery → Thermal 1-Up).
          const isAlreadyDefault =
            activePreset?.isDefault && presetMatchesPrintMode(activePreset, printMode);
          const setDefaultLabel = isAlreadyDefault
            ? `Default for ${getPrecisionPrintModeDisplayName(printMode)}`
            : `Set as default for ${getPrecisionPrintModeDisplayName(printMode)}`;
          return activePreset?.id ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant={isAlreadyDefault ? "default" : "outline"}
                    size="xs"
                    className={`h-8 ${isAlreadyDefault ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}`}
                    onClick={() => onSetDefault(activePreset.id!, activePreset.name, printMode)}
                    disabled={saving}
                  >
                    <Star className={`h-3 w-3 mr-1 ${isAlreadyDefault ? 'fill-white' : ''}`} />
                    {setDefaultLabel}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    {isAlreadyDefault
                      ? `Default preset when ${getPrecisionPrintModeDisplayName(printMode)} is selected`
                      : `Set as the default design for ${getPrecisionPrintModeDisplayName(printMode)} and bind this preset to that mode`}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null;
        })()}

        {isActiveTemplate && onSetTemplateDefault && (() => {
          const isAlreadyDefault = defaultTemplateName === effectivePresetName;
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant={isAlreadyDefault ? "default" : "outline"}
                    size="xs"
                    className={`h-8 ${isAlreadyDefault ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}`}
                    onClick={() => onSetTemplateDefault(effectivePresetName!)}
                    disabled={saving}
                  >
                    <Star className={`h-3 w-3 mr-1 ${isAlreadyDefault ? 'fill-white' : ''}`} />
                    {isAlreadyDefault
                      ? `Default for ${getPrecisionPrintModeDisplayName(printMode)}`
                      : `Set as default for ${getPrecisionPrintModeDisplayName(printMode)}`}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    {isAlreadyDefault
                      ? `Default template for ${getPrecisionPrintModeDisplayName(printMode)}`
                      : `Set as the default template for ${getPrecisionPrintModeDisplayName(printMode)} only`}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })()}

        {(onSavePreset || onPresetsChange) && (
          <Dialog open={savePresetOpen} onOpenChange={setSavePresetOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="xs" className="h-8" onClick={() => {
                setNewPresetWidth(values.labelWidth);
                setNewPresetHeight(values.labelHeight);
                setNewPresetCols(values.thermalCols || 1);
                setNewPresetMode(printMode || 'thermal');
              }}>
                <Save className="h-3 w-3 mr-1" />
                Save
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-sm">Create New Label Preset</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Preset Name *</Label>
                  <Input
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    placeholder="e.g. 38×38 Jewellery 2-Up"
                    className="h-8 text-xs no-uppercase"
                    onKeyDown={(e) => e.key === "Enter" && savePreset()}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Width (mm)</Label>
                    <Input
                      type="number"
                      value={newPresetWidth}
                      onChange={(e) => setNewPresetWidth(Number(e.target.value) || values.labelWidth)}
                      className="h-8 text-xs"
                      min={10} max={200}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Height (mm)</Label>
                    <Input
                      type="number"
                      value={newPresetHeight}
                      onChange={(e) => setNewPresetHeight(Number(e.target.value) || values.labelHeight)}
                      className="h-8 text-xs"
                      min={10} max={200}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Print Mode</Label>
                  <Select value={newPresetMode} onValueChange={(v) => setNewPresetMode(v as any)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="thermal" className="text-xs">🖨️ Thermal (1-Up)</SelectItem>
                      <SelectItem value="thermal2up" className="text-xs">🖨️ Thermal (2-Up)</SelectItem>
                      <SelectItem value="thermal3up" className="text-xs">🖨️ Thermal (3-Up)</SelectItem>
                      <SelectItem value="a4" className="text-xs">📄 A4 Sheet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(newPresetMode === 'thermal2up' || newPresetMode === 'thermal3up') && (
                  <div className="space-y-1">
                    <Label className="text-xs">Labels Per Row</Label>
                    <Input
                      type="number"
                      value={newPresetMode === 'thermal3up' ? 3 : newPresetCols}
                      readOnly
                      className="h-8 text-xs bg-muted/40"
                    />
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground bg-muted/40 rounded px-2 py-1.5">
                  Size: {newPresetWidth}×{newPresetHeight}mm · Mode: {newPresetMode === 'thermal3up' ? 'Thermal 3-Up' : newPresetMode === 'thermal2up' ? `Thermal ${newPresetCols}-Up` : newPresetMode === 'a4' ? 'A4 Sheet' : 'Thermal 1-Up'}
                  {labelConfig ? " · Includes label design" : ""}
                </p>
              </div>
              <DialogFooter>
                <Button type="button" size="xs" onClick={savePreset} disabled={!newPresetName.trim() || saving}>
                  {saving ? "Saving..." : "Create Preset"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {onOpenBackupRestore && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="h-8"
            onClick={onOpenBackupRestore}
          >
            <History className="h-3 w-3 mr-1" />
            Backup &amp; Restore
          </Button>
        )}
      </div>

      {/* Print Mode Toggle */}
      {!compact && onPrintModeChange && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Print Mode</p>
            <div className="flex rounded-md border border-border overflow-hidden">
              <button
                type="button"
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  printMode === 'thermal'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                }`}
                onClick={() => onPrintModeChange('thermal')}
              >
                🖨️ Thermal (1-Up)
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  printMode === 'thermal2up'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                }`}
                onClick={() => onPrintModeChange('thermal2up')}
              >
                🖨️ Thermal (2-Up)
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  printMode === 'thermal3up'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                }`}
                onClick={() => onPrintModeChange('thermal3up')}
              >
                🖨️ Thermal (3-Up)
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  printMode === 'a4'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                }`}
                onClick={() => onPrintModeChange('a4')}
              >
                📄 A4 Sheet
              </button>
            </div>
          </div>

          {noDefaultForModeHint && (
            <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-2.5 py-2">
              {noDefaultForModeHint}
            </p>
          )}

          {printMode === 'a4' && (
            <div className="border rounded-lg p-3 space-y-3 bg-muted/10">
              <div className="flex items-end gap-2 flex-wrap">
                <div className="flex-1 min-w-[160px] space-y-1">
                  <Label className="text-xs">A4 Sheet Preset</Label>
                  <Select value={activeA4PresetName || undefined} onValueChange={(name) => {
                    // Check built-in first
                    const builtIn = A4_SHEET_PRESETS.find(p => p.name === name);
                    if (builtIn) {
                      onChange({
                        ...values,
                        labelWidth: builtIn.width,
                        labelHeight: builtIn.height,
                        xOffset: builtIn.xOffset,
                        yOffset: builtIn.yOffset,
                        vGap: builtIn.vGap,
                      });
                      onA4ColsChange?.(builtIn.cols);
                      onA4RowsChange?.(builtIn.rows);
                      setActiveA4PresetName(null);
                      return;
                    }
                    // Check user A4 presets
                    const userPreset = a4UserPresets.find(p => p.name === name);
                    if (userPreset) {
                      onChange({
                        xOffset: userPreset.xOffset,
                        yOffset: userPreset.yOffset,
                        vGap: userPreset.vGap,
                        hGap: userPreset.hGap ?? 0,
                        labelWidth: userPreset.width,
                        labelHeight: userPreset.height,
                      });
                      onA4ColsChange?.(userPreset.a4Cols || 4);
                      onA4RowsChange?.(userPreset.a4Rows || 10);
                      setActiveA4PresetName(name);
                      onLoadPreset?.(userPreset);
                    }
                  }}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select A4 sheet format..." />
                    </SelectTrigger>
                    <SelectContent>
                      {A4_SHEET_PRESETS.map((p) => (
                        <SelectItem key={p.name} value={p.name} className="text-xs">
                          📄 {p.name}
                        </SelectItem>
                      ))}
                      {a4UserPresets.length > 0 && (
                        <>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 mt-1">💾 My A4 Presets</div>
                          {a4UserPresets.map((p) => (
                            <SelectItem key={p.name} value={p.name} className="text-xs">
                              📐 {p.name}
                              <span className="ml-1 text-muted-foreground">({p.width}×{p.height}, {p.a4Cols}×{p.a4Rows})</span>
                            </SelectItem>
                          ))}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {isA4UserPreset && (onSavePreset || onPresetsChange) && (
                  <Button type="button" variant="outline" size="xs" className="h-8" disabled={saving} onClick={async () => {
                    const existing = a4UserPresets.find(p => p.name === activeA4PresetName);
                    if (!existing) return;
                    const updated: CalibrationPreset = {
                      ...existing, xOffset: values.xOffset, yOffset: values.yOffset, vGap: values.vGap, hGap: values.hGap,
                      width: values.labelWidth, height: values.labelHeight, a4Cols, a4Rows, printMode: 'a4',
                      labelConfig: labelConfig || null,
                    };
                    if (onSavePreset) { setSaving(true); try { await onSavePreset(updated); } finally { setSaving(false); } }
                    else if (onPresetsChange) { onPresetsChange(presets.map(p => p.name === activeA4PresetName ? updated : p)); }
                  }}>
                    <Save className="h-3 w-3 mr-1" /> Update
                  </Button>
                )}

                {(onSavePreset || onPresetsChange) && (
                  <Dialog open={saveA4Open} onOpenChange={setSaveA4Open}>
                    <DialogTrigger asChild>
                      <Button type="button" variant="outline" size="xs" className="h-8">
                        <Save className="h-3 w-3 mr-1" /> Save
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-sm">
                      <DialogHeader>
                        <DialogTitle className="text-sm">Save A4 Sheet Preset</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-2">
                        <Label className="text-xs">Preset Name</Label>
                        <Input value={newA4PresetName} onChange={(e) => setNewA4PresetName(e.target.value)}
                          placeholder="e.g. My A4 39x35 (5×8)" className="h-8 text-xs"
                          onKeyDown={(e) => { if (e.key === "Enter") {
                            if (!newA4PresetName.trim()) return;
                            const newP: CalibrationPreset = {
                              name: newA4PresetName.trim(), xOffset: values.xOffset, yOffset: values.yOffset, vGap: values.vGap, hGap: values.hGap,
                              width: values.labelWidth, height: values.labelHeight, a4Cols, a4Rows, printMode: 'a4',
                              labelConfig: labelConfig || null,
                            };
                            if (onSavePreset) { setSaving(true); const r = onSavePreset(newP); if (r && typeof (r as any).then === 'function') { (r as Promise<void>).then(() => { setNewA4PresetName(""); setSaveA4Open(false); }).finally(() => setSaving(false)); } else { setNewA4PresetName(""); setSaveA4Open(false); setSaving(false); } }
                            else if (onPresetsChange) { onPresetsChange([...presets.filter(p => p.name !== newP.name), newP]); setNewA4PresetName(""); setSaveA4Open(false); }
                          }}} />
                        <p className="text-[10px] text-muted-foreground">
                          Saves: {values.labelWidth}×{values.labelHeight}mm, {a4Cols}×{a4Rows} grid, offset ({values.xOffset}, {values.yOffset}), gap {values.vGap}mm
                        </p>
                      </div>
                      <DialogFooter>
                        <Button type="button" size="xs" disabled={!newA4PresetName.trim() || saving} onClick={async () => {
                          if (!newA4PresetName.trim()) return;
                          const newP: CalibrationPreset = {
                            name: newA4PresetName.trim(), xOffset: values.xOffset, yOffset: values.yOffset, vGap: values.vGap, hGap: values.hGap,
                            width: values.labelWidth, height: values.labelHeight, a4Cols, a4Rows, printMode: 'a4',
                            labelConfig: labelConfig || null,
                          };
                          if (onSavePreset) { setSaving(true); try { await onSavePreset(newP); setNewA4PresetName(""); setSaveA4Open(false); } finally { setSaving(false); } }
                          else if (onPresetsChange) { onPresetsChange([...presets.filter(p => p.name !== newP.name), newP]); setNewA4PresetName(""); setSaveA4Open(false); }
                        }}>
                          {saving ? "Saving..." : "Save Preset"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}

              </div>

              <div className="grid grid-cols-2 gap-2">
                <NudgeField label="Columns" value={a4Cols} onChange={(v) => onA4ColsChange?.(v)} min={1} max={8} step={1} unit="cols" />
                <NudgeField label="Rows" value={a4Rows} onChange={(v) => onA4RowsChange?.(v)} min={1} max={20} step={1} unit="rows" />
              </div>
              <p className="text-[10px] text-muted-foreground">
                📋 {a4Cols} × {a4Rows} = {a4Cols * a4Rows} labels per A4 sheet • Label: {values.labelWidth}×{values.labelHeight}mm
              </p>
            </div>
          )}
        </div>
      )}

      {/* Calibration Fields + Preview */}
      <div
        className={cn(
          fullWorkspace && "grid grid-cols-1 xl:grid-cols-2 gap-4 flex-1 min-h-0 items-stretch",
          !fullWorkspace && (compact ? "space-y-3" : "grid grid-cols-1 md:grid-cols-2 gap-4"),
        )}
      >
        {/* Controls */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Offsets & Gap</p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[260px] text-xs">
                  Print the Test Label. If the red crosshair is not centered on your sticker, use X and Y offsets to nudge the print. Positive X moves right, positive Y moves down. 1mm = 1 unit.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className={cn("grid gap-2", showHGap ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}>
            <NudgeField label="X-Offset" value={values.xOffset} onChange={(v) => update({ xOffset: v })} min={-15} max={15} />
            <NudgeField label="Y-Offset" value={values.yOffset} onChange={(v) => update({ yOffset: v })} min={-15} max={15} />
            <NudgeField label="V-Gap" value={values.vGap} onChange={(v) => update({ vGap: v })} min={0} max={10} />
            {showHGap && (
              <NudgeField label="H-Gap" value={values.hGap} onChange={(v) => update({ hGap: v })} min={0} max={20} />
            )}
          </div>

          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-1">Label Dimensions</p>
          <div className="grid grid-cols-2 gap-2">
            <NudgeField label="Width" value={values.labelWidth} onChange={(v) => update({ labelWidth: v })} min={15} max={120} step={1} />
            <NudgeField label="Height" value={values.labelHeight} onChange={(v) => update({ labelHeight: v })} min={10} max={120} step={1} />
          </div>
        </div>

        {/* Live Preview */}
        {(!compact || fullWorkspace) && (
          <div className={cn("space-y-2", fullWorkspace && "flex flex-col min-h-0 h-full")}>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">
              Live Preview ({previewScale}× •{' '}
              {getThermalPreviewCols(printMode) > 1
                ? `${values.labelWidth}×${values.labelHeight}mm × ${getThermalPreviewCols(printMode)}`
                : `${values.labelWidth}×${values.labelHeight}mm`})
            </p>
            <Card className={cn("overflow-hidden", fullWorkspace && "flex flex-col flex-1 min-h-0")}>
              <CardContent
                className={cn(
                  "p-3 flex items-center justify-center bg-muted/30 overflow-auto",
                  fullWorkspace ? "flex-1 min-h-[180px]" : "",
                )}
                style={fullWorkspace ? undefined : { minHeight: 120 }}
              >
                {getThermalPreviewCols(printMode) > 1 ? (
                  <PrecisionThermalRowPreview
                    items={Array.from({ length: getThermalPreviewCols(printMode) }, () => sampleItem || SAMPLE_ITEM)}
                    labelWidth={values.labelWidth}
                    labelHeight={values.labelHeight}
                    xOffset={values.xOffset}
                    yOffset={values.yOffset}
                    horizontalGap={values.hGap}
                    thermalCols={getThermalPreviewCols(printMode)}
                    showBorder
                    config={labelConfig}
                    scaleFactor={previewScale}
                  />
                ) : (
                  <PrecisionLabelCell
                    item={sampleItem || SAMPLE_ITEM}
                    width={values.labelWidth}
                    height={values.labelHeight}
                    xOffset={values.xOffset}
                    yOffset={values.yOffset}
                    showBorder
                    config={labelConfig}
                    scaleFactor={previewScale}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
