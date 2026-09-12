/**
 * Shared helpers for barcode label designer persist / reload.
 * Designer Save writes barcode_label_settings; reopen often reads printer_presets.
 * Names like "rahmani 38*25" vs "rahmani 38×25" must match.
 */

export function normalizeLabelDesignName(name: string | null | undefined): string {
  return String(name || "")
    .trim()
    .replace(/×/g, "*")
    .replace(/\s+/g, " ");
}

export function labelDesignNamesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normalizeLabelDesignName(a).toLowerCase();
  const right = normalizeLabelDesignName(b).toLowerCase();
  return left.length > 0 && left === right;
}

/** Template row is what Designer Save upserts; prefer it over a mirrored preset copy. */
export function preferSavedLabelConfig<T>(
  templateConfig: T | null | undefined,
  presetConfig: T | null | undefined,
): T | null {
  if (templateConfig != null) return templateConfig;
  if (presetConfig != null) return presetConfig;
  return null;
}

export function pickLatestNamedSetting<T extends { setting_name?: string; updated_at?: string | null }>(
  rows: T[],
): T[] {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const name = String(row.setting_name || "");
    if (!name) continue;
    const prev = latest.get(name);
    if (!prev) {
      latest.set(name, row);
      continue;
    }
    const prevAt = Date.parse(String(prev.updated_at || "")) || 0;
    const nextAt = Date.parse(String(row.updated_at || "")) || 0;
    if (nextAt >= prevAt) latest.set(name, row);
  }
  return [...latest.values()];
}
