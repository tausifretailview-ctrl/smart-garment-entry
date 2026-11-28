import { useState } from "react";
import { Scale } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsField, SettingsGrid, SettingsSection, SettingsToggle } from "@/components/settings/settingsLayout";
import {
  parseScaleBarcode,
  readScaleBarcodeConfig,
  type ScaleBarcodeConfig,
  type ScaleValueType,
} from "@/lib/scaleBarcode";

/**
 * Settings → POS → Weighing scale labels (supermarket go-live, Nov 2026). The layout of the
 * label barcode differs between scales; the test box shows how a printed label is read.
 */
type Props = {
  saleSettings: unknown;
  onChange: (next: ScaleBarcodeConfig) => void;
};

export function ScaleBarcodeSettings({ saleSettings, onChange }: Props) {
  const cfg = readScaleBarcodeConfig(saleSettings);
  const [sample, setSample] = useState("");
  const patch = (p: Partial<ScaleBarcodeConfig>) => onChange({ ...cfg, ...p });
  const total = (cfg.prefixes[0]?.length ?? 2) + cfg.itemDigits + cfg.valueDigits + 1;
  const parsed = sample.trim() ? parseScaleBarcode(sample, { ...cfg, enabled: true }) : null;

  return (
    <SettingsSection
      title="Weighing scale labels"
      subtitle="Loose items: the scale prints the item code and weight (or price) in the barcode"
      icon={Scale}
      tone="emerald"
    >
      <SettingsGrid cols={2}>
        <SettingsToggle
          id="scale_barcode_enabled"
          label="Read scale labels at POS and Sale Bill"
          description="The item's barcode in EzzyERP must be its item code (PLU) on the scale."
          className="col-span-full"
          checked={cfg.enabled}
          onCheckedChange={(checked) => patch({ enabled: checked })}
        />
        {cfg.enabled ? (
          <>
            <SettingsField label="Label starts with" htmlFor="scale_prefixes" help="Comma separated, e.g. 21,22 (usually 20–29)">
              <Input
                id="scale_prefixes"
                value={cfg.prefixes.join(",")}
                onChange={(e) => patch({ prefixes: e.target.value.split(",").map((p) => p.trim()).filter(Boolean) })}
              />
            </SettingsField>
            <SettingsField label="Item code digits" htmlFor="scale_item_digits" help="Usually 5">
              <Input
                id="scale_item_digits"
                type="number"
                min={3}
                max={7}
                value={cfg.itemDigits}
                onChange={(e) => patch({ itemDigits: Number(e.target.value) || cfg.itemDigits })}
              />
            </SettingsField>
            <SettingsField label="Label holds" htmlFor="scale_value_type">
              <Select
                value={cfg.valueType}
                onValueChange={(v: ScaleValueType) => patch({ valueType: v, valueDecimals: v === "price" ? 2 : 3 })}
              >
                <SelectTrigger id="scale_value_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weight">Weight (grams → kg)</SelectItem>
                  <SelectItem value="price">Price (paise → ₹)</SelectItem>
                </SelectContent>
              </Select>
            </SettingsField>
            <SettingsField label="Weight / price digits" htmlFor="scale_value_digits" help={`Barcode length: ${total} digits`}>
              <Input
                id="scale_value_digits"
                type="number"
                min={4}
                max={6}
                value={cfg.valueDigits}
                onChange={(e) => patch({ valueDigits: Number(e.target.value) || cfg.valueDigits })}
              />
            </SettingsField>
            <SettingsField label="Test a label" htmlFor="scale_sample" help="Scan or type one printed label" className="col-span-full">
              <Input id="scale_sample" value={sample} onChange={(e) => setSample(e.target.value)} placeholder="2100123002505" />
              {sample.trim() ? (
                <p className="mt-1 text-xs" data-testid="scale-sample-result">
                  {parsed
                    ? `Item code ${parsed.itemCode} · ${parsed.weightKg != null ? `${parsed.weightKg} kg` : `₹${parsed.price}`}`
                    : "Not read as a scale label with these settings (wrong start, length or check digit)."}
                </p>
              ) : null}
            </SettingsField>
          </>
        ) : null}
      </SettingsGrid>
    </SettingsSection>
  );
}
