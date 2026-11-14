import { supabase } from "@/integrations/supabase/client";
import { mapPrinterPresetFromRow } from "@/lib/barcode/barcodeLabelConfig";
import { presetMatchesPrintMode, type PrecisionPrintMode } from "@/utils/precisionThermalModes";
import type { CalibrationPreset } from "@/components/precision-barcode/LabelCalibrationUI";

/**
 * Printer presets (saved label calibrations) data module (Plan Phase 4, D6 + S4).
 *
 * Barcode Printing loaded the preset list with five copies of the same query and did the
 * "default for this print mode" switch inline; Settings had its own copy of that switch
 * whose writes were never checked. Both now use these functions. They always read fresh
 * (these are editors: a save must show at once), and every function throws on failure so
 * the caller decides what to tell the user.
 */

/** All the shop's presets, A→Z by name, in the shape the label screens use. */
export async function fetchPrinterPresets(orgId: string): Promise<CalibrationPreset[]> {
  const { data, error } = await supabase
    .from("printer_presets")
    .select("*")
    .eq("organization_id", orgId)
    .order("name");
  if (error) throw error;
  return (data || []).map((row) => mapPrinterPresetFromRow(row as Record<string, unknown>));
}

export async function fetchPrinterPresetByName(orgId: string, name: string): Promise<CalibrationPreset | null> {
  const { data, error } = await supabase
    .from("printer_presets")
    .select("*")
    .eq("organization_id", orgId)
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  return data ? mapPrinterPresetFromRow(data as Record<string, unknown>) : null;
}

/** Un-default every preset that is currently the default for this print mode. */
export async function clearDefaultPrinterPresetsForMode(orgId: string, printMode: PrecisionPrintMode): Promise<void> {
  const { data: rows, error } = await supabase
    .from("printer_presets")
    .select("id, name, print_mode, thermal_cols, a4_cols, a4_rows")
    .eq("organization_id", orgId)
    .eq("is_default", true);
  if (error) throw error;

  const idsToClear = (rows ?? [])
    .filter((row) =>
      presetMatchesPrintMode(
        {
          name: String(row.name ?? ""),
          printMode: row.print_mode as PrecisionPrintMode | undefined,
          thermalCols: row.thermal_cols != null ? Number(row.thermal_cols) : undefined,
          a4Cols: row.a4_cols != null ? Number(row.a4_cols) : undefined,
          a4Rows: row.a4_rows != null ? Number(row.a4_rows) : undefined,
        },
        printMode,
      ),
    )
    .map((row) => String(row.id));
  if (idsToClear.length === 0) return;

  const { error: clearError } = await supabase
    .from("printer_presets")
    .update({ is_default: false })
    .eq("organization_id", orgId)
    .in("id", idsToClear);
  if (clearError) throw clearError;
}

export function thermalColsForMode(printMode: PrecisionPrintMode): number {
  return printMode === "thermal3up" ? 3 : printMode === "thermal2up" ? 2 : 1;
}

/** Make one preset the default for a print mode. Returns false when the preset is gone. */
export async function markPrinterPresetDefault(
  orgId: string,
  presetId: string,
  printMode: PrecisionPrintMode,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("printer_presets")
    .update({ is_default: true, print_mode: printMode, thermal_cols: thermalColsForMode(printMode) })
    .eq("id", presetId)
    .eq("organization_id", orgId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

/** Clear the mode's current default, then mark this preset. Returns false when the preset is gone. */
export async function setDefaultPrinterPreset(
  orgId: string,
  presetId: string,
  printMode: PrecisionPrintMode,
): Promise<boolean> {
  await clearDefaultPrinterPresetsForMode(orgId, printMode);
  return markPrinterPresetDefault(orgId, presetId, printMode);
}

export async function deletePrinterPreset(orgId: string, presetId: string): Promise<void> {
  const { error } = await supabase
    .from("printer_presets")
    .delete()
    .eq("id", presetId)
    .eq("organization_id", orgId);
  if (error) throw error;
}
