/** "+3" when worse than the previous night, "−2" when better, "" when unchanged or first run. */
export function stockDriftChange(row: { drift_variants: number; previous_drift_variants: number | null }): string {
  if (row.previous_drift_variants == null) return "";
  const delta = row.drift_variants - row.previous_drift_variants;
  if (delta === 0) return "";
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}
