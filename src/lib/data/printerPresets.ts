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

/** Print modes that Settings → Bill & Barcode can open on by default. */
export function isSettingsLandingMode(printMode: PrecisionPrintMode): boolean {
  return printMode === "thermal" || printMode === "thermal2up" || printMode === "thermal3up" || printMode === "footwear";
}

/**
 * Mirror a default preset into Settings → Bill & Barcode (landing tab, print mode and design),
 * keeping every other barcode setting. Returns false when the shop has no settings row.
 * Throws on a failed read or write — the write used to be unchecked, so a failure looked
 * like success.
 */
export async function syncDefaultLabelDesignToSettings(
  orgId: string,
  presetId: string,
  printMode: PrecisionPrintMode,
): Promise<boolean> {
  const { data: settingsRow, error: readError } = await supabase
    .from("settings")
    .select("id, bill_barcode_settings")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (readError) throw readError;
  if (!settingsRow?.id) return false;

  const prevBbs =
    settingsRow.bill_barcode_settings && typeof settingsRow.bill_barcode_settings === "object"
      ? (settingsRow.bill_barcode_settings as Record<string, unknown>)
      : {};
  const tabForMode =
    printMode === "footwear"
      ? "precision_footwear"
      : printMode === "thermal3up"
        ? "precision_3up"
        : printMode === "thermal2up"
          ? "precision_2up"
          : "precision_1up";
  const { error: writeError } = await supabase
    .from("settings")
    .update({
      bill_barcode_settings: {
        ...prevBbs,
        barcode_default_print_tab: tabForMode,
        default_thermal_landing: printMode,
        default_precision_preset_id: presetId,
        precision_print_mode: printMode,
      },
    })
    .eq("id", settingsRow.id)
    .eq("organization_id", orgId);
  if (writeError) throw writeError;
  return true;
}

/**
 * Save the Label Designer's precision design into Settings → Bill & Barcode, keeping every
 * other barcode setting (read fresh just before writing). Throws on a failed read or write.
 */
export async function savePrecisionLabelConfigToSettings(orgId: string, config: unknown): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from("settings")
    .select("bill_barcode_settings")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const currentBbs = (existing?.bill_barcode_settings as Record<string, unknown> | null) || {};
  const { error: updateError } = await supabase
    .from("settings")
    .update({ bill_barcode_settings: { ...currentBbs, precision_label_config: config } as never })
    .eq("organization_id", orgId);
  if (updateError) throw updateError;
}
