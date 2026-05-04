/** Strict ADM + digits (case-insensitive), e.g. ADM0449, adm10000 */
export function parseAdmNumericSuffix(admissionNumber: string): number | null {
  const m = String(admissionNumber || "")
    .trim()
    .match(/^ADM(\d+)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

export function maxAdmNumericFromRows(rows: { admission_number: string }[]): number {
  let max = 0;
  for (const r of rows) {
    const n = parseAdmNumericSuffix(r.admission_number);
    if (n != null && n > max) max = n;
  }
  return max;
}

/** ADM + zero-padded suffix (min width 4; grows for 10000+). */
export function formatAdmissionFromNumeric(n: number): string {
  if (!Number.isFinite(n) || n < 1) return "ADM0001";
  const width = Math.max(4, String(n).length);
  return `ADM${String(n).padStart(width, "0")}`;
}

/** Next ADM string after the highest existing numeric suffix among ADM* rows. */
export function formatNextAdmissionAfterMax(maxExistingNumeric: number): string {
  return formatAdmissionFromNumeric(maxExistingNumeric + 1);
}
