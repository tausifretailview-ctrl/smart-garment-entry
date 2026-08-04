/**
 * Sheet types selectable as the Standard Printing default
 * (Settings → Bill & Barcode → Default Standard Sheet Type).
 * Values must match the sheetPresets keys in BarcodePrinting.tsx.
 */
export type StandardSheetTypeOptionGroup = {
  group: string;
  options: { value: string; label: string }[];
};

export const STANDARD_SHEET_TYPE_OPTIONS: StandardSheetTypeOptionGroup[] = [
  {
    group: "A4 - Small Labels",
    options: [
      { value: "a4_80sheet", label: "A4 80-Sheet (26×14mm, tiny)" },
      { value: "novajet48", label: "Novajet 48 (33×19mm, 8 cols)" },
      { value: "novajet65", label: "Novajet 65 (38×21mm, 5 cols)" },
      { value: "a4_65sheet", label: "A4 65-Sheet (38×22mm, shelf)" },
    ],
  },
  {
    group: "A4 - Medium Labels",
    options: [
      { value: "a4_12x4", label: "NovaJet MPL 48L (48×24mm, 4×12)" },
      { value: "a4_36sheet", label: "A4 36-Sheet (48×30mm, 4×9)" },
      { value: "a4_32sheet", label: "A4 32-Sheet (52×30mm, retail)" },
      { value: "a4_35square", label: "A4 35-Square (35×35mm)" },
      { value: "a4_40sheet", label: "A4 40-Sheet (39×35mm, 5×8) MPL 40L" },
      { value: "novajet40", label: "Novajet 40 (39×35mm, 5×8) MPL 40L" },
    ],
  },
  {
    group: "A4 - Large Labels",
    options: [
      { value: "a4_24sheet", label: "A4 24-Sheet (70×35mm)" },
      { value: "a4_21sheet", label: "A4 21-Sheet (63.5×38.1mm)" },
      { value: "a4_20sheet", label: "A4 20-Sheet (100×50mm)" },
    ],
  },
  {
    group: "Thermal 1UP",
    options: [
      { value: "thermal_40x20_1up", label: "40×20mm (1UP)" },
      { value: "thermal_38x25_1up", label: "38×25mm (1UP)" },
      { value: "thermal_40x30_1up", label: "40×30mm (1UP)" },
      { value: "thermal_50x25_1up", label: "50×25mm (1UP)" },
      { value: "thermal_50x30_1up", label: "50×30mm (1UP)" },
      { value: "thermal_50x38_1up", label: "50×38mm (1UP)" },
      { value: "thermal_50x40_1up", label: "50×40mm (1UP)" },
      { value: "thermal_60x30_1up", label: "60×30mm (1UP)" },
      { value: "thermal_60x40_1up", label: "60×40mm (1UP)" },
      { value: "thermal_75x50_1up", label: "75×50mm (1UP)" },
      { value: "thermal_80x40_1up", label: "80×40mm (1UP)" },
      { value: "thermal_100x50_1up", label: "100×50mm (1UP)" },
      { value: "jewellery_100x15_1up", label: "Jewellery Tag (100×15mm)" },
    ],
  },
  {
    group: "Thermal 2UP",
    options: [
      { value: "thermal_40x20_2up", label: "40×20mm (2UP)" },
      { value: "thermal_38x25_2up", label: "38×25mm (2UP)" },
      { value: "thermal_40x30_2up", label: "40×30mm (2UP)" },
      { value: "thermal_50x25_2up", label: "50×25mm (2UP)" },
      { value: "thermal_50x30_2up", label: "50×30mm (2UP)" },
      { value: "thermal_60x30_2up", label: "60×30mm (2UP)" },
      { value: "thermal_60x40_2up", label: "60×40mm (2UP)" },
      { value: "thermal_75x50_2up", label: "75×50mm (2UP)" },
    ],
  },
];

export const STANDARD_SHEET_TYPE_VALUES = new Set(
  STANDARD_SHEET_TYPE_OPTIONS.flatMap((g) => g.options.map((o) => o.value)),
);

export function isValidStandardSheetType(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  // Saved custom sheet presets are stored as "preset_<name>"
  if (value.startsWith("preset_")) return value.length > "preset_".length;
  return STANDARD_SHEET_TYPE_VALUES.has(value);
}
