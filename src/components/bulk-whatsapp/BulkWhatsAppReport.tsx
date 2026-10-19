import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCheck,
  Copy,
  Download,
  Eye,
  Loader2,
  Megaphone,
  Pause,
  Play,
  RefreshCcw,
  RotateCcw,
  Search,
  Send,
  Square,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type * as XLSXType from "xlsx";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatBulkPhone } from "@/utils/bulkWhatsAppContacts";
import { describeBulkFailure, groupBulkFailures, isRetryableBulkFailure } from "@/utils/bulkWhatsAppFailure";
import {
  CAMPAIGN_LIST_LIMIT,
  callBulkWhatsApp,
  fetchCampaignMessage,
  fetchRecipients,
  scheduledStart,
  useBulkCampaigns,
  type BulkCampaign,
  type BulkCampaignMessage,
  type BulkRecipient,
} from "./bulkWhatsAppApi";

/** Chart code loads only when a report with at least two finished campaigns is shown. */
const BulkWhatsAppTrend = lazy(() => import("./BulkWhatsAppTrend"));

let xlsxModulePromise: Promise<typeof XLSXType> | null = null;
const loadXlsx = (): Promise<typeof XLSXType> => (xlsxModulePromise ??= import("xlsx"));

const fmtDate = (iso: string | null | undefined) => (iso ? format(new Date(iso), "dd MMM yyyy") : "–");
const fmtTime = (iso: string | null | undefined) => (iso ? format(new Date(iso), "hh:mm a") : "");
const fmt = (iso: string | null | undefined) => (iso ? format(new Date(iso), "dd-MM-yy hh:mm a") : "–");
const num = (n: number) => n.toLocaleString("en-IN");
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");

const CAMPAIGN_BADGE: Record<BulkCampaign["status"], { label: string; className: string; dot: string }> = {
  running: { label: "Sending", className: "bg-blue-50 text-blue-700 ring-blue-200", dot: "bg-blue-500 animate-pulse" },
  paused: { label: "Paused", className: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-500" },
  stopped: { label: "Stopped", className: "bg-slate-100 text-slate-600 ring-slate-200", dot: "bg-slate-400" },
  completed: { label: "Done", className: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  failed: { label: "Failed", className: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-500" },
};

const RECIPIENT_BADGE: Record<BulkRecipient["status"], { label: string; className: string }> = {
  pending: { label: "Waiting", className: "bg-slate-100 text-slate-600 ring-slate-200" },
  sent: { label: "Sent", className: "bg-blue-50 text-blue-700 ring-blue-200" },
  delivered: { label: "Delivered", className: "bg-sky-50 text-sky-700 ring-sky-200" },
  read: { label: "Read", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  failed: { label: "Failed", className: "bg-red-50 text-red-700 ring-red-200" },
  skipped: { label: "Not sent", className: "bg-slate-100 text-slate-500 ring-slate-200" },
};

const Pill = ({ className, children }: { className: string; children: ReactNode }) => (
  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", className)}>
    {children}
  </span>
);

const TH = "sticky top-0 z-10 bg-slate-800 px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-white whitespace-nowrap";
const TD = "px-3 py-2.5 align-middle";
const NUM = "px-3 py-2.5 align-middle text-right tabular-nums font-semibold";

const isLive = (c: BulkCampaign) => c.status === "running" || c.status === "paused";

function StatCard({
  label,
  value,
  sub,
  icon,
  tone,
  loading,
  className,
}: {
  label: string;
  value: string;
  sub: string;
  icon: ReactNode;
  tone: string;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl px-4 py-3 text-white shadow-sm", tone, className)}>
      <div className="pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/10" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/85">{label}</span>
        <span className="opacity-90">{icon}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-1.5 h-7 w-20 bg-white/30" />
      ) : (
        <div className="mt-0.5 text-2xl font-bold leading-tight tabular-nums">{value}</div>
      )}
      <div className="truncate text-[11px] text-white/80">{sub}</div>
    </div>
  );
}

/** Summary cards over the user's (or, for admins, the shop's) recent bulk sends. */
export function BulkWhatsAppStats({ organizationId }: { organizationId: string }) {
  const q = useBulkCampaigns(organizationId);
  const t = useMemo(() => {
    const list = q.data ?? [];
    const sum = (k: "total_count" | "sent_count" | "delivered_count" | "read_count" | "failed_count") =>
      list.reduce((a, c) => a + (c[k] ?? 0), 0);
    return {
      campaigns: list.length,
      live: list.filter((c) => c.status === "running").length,
      total: sum("total_count"),
      sent: sum("sent_count"),
      delivered: sum("delivered_count"),
      read: sum("read_count"),
      failed: sum("failed_count"),
      capped: list.length >= CAMPAIGN_LIST_LIMIT,
    };
  }, [q.data]);
  const loading = q.isLoading;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard
        label="Campaigns"
        value={num(t.campaigns)}
        sub={t.live ? `${t.live} sending now` : t.capped ? `Last ${CAMPAIGN_LIST_LIMIT} sends` : "All bulk sends"}
        icon={<Megaphone className="h-5 w-5" />}
        tone="bg-gradient-to-br from-slate-700 to-slate-900"
        loading={loading}
      />
      <StatCard
        label="Messages sent"
        value={num(t.sent)}
        sub={`of ${num(t.total)} numbers`}
        icon={<Send className="h-5 w-5" />}
        tone="bg-gradient-to-br from-blue-600 to-indigo-600"
        loading={loading}
      />
      <StatCard
        label="Delivered"
        value={num(t.delivered)}
        sub={`${pct(t.delivered, t.sent)} of sent`}
        icon={<CheckCheck className="h-5 w-5" />}
        tone="bg-gradient-to-br from-sky-500 to-cyan-600"
        loading={loading}
      />
      <StatCard
        label="Read"
        value={num(t.read)}
        sub={`${pct(t.read, t.sent)} read rate`}
        icon={<Eye className="h-5 w-5" />}
        tone="bg-gradient-to-br from-emerald-500 to-teal-600"
        loading={loading}
      />
      <StatCard
        label="Failed"
        value={num(t.failed)}
        sub="Not on WhatsApp or error"
        icon={<XCircle className="h-5 w-5" />}
        tone="bg-gradient-to-br from-rose-500 to-red-600"
        loading={loading}
        className="col-span-2 sm:col-span-1"
      />
    </div>
  );
}

type Filter = "all" | "sent" | "delivered" | "read" | "failed" | "pending";

const matches = (r: BulkRecipient, f: Filter) =>
  f === "all" ||
  (f === "sent" && ["sent", "delivered", "read"].includes(r.status)) ||
  (f === "delivered" && ["delivered", "read"].includes(r.status)) ||
  (f === "read" && r.status === "read") ||
  (f === "failed" && r.status === "failed") ||
  (f === "pending" && (r.status === "pending" || r.status === "skipped"));

function FilterTile({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-white px-3 py-2 text-left shadow-sm transition hover:shadow",
        active ? "border-slate-800 ring-2 ring-slate-800/10" : "border-slate-200",
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn("text-xl font-bold tabular-nums", tone)}>{num(value)}</div>
    </button>
  );
}

function CampaignDetail({
  campaign,
  organizationId,
  onClose,
  onReuse,
}: {
  campaign: BulkCampaign;
  organizationId: string;
  onClose: () => void;
  onReuse?: (m: BulkCampaignMessage) => void;
}) {
  const queryClient = useQueryClient();
  const [resending, setResending] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [reason, setReason] = useState<string | null>(null);
  const [showMessage, setShowMessage] = useState(false);
  const live = isLive(campaign);
  const q = useQuery({
    queryKey: ["bulk-whatsapp-recipients", campaign.id],
    queryFn: () => fetchRecipients(campaign.id),
    refetchInterval: live ? 8000 : 60000,
  });
  const msg = useQuery({
    queryKey: ["bulk-whatsapp-message", campaign.id],
    queryFn: () => fetchCampaignMessage(campaign.id),
    staleTime: Infinity,
  });
  const failures = useMemo(() => groupBulkFailures(q.data ?? []), [q.data]);
  const rows = useMemo(
    () =>
      (q.data ?? []).filter(
        (r) => matches(r, filter) && (!reason || describeBulkFailure(r.error)?.label === reason),
      ),
    [q.data, filter, reason],
  );
  const pending = Math.max(0, campaign.total_count - campaign.sent_count - campaign.failed_count);
  const isImage = msg.data?.media_type?.startsWith("image/");
  const hasMessage = Boolean(msg.data && (msg.data.message || msg.data.media_url));
  const startsAt = scheduledStart(campaign);
  const retryable = useMemo(
    () => (q.data ?? []).filter((r) => r.status === "failed" && isRetryableBulkFailure(r.error)).length,
    [q.data],
  );

  const resendFailed = async () => {
    if (!window.confirm(`Send this message again to ${retryable} failed ${retryable === 1 ? "number" : "numbers"}?`)) return;
    setResending(true);
    try {
      const res = await callBulkWhatsApp<{ total?: number }>(organizationId, "resend-failed", { campaignId: campaign.id });
      toast.success(`Sending again to ${res.total ?? retryable} numbers as a new campaign`);
      await queryClient.invalidateQueries({ queryKey: ["bulk-whatsapp-campaigns", organizationId] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send again");
    } finally {
      setResending(false);
    }
  };
  const pick = (f: Filter) => {
    setFilter(f);
    setReason(null);
  };

  /** Exports what the table shows, so the Failed filter gives a list of numbers to fix and send again. */
  const exportExcel = async () => {
    const XLSX = await loadXlsx();
    const sheet = XLSX.utils.json_to_sheet(
      rows.map((r) => ({
        "#": r.position,
        Name: r.name ?? "",
        Mobile: r.phone,
        Status: RECIPIENT_BADGE[r.status].label,
        Reason: describeBulkFailure(r.error)?.label ?? "",
        Details: r.error ?? "",
        "Sent at": fmt(r.sent_at),
        "Delivered at": fmt(r.delivered_at),
        "Read at": fmt(r.read_at),
      })),
    );
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Report");
    const suffix = reason ? reason : filter === "all" ? "report" : filter;
    XLSX.writeFile(book, `${campaign.name.replace(/[^\w-]+/g, "_")}-${suffix.replace(/[^\w-]+/g, "_")}.xlsx`);
  };

  const preview = hasMessage && msg.data && (
    <div className="rounded-xl bg-[#efeae2] p-2.5">
      <div className="rounded-lg rounded-tl-none bg-white p-1.5 text-xs shadow-sm">
        {isImage && msg.data.media_url && (
          <img src={msg.data.media_url} alt="" className="mb-1 max-h-48 w-full rounded object-contain" />
        )}
        {!isImage && msg.data.media_url && (
          <div className="mb-1 rounded bg-slate-100 px-2 py-1.5 text-xs text-slate-600">
            {msg.data.media_type?.includes("pdf") ? "PDF attached" : "Video attached"}
          </div>
        )}
        <div className="max-h-56 overflow-auto whitespace-pre-wrap px-1 text-slate-800">{msg.data.message}</div>
      </div>
    </div>
  );

  const actionButtons = (
    <div className="flex flex-wrap items-center gap-2">
      {!live && retryable > 0 && (
        <Button size="sm" className="h-8 bg-emerald-600 text-white hover:bg-emerald-700" disabled={resending} onClick={() => void resendFailed()}>
          {resending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1 h-4 w-4" />}
          Send again to {num(retryable)} failed
        </Button>
      )}
      {onReuse && msg.data && (
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => {
            onReuse(msg.data!);
            onClose();
          }}
        >
          <Copy className="mr-1 h-4 w-4" /> Use this message again
        </Button>
      )}
      {hasMessage && (
        <Button size="sm" variant="outline" className="h-8" onClick={() => setShowMessage((v) => !v)}>
          <Eye className="mr-1 h-4 w-4" /> {showMessage ? "Hide message" : "Show message"}
        </Button>
      )}
      <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => void exportExcel()} disabled={!rows.length}>
        <Download className="mr-1 h-4 w-4" /> Excel{filter !== "all" || reason ? " (this list)" : ""}
      </Button>
    </div>
  );

  // Full page (not a popup) so the number list gets the whole width; Back or Esc returns to the list.
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 bg-slate-50 p-0 shadow-none">
        <header className="shrink-0 border-b border-slate-200 bg-white px-3 py-2.5 pr-12 shadow-sm sm:px-5 sm:pr-14">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2">
            <Button size="sm" variant="outline" className="h-8 gap-1 px-2.5" onClick={onClose}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-lg font-semibold leading-tight text-slate-900">
                {campaign.name}
                <Pill className={CAMPAIGN_BADGE[campaign.status].className}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", CAMPAIGN_BADGE[campaign.status].dot)} />
                  {CAMPAIGN_BADGE[campaign.status].label}
                </Pill>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                {fmtDate(campaign.created_at)}, {fmtTime(campaign.created_at)}
                {campaign.sender_number ? ` · from ${formatBulkPhone(campaign.sender_number)}` : ""}
                {startsAt && startsAt.getTime() > Date.now() ? ` · starts ${fmtDate(startsAt.toISOString())}, ${fmtTime(startsAt.toISOString())}` : ""}
              </DialogDescription>
            </div>
            {actionButtons}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl space-y-3 px-3 py-4 sm:px-5">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <FilterTile label="Total" value={campaign.total_count} tone="text-slate-800" active={filter === "all" && !reason} onClick={() => pick("all")} />
              <FilterTile label="Sent" value={campaign.sent_count} tone="text-blue-600" active={filter === "sent"} onClick={() => pick("sent")} />
              <FilterTile label="Delivered" value={campaign.delivered_count} tone="text-sky-600" active={filter === "delivered"} onClick={() => pick("delivered")} />
              <FilterTile label="Read" value={campaign.read_count} tone="text-emerald-600" active={filter === "read"} onClick={() => pick("read")} />
              <FilterTile label="Failed" value={campaign.failed_count} tone="text-red-600" active={filter === "failed" && !reason} onClick={() => pick("failed")} />
              <FilterTile label="Waiting" value={pending} tone="text-slate-500" active={filter === "pending"} onClick={() => pick("pending")} />
            </div>

            {(failures.length > 0 || showMessage) && (
              <div className={cn("grid gap-3", failures.length > 0 && showMessage && "lg:grid-cols-[minmax(0,1fr)_320px]")}>
                {failures.length > 0 && (
                  <div className="rounded-xl border border-red-200 bg-red-50/60 p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-red-800">
                      <AlertTriangle className="h-4 w-4" />
                      Why {num(campaign.failed_count)} {campaign.failed_count === 1 ? "number" : "numbers"} failed
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {failures.map(({ reason: r, count }) => (
                        <button
                          key={r.label}
                          type="button"
                          title={r.hint}
                          onClick={() => {
                            setFilter("failed");
                            setReason(reason === r.label ? null : r.label);
                          }}
                          className={cn(
                            "rounded-lg border bg-white px-2.5 py-1.5 text-left text-xs shadow-sm transition hover:border-red-300",
                            reason === r.label ? "border-red-500 ring-2 ring-red-500/20" : "border-red-100",
                          )}
                        >
                          <span className="font-semibold text-red-700">{r.label}</span>
                          <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 font-bold tabular-nums text-red-700">{count}</span>
                          <span className="mt-0.5 block max-w-[300px] text-[11px] leading-snug text-slate-500">{r.hint}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {showMessage && <div className={cn(!failures.length && "max-w-sm")}>{preview}</div>}
              </div>
            )}

            <p className="text-xs text-slate-500">
              Showing {num(rows.length)} of {num(q.data?.length ?? campaign.total_count)} numbers. Read shows only when the
              customer has blue ticks on; otherwise it stays Delivered.
            </p>

            <div className="max-h-[calc(100dvh-8rem)] min-h-[240px] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              {q.isLoading ? (
                <div className="flex justify-center p-6">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr>
                      <th className={cn(TH, "w-12")}>#</th>
                      <th className={TH}>Name</th>
                      <th className={TH}>Mobile</th>
                      <th className={TH}>Status</th>
                      <th className={cn(TH, "w-[32%]")}>Reason</th>
                      <th className={TH}>Sent</th>
                      <th className={TH}>Delivered</th>
                      <th className={TH}>Read</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => {
                      const why = describeBulkFailure(r.error);
                      return (
                        <tr key={r.id} className="odd:bg-white even:bg-slate-50/60">
                          <td className={cn(TD, "tabular-nums text-slate-500")}>{r.position}</td>
                          <td className={cn(TD, "font-medium text-slate-800")}>{r.name ?? "–"}</td>
                          <td className={cn(TD, "whitespace-nowrap tabular-nums")}>{formatBulkPhone(r.phone)}</td>
                          <td className={TD}>
                            <Pill className={RECIPIENT_BADGE[r.status].className}>{RECIPIENT_BADGE[r.status].label}</Pill>
                          </td>
                          <td className={TD}>
                            {why ? (
                              <div title={r.error ?? undefined}>
                                <span className={cn("text-xs font-semibold", r.status === "failed" ? "text-red-700" : "text-slate-600")}>
                                  {why.label}
                                </span>
                                <span className="text-[11px] leading-snug text-slate-500"> · {why.hint}</span>
                              </div>
                            ) : (
                              <span className="text-slate-300">–</span>
                            )}
                          </td>
                          <td className={cn(TD, "whitespace-nowrap text-xs text-slate-600")}>{fmt(r.sent_at)}</td>
                          <td className={cn(TD, "whitespace-nowrap text-xs text-slate-600")}>{fmt(r.delivered_at)}</td>
                          <td className={cn(TD, "whitespace-nowrap text-xs text-slate-600")}>{fmt(r.read_at)}</td>
                        </tr>
                      );
                    })}
                    {!rows.length && (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-500">
                          No numbers here
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CampaignActions({
  c,
  busy,
  onControl,
}: {
  c: BulkCampaign;
  busy: boolean;
  onControl: (c: BulkCampaign, action: "pause" | "resume" | "stop") => void;
}) {
  if (!isLive(c)) return null;
  return (
    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {c.status === "running" ? (
        <Button size="icon" variant="outline" className="h-7 w-7" title="Pause" disabled={busy} onClick={() => onControl(c, "pause")}>
          <Pause className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <Button size="icon" variant="outline" className="h-7 w-7" title="Resume" disabled={busy} onClick={() => onControl(c, "resume")}>
          <Play className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button size="icon" variant="outline" className="h-7 w-7 text-destructive" title="Stop" disabled={busy} onClick={() => onControl(c, "stop")}>
        <Square className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function StatusCell({ c }: { c: BulkCampaign }) {
  const done = c.sent_count + c.failed_count;
  const live = isLive(c);
  const badge = CAMPAIGN_BADGE[c.status];
  const startsAt = scheduledStart(c);
  if (startsAt && startsAt.getTime() > Date.now()) {
    return (
      <>
        <Pill className={c.status === "paused" ? badge.className : "bg-violet-50 text-violet-700 ring-violet-200"}>
          <CalendarClock className="h-3 w-3" />
          {c.status === "paused" ? "Paused" : "Scheduled"}
        </Pill>
        <div className="mt-1 text-[11px] text-violet-700">
          Starts {fmtDate(startsAt.toISOString())}, {fmtTime(startsAt.toISOString())}
        </div>
      </>
    );
  }
  return (
    <>
      <Pill className={badge.className}>
        <span className={cn("h-1.5 w-1.5 rounded-full", badge.dot)} />
        {badge.label}
        {live ? ` ${done}/${c.total_count}` : ""}
      </Pill>
      {live && c.total_count > 0 && (
        <div className="mt-1.5 h-1.5 w-32 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all"
            style={{ width: `${Math.min(100, (done / c.total_count) * 100)}%` }}
          />
        </div>
      )}
      {c.status_note && !startsAt ? <div className="mt-1 max-w-[220px] text-[11px] text-amber-700">{c.status_note}</div> : null}
    </>
  );
}

type CampaignSort = "newest" | "oldest" | "name-asc" | "name-desc";

const SORT_LABEL: Record<CampaignSort, string> = {
  newest: "Date: newest first",
  oldest: "Date: oldest first",
  "name-asc": "Campaign name: A to Z",
  "name-desc": "Campaign name: Z to A",
};

/** Past and running bulk sends with live counts; click one for the per-number report. */
export function BulkWhatsAppReport({
  organizationId,
  userId,
  fullPage = false,
  onReuse,
}: {
  organizationId: string;
  userId: string | undefined;
  /** Reports page: taller table plus search, date range and sort. */
  fullPage?: boolean;
  /** "Use this message again": loads a past campaign's message and poster into the send form. */
  onReuse?: (m: BulkCampaignMessage) => void;
}) {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<CampaignSort>("newest");
  const q = useBulkCampaigns(organizationId);
  const open = q.data?.find((c) => c.id === openId) ?? null;
  const filtersOn = Boolean(search.trim() || from || to) || sort !== "newest";
  const rows = useMemo(() => {
    const list = q.data ?? [];
    if (!fullPage) return list;
    const needle = search.trim().toLowerCase();
    // Dates compare as local yyyy-MM-dd strings, the same form the date inputs give.
    const day = (iso: string) => format(new Date(iso), "yyyy-MM-dd");
    const kept = list.filter(
      (c) =>
        (!needle || c.name.toLowerCase().includes(needle) || (c.sender_number ?? "").includes(needle)) &&
        (!from || day(c.created_at) >= from) &&
        (!to || day(c.created_at) <= to),
    );
    const byDate = (a: BulkCampaign, b: BulkCampaign) => a.created_at.localeCompare(b.created_at);
    const byName = (a: BulkCampaign, b: BulkCampaign) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || -byDate(a, b);
    const cmp: Record<CampaignSort, (a: BulkCampaign, b: BulkCampaign) => number> = {
      newest: (a, b) => -byDate(a, b),
      oldest: byDate,
      "name-asc": byName,
      "name-desc": (a, b) => -byName(a, b),
    };
    return [...kept].sort(cmp[sort]);
  }, [q.data, fullPage, search, from, to, sort]);

  const control = async (c: BulkCampaign, action: "pause" | "resume" | "stop") => {
    if (action === "stop" && !window.confirm(`Stop "${c.name}"? Numbers not sent yet will be skipped.`)) return;
    setBusyId(c.id);
    try {
      await callBulkWhatsApp(organizationId, action, { campaignId: c.id });
      await queryClient.invalidateQueries({ queryKey: ["bulk-whatsapp-campaigns", organizationId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
    {q.data && q.data.length > 1 && (
      <Suspense fallback={null}>
        <BulkWhatsAppTrend campaigns={q.data} />
      </Suspense>
    )}
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <div className="text-base font-semibold text-slate-900">Delivery report</div>
          <div className="text-xs text-slate-500">
            Tap a campaign to see every number's status
            {fullPage && q.data?.length ? ` · ${num(rows.length)} of ${num(q.data.length)}` : ""}
          </div>
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => void q.refetch()} disabled={q.isFetching}>
          <RefreshCcw className={cn("h-4 w-4", q.isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>
      {fullPage && (
        <div className="grid gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_150px_150px_220px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search campaign name"
              className="no-uppercase h-9 bg-white pl-8 text-sm"
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            From
            <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-9 bg-white text-sm" />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            To
            <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-9 bg-white text-sm" />
          </label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as CampaignSort)}
            className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            aria-label="Sort"
          >
            {(Object.keys(SORT_LABEL) as CampaignSort[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="ghost"
            className="h-9"
            disabled={!filtersOn}
            onClick={() => {
              setSearch("");
              setFrom("");
              setTo("");
              setSort("newest");
            }}
          >
            Clear
          </Button>
        </div>
      )}
      {q.isLoading ? (
        <div className="flex justify-center p-6">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !q.data?.length ? (
        <div className="px-4 py-10 text-center">
          <Megaphone className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">No bulk messages sent yet</p>
        </div>
      ) : !rows.length ? (
        <div className="px-4 py-10 text-center text-sm text-slate-500">No campaigns match these filters</div>
      ) : (
        <>
          {/* Phones: one card per campaign instead of a wide table. */}
          <ul className="divide-y divide-slate-100 sm:hidden">
            {rows.map((c) => (
              <li key={c.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenId(c.id)}
                  onKeyDown={(e) => e.key === "Enter" && setOpenId(c.id)}
                  className="space-y-2.5 px-4 py-3 active:bg-emerald-50/70"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-900">{c.name}</div>
                      <div className="text-xs text-slate-500">
                        {fmtDate(c.created_at)}, {fmtTime(c.created_at)}
                        {c.sender_number ? ` · ${formatBulkPhone(c.sender_number)}` : ""}
                        {c.user_id !== userId ? " · Other user" : ""}
                      </div>
                    </div>
                    <CampaignActions c={c} busy={busyId === c.id} onControl={(x, a) => void control(x, a)} />
                  </div>
                  <div>
                    <StatusCell c={c} />
                  </div>
                  <div className="grid grid-cols-5 gap-1 rounded-lg bg-slate-50 px-2 py-1.5 text-center">
                    {(
                      [
                        ["Total", c.total_count, "text-slate-800"],
                        ["Sent", c.sent_count, "text-blue-600"],
                        ["Deliv.", c.delivered_count, "text-sky-600"],
                        ["Read", c.read_count, "text-emerald-600"],
                        ["Failed", c.failed_count, c.failed_count ? "text-red-600" : "text-slate-300"],
                      ] as const
                    ).map(([label, value, tone]) => (
                      <div key={label}>
                        <div className={cn("text-sm font-bold tabular-nums", tone)}>{num(value)}</div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className={cn("hidden overflow-auto sm:block", fullPage ? "max-h-[calc(100dvh-16rem)]" : "max-h-[560px]")}>
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr>
                  <th className={TH}>Campaign</th>
                  <th className={TH}>Sent from</th>
                  <th className={TH}>Status</th>
                  <th className={cn(TH, "text-right")}>Total</th>
                  <th className={cn(TH, "text-right")}>Sent</th>
                  <th className={cn(TH, "text-right")}>Delivered</th>
                  <th className={cn(TH, "text-right")}>Read</th>
                  <th className={cn(TH, "text-right")}>Failed</th>
                  <th className={cn(TH, "w-24")} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((c) => {
                  return (
                    <tr
                      key={c.id}
                      className="cursor-pointer odd:bg-white even:bg-slate-50/60 hover:bg-emerald-50/70"
                      onClick={() => setOpenId(c.id)}
                    >
                      <td className={TD}>
                        <div className="font-semibold text-slate-900">{c.name}</div>
                        <div className="text-xs text-slate-500">
                          {fmtDate(c.created_at)}, {fmtTime(c.created_at)}
                        </div>
                      </td>
                      <td className={cn(TD, "whitespace-nowrap")}>
                        <div className="tabular-nums text-slate-700">{c.sender_number ? formatBulkPhone(c.sender_number) : "–"}</div>
                        {c.user_id !== userId ? <div className="text-[11px] text-slate-400">Other user</div> : null}
                      </td>
                      <td className={cn(TD, "min-w-[150px]")}>
                        <StatusCell c={c} />
                      </td>
                      <td className={cn(NUM, "text-slate-800")}>{num(c.total_count)}</td>
                      <td className={cn(NUM, "text-blue-600")}>{num(c.sent_count)}</td>
                      <td className={cn(NUM, "text-sky-600")}>{num(c.delivered_count)}</td>
                      <td className={NUM}>
                        <div className="text-emerald-600">{num(c.read_count)}</div>
                        <div className="text-[11px] font-normal text-slate-400">{pct(c.read_count, c.sent_count)}</div>
                      </td>
                      <td className={cn(NUM, c.failed_count ? "text-red-600" : "text-slate-300")}>{num(c.failed_count)}</td>
                      <td className={cn(TD, "whitespace-nowrap")}>
                        <CampaignActions c={c} busy={busyId === c.id} onControl={(x, a) => void control(x, a)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {open && (
        <CampaignDetail campaign={open} organizationId={organizationId} onClose={() => setOpenId(null)} onReuse={onReuse} />
      )}
    </div>
    </div>
  );
}
