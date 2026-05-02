/**
 * Gross liability before adjustments and payments (structure + effective opening).
 * Used by Fee Collection grid, collect dialog, and year-wise balance helpers.
 *
 * @see docs/school-fees-liability.md
 */
export function resolveLiability(
  student: { closing_fees_balance?: number | null; is_new_admission?: boolean | null },
  structureTotal: number,
  yearName?: string | null
): number {
  const importedBalance = Number(student?.closing_fees_balance) || 0;
  const expected = Number(structureTotal) || 0;
  const isNewAdmission = student?.is_new_admission === true;
  const isLegacy2025 = yearName === "2025-26";

  if (isNewAdmission) return importedBalance;
  if (expected > 0) return expected + importedBalance;
  if (isLegacy2025 && importedBalance > 0 && expected <= 0) return importedBalance;
  return importedBalance;
}
