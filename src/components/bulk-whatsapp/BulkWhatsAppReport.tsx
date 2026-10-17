import { useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCheck,
  Download,
  Eye,
  Loader2,
  Megaphone,
  Pause,
  Play,
  RefreshCcw,
  Send,
  Square,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type * as XLSXType from "xlsx";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatBulkPhone } from "@/utils/bulkWhatsAppContacts";
import {
  CAMPAIGN_LIST_LIMIT,
  callBulkWhatsApp,
  fetchCampaignMessage,
  fetchRecipients,
  useBulkCampaigns,
  type BulkCampaign,
  type BulkRecipient,
} from "./bulkWhatsAppApi";

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
}: {
  label: string;
  value: string;
  sub: string;
  icon: ReactNode;
  tone: string;
  loading?: boolean;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl px-4 py-3 text-white shadow-sm", tone)}>
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

function CampaignDetail({ campaign, onClose }: { campaign: BulkCampaign; onClose: () => void }) {
  const [filter, setFilter] = useState<Filter>("all");
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
  const rows = useMemo(() => (q.data ?? []).filter((r) => matches(r, filter)), [q.data, filter]);
  const pending = Math.max(0, campaign.total_count - campaign.sent_count - campaign.failed_count);
  const isImage = msg.data?.media_type?.startsWith("image/");

  const exportExcel = async () => {
    const XLSX = await loadXlsx();
    const sheet = XLSX.utils.json_to_sheet(
      (q.data ?? []).map((r) => ({
        "#": r.position,
        Name: r.name ?? "",
        Mobile: r.phone,
        Status: RECIPIENT_BADGE[r.status].label,
        Reason: r.error ?? "",
        "Sent at": fmt(r.sent_at),
        "Delivered at": fmt(r.delivered_at),
        "Read at": fmt(r.read_at),
      })),
    );
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Report");
    XLSX.writeFile(book, `${campaign.name.replace(/[^\w-]+/g, "_")}-report.xlsx`);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-lg">
            {campaign.name}
            <Pill className={CAMPAIGN_BADGE[campaign.status].className}>
              <span className={cn("h-1.5 w-1.5 rounded-full", CAMPAIGN_BADGE[campaign.status].dot)} />
              {CAMPAIGN_BADGE[campaign.status].label}
            </Pill>
          </DialogTitle>
          <p className="text-xs text-slate-500">
            {fmtDate(campaign.created_at)}, {fmtTime(campaign.created_at)}
            {campaign.sender_number ? ` · from ${formatBulkPhone(campaign.sender_number)}` : ""}
          </p>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <FilterTile label="Total" value={campaign.total_count} tone="text-slate-800" active={filter === "all"} onClick={() => setFilter("all")} />
          <FilterTile label="Sent" value={campaign.sent_count} tone="text-blue-600" active={filter === "sent"} onClick={() => setFilter("sent")} />
          <FilterTile label="Delivered" value={campaign.delivered_count} tone="text-sky-600" active={filter === "delivered"} onClick={() => setFilter("delivered")} />
          <FilterTile label="Read" value={campaign.read_count} tone="text-emerald-600" active={filter === "read"} onClick={() => setFilter("read")} />
          <FilterTile label="Failed" value={campaign.failed_count} tone="text-red-600" active={filter === "failed"} onClick={() => setFilter("failed")} />
          <FilterTile label="Waiting" value={pending} tone="text-slate-500" active={filter === "pending"} onClick={() => setFilter("pending")} />
        </div>

        {msg.data && (msg.data.message || msg.data.media_url) && (
          <div className="flex items-start gap-3 rounded-xl bg-[#efeae2] p-3">
            <div className="max-w-sm rounded-lg rounded-tl-none bg-white p-1.5 text-sm shadow-sm">
              {isImage && msg.data.media_url && (
                <img src={msg.data.media_url} alt="" className="mb-1 max-h-40 w-full rounded object-cover" />
              )}
              {!isImage && msg.data.media_url && (
                <div className="mb-1 rounded bg-slate-100 px-2 py-1.5 text-xs text-slate-600">
                  {msg.data.media_type?.includes("pdf") ? "PDF attached" : "Video attached"}
                </div>
              )}
              <div className="whitespace-pre-wrap px-1 text-slate-800">{msg.data.message}</div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            Read shows only when the customer has blue ticks on; otherwise it stays Delivered.
          </p>
          <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => void exportExcel()} disabled={!q.data?.length}>
            <Download className="mr-1 h-4 w-4" /> Excel
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200">
          {q.isLoading ? (
            <div className="flex justify-center p-6">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr>
                  <th className={cn(TH, "w-12")}>#</th>
                  <th className={TH}>Name</th>
                  <th className={TH}>Mobile</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Sent</th>
                  <th className={TH}>Delivered</th>
                  <th className={TH}>Read</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="odd:bg-white even:bg-slate-50/60">
                    <td className={cn(TD, "tabular-nums text-slate-500")}>{r.position}</td>
                    <td className={cn(TD, "font-medium text-slate-800")}>{r.name ?? "–"}</td>
                    <td className={cn(TD, "whitespace-nowrap tabular-nums")}>{formatBulkPhone(r.phone)}</td>
                    <td className={TD}>
                      <Pill className={RECIPIENT_BADGE[r.status].className}>{RECIPIENT_BADGE[r.status].label}</Pill>
                      {r.error ? <div className="mt-0.5 text-[11px] text-red-600">{r.error}</div> : null}
                    </td>
                    <td className={cn(TD, "whitespace-nowrap text-xs text-slate-600")}>{fmt(r.sent_at)}</td>
                    <td className={cn(TD, "whitespace-nowrap text-xs text-slate-600")}>{fmt(r.delivered_at)}</td>
                    <td className={cn(TD, "whitespace-nowrap text-xs text-slate-600")}>{fmt(r.read_at)}</td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      No numbers here
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Past and running bulk sends with live counts; click one for the per-number report. */
export function BulkWhatsAppReport({ organizationId, userId }: { organizationId: string; userId: string | undefined }) {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const q = useBulkCampaigns(organizationId);
  const open = q.data?.find((c) => c.id === openId) ?? null;

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
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <div className="text-base font-semibold text-slate-900">Delivery report</div>
          <div className="text-xs text-slate-500">Tap a campaign to see every number's status</div>
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => void q.refetch()} disabled={q.isFetching}>
          <RefreshCcw className={cn("h-4 w-4", q.isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>
      {q.isLoading ? (
        <div className="flex justify-center p-6">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !q.data?.length ? (
        <div className="px-4 py-10 text-center">
          <Megaphone className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">No bulk messages sent yet</p>
        </div>
      ) : (
        <div className="max-h-[560px] overflow-auto">
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
              {q.data.map((c) => {
                const done = c.sent_count + c.failed_count;
                const live = isLive(c);
                const badge = CAMPAIGN_BADGE[c.status];
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
                      {c.status_note ? <div className="mt-1 max-w-[220px] text-[11px] text-amber-700">{c.status_note}</div> : null}
                    </td>
                    <td className={cn(NUM, "text-slate-800")}>{num(c.total_count)}</td>
                    <td className={cn(NUM, "text-blue-600")}>{num(c.sent_count)}</td>
                    <td className={cn(NUM, "text-sky-600")}>{num(c.delivered_count)}</td>
                    <td className={NUM}>
                      <div className="text-emerald-600">{num(c.read_count)}</div>
                      <div className="text-[11px] font-normal text-slate-400">{pct(c.read_count, c.sent_count)}</div>
                    </td>
                    <td className={cn(NUM, c.failed_count ? "text-red-600" : "text-slate-300")}>{num(c.failed_count)}</td>
                    <td className={cn(TD, "whitespace-nowrap")} onClick={(e) => e.stopPropagation()}>
                      {live && (
                        <div className="flex justify-end gap-1">
                          {c.status === "running" ? (
                            <Button size="icon" variant="outline" className="h-7 w-7" title="Pause" disabled={busyId === c.id} onClick={() => void control(c, "pause")}>
                              <Pause className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button size="icon" variant="outline" className="h-7 w-7" title="Resume" disabled={busyId === c.id} onClick={() => void control(c, "resume")}>
                              <Play className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button size="icon" variant="outline" className="h-7 w-7 text-destructive" title="Stop" disabled={busyId === c.id} onClick={() => void control(c, "stop")}>
                            <Square className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {open && <CampaignDetail campaign={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}
