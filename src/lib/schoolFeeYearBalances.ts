import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveImportedOpeningBalance } from "@/lib/schoolFeeOpening";

type AcademicYearRow = {
  id: string;
  year_name: string | null;
  start_date: string | null;
  end_date: string | null;
};

/** Matches FeeCollection.tsx resolveLiability */
function resolveLiability(
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

function getPreviousAcademicYear(target: AcademicYearRow, allChrono: AcademicYearRow[]): AcademicYearRow | null {
  if (!target.start_date) return null;
  const tStart = new Date(target.start_date);
  const candidates = allChrono.filter((y) => y.end_date && new Date(y.end_date) < tStart);
  if (!candidates.length) return null;
  return candidates.sort(
    (a, b) => new Date(b.end_date!).getTime() - new Date(a.end_date!).getTime()
  )[0];
}

export type YearFeeBalanceRow = { yearId: string; year_name: string; balance: number };

/**
 * Pending fee balance per academic year for one student, using the same rules as Fee Collection.
 */
export async function computeYearWiseFeeBalances(
  supabase: SupabaseClient,
  organizationId: string,
  student: {
    id: string;
    class_id: string | null;
    academic_year_id?: string | null;
    closing_fees_balance: number | null;
    is_new_admission: boolean | null;
    fees_opening_is_net?: boolean | null;
  },
  options?: { maxYearsDisplay?: number }
): Promise<YearFeeBalanceRow[]> {
  const maxYears = options?.maxYearsDisplay ?? 6;

  const { data: allYears, error: yErr } = await supabase
    .from("academic_years")
    .select("id, year_name, start_date, end_date")
    .eq("organization_id", organizationId)
    .order("start_date", { ascending: true });

  if (yErr) throw yErr;
  const yearsChrono: AcademicYearRow[] = allYears || [];

  const { data: allFees } = await supabase
    .from("student_fees")
    .select("academic_year_id, paid_amount, status")
    .eq("organization_id", organizationId)
    .eq("student_id", student.id)
    .in("status", ["paid", "partial"])
    .gt("paid_amount", 0);

  const paymentsByYear = new Map<string, number>();
  (allFees || []).forEach((f: any) => {
    if (f.status === "balance_adjustment") return;
    const y = f.academic_year_id as string;
    paymentsByYear.set(y, (paymentsByYear.get(y) || 0) + Number(f.paid_amount || 0));
  });

  const { data: allAdjustments } = await (supabase.from("student_balance_audit" as any) as any)
    .select("academic_year_id, adjustment_type, change_amount")
    .eq("organization_id", organizationId)
    .eq("student_id", student.id);

  const adjByYear = new Map<string, number>();
  (allAdjustments || []).forEach((a: any) => {
    const y = a.academic_year_id as string | undefined;
    if (!y) return;
    const delta =
      a.adjustment_type === "credit"
        ? (a.change_amount || 0)
        : a.adjustment_type === "debit"
          ? -(a.change_amount || 0)
          : 0;
    adjByYear.set(y, (adjByYear.get(y) || 0) + delta);
  });

  const yearIds = yearsChrono.map((y) => y.id);
  let structureByYear = new Map<string, number>();
  if (student.class_id && yearIds.length) {
    const { data: structures } = await supabase
      .from("fee_structures")
      .select("academic_year_id, amount, frequency")
      .eq("organization_id", organizationId)
      .eq("class_id", student.class_id)
      .in("academic_year_id", yearIds);

    (structures || []).forEach((s: any) => {
      const mult = s.frequency === "monthly" ? 12 : s.frequency === "quarterly" ? 4 : 1;
      const y = s.academic_year_id as string;
      structureByYear.set(y, (structureByYear.get(y) || 0) + (s.amount || 0) * mult);
    });
  }

  const results: YearFeeBalanceRow[] = [];

  for (const Y of yearsChrono) {
    const previousYear = getPreviousAcademicYear(Y, yearsChrono);
    let latePrevPaid = 0;
    if (previousYear?.id) {
      latePrevPaid = paymentsByYear.get(previousYear.id) || 0;
    }

    const openingIsNet =
      student.fees_opening_is_net === true &&
      !!student.academic_year_id &&
      student.academic_year_id === Y.id;
    const importedBalance = resolveImportedOpeningBalance(
      Number(student.closing_fees_balance || 0),
      latePrevPaid,
      openingIsNet
    );
    const totalExpected = structureByYear.get(Y.id) || 0;
    // For new-admission students, opening (imported) balance applies only to their joining year.
    // Prior years should have zero imported liability.
    const isNewAdmission = student.is_new_admission === true;
    const isJoiningYear = !!student.academic_year_id && student.academic_year_id === Y.id;
    const effectiveImported = isNewAdmission && !isJoiningYear ? 0 : importedBalance;
    const liability = resolveLiability(
      { ...student, closing_fees_balance: effectiveImported },
      totalExpected,
      Y.year_name
    );
    const adjustmentNet = adjByYear.get(Y.id) || 0;
    const totalDueGross = liability + adjustmentNet;
    const paid = paymentsByYear.get(Y.id) || 0;
    const totalDue = Math.max(0, Math.round((totalDueGross - paid) * 100) / 100);

    results.push({
      yearId: Y.id,
      year_name: Y.year_name || "",
      balance: totalDue,
    });
  }

  const newestFirst = [...results].reverse();
  return newestFirst.slice(0, maxYears);
}

export type StudentPendingBatchRow = {
  id: string;
  class_id: string | null;
  academic_year_id?: string | null;
  closing_fees_balance: number | null;
  is_new_admission: boolean | null;
  fees_opening_is_net?: boolean | null;
};

/**
 * Pending summed across all academic sessions for many students (same math as
 * {@link computeYearWiseFeeBalances}), using batched queries — for ledger “All Years”.
 */
export async function computePendingAllSessionsBatch(
  supabase: SupabaseClient,
  organizationId: string,
  students: StudentPendingBatchRow[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!students.length) return out;

  const { data: allYears, error: yErr } = await supabase
    .from("academic_years")
    .select("id, year_name, start_date, end_date")
    .eq("organization_id", organizationId)
    .order("start_date", { ascending: true });

  if (yErr) throw yErr;
  const yearsChrono: AcademicYearRow[] = allYears || [];
  if (!yearsChrono.length) {
    students.forEach((s) => out.set(s.id, 0));
    return out;
  }

  const yearIds = yearsChrono.map((y) => y.id);
  const studentIds = students.map((s) => s.id);

  const { data: allFees } = await supabase
    .from("student_fees")
    .select("student_id, academic_year_id, paid_amount, status")
    .eq("organization_id", organizationId)
    .in("student_id", studentIds)
    .in("status", ["paid", "partial"])
    .gt("paid_amount", 0);

  const payByStudent = new Map<string, Map<string, number>>();
  (allFees || []).forEach((f: any) => {
    if (f.status === "balance_adjustment") return;
    const sid = f.student_id as string;
    const y = f.academic_year_id as string;
    if (!payByStudent.has(sid)) payByStudent.set(sid, new Map());
    const m = payByStudent.get(sid)!;
    m.set(y, (m.get(y) || 0) + Number(f.paid_amount || 0));
  });

  const { data: allAdj } = await (supabase.from("student_balance_audit" as any) as any)
    .select("student_id, academic_year_id, adjustment_type, change_amount")
    .eq("organization_id", organizationId)
    .in("student_id", studentIds);

  const adjByStudent = new Map<string, Map<string, number>>();
  (allAdj || []).forEach((a: any) => {
    const sid = a.student_id as string;
    const y = a.academic_year_id as string | undefined;
    if (!y) return;
    const delta =
      a.adjustment_type === "credit"
        ? (a.change_amount || 0)
        : a.adjustment_type === "debit"
          ? -(a.change_amount || 0)
          : 0;
    if (!adjByStudent.has(sid)) adjByStudent.set(sid, new Map());
    const m = adjByStudent.get(sid)!;
    m.set(y, (m.get(y) || 0) + delta);
  });

  const classIds = [...new Set(students.map((s) => s.class_id).filter(Boolean))] as string[];
  const structureByClassYear = new Map<string, Map<string, number>>();
  if (classIds.length && yearIds.length) {
    const { data: structures } = await supabase
      .from("fee_structures")
      .select("class_id, academic_year_id, amount, frequency")
      .eq("organization_id", organizationId)
      .in("class_id", classIds)
      .in("academic_year_id", yearIds);

    (structures || []).forEach((s: any) => {
      const mult = s.frequency === "monthly" ? 12 : s.frequency === "quarterly" ? 4 : 1;
      const cid = s.class_id as string;
      const y = s.academic_year_id as string;
      if (!structureByClassYear.has(cid)) structureByClassYear.set(cid, new Map());
      const ym = structureByClassYear.get(cid)!;
      ym.set(y, (ym.get(y) || 0) + (s.amount || 0) * mult);
    });
  }

  for (const student of students) {
    const paymentsByYear = payByStudent.get(student.id) || new Map<string, number>();
    const adjByYear = adjByStudent.get(student.id) || new Map<string, number>();
    const structForClass = student.class_id
      ? structureByClassYear.get(student.class_id) || new Map<string, number>()
      : new Map<string, number>();

    let sumPending = 0;
    for (const Y of yearsChrono) {
      const previousYear = getPreviousAcademicYear(Y, yearsChrono);
      let latePrevPaid = 0;
      if (previousYear?.id) {
        latePrevPaid = paymentsByYear.get(previousYear.id) || 0;
      }
      const openingIsNet =
        student.fees_opening_is_net === true &&
        !!student.academic_year_id &&
        student.academic_year_id === Y.id;
      const importedBalance = resolveImportedOpeningBalance(
        Number(student.closing_fees_balance || 0),
        latePrevPaid,
        openingIsNet
      );
      const totalExpected = structForClass.get(Y.id) || 0;
      const isNewAdmission = student.is_new_admission === true;
      const isJoiningYear = !!student.academic_year_id && student.academic_year_id === Y.id;
      const effectiveImported = isNewAdmission && !isJoiningYear ? 0 : importedBalance;
      const liability = resolveLiability(
        { ...student, closing_fees_balance: effectiveImported },
        totalExpected,
        Y.year_name
      );
      const adjustmentNet = adjByYear.get(Y.id) || 0;
      const totalDueGross = liability + adjustmentNet;
      const paid = paymentsByYear.get(Y.id) || 0;
      const totalDue = Math.max(0, Math.round((totalDueGross - paid) * 100) / 100);
      sumPending += totalDue;
    }
    out.set(student.id, Math.round(sumPending * 100) / 100);
  }

  return out;
}

export function formatYearWiseBalanceLines(rows: YearFeeBalanceRow[]): string {
  if (!rows.length) return "";
  return rows
    .filter((r) => r.year_name)
    .map((r) => `• ${r.year_name} fees balance: Rs.${r.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`)
    .join("\n");
}

/** Sum of pending balances across returned year rows (multi-session total). */
export function sumYearWisePending(rows: YearFeeBalanceRow[]): number {
  return Math.round(rows.reduce((s, r) => s + (r.balance || 0), 0) * 100) / 100;
}

/**
 * WhatsApp / SMS: headline total plus per-session lines (only years with balance > 0).
 * Use for fee reminders and receipt “outstanding” sections.
 */
export function formatWhatsAppPendingSummary(rows: YearFeeBalanceRow[]): string {
  const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2 });
  const total = sumYearWisePending(rows);
  const nonZero = rows.filter((r) => r.balance > 0);
  const lines = formatYearWiseBalanceLines(nonZero);
  const head = `💰 Total pending (all sessions): Rs.${fmt(total)}`;
  if (!lines) return head;
  return `${head}\n\nBy session:\n${lines}`;
}

/** Full fee receipt body for WhatsApp (matches Fee Collection dialog). */
export function buildFeeReceiptWhatsAppMessage(opts: {
  orgName: string;
  receiptNumber: string;
  paidDateLabel: string;
  studentName: string;
  admissionNo: string;
  className: string;
  totalPaying: number;
  paymentMethod: string;
  feeLines: string;
  remainingBalance: number;
  yearWiseBalances?: YearFeeBalanceRow[];
}): string {
  const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2 });
  const rows = opts.yearWiseBalances ?? [];
  const balanceSection =
    rows.length > 0
      ? `\n\nOutstanding after this payment:\n${formatWhatsAppPendingSummary(rows)}\n`
      : `\nBalance (this session): Rs.${fmt(opts.remainingBalance)}\n`;
  return `Fee Receipt\n\nRespected Sir/Madam,\n\n${opts.orgName}\n\nReceipt No: ${opts.receiptNumber}\nDate: ${opts.paidDateLabel}\nStudent: ${opts.studentName}\nAdmission No: ${opts.admissionNo}\nClass: ${opts.className}\n\nAmount Paid: Rs.${fmt(opts.totalPaying)}\nPayment Mode: ${opts.paymentMethod}${balanceSection}\n${opts.feeLines}\n\nThank you for your payment.\n\n${opts.orgName}`;
}
