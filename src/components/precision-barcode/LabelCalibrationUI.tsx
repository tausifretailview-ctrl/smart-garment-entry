import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Minus, Plus, Save, Trash2 } from "lucide-react";
import { PrecisionLabelPreview } from "./PrecisionLabelPreview";
import { LabelDesignConfig, LabelItem } from "@/types/labelTypes";

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

      {/* Calibration Fields + Preview */}
      <div className={compact ? "space-y-3" : "grid grid-cols-1 md:grid-cols-2 gap-4"}>
        {/* Controls */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Offsets & Gap</p>
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
                    item={SAMPLE_ITEM}
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
