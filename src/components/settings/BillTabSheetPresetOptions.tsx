import { SelectGroup, SelectItem, SelectLabel } from "@/components/ui/select";
import { useBarcodeLabelSettings } from "@/hooks/useBarcodeLabelSettings";

/** Defers barcode_label_settings fetch until Bill tab content mounts. */
export function BillTabSheetPresetOptions() {
  const { customPresets: savedSheetPresets } = useBarcodeLabelSettings();

  if (savedSheetPresets.length === 0) return null;

  return (
    <SelectGroup>
      <SelectLabel>💾 My Saved Presets</SelectLabel>
      {savedSheetPresets.map((preset) => (
        <SelectItem key={preset.name} value={`preset_${preset.name}`}>
          {preset.name} ({preset.width}×{preset.height}mm, {preset.cols}×{preset.rows})
        </SelectItem>
      ))}
    </SelectGroup>
  );
}
