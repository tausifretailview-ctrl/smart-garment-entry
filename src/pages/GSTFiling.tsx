import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CalendarCheck, CheckCircle2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { orgSettingsQueryKey, useSettings } from "@/hooks/useSettings";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { resolveGstFilingPrefs, type GstFilingScheme } from "@/utils/gstReadiness";
import {
  RETURN_NAMES,
  filingCalendar,
  formatYmd,
  nextReminder,
  reminderText,
  resolveGstFilings,
  todayIst,
  withGstFilingRecord,
  type FilingStatus,
  type GstFilingRecord,
  type GstPeriod,
  type GstReturnType,
  type PeriodRow,
  type ReturnDue,
} from "@/utils/gstFiling";

// Same look as GST Readiness / GST Analysis: coloured summary band, white cards.
const CARD = "rounded-lg border border-slate-200 bg-white shadow-sm";
const CARD_TITLE = "text-base font-bold text-slate-800 leading-tight flex items-center gap-2";

const STATUS: Record<FilingStatus, { label: string; cls: string }> = {
  filed: { label: "Filed", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  overdue: { label: "Overdue", cls: "bg-rose-100 text-rose-800 border-rose-200" },
  due_soon: { label: "Due soon", cls: "bg-amber-100 text-amber-900 border-amber-200" },
  open: { label: "To file", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  upcoming: { label: "Period running", cls: "bg-slate-50 text-slate-500 border-slate-200" },
};

const SCHEME_LABEL: Record<NonNullable<GstFilingScheme> | "none", string> = {
  regular: "Regular (monthly)",
  qrmp: "QRMP (quarterly)",
  composition: "Composition (CMP-08 every quarter)",
  none: "Scheme not chosen",
};

type PendingAction = { mode: "mark" | "undo"; type: GstReturnType; period: GstPeriod; record?: GstFilingRecord };

/** Outward returns lock the period's bills; GSTR-3B is only a payment summary. */
const locksBills = (type: GstReturnType) => type !== "GSTR3B";

function dueWords(daysLeft: number): string {
  if (daysLeft < 0) return `${Math.abs(daysLeft)} day${daysLeft === -1 ? "" : "s"} late`;
  if (daysLeft === 0) return "today";
  if (daysLeft === 1) return "tomorrow";
  return `in ${daysLeft} days`;
}

const GSTFiling = () => {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const { orgNavigate } = useOrgNavigation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings, isLoading, error } = useSettings();
  const orgId = currentOrganization?.id;

  const row = settings as { business_name?: string | null; gst_number?: string | null; report_settings?: unknown } | null | undefined;
  const prefs = useMemo(() => resolveGstFilingPrefs(row), [row]);
  const filings = useMemo(() => resolveGstFilings(row), [row]);
  const gstin = String(row?.gst_number || "").trim().toUpperCase();
  const todayYmd = todayIst();

  const calendarInput = useMemo(
    () => ({ scheme: prefs.scheme, shopStateCode: gstin.slice(0, 2), filings, todayYmd }),
    [prefs.scheme, gstin, filings, todayYmd],
  );
  const rows = useMemo(() => filingCalendar({ ...calendarInput, count: 12 }), [calendarInput]);
  const reminder = useMemo(() => nextReminder(calendarInput), [calendarInput]);
  const returnTypes = rows[0]?.returns.map((r) => r.type) ?? [];

  const [action, setAction] = useState<PendingAction | null>(null);
  const [arn, setArn] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) window.history.back();
    else orgNavigate("/reports");
  };

  const openReports = (period: GstPeriod) => orgNavigate(`/gst-reports?from=${period.fromYmd}&to=${period.toYmd}`);

  const startAction = (next: PendingAction) => {
    setArn("");
    setNote("");
    setAction(next);
  };

  const saveRecord = async () => {
    if (!orgId || !action) return;
    setSaving(true);
    try {
      // Re-read the row first so a save from another tab or page is not overwritten.
      const { data: fresh, error: readError } = await supabase
        .from("settings")
        .select("report_settings")
        .eq("organization_id", orgId)
        .maybeSingle();
      if (readError) throw readError;
      const record: GstFilingRecord | null =
        action.mode === "mark"
          ? {
              filedAt: new Date().toISOString(),
              filedBy: user?.email || "",
              arn: arn.trim().toUpperCase() || undefined,
              note: note.trim() || undefined,
            }
          : null;
      const next = withGstFilingRecord(fresh?.report_settings, action.type, action.period.fp, record);
      const { error: writeError } = await supabase
        .from("settings")
        .update({ report_settings: next as any })
        .eq("organization_id", orgId);
      if (writeError) throw writeError;
      await queryClient.invalidateQueries({ queryKey: orgSettingsQueryKey(orgId) });
      const name = `${RETURN_NAMES[action.type]} for ${action.period.label}`;
      toast({
        title: record ? `${name} marked as filed` : `Filed mark removed from ${name}`,
        description: record
          ? locksBills(action.type)
            ? "Bills of this period are now locked against edits and deletes."
            : "The reminder for this return stops."
          : "Bills of this period can be changed again; the next return will need an amendment.",
      });
      setAction(null);
    } catch (e) {
      const message = (e as { message?: string } | null)?.message || String(e);
      toast({ title: "Could not save", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const band = reminder ? (reminder.overdue ? "from-rose-600 to-red-700" : "from-amber-500 to-orange-600") : "from-emerald-600 to-teal-600";
  const headline = isLoading
    ? "Loading…"
    : reminder
      ? reminderText(reminder).title
      : prefs.scheme
        ? "Nothing due in the next 7 days"
        : "Choose your filing scheme to see due dates";
  const subline = reminder
    ? reminderText(reminder).body
    : prefs.scheme
      ? "Returns of the last two periods are filed or not yet close to their due date."
      : "Monthly (Regular) dates are shown until the scheme is set on GST Readiness.";

  return (
    <div className="business-insights-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full">
      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-2 overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="outline" size="sm" className="h-9 px-3 text-sm shrink-0" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-teal-700 tracking-tight leading-none flex items-center gap-2">
                <CalendarCheck className="h-5 w-5 shrink-0" />
                GST Filing
              </h1>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                Due dates for every period, and a record of what you filed on gst.gov.in.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9" onClick={() => orgNavigate("/gst-readiness")}>
              GST Readiness
            </Button>
            <Button variant="outline" size="sm" className="h-9" onClick={() => orgNavigate("/gst-reports")}>
              GST Reports
            </Button>
            <Button variant="outline" size="sm" className="h-9" onClick={() => orgNavigate("/gst-analysis")}>
              GST Analysis
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 shrink-0">
            Could not load settings: {(error as { message?: string }).message || String(error)}
          </div>
        )}

        <div className={cn("rounded-lg px-4 py-3 text-white shadow-sm shrink-0 bg-gradient-to-br", band)}>
          <p className="text-xs font-medium text-white/80">
            {row?.business_name || currentOrganization?.name || "This shop"}
            {gstin ? ` · ${gstin}` : ""} · {SCHEME_LABEL[prefs.scheme ?? "none"]}
          </p>
          <p className="text-lg sm:text-xl font-black leading-tight mt-0.5">{headline}</p>
          <p className="text-xs text-white/80 mt-1">{subline}</p>
          {reminder && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" className="h-8" onClick={() => openReports(reminder.period)}>
                Open GST Reports for {reminder.period.label}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="h-8"
                onClick={() => startAction({ mode: "mark", type: reminder.type, period: reminder.period })}
              >
                Already filed? Mark it
              </Button>
            </div>
          )}
        </div>

        {!prefs.scheme && !isLoading && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 shrink-0 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Tell us how this shop files (Regular, QRMP or Composition) on{" "}
              <button type="button" className="underline font-semibold" onClick={() => orgNavigate("/gst-readiness")}>
                GST Readiness
              </button>
              . Due dates and the reminder depend on it.
            </span>
          </div>
        )}

        <Card className={cn(CARD, "shrink-0")}>
          <CardHeader className="px-4 py-3 space-y-1">
            <CardTitle className={CARD_TITLE}>Last 12 periods</CardTitle>
            <CardDescription className="text-xs">
              Generate the period in GST Reports, download the GSTR-1 file, upload and file it on gst.gov.in, then mark it
              filed here. A filed period's bills are locked so the return and Ezzy ERP stay equal.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-2 pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold">Period</th>
                    {returnTypes.map((t) => (
                      <th key={t} className="text-left px-3 py-2 font-semibold">
                        {RETURN_NAMES[t]}
                      </th>
                    ))}
                    <th className="text-left px-3 py-2 font-semibold">Figures</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <PeriodTableRow key={r.period.fp} row={r} onMark={startAction} onOpen={openReports} />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className={cn(CARD, "shrink-0")}>
          <CardHeader className="px-4 py-3 space-y-1">
            <CardTitle className={CARD_TITLE}>How a month is filed</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 text-sm text-slate-700">
            <ol className="list-decimal pl-5 space-y-1">
              <li>
                <b>GST Reports</b> → pick the period → Generate → <b>GSTR-1 JSON</b>. Fix anything red, then Download.
              </li>
              <li>
                On gst.gov.in: Returns Dashboard → period → GSTR-1 → <b>Prepare Offline</b> → Upload. If it says “Processed
                with Errors”, download the error report and import it in the same GSTR-1 window to see which bills to fix.
              </li>
              <li>Prepare Online → check totals → Generate Summary → Submit → <b>File with EVC</b> (OTP on the owner's mobile).</li>
              <li>
                Come back here and <b>Mark filed</b>. For GSTR-3B, pay the tax shown on <b>GST Analysis</b> → portal GSTR-3B →
                File, then mark it too.
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!action} onOpenChange={(open) => { if (!open && !saving) setAction(null); }}>
        <DialogContent className="max-w-md">
          {action && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {action.mode === "mark"
                    ? `Mark ${RETURN_NAMES[action.type]} for ${action.period.label} as filed`
                    : `Undo the filed mark on ${RETURN_NAMES[action.type]} for ${action.period.label}`}
                </DialogTitle>
                <DialogDescription>
                  {action.mode === "mark"
                    ? locksBills(action.type)
                      ? `Only after it is filed on gst.gov.in. Bills dated in ${action.period.label} are then locked against edits and deletes.`
                      : "Only after it is filed and the tax is paid on gst.gov.in. The reminder for this return stops."
                    : `Bills of ${action.period.label} can be changed again. Anything changed after filing needs an amendment in the next return.`}
                </DialogDescription>
              </DialogHeader>
              {action.mode === "mark" && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="gst-filed-arn">ARN (optional)</Label>
                    <Input
                      id="gst-filed-arn"
                      value={arn}
                      onChange={(e) => setArn(e.target.value.toUpperCase())}
                      placeholder="AA2710260001234"
                      maxLength={20}
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">The acknowledgement number the portal shows after filing.</p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="gst-filed-note">Note (optional)</Label>
                    <Input id="gst-filed-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. late fee paid ₹200" maxLength={120} />
                  </div>
                </div>
              )}
              {action.mode === "undo" && action.record && (
                <p className="text-sm text-slate-600">
                  Marked on {formatYmd(action.record.filedAt.slice(0, 10))}
                  {action.record.filedBy ? ` by ${action.record.filedBy}` : ""}
                  {action.record.arn ? ` · ARN ${action.record.arn}` : ""}.
                </p>
              )}
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setAction(null)} disabled={saving}>
                  Cancel
                </Button>
                <Button
                  onClick={() => void saveRecord()}
                  disabled={saving}
                  className={action.mode === "mark" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : undefined}
                  variant={action.mode === "mark" ? "default" : "destructive"}
                >
                  {action.mode === "mark" ? "Mark as filed" : "Undo filed mark"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

function PeriodTableRow({
  row,
  onMark,
  onOpen,
}: {
  row: PeriodRow;
  onMark: (action: PendingAction) => void;
  onOpen: (period: GstPeriod) => void;
}) {
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-4 py-2 whitespace-nowrap">
        <div className="font-semibold text-slate-800">{row.period.label}</div>
        <div className="text-[11px] text-slate-500">
          {formatYmd(row.period.fromYmd)} – {formatYmd(row.period.toYmd)}
        </div>
      </td>
      {row.returns.map((r) => (
        <td key={r.type} className="px-3 py-2">
          <ReturnCell due={r} row={row} onMark={onMark} />
        </td>
      ))}
      <td className="px-3 py-2 whitespace-nowrap">
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => onOpen(row.period)}>
          GST Reports
        </Button>
      </td>
    </tr>
  );
}

function ReturnCell({ due, row, onMark }: { due: ReturnDue; row: PeriodRow; onMark: (action: PendingAction) => void }) {
  const status = STATUS[due.status];
  const showDays = due.status === "due_soon" || due.status === "overdue";
  return (
    <div className="space-y-1 min-w-[12rem]">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", status.cls)}>{status.label}</span>
        <span className="text-xs text-slate-500">
          due {formatYmd(due.dueYmd)}
          {showDays ? ` · ${dueWords(due.daysLeft)}` : ""}
        </span>
      </div>
      {due.record && (
        <div className="text-xs text-slate-600">
          on {formatYmd(due.record.filedAt.slice(0, 10))}
          {due.record.filedBy ? ` · ${due.record.filedBy}` : ""}
          {due.record.arn ? (
            <>
              {" "}
              · ARN <span className="font-mono">{due.record.arn}</span>
            </>
          ) : null}
          {due.record.note ? <div className="text-slate-500 italic">{due.record.note}</div> : null}
        </div>
      )}
      {row.ended &&
        (due.record ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-slate-600"
            onClick={() => onMark({ mode: "undo", type: due.type, period: row.period, record: due.record })}
          >
            <Undo2 className="h-3.5 w-3.5 mr-1" />
            Undo
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => onMark({ mode: "mark", type: due.type, period: row.period })}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Mark filed
          </Button>
        ))}
    </div>
  );
}

export default GSTFiling;
