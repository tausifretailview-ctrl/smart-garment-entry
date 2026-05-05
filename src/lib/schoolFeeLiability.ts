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

/**
 * Compute the effective pending-due (BEFORE this-year payments) given a base liability
 * and the audit log for the year. "Set" entries are treated as authoritative overrides:
 * the latest "set" replaces the liability + all prior credits/debits. Subsequent
 * credits/debits are then layered on top.
 *
 * Pass audits in any order — they're sorted internally by created_at ascending.
 */
export function computeEffectivePendingDue(
  baseLiability: number,
  audits: Array<{
    adjustment_type: string;
    change_amount?: number | null;
    old_balance?: number | null;
    new_balance?: number | null;
    created_at?: string | null;
    reason_code?: string | null;
  }>
): number {
  const sorted = [...(audits || [])]
    .filter(
      (a) => a.reason_code !== "receipt_deleted" && a.reason_code !== "receipt_modified"
    )
    .sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    });

  let due = Number(baseLiability) || 0;
  for (const a of sorted) {
    const t = a.adjustment_type;
    if (t === "set") {
      // Authoritative override — clears liability + prior adjustments.
      due = Number(a.new_balance ?? 0);
    } else if (t === "credit") {
      due += Number(a.change_amount || 0);
    } else if (t === "debit") {
      due -= Number(a.change_amount || 0);
    }
  }
  return Math.round(due * 100) / 100;
}
