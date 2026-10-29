/**
 * GST filing calendar: which returns a shop files, when each one is due,
 * which periods are marked filed, and what that locks.
 *
 * Pure helpers (no Supabase). The page and the alert popup read the shop's
 * filing scheme from `settings.report_settings.gst_filing` (see gstReadiness.ts)
 * and the filed marks from `settings.report_settings.gst_filing.filed`:
 *
 *   gst_filing.filed = { GSTR1: { "102026": { filed_at, filed_by, arn } }, GSTR3B: {...}, CMP08: {...} }
 *
 * Periods are keyed the portal way, MMYYYY (a quarter by its last month), the
 * same `fp` the GSTR-1 file carries, so a filed mark and a file always agree.
 *
 * Due dates (as of 2026):
 * - Regular: GSTR-1 by the 11th and GSTR-3B by the 20th of the next month.
 * - QRMP: GSTR-1 by the 13th of the month after the quarter; GSTR-3B by the
 *   22nd (southern / western states and UTs) or 24th (the rest).
 * - Composition: CMP-08 by the 18th of the month after the quarter (GSTR-4 is yearly).
 */
import type { GstFilingScheme } from "@/utils/gstReadiness";

export type GstReturnType = "GSTR1" | "GSTR3B" | "CMP08";

export type GstFilingRecord = {
  filedAt: string; // ISO timestamp
  filedBy: string; // email or name of the user who marked it
  arn?: string;
  note?: string;
  totals?: { taxable: number; tax: number; bills: number };
};

export type GstFilings = Partial<Record<GstReturnType, Record<string, GstFilingRecord>>>;

export type GstPeriod = {
  /** Portal period key MMYYYY; a quarter uses its last month. */
  fp: string;
  /** "Oct 2026" or "Oct–Dec 2026". */
  label: string;
  fromYmd: string;
  toYmd: string;
  months: 1 | 3;
};

export type FilingStatus = "filed" | "overdue" | "due_soon" | "open" | "upcoming";

export type ReturnDue = {
  type: GstReturnType;
  name: string;
  dueYmd: string;
  /** Days from today to the due date; negative when overdue. */
  daysLeft: number;
  status: FilingStatus;
  record?: GstFilingRecord;
};

export type PeriodRow = { period: GstPeriod; ended: boolean; returns: ReturnDue[] };

export type GstReminder = {
  type: GstReturnType;
  name: string;
  period: GstPeriod;
  dueYmd: string;
  daysLeft: number;
  overdue: boolean;
};

export const RETURN_NAMES: Record<GstReturnType, string> = { GSTR1: "GSTR-1", GSTR3B: "GSTR-3B", CMP08: "CMP-08" };

/** The popup reminds this many days before a due date (and every day after it). */
export const REMIND_DAYS_BEFORE_DUE = 7;

/** QRMP GSTR-3B is due on the 22nd in these states / UTs, the 24th elsewhere. */
const QRMP_3B_22ND_STATES = new Set(["22", "23", "24", "25", "26", "27", "29", "30", "31", "32", "33", "34", "35", "36", "37"]);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function parseYmd(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || "").trim());
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** Whole days from `fromYmd` to `toYmd` (negative when `toYmd` is earlier). */
export function daysBetween(fromYmd: string, toYmd: string): number {
  const a = parseYmd(fromYmd);
  const b = parseYmd(toYmd);
  if (!a || !b) return 0;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

/** Today's date in IST as YYYY-MM-DD, whatever the PC's time zone. */
export function todayIst(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return ymd(ist.getUTCFullYear(), ist.getUTCMonth() + 1, ist.getUTCDate());
}

/** Quarterly schemes file per quarter; everyone else per month. */
export function periodMonths(scheme: GstFilingScheme | null | undefined): 1 | 3 {
  return scheme === "qrmp" || scheme === "composition" ? 3 : 1;
}

function monthPeriod(y: number, m: number): GstPeriod {
  return { fp: `${pad2(m)}${y}`, label: `${MONTHS[m - 1]} ${y}`, fromYmd: ymd(y, m, 1), toYmd: ymd(y, m, lastDay(y, m)), months: 1 };
}

function quarterPeriod(y: number, m: number): GstPeriod {
  const first = m - ((m - 1) % 3);
  const last = first + 2;
  return {
    fp: `${pad2(last)}${y}`,
    label: `${MONTHS[first - 1]}–${MONTHS[last - 1]} ${y}`,
    fromYmd: ymd(y, first, 1),
    toYmd: ymd(y, last, lastDay(y, last)),
    months: 3,
  };
}

/** The filing period a date falls in. */
export function periodForDate(dateYmd: string, scheme: GstFilingScheme | null | undefined): GstPeriod | null {
  const p = parseYmd(dateYmd);
  if (!p) return null;
  return periodMonths(scheme) === 3 ? quarterPeriod(p.y, p.m) : monthPeriod(p.y, p.m);
}

/** The period for a portal key MMYYYY under the given scheme. */
export function periodForFp(fp: string, scheme: GstFilingScheme | null | undefined): GstPeriod | null {
  const match = /^(\d{2})(\d{4})$/.exec(String(fp || "").trim());
  if (!match) return null;
  const m = Number(match[1]);
  const y = Number(match[2]);
  if (m < 1 || m > 12) return null;
  return periodMonths(scheme) === 3 ? quarterPeriod(y, m) : monthPeriod(y, m);
}

/** The last `count` periods ending with the one `today` falls in, newest first. */
export function listPeriods(scheme: GstFilingScheme | null | undefined, todayYmd: string, count = 12): GstPeriod[] {
  const out: GstPeriod[] = [];
  const step = periodMonths(scheme);
  let cursor = periodForDate(todayYmd, scheme);
  while (cursor && out.length < count) {
    out.push(cursor);
    const from = parseYmd(cursor.fromYmd)!;
    let m = from.m - step;
    let y = from.y;
    if (m < 1) {
      m += 12;
      y -= 1;
    }
    cursor = step === 3 ? quarterPeriod(y, m) : monthPeriod(y, m);
  }
  return out;
}

/** Which returns a shop files under its scheme. */
export function returnTypesFor(scheme: GstFilingScheme | null | undefined): GstReturnType[] {
  return scheme === "composition" ? ["CMP08"] : ["GSTR1", "GSTR3B"];
}

/** Due date of one return for one period. */
export function dueDateFor(period: GstPeriod, type: GstReturnType, scheme: GstFilingScheme | null | undefined, shopStateCode?: string | null): string {
  const to = parseYmd(period.toYmd)!;
  let m = to.m + 1;
  let y = to.y;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  if (type === "CMP08") return ymd(y, m, 18);
  if (scheme === "qrmp") {
    if (type === "GSTR1") return ymd(y, m, 13);
    return ymd(y, m, QRMP_3B_22ND_STATES.has(String(shopStateCode || "").trim()) ? 22 : 24);
  }
  return ymd(y, m, type === "GSTR1" ? 11 : 20);
}

function statusFor(record: GstFilingRecord | undefined, ended: boolean, daysLeft: number): FilingStatus {
  if (record) return "filed";
  if (!ended) return "upcoming";
  if (daysLeft < 0) return "overdue";
  if (daysLeft <= REMIND_DAYS_BEFORE_DUE) return "due_soon";
  return "open";
}

export type CalendarInput = {
  scheme: GstFilingScheme | null | undefined;
  shopStateCode?: string | null;
  filings: GstFilings;
  todayYmd: string;
  count?: number;
};

/** Period rows for the filing page, newest first. */
export function filingCalendar(input: CalendarInput): PeriodRow[] {
  const types = returnTypesFor(input.scheme);
  return listPeriods(input.scheme, input.todayYmd, input.count ?? 12).map((period) => {
    const ended = period.toYmd < input.todayYmd;
    const returns = types.map((type) => {
      const dueYmd = dueDateFor(period, type, input.scheme, input.shopStateCode);
      const daysLeft = daysBetween(input.todayYmd, dueYmd);
      const record = input.filings[type]?.[period.fp];
      return { type, name: RETURN_NAMES[type], dueYmd, daysLeft, status: statusFor(record, ended, daysLeft), record };
    });
    return { period, ended, returns };
  });
}

/** The reminder looks only this many ended periods back, so old history never nags. */
export const REMIND_LOOKBACK_PERIODS = 2;

/**
 * The one return to remind about: the oldest unfiled return of the last two
 * ended periods that is overdue or due within REMIND_DAYS_BEFORE_DUE days.
 * Null when nothing is close, and null until the shop has chosen its filing
 * scheme (a shop that files through its accountant is never nagged).
 */
export function nextReminder(input: CalendarInput): GstReminder | null {
  if (!input.scheme) return null;
  const rows = filingCalendar({ ...input, count: REMIND_LOOKBACK_PERIODS + 1 }).filter((r) => r.ended).reverse();
  for (const row of rows) {
    for (const r of row.returns) {
      if (r.status === "overdue" || r.status === "due_soon") {
        return { type: r.type, name: r.name, period: row.period, dueYmd: r.dueYmd, daysLeft: r.daysLeft, overdue: r.daysLeft < 0 };
      }
    }
  }
  return null;
}

export function reminderText(rem: GstReminder): { title: string; body: string } {
  const due = formatYmd(rem.dueYmd);
  if (rem.overdue) {
    const late = Math.abs(rem.daysLeft);
    return {
      title: `${rem.name} for ${rem.period.label} is overdue`,
      body: `It was due on ${due} (${late} day${late === 1 ? "" : "s"} ago). Late fee and interest grow daily. File it on gst.gov.in, then mark it filed in GST Filing.`,
    };
  }
  const left = rem.daysLeft === 0 ? "today" : rem.daysLeft === 1 ? "tomorrow" : `in ${rem.daysLeft} days`;
  return {
    title: `${rem.name} for ${rem.period.label} is due ${left}`,
    body: `Due ${due}. Open GST Reports for ${rem.period.label}, check the file and upload it on gst.gov.in. Mark it filed in GST Filing when done.`,
  };
}

export function formatYmd(value: string): string {
  const p = parseYmd(value);
  if (!p) return value;
  return `${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
}

// ── Filed marks in settings ──────────────────────────────────────────────

const RETURN_TYPES: GstReturnType[] = ["GSTR1", "GSTR3B", "CMP08"];

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseRecord(raw: unknown): GstFilingRecord | null {
  const o = asObject(raw);
  const filedAt = String(o.filed_at || "").trim();
  if (!filedAt) return null;
  const totals = asObject(o.totals);
  const rec: GstFilingRecord = { filedAt, filedBy: String(o.filed_by || "").trim() };
  if (o.arn) rec.arn = String(o.arn).trim();
  if (o.note) rec.note = String(o.note).trim();
  if (Object.keys(totals).length) {
    rec.totals = { taxable: Number(totals.taxable) || 0, tax: Number(totals.tax) || 0, bills: Number(totals.bills) || 0 };
  }
  return rec;
}

/** Filed marks from the settings row (`report_settings.gst_filing.filed`). */
export function resolveGstFilings(settings: { report_settings?: unknown } | null | undefined): GstFilings {
  const filed = asObject(asObject(asObject(settings?.report_settings).gst_filing).filed);
  const out: GstFilings = {};
  for (const type of RETURN_TYPES) {
    const byPeriod = asObject(filed[type]);
    const parsed: Record<string, GstFilingRecord> = {};
    for (const [fp, raw] of Object.entries(byPeriod)) {
      const rec = parseRecord(raw);
      if (rec && /^\d{6}$/.test(fp)) parsed[fp] = rec;
    }
    if (Object.keys(parsed).length) out[type] = parsed;
  }
  return out;
}

/** New report_settings with one filed mark set (record) or removed (null); other keys untouched. */
export function withGstFilingRecord(
  reportSettings: unknown,
  type: GstReturnType,
  fp: string,
  record: GstFilingRecord | null,
): Record<string, unknown> {
  const base = asObject(reportSettings);
  const gstFiling = asObject(base.gst_filing);
  const filed = asObject(gstFiling.filed);
  const byPeriod = { ...asObject(filed[type]) };
  if (record) {
    const raw: Record<string, unknown> = { filed_at: record.filedAt, filed_by: record.filedBy };
    if (record.arn) raw.arn = record.arn;
    if (record.note) raw.note = record.note;
    if (record.totals) raw.totals = record.totals;
    byPeriod[fp] = raw;
  } else {
    delete byPeriod[fp];
  }
  return { ...base, gst_filing: { ...gstFiling, filed: { ...filed, [type]: byPeriod } } };
}

// ── Locking bills of a filed period ───────────────────────────────────────

export type FiledPeriodLock = { type: GstReturnType; period: GstPeriod; record: GstFilingRecord };

/** The filed outward return (GSTR-1, or CMP-08 for composition) covering a bill date, if any. */
export function filedPeriodForDate(
  filings: GstFilings,
  scheme: GstFilingScheme | null | undefined,
  dateValue: string | Date | null | undefined,
): FiledPeriodLock | null {
  if (!dateValue) return null;
  const dateYmd = dateValue instanceof Date ? todayIst(dateValue) : String(dateValue).slice(0, 10);
  const type: GstReturnType = scheme === "composition" ? "CMP08" : "GSTR1";
  const byPeriod = filings[type];
  if (!byPeriod || !Object.keys(byPeriod).length) return null;
  const period = periodForDate(dateYmd, scheme);
  if (!period) return null;
  const record = byPeriod[period.fp];
  return record ? { type, period, record } : null;
}

/** Plain-words reason shown when an edit or delete is refused. */
export function filedPeriodLockMessage(billNumber: string | null | undefined, lock: FiledPeriodLock): string {
  const bill = billNumber ? `Bill ${billNumber}` : "This bill";
  return (
    `${bill} is dated in ${lock.period.label}, whose ${RETURN_NAMES[lock.type]} was marked filed on ` +
    `${formatYmd(lock.record.filedAt.slice(0, 10))}. Changing it would alter a filed return. ` +
    `Make a sale return or a fresh bill instead; if you must change this bill, undo the filed mark on the GST Filing page first ` +
    `(the next return will then need an amendment).`
  );
}

// ── Portal error report ───────────────────────────────────────────────────

export type PortalError = { table: string; ref: string; code: string; message: string };

export type PortalErrorReport = { gstin: string; fp: string; errors: PortalError[] };

const TABLE_NAMES: Record<string, string> = {
  b2b: "B2B",
  b2ba: "B2B amendments",
  b2cl: "B2CL",
  b2cla: "B2CL amendments",
  b2cs: "B2CS",
  b2csa: "B2CS amendments",
  cdnr: "Credit notes (registered)",
  cdnra: "Credit note amendments",
  cdnur: "Credit notes (unregistered)",
  cdnura: "Credit note amendments",
  exp: "Exports",
  nil: "Nil-rated",
  hsn: "HSN summary",
  doc_issue: "Documents issued",
  at: "Advances received",
  txpd: "Advances adjusted",
  ecom: "E-commerce",
};

const pick = (o: Record<string, unknown>, keys: string[]): string => {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
};

/**
 * Reads the JSON error report the portal gives after "Processed with Error".
 * It has the shape of the uploaded file with `error_cd` / `error_msg` added
 * on the rows that failed, so the walk is tolerant of nesting and extra keys.
 */
export function parsePortalErrorReport(raw: unknown): PortalErrorReport {
  const root = asObject(raw);
  const report: PortalErrorReport = { gstin: pick(root, ["gstin"]), fp: pick(root, ["fp"]), errors: [] };
  const seen = new Set<string>();

  const walk = (node: unknown, table: string, ctx: string[]) => {
    if (Array.isArray(node)) {
      node.forEach((child) => walk(child, table, ctx));
      return;
    }
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    const nextCtx = [...ctx];
    const ctin = pick(o, ["ctin"]);
    if (ctin) nextCtx.push(ctin);
    const doc = pick(o, ["inum", "nt_num", "oinum", "ont_num"]);
    if (doc) nextCtx.push(doc);
    const hsn = pick(o, ["hsn_sc"]);
    if (hsn) nextCtx.push(`HSN ${hsn}`);
    const docFrom = pick(o, ["from"]);
    if (docFrom && !doc) nextCtx.push(`${docFrom}${o.to ? ` to ${o.to}` : ""}`);
    if (!doc && !hsn && !docFrom && o.rt !== undefined && table === "b2cs") {
      nextCtx.push(`${pick(o, ["pos"]) ? `POS ${pick(o, ["pos"])} · ` : ""}${o.rt}%`);
    }
    const code = pick(o, ["error_cd", "error_code", "errorCode", "err_cd"]);
    const message = pick(o, ["error_msg", "error_message", "errorMessage", "errMsg", "err_msg"]);
    if (code || message) {
      const err: PortalError = { table: TABLE_NAMES[table] || (table ? table.toUpperCase() : "File"), ref: nextCtx.join(" · "), code, message };
      const key = `${err.table}|${err.ref}|${err.code}|${err.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        report.errors.push(err);
      }
    }
    for (const [key, value] of Object.entries(o)) {
      if (value && typeof value === "object") walk(value, TABLE_NAMES[key] ? key : table, nextCtx);
    }
  };

  walk(root, "", []);
  return report;
}
