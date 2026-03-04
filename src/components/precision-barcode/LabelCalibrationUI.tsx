import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { HelpCircle, Minus, Plus, Save, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PrecisionLabelPreview } from "./PrecisionLabelPreview";
import { LabelDesignConfig, LabelItem, LabelTemplate } from "@/types/labelTypes";

export interface CalibrationValues {
  xOffset: number;
  yOffset: number;
  vGap: number;
  labelWidth: number;
  labelHeight: number;
}

export interface CalibrationPreset {
  id?: string;
  name: string;
  xOffset: number;
  yOffset: number;
  vGap: number;
  width: number;
  height: number;
  a4Cols?: number;
  a4Rows?: number;
  labelConfig?: LabelDesignConfig | null;
  isDefault?: boolean;
}

const BUILT_IN_PRESETS: CalibrationPreset[] = [
  { name: "50×25mm Thermal", xOffset: 0, yOffset: 0, vGap: 2, width: 50, height: 25 },
  { name: "38×25mm Jewellery", xOffset: 1, yOffset: 0.5, vGap: 1, width: 38, height: 25 },
  { name: "100×50mm Shipping", xOffset: 0, yOffset: 0, vGap: 3, width: 100, height: 50 },
  { name: "40×30mm Compact", xOffset: 0, yOffset: 0, vGap: 2, width: 40, height: 30 },
  { name: "60×40mm Standard", xOffset: 0, yOffset: 0, vGap: 2, width: 60, height: 40 },
];

const A4_SHEET_PRESETS = [
  { name: "Novajet 40 (52×30mm, 4×10)", width: 52, height: 30, cols: 4, rows: 10, xOffset: 1, yOffset: 5, vGap: 0 },
  { name: "Novajet 24 (64×34mm, 3×8)", width: 64, height: 34, cols: 3, rows: 8, xOffset: 5, yOffset: 5, vGap: 0 },
  { name: "Novajet 12 (100×44mm, 2×6)", width: 100, height: 44, cols: 2, rows: 6, xOffset: 5, yOffset: 5, vGap: 0 },
  { name: "39×35mm (4×7)", width: 39, height: 35, cols: 4, rows: 7, xOffset: 13, yOffset: 11, vGap: 3.5 },
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
  labelConfig?: LabelDesignConfig;
  compact?: boolean;
  sampleItem?: LabelItem;
  savedTemplates?: LabelTemplate[];
  printMode?: 'thermal' | 'a4';
  a4Cols?: number;
  a4Rows?: number;
  onPrintModeChange?: (mode: 'thermal' | 'a4') => void;
  onA4ColsChange?: (cols: number) => void;
  onA4RowsChange?: (rows: number) => void;
  /** @deprecated Use onSavePreset/onDeletePreset instead */
  onPresetsChange?: (presets: CalibrationPreset[]) => void;
}

export function LabelCalibrationUI({
  values,
  onChange,
  presets = [],
  onSavePreset,
  onDeletePreset,
  onLoadPreset,
  onPresetsChange,
  labelConfig,
  compact = false,
  sampleItem,
  savedTemplates = [],
  printMode = 'thermal',
  a4Cols = 4,
  a4Rows = 12,
  onPrintModeChange,
  onA4ColsChange,
  onA4RowsChange,
}: LabelCalibrationUIProps) {
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [activePresetName, setActivePresetName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const allPresets = [...BUILT_IN_PRESETS, ...presets];

  const isUserPreset = activePresetName ? presets.some((p) => p.name === activePresetName) : false;

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
        onLoadPreset?.({ name: templateName, xOffset: values.xOffset, yOffset: values.yOffset, vGap: values.vGap, width: template.labelWidth || values.labelWidth, height: template.labelHeight || values.labelHeight, labelConfig: template.config });
        setActivePresetName(null);
      }
      return;
    }

    const preset = allPresets.find((p) => p.name === name);
    if (preset) {
      onChange({
        xOffset: preset.xOffset,
        yOffset: preset.yOffset,
        vGap: preset.vGap,
        labelWidth: preset.width,
        labelHeight: preset.height,
      });
      setActivePresetName(name);
      onLoadPreset?.(preset);
    }
  };

  const updatePreset = async () => {
    if (!activePresetName || !isUserPreset) return;
    const existing = presets.find((p) => p.name === activePresetName);
    if (!existing) return;

    const updatedPreset: CalibrationPreset = {
      ...existing,
      xOffset: values.xOffset,
      yOffset: values.yOffset,
      vGap: values.vGap,
      width: values.labelWidth,
      height: values.labelHeight,
      labelConfig: labelConfig || null,
    };

    if (onSavePreset) {
      setSaving(true);
      try { await onSavePreset(updatedPreset); } finally { setSaving(false); }
    } else if (onPresetsChange) {
      const updated = presets.map((p) => p.name === activePresetName ? updatedPreset : p);
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
      width: values.labelWidth,
      height: values.labelHeight,
      labelConfig: labelConfig || null,
    };

    if (onSavePreset) {
      setSaving(true);
      try {
        await onSavePreset(newPreset);
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

  const deletePreset = async (name: string) => {
    const preset = presets.find((p) => p.name === name);
    if (!preset) return;

    if (onDeletePreset && preset.id) {
      await onDeletePreset(preset.id);
    } else if (onPresetsChange) {
      onPresetsChange(presets.filter((p) => p.name !== name));
    }
    if (activePresetName === name) setActivePresetName(null);
  };

  const previewScale = compact ? 2 : 2.5;

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {/* Presets Row */}
      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex-1 min-w-[160px] space-y-1">
          <Label className="text-xs">Load Preset</Label>
          <Select onValueChange={loadPreset}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select a preset..." />
            </SelectTrigger>
            <SelectContent>
              {allPresets.map((p) => (
                <SelectItem key={p.name} value={p.name} className="text-xs">
                  {p.name}
                  <span className="ml-1 text-muted-foreground">
                    ({p.width}×{p.height})
                  </span>
                </SelectItem>
              ))}
              {savedTemplates.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 mt-1">💾 My Label Templates</div>
                  {savedTemplates.map((t) => (
                    <SelectItem key={`template_${t.name}`} value={`template_${t.name}`} className="text-xs">
                      📐 {t.name}
                      {t.labelWidth && t.labelHeight && (
                        <span className="ml-1 text-muted-foreground">
                          ({t.labelWidth}×{t.labelHeight})
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
          <Button type="button" variant="outline" size="xs" className="h-8" onClick={updatePreset} disabled={saving}>
            <Save className="h-3 w-3 mr-1" />
            Update
          </Button>
        )}

        {(onSavePreset || onPresetsChange) && (
          <Dialog open={savePresetOpen} onOpenChange={setSavePresetOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="xs" className="h-8">
                <Save className="h-3 w-3 mr-1" />
                Save
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-sm">Save Calibration Preset</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <Label className="text-xs">Preset Name</Label>
                <Input
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="e.g. My Thermal 50x25"
                  className="h-8 text-xs"
                  onKeyDown={(e) => e.key === "Enter" && savePreset()}
                />
                <p className="text-[10px] text-muted-foreground">
                  Saves: {values.labelWidth}×{values.labelHeight}mm, offset ({values.xOffset}, {values.yOffset}), gap {values.vGap}mm
                  {labelConfig ? " + label design" : ""}
                </p>
              </div>
              <DialogFooter>
                <Button type="button" size="xs" onClick={savePreset} disabled={!newPresetName.trim() || saving}>
                  {saving ? "Saving..." : "Save Preset"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {presets.length > 0 && (onDeletePreset || onPresetsChange) && (
          <Select onValueChange={deletePreset}>
            <SelectTrigger className="h-8 text-xs w-auto min-w-[100px]">
              <SelectValue placeholder="Delete..." />
            </SelectTrigger>
            <SelectContent>
              {presets.map((p) => (
                <SelectItem key={p.name} value={p.name} className="text-xs text-destructive">
                  🗑 {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

          {printMode === 'a4' && (
            <div className="border rounded-lg p-3 space-y-3 bg-muted/10">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex-1 min-w-[160px] space-y-1">
                  <Label className="text-xs">A4 Sheet Preset</Label>
                  <Select onValueChange={(name) => {
                    const preset = A4_SHEET_PRESETS.find(p => p.name === name);
                    if (preset) {
                      onChange({
                        ...values,
                        labelWidth: preset.width,
                        labelHeight: preset.height,
                        xOffset: preset.xOffset,
                        yOffset: preset.yOffset,
                        vGap: preset.vGap,
                      });
                      onA4ColsChange?.(preset.cols);
                      onA4RowsChange?.(preset.rows);
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
                    </SelectContent>
                  </Select>
                </div>
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
      <div className={compact ? "space-y-3" : "grid grid-cols-1 md:grid-cols-2 gap-4"}>
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
          <div className="grid grid-cols-3 gap-2">
            <NudgeField label="X-Offset" value={values.xOffset} onChange={(v) => update({ xOffset: v })} min={-15} max={15} />
            <NudgeField label="Y-Offset" value={values.yOffset} onChange={(v) => update({ yOffset: v })} min={-15} max={15} />
            <NudgeField label="V-Gap" value={values.vGap} onChange={(v) => update({ vGap: v })} min={0} max={10} />
          </div>

          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-1">Label Dimensions</p>
          <div className="grid grid-cols-2 gap-2">
            <NudgeField label="Width" value={values.labelWidth} onChange={(v) => update({ labelWidth: v })} min={15} max={120} step={1} />
            <NudgeField label="Height" value={values.labelHeight} onChange={(v) => update({ labelHeight: v })} min={10} max={120} step={1} />
          </div>
        </div>

        {/* Live Preview */}
        {!compact && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Live Preview ({previewScale}× • {values.labelWidth}×{values.labelHeight}mm)
            </p>
            <Card className="overflow-hidden">
              <CardContent className="p-3 flex items-center justify-center bg-muted/30 overflow-auto" style={{ minHeight: 120 }}>
                <div
                  style={{
                    width: values.labelWidth * 3.7795 * previewScale,
                    height: values.labelHeight * 3.7795 * previewScale,
                    flexShrink: 0,
                  }}
                >
                  <PrecisionLabelPreview
                    item={sampleItem || SAMPLE_ITEM}
                    width={values.labelWidth}
                    height={values.labelHeight}
                    xOffset={values.xOffset}
                    yOffset={values.yOffset}
                    showBorder
                    config={labelConfig}
                    scaleFactor={previewScale}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
