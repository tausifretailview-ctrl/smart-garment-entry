import type { SupabaseClient } from "@supabase/supabase-js";

type AcademicYearRow = {
  id: string;
  organization_id: string;
  start_date: string | null;
  end_date: string | null;
};

function dayOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

/**
 * Map a calendar date to the academic year row that contains it (inclusive range).
 */
export function academicYearIdForPaymentDate(
  years: AcademicYearRow[],
  organizationId: string,
  dateStr: string | null | undefined
): string | null {
  const day = dayOnly(dateStr);
  if (!day) return null;
  const orgYears = years
    .filter((y) => y.organization_id === organizationId)
    .sort((a, b) => {
      const as = dayOnly(a.start_date) || "";
      const bs = dayOnly(b.start_date) || "";
      return as.localeCompare(bs);
    });
  for (const y of orgYears) {
    const s = dayOnly(y.start_date);
    const e = dayOnly(y.end_date);
    if (!s || !e) continue;
    if (day >= s && day <= e) return y.id;
  }
  return null;
}

export type FixHistoricalStudentLedgersResult = {
  scanned: number;
  updated: number;
  candidates: number;
  errors: string[];
};

/**
 * Re-assign `student_fees.academic_year_id` from `paid_date` (or `created_at`) when it
 * disagrees with the academic calendar. Fixes promoted-session bugs where prior-year
 * cash was stored under the new session and inflated current-year paid totals.
 */
export async function fixHistoricalStudentLedgers(
  supabase: SupabaseClient,
  options?: { organizationId?: string; dryRun?: boolean }
): Promise<FixHistoricalStudentLedgersResult> {
  const errors: string[] = [];
  let scanned = 0;
  let updated = 0;
  let candidates = 0;
  const dryRun = options?.dryRun === true;

  let yq = supabase
    .from("academic_years")
    .select("id, organization_id, start_date, end_date")
    .order("start_date", { ascending: true });
  if (options?.organizationId) yq = yq.eq("organization_id", options.organizationId);
  const { data: yearsData, error: yErr } = await yq;
  if (yErr) {
    errors.push(yErr.message);
    return { scanned, updated, candidates, errors };
  }
  const yearRows = (yearsData || []) as AcademicYearRow[];

  const PAGE = 500;
  let from = 0;
  for (;;) {
    let fq = supabase
      .from("student_fees")
      .select("id, organization_id, academic_year_id, paid_date, created_at, paid_amount, status")
      .in("status", ["paid", "partial"])
      .gt("paid_amount", 0)
      .range(from, from + PAGE - 1);
    if (options?.organizationId) fq = fq.eq("organization_id", options.organizationId);
    const { data: rows, error } = await fq;
    if (error) {
      errors.push(error.message);
      break;
    }
    if (!rows?.length) break;

    for (const row of rows as {
      id: string;
      organization_id: string;
      academic_year_id: string;
      paid_date: string | null;
      created_at: string | null;
      paid_amount: number | null;
      status: string | null;
    }[]) {
      scanned++;
      const dateStr = row.paid_date || row.created_at || null;
      const expected = academicYearIdForPaymentDate(yearRows, row.organization_id, dateStr);
      if (!expected || expected === row.academic_year_id) continue;
      candidates++;
      if (dryRun) continue;
      const { error: uErr } = await supabase
        .from("student_fees")
        .update({ academic_year_id: expected })
        .eq("id", row.id);
      if (uErr) errors.push(`${row.id}: ${uErr.message}`);
      else updated++;
    }

    if (rows.length < PAGE) break;
    from += PAGE;
  }

  return { scanned, updated, candidates, errors };
}
