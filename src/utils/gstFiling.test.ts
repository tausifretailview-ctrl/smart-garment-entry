import { describe, expect, it } from "vitest";
import {
  daysBetween,
  dueDateFor,
  filedPeriodForDate,
  filedPeriodLockMessage,
  filingCalendar,
  listPeriods,
  nextReminder,
  parsePortalErrorReport,
  periodForDate,
  periodForFp,
  reminderText,
  resolveGstFilings,
  todayIst,
  withGstFilingRecord,
  type GstFilings,
} from "./gstFiling";

const filed = (fp: string, type: "GSTR1" | "GSTR3B" | "CMP08" = "GSTR1"): GstFilings => ({
  [type]: { [fp]: { filedAt: "2026-11-09T10:00:00.000Z", filedBy: "owner@shop.in", arn: "AA271026000123X" } },
});

describe("periods", () => {
  it("months for regular, quarters for QRMP / composition, keyed MMYYYY by the last month", () => {
    expect(periodForDate("2026-10-15", "regular")).toMatchObject({ fp: "102026", label: "Oct 2026", fromYmd: "2026-10-01", toYmd: "2026-10-31" });
    expect(periodForDate("2026-10-15", null)).toMatchObject({ fp: "102026" });
    expect(periodForDate("2026-10-15", "qrmp")).toMatchObject({ fp: "122026", label: "Oct–Dec 2026", fromYmd: "2026-10-01", toYmd: "2026-12-31" });
    expect(periodForDate("2026-02-03", "composition")).toMatchObject({ fp: "032026", label: "Jan–Mar 2026", toYmd: "2026-03-31" });
    expect(periodForFp("022028", "regular")).toMatchObject({ toYmd: "2028-02-29" });
    expect(periodForFp("132026", "regular")).toBeNull();
  });

  it("lists the last periods newest first, across a year end", () => {
    expect(listPeriods("regular", "2026-02-10", 3).map((p) => p.fp)).toEqual(["022026", "012026", "122025"]);
    expect(listPeriods("qrmp", "2026-05-10", 3).map((p) => p.label)).toEqual(["Apr–Jun 2026", "Jan–Mar 2026", "Oct–Dec 2025"]);
  });

  it("knows the due dates", () => {
    const oct = periodForDate("2026-10-15", "regular")!;
    expect(dueDateFor(oct, "GSTR1", "regular")).toBe("2026-11-11");
    expect(dueDateFor(oct, "GSTR3B", "regular")).toBe("2026-11-20");
    const dec = periodForDate("2026-12-15", "regular")!;
    expect(dueDateFor(dec, "GSTR1", "regular")).toBe("2027-01-11");
    const q = periodForDate("2026-10-15", "qrmp")!;
    expect(dueDateFor(q, "GSTR1", "qrmp")).toBe("2027-01-13");
    expect(dueDateFor(q, "GSTR3B", "qrmp", "27")).toBe("2027-01-22"); // Maharashtra
    expect(dueDateFor(q, "GSTR3B", "qrmp", "07")).toBe("2027-01-24"); // Delhi
    expect(dueDateFor(periodForDate("2026-10-15", "composition")!, "CMP08", "composition")).toBe("2027-01-18");
  });

  it("day arithmetic and IST today", () => {
    expect(daysBetween("2026-11-08", "2026-11-11")).toBe(3);
    expect(daysBetween("2026-11-12", "2026-11-11")).toBe(-1);
    expect(todayIst(new Date("2026-10-31T19:00:00.000Z"))).toBe("2026-11-01");
  });
});

describe("calendar and reminders", () => {
  it("marks each return filed / due soon / overdue / open / upcoming", () => {
    const rows = filingCalendar({ scheme: "regular", filings: filed("092026"), todayYmd: "2026-11-08", count: 3 });
    expect(rows.map((r) => r.period.fp)).toEqual(["112026", "102026", "092026"]);
    expect(rows[0].ended).toBe(false);
    expect(rows[0].returns.map((r) => r.status)).toEqual(["upcoming", "upcoming"]);
    expect(rows[1].returns.map((r) => [r.name, r.dueYmd, r.daysLeft, r.status])).toEqual([
      ["GSTR-1", "2026-11-11", 3, "due_soon"],
      ["GSTR-3B", "2026-11-20", 12, "open"],
    ]);
    expect(rows[2].returns.map((r) => r.status)).toEqual(["filed", "overdue"]);
    expect(rows[2].returns[0].record?.arn).toBe("AA271026000123X");
  });

  it("composition shops see CMP-08 only", () => {
    const rows = filingCalendar({ scheme: "composition", filings: {}, todayYmd: "2026-11-08", count: 2 });
    expect(rows[1].returns.map((r) => r.name)).toEqual(["CMP-08"]);
  });

  it("reminds about the oldest overdue return first, then one due within a week, else nothing", () => {
    const overdue = nextReminder({ scheme: "regular", filings: filed("092026"), todayYmd: "2026-11-08" });
    expect(overdue).toMatchObject({ type: "GSTR3B", period: { fp: "092026" }, overdue: true, daysLeft: -19 });
    expect(reminderText(overdue!).title).toBe("GSTR-3B for Sep 2026 is overdue");

    const soon = nextReminder({ scheme: "regular", filings: { ...filed("092026"), ...filed("092026", "GSTR3B") }, todayYmd: "2026-11-08" });
    expect(soon).toMatchObject({ type: "GSTR1", period: { fp: "102026" }, overdue: false, daysLeft: 3 });
    expect(reminderText(soon!).title).toBe("GSTR-1 for Oct 2026 is due in 3 days");

    expect(nextReminder({ scheme: "regular", filings: { ...filed("092026"), ...filed("092026", "GSTR3B") }, todayYmd: "2026-11-02" })).toBeNull();
  });

  it("never nags about old history or a shop that has not chosen a scheme", () => {
    // Jun 2026 was never marked, but only the last two ended periods count.
    expect(nextReminder({ scheme: "regular", filings: { ...filed("092026"), ...filed("092026", "GSTR3B") }, todayYmd: "2026-11-02" })).toBeNull();
    expect(nextReminder({ scheme: null, filings: {}, todayYmd: "2026-11-08" })).toBeNull();
  });
});

describe("filed marks in settings", () => {
  it("reads and writes report_settings.gst_filing.filed without touching other keys", () => {
    const settings = { report_settings: { other: 1, gst_filing: { scheme: "regular", filed: { GSTR1: { "102026": { filed_at: "2026-11-09T10:00:00.000Z", filed_by: "o@s.in", arn: "ARN1", totals: { taxable: 100, tax: 5, bills: 2 } }, bad: {} } } } } };
    expect(resolveGstFilings(settings)).toEqual({
      GSTR1: { "102026": { filedAt: "2026-11-09T10:00:00.000Z", filedBy: "o@s.in", arn: "ARN1", totals: { taxable: 100, tax: 5, bills: 2 } } },
    });
    const next = withGstFilingRecord(settings.report_settings, "GSTR3B", "102026", { filedAt: "2026-11-19T10:00:00.000Z", filedBy: "o@s.in" });
    expect(next.other).toBe(1);
    expect((next.gst_filing as any).scheme).toBe("regular");
    expect(resolveGstFilings({ report_settings: next }).GSTR3B).toEqual({ "102026": { filedAt: "2026-11-19T10:00:00.000Z", filedBy: "o@s.in" } });
    const undone = withGstFilingRecord(next, "GSTR1", "102026", null);
    expect(resolveGstFilings({ report_settings: undone }).GSTR1).toBeUndefined();
    expect(resolveGstFilings(null)).toEqual({});
  });
});

describe("filed-period lock", () => {
  it("locks bills dated inside a filed GSTR-1 period, by scheme", () => {
    expect(filedPeriodForDate(filed("102026"), "regular", "2026-10-20T10:00:00+05:30")).toMatchObject({ type: "GSTR1", period: { fp: "102026" } });
    expect(filedPeriodForDate(filed("102026"), "regular", "2026-11-01")).toBeNull();
    expect(filedPeriodForDate(filed("102026", "GSTR3B"), "regular", "2026-10-20")).toBeNull();
    expect(filedPeriodForDate(filed("122026"), "qrmp", "2026-10-02")).toMatchObject({ period: { label: "Oct–Dec 2026" } });
    expect(filedPeriodForDate(filed("122026", "CMP08"), "composition", "2026-11-02")).toMatchObject({ type: "CMP08" });
    expect(filedPeriodForDate({}, "regular", "2026-10-02")).toBeNull();
    expect(filedPeriodForDate(filed("102026"), "regular", null)).toBeNull();
  });

  it("explains the refusal in plain words", () => {
    const lock = filedPeriodForDate(filed("102026"), "regular", "2026-10-20")!;
    expect(filedPeriodLockMessage("POS/26-27/12", lock)).toContain("Bill POS/26-27/12 is dated in Oct 2026, whose GSTR-1 was marked filed on 9 Nov 2026");
    expect(filedPeriodLockMessage(null, lock)).toMatch(/^This bill is dated/);
  });
});

describe("portal error report", () => {
  it("lists every failed row with its table, reference, code and message", () => {
    const report = parsePortalErrorReport({
      gstin: "27ABCDE1234F1Z0",
      fp: "102026",
      error_report: {
        b2b: [
          { ctin: "24ABCDE1234F1Z6", inv: [{ inum: "INV/26-27/9", error_cd: "RET191113", error_msg: "The GSTIN is invalid." }, { inum: "INV/26-27/10" }] },
        ],
        b2cs: [{ sply_ty: "INTRA", pos: "27", rt: 5, error_cd: "RET191175", error_msg: "Rate not allowed." }],
        hsn: { data: [{ hsn_sc: "61", error_cd: "RET191120", error_msg: "HSN invalid." }] },
        doc_issue: { doc_det: [{ doc_num: 1, docs: [{ from: "POS/1", to: "POS/9", error_msg: "Bad series." }] }] },
        cdnr: [{ ctin: "24ABCDE1234F1Z6", nt: [{ nt_num: "SR/1", error_cd: "RET191124", error_msg: "Original invoice not found." }] }],
      },
    });
    expect(report.gstin).toBe("27ABCDE1234F1Z0");
    expect(report.fp).toBe("102026");
    expect(report.errors).toEqual([
      { table: "B2B", ref: "24ABCDE1234F1Z6 · INV/26-27/9", code: "RET191113", message: "The GSTIN is invalid." },
      { table: "B2CS", ref: "POS 27 · 5%", code: "RET191175", message: "Rate not allowed." },
      { table: "HSN summary", ref: "HSN 61", code: "RET191120", message: "HSN invalid." },
      { table: "Documents issued", ref: "POS/1 to POS/9", code: "", message: "Bad series." },
      { table: "Credit notes (registered)", ref: "24ABCDE1234F1Z6 · SR/1", code: "RET191124", message: "Original invoice not found." },
    ]);
  });

  it("handles a file-level error and junk input", () => {
    expect(parsePortalErrorReport({ error_cd: "RET191106", error_msg: "JSON structure" }).errors).toEqual([
      { table: "File", ref: "", code: "RET191106", message: "JSON structure" },
    ]);
    expect(parsePortalErrorReport("nope").errors).toEqual([]);
    expect(parsePortalErrorReport(null).errors).toEqual([]);
  });
});
