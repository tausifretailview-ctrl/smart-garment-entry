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

/** Signed effect on pending due for one `student_balance_audit` row (credit +, debit −, set = new−old). */
export function adjustmentDueDelta(a: {
  adjustment_type: string;
  change_amount?: number | null;
  old_balance?: number | null;
  new_balance?: number | null;
}): number {
  const t = a.adjustment_type;
  if (t === "credit") return Number(a.change_amount || 0);
  if (t === "debit") return -Number(a.change_amount || 0);
  if (t === "set") return Number(a.new_balance ?? 0) - Number(a.old_balance ?? 0);
  return 0;
}
