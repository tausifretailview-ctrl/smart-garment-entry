import { supabase } from "@/integrations/supabase/client";
import type { LabelDesignConfig } from "@/types/labelTypes";
import { isMissingPgColumn, omitRecordKey } from "@/utils/printerPresetDbCompat";

export type PrinterPresetBackupRow = {
  backup_id: string;
  preset_id: string | null;
  organization_id: string;
  org_name?: string | null;
  name: string | null;
  label_width: number | null;
  label_height: number | null;
  x_offset: number | null;
  y_offset: number | null;
  v_gap: number | null;
  h_gap?: number | null;
  a4_cols: number | null;
  a4_rows: number | null;
  label_config: LabelDesignConfig | null;
  is_default: boolean | null;
  print_mode: string | null;
  thermal_cols: number | null;
  /** Inferred from note — production table has no backup_type column. */
  backup_type: "auto" | "manual";
  note: string | null;
  created_by: string | null;
  /** Mapped from backed_up_at for UI compatibility. */
  created_at: string;
  backed_up_at?: string;
};

export type PrinterPresetExportPreset = {
  name: string;
  label_width: number;
  label_height: number;
  x_offset: number;
  y_offset: number;
  v_gap: number;
  h_gap?: number;
  a4_cols: number | null;
  a4_rows: number | null;
  label_config: LabelDesignConfig | null;
  is_default: boolean;
  print_mode: string | null;
  thermal_cols: number | null;
};

export type PrinterPresetExportFile = {
  version: 1;
  exportedAt: string;
  organizationId: string;
  organizationName: string;
  presets: PrinterPresetExportPreset[];
};

type PrinterPresetRow = {
  id: string;
  organization_id: string;
  name: string;
  label_width: number;
  label_height: number;
  x_offset: number;
  y_offset: number;
  v_gap: number;
  h_gap?: number;
  a4_cols: number | null;
  a4_rows: number | null;
  label_config: LabelDesignConfig | null;
  is_default: boolean | null;
  print_mode: string | null;
  thermal_cols: number | null;
};

function mapPresetRow(row: Record<string, unknown>): PrinterPresetRow {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    name: String(row.name),
    label_width: Number(row.label_width),
    label_height: Number(row.label_height),
    x_offset: Number(row.x_offset),
    y_offset: Number(row.y_offset),
    v_gap: Number(row.v_gap),
    h_gap: row.h_gap != null ? Number(row.h_gap) : 0,
    a4_cols: row.a4_cols != null ? Number(row.a4_cols) : null,
    a4_rows: row.a4_rows != null ? Number(row.a4_rows) : null,
    label_config: (row.label_config as LabelDesignConfig) ?? null,
    is_default: row.is_default != null ? Boolean(row.is_default) : null,
    print_mode: row.print_mode != null ? String(row.print_mode) : null,
    thermal_cols: row.thermal_cols != null ? Number(row.thermal_cols) : null,
  };
}

function inferBackupType(note: string | null | undefined): "auto" | "manual" {
  if (!note || !note.trim()) return "auto";
  const n = note.trim().toLowerCase();
  if (n === "before restore" || n === "before import") return "auto";
  if (n.startsWith("full snapshot") || n.startsWith("migrated from")) return "auto";
  return "manual";
}

function mapBackupRow(row: Record<string, unknown>): PrinterPresetBackupRow {
  const backedUpAt = String(row.backed_up_at ?? row.created_at ?? new Date().toISOString());
  const note = row.note != null ? String(row.note) : null;
  return {
    backup_id: String(row.backup_id),
    preset_id: row.preset_id != null ? String(row.preset_id) : null,
    organization_id: String(row.organization_id),
    org_name: row.org_name != null ? String(row.org_name) : null,
    name: row.name != null ? String(row.name) : null,
    label_width: row.label_width != null ? Number(row.label_width) : null,
    label_height: row.label_height != null ? Number(row.label_height) : null,
    x_offset: row.x_offset != null ? Number(row.x_offset) : null,
    y_offset: row.y_offset != null ? Number(row.y_offset) : null,
    v_gap: row.v_gap != null ? Number(row.v_gap) : null,
    h_gap: row.h_gap != null ? Number(row.h_gap) : null,
    a4_cols: row.a4_cols != null ? Number(row.a4_cols) : null,
    a4_rows: row.a4_rows != null ? Number(row.a4_rows) : null,
    label_config: (row.label_config as LabelDesignConfig) ?? null,
    is_default: row.is_default != null ? Boolean(row.is_default) : null,
    print_mode: row.print_mode != null ? String(row.print_mode) : null,
    thermal_cols: row.thermal_cols != null ? Number(row.thermal_cols) : null,
    backup_type: inferBackupType(note),
    note,
    created_by: row.created_by != null ? String(row.created_by) : null,
    created_at: backedUpAt,
    backed_up_at: backedUpAt,
  };
}

export function getPrinterPresetBackupErrorMessage(err: unknown): string {
  const raw =
    err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
      ? (err as { message: string }).message
      : err instanceof Error
        ? err.message
        : "";
  const msg = raw.trim();
  if (!msg) return "Unknown error";

  const lower = msg.toLowerCase();
  // Common after REVOKE ALL on printer_presets_backup (permission denied for table …)
  if (
    lower.includes("permission denied") ||
    lower.includes("42501") ||
    (lower.includes("printer_presets_backup") &&
      (lower.includes("denied") || lower.includes("not authorized") || lower.includes("rls")))
  ) {
    return "No permission to use label design backups on this database. Ask an admin to apply the printer_presets_backup grants migration.";
  }
  if (
    lower.includes("could not find the table") ||
    (lower.includes("printer_presets_backup") && lower.includes("schema cache"))
  ) {
    return "Label design backup table is missing on the server. Apply the printer_presets_backup migration, then try again.";
  }
  return msg;
}

function snapshotToInsert(
  preset: PrinterPresetRow,
  organizationId: string,
  organizationName: string,
  note?: string | null,
  includeHGap = true,
) {
  const row: Record<string, unknown> = {
    preset_id: preset.id,
    organization_id: organizationId,
    org_name: organizationName,
    name: preset.name,
    label_width: preset.label_width,
    label_height: preset.label_height,
    x_offset: preset.x_offset,
    y_offset: preset.y_offset,
    v_gap: preset.v_gap,
    a4_cols: preset.a4_cols,
    a4_rows: preset.a4_rows,
    label_config: preset.label_config as unknown as import("@/integrations/supabase/types").Json,
    is_default: preset.is_default,
    print_mode: preset.print_mode,
    thermal_cols: preset.thermal_cols,
    note: note ?? null,
  };
  if (includeHGap) {
    row.h_gap = preset.h_gap ?? 0;
  }
  return row;
}

async function insertBackupRow(
  row: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("printer_presets_backup").insert([row]);
  if (!error) return;
  if (isMissingPgColumn(error, "h_gap") && "h_gap" in row) {
    const { error: retryError } = await supabase
      .from("printer_presets_backup")
      .insert([omitRecordKey(row, "h_gap")]);
    if (retryError) throw retryError;
    return;
  }
  throw error;
}

export async function fetchPrinterPresetBackups(
  organizationId: string,
): Promise<PrinterPresetBackupRow[]> {
  const { data, error } = await supabase
    .from("printer_presets_backup")
    .select("*")
    .eq("organization_id", organizationId)
    .order("backed_up_at", { ascending: false });

  if (error) throw error;
  return (data || []).map((row) => mapBackupRow(row as Record<string, unknown>));
}

export async function fetchOrgPrinterPresets(organizationId: string): Promise<PrinterPresetRow[]> {
  const { data, error } = await supabase
    .from("printer_presets")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name");

  if (error) throw error;
  return (data || []).map((row) => mapPresetRow(row as Record<string, unknown>));
}

export async function createManualPrinterPresetBackup(
  organizationId: string,
  organizationName: string,
  presetId: string,
  note?: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("printer_presets")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", presetId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Preset not found");

  const preset = mapPresetRow(data as Record<string, unknown>);
  await insertBackupRow(
    snapshotToInsert(preset, organizationId, organizationName, note?.trim() || null),
  );
}

async function insertPresetSnapshotBackup(
  preset: PrinterPresetRow,
  organizationId: string,
  organizationName: string,
  note?: string,
): Promise<void> {
  await insertBackupRow(
    snapshotToInsert(preset, organizationId, organizationName, note),
  );
}

export async function restorePrinterPresetFromBackup(
  organizationId: string,
  organizationName: string,
  backup: PrinterPresetBackupRow,
): Promise<PrinterPresetRow> {
  if (backup.organization_id !== organizationId) {
    throw new Error("Backup does not belong to this organization");
  }
  if (!backup.name) {
    throw new Error("Backup is missing a preset name");
  }

  let current: PrinterPresetRow | null = null;
  if (backup.preset_id) {
    const { data } = await supabase
      .from("printer_presets")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", backup.preset_id)
      .maybeSingle();
    if (data) current = mapPresetRow(data as Record<string, unknown>);
  }
  if (!current) {
    const { data } = await supabase
      .from("printer_presets")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("name", backup.name)
      .maybeSingle();
    if (data) current = mapPresetRow(data as Record<string, unknown>);
  }

  if (current) {
    await insertPresetSnapshotBackup(
      current,
      organizationId,
      backup.org_name || organizationName,
      "before restore",
    );
  }

  const payload: Record<string, unknown> = {
    organization_id: organizationId,
    name: backup.name,
    label_width: backup.label_width ?? 50,
    label_height: backup.label_height ?? 25,
    x_offset: backup.x_offset ?? 0,
    y_offset: backup.y_offset ?? 0,
    v_gap: backup.v_gap ?? 2,
    h_gap: backup.h_gap ?? 0,
    a4_cols: backup.a4_cols,
    a4_rows: backup.a4_rows,
    label_config: backup.label_config as unknown as import("@/integrations/supabase/types").Json,
    is_default: backup.is_default ?? false,
    print_mode: backup.print_mode ?? "thermal",
    thermal_cols: backup.thermal_cols ?? 1,
  };

  let restored;
  let error;
  ({ data: restored, error } = await supabase
    .from("printer_presets")
    .upsert(
      [current ? { id: current.id, ...payload } : payload] as never,
      { onConflict: "organization_id,name" },
    )
    .select("*")
    .single());

  if (error && isMissingPgColumn(error, "h_gap")) {
    const without = omitRecordKey(payload, "h_gap");
    ({ data: restored, error } = await supabase
      .from("printer_presets")
      .upsert(
        [current ? { id: current.id, ...without } : without] as never,
        { onConflict: "organization_id,name" },
      )
      .select("*")
      .single());
  }

  if (error) throw error;
  return mapPresetRow(restored as Record<string, unknown>);
}

export function buildPrinterPresetExportFile(
  organizationId: string,
  organizationName: string,
  presets: PrinterPresetRow[],
): PrinterPresetExportFile {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    organizationId,
    organizationName,
    presets: presets.map((p) => ({
      name: p.name,
      label_width: p.label_width,
      label_height: p.label_height,
      x_offset: p.x_offset,
      y_offset: p.y_offset,
      v_gap: p.v_gap,
      h_gap: p.h_gap ?? 0,
      a4_cols: p.a4_cols,
      a4_rows: p.a4_rows,
      label_config: p.label_config,
      is_default: Boolean(p.is_default),
      print_mode: p.print_mode,
      thermal_cols: p.thermal_cols,
    })),
  };
}

export function validatePrinterPresetImportFile(
  raw: unknown,
): { ok: true; data: PrinterPresetExportFile } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Invalid file: expected a JSON object" };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) {
    return { ok: false, error: "Unsupported export version — expected version 1" };
  }
  if (!Array.isArray(obj.presets)) {
    return { ok: false, error: "Invalid file: missing presets array" };
  }
  if (obj.presets.length === 0) {
    return { ok: false, error: "Import file contains no presets" };
  }

  for (let i = 0; i < obj.presets.length; i++) {
    const p = obj.presets[i];
    if (!p || typeof p !== "object") {
      return { ok: false, error: `Preset #${i + 1} is not an object` };
    }
    const preset = p as Record<string, unknown>;
    if (typeof preset.name !== "string" || !preset.name.trim()) {
      return { ok: false, error: `Preset #${i + 1} is missing a valid name` };
    }
    if (preset.label_config != null && typeof preset.label_config !== "object") {
      return { ok: false, error: `Preset "${preset.name}" has invalid label_config` };
    }
    for (const key of ["label_width", "label_height", "x_offset", "y_offset", "v_gap", "h_gap"] as const) {
      if (preset[key] != null && typeof preset[key] !== "number") {
        return { ok: false, error: `Preset "${preset.name}" has invalid ${key}` };
      }
    }
  }

  return {
    ok: true,
    data: {
      version: 1,
      exportedAt: typeof obj.exportedAt === "string" ? obj.exportedAt : new Date().toISOString(),
      organizationId: typeof obj.organizationId === "string" ? obj.organizationId : "",
      organizationName: typeof obj.organizationName === "string" ? obj.organizationName : "",
      presets: obj.presets as PrinterPresetExportPreset[],
    },
  };
}

export async function backupAllPresetsBeforeImport(
  organizationId: string,
  organizationName: string,
): Promise<void> {
  const presets = await fetchOrgPrinterPresets(organizationId);
  if (presets.length === 0) return;
  for (const preset of presets) {
    await insertPresetSnapshotBackup(preset, organizationId, organizationName, "before import");
  }
}

export async function importPrinterPresetExportFile(
  organizationId: string,
  organizationName: string,
  file: PrinterPresetExportFile,
): Promise<number> {
  await backupAllPresetsBeforeImport(organizationId, organizationName);

  const rows = file.presets.map((p) => ({
    organization_id: organizationId,
    name: p.name.trim(),
    label_width: p.label_width ?? 50,
    label_height: p.label_height ?? 25,
    x_offset: p.x_offset ?? 0,
    y_offset: p.y_offset ?? 0,
    v_gap: p.v_gap ?? 2,
    h_gap: p.h_gap ?? 0,
    a4_cols: p.a4_cols,
    a4_rows: p.a4_rows,
    label_config: p.label_config as unknown as import("@/integrations/supabase/types").Json,
    is_default: p.is_default ?? false,
    print_mode: p.print_mode ?? "thermal",
    thermal_cols: p.thermal_cols ?? 1,
  }));

  let { error } = await supabase
    .from("printer_presets")
    .upsert(rows, { onConflict: "organization_id,name" });

  if (error && isMissingPgColumn(error, "h_gap")) {
    const without = rows.map((row) => omitRecordKey(row, "h_gap"));
    ({ error } = await supabase
      .from("printer_presets")
      .upsert(without, { onConflict: "organization_id,name" }));
  }

  if (error) throw error;
  return rows.length;
}

export function downloadPrinterPresetExport(
  organizationName: string,
  file: PrinterPresetExportFile,
): void {
  const safeName = organizationName.replace(/[^\w\-]+/g, "-").replace(/-+/g, "-") || "org";
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}-label-designs-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function formatBackupDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
