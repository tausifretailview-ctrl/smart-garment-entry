import { Fragment, useMemo, useState } from "react";
import { format } from "date-fns";
import { Eye, Send, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  bulkHistoryMatches,
  pushFailureLabel,
  pushMessageStage,
  type BulkHistoryFilter,
  type BulkSendHistoryRow,
  type PushMessageRow,
  type PushSummary,
} from "@/utils/customerPushStats";

const fmt = (iso: string | null | undefined) => (iso ? format(new Date(iso), "dd-MM-yy HH:mm") : "–");

const STAGE_BADGE: Record<string, { label: string; className: string }> = {
  opened: { label: "Read", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  delivered: { label: "Delivered", className: "bg-sky-100 text-sky-800 border-sky-200" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-800 border-blue-200" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800 border-red-200" },
  queued: { label: "Queued", className: "bg-slate-100 text-slate-700 border-slate-200" },
};

function Card({
  label,
  value,
  sub,
  icon: Icon,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof Send;
  tone: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl p-3 text-left text-white shadow-sm transition-transform hover:-translate-y-0.5",
        tone,
        active && "ring-2 ring-offset-2 ring-slate-700",
      )}
    >
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide opacity-90">
        {label}
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub ? <div className="text-xs opacity-90">{sub}</div> : null}
    </button>
  );
}

function phonesForCampaign(messages: PushMessageRow[], campaignId: string, phoneOf: (subscriptionId: string) => string) {
  return messages
    .filter((m) => m.campaign_id === campaignId)
    .map((m) => ({
      ...m,
      phone: phoneOf(m.subscription_id),
      stage: pushMessageStage(m),
    }))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

function rowMatchesSearch(row: BulkSendHistoryRow, phones: string[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if ([row.title, row.body, row.audience].join(" ").toLowerCase().includes(q)) return true;
  const digits = q.replace(/\D/g, "");
  return !!digits && phones.some((p) => p.includes(digits));
}

/** Bulk offer sends: period cards plus one history row per send, with the phones under it. */
export default function BulkSendHistory({
  summary,
  history,
  messages,
  phoneOf,
  search,
  loading,
}: {
  summary: PushSummary;
  history: BulkSendHistoryRow[];
  messages: PushMessageRow[];
  phoneOf: (subscriptionId: string) => string;
  search: string;
  loading: boolean;
}) {
  const [filter, setFilter] = useState<BulkHistoryFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const visible = useMemo(() => {
    return history.filter((row) => {
      if (!bulkHistoryMatches(row, filter)) return false;
      const phones = phonesForCampaign(messages, row.campaignId, phoneOf).map((p) => p.phone);
      return rowMatchesSearch(row, phones, search);
    });
  }, [history, filter, messages, phoneOf, search]);

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 shrink-0">
        <Card
          label="Total sent"
          value={summary.sent.toLocaleString("en-IN")}
          sub={`${summary.total.toLocaleString("en-IN")} phones`}
          icon={Send}
          tone="bg-gradient-to-br from-blue-500 to-blue-700"
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <Card
          label="Failed"
          value={summary.failed.toLocaleString("en-IN")}
          icon={XCircle}
          tone="bg-gradient-to-br from-red-500 to-red-700"
          active={filter === "failed"}
          onClick={() => setFilter("failed")}
        />
        <Card
          label="Read"
          value={summary.opened.toLocaleString("en-IN")}
          sub={summary.sent ? `${summary.openRate}% of sent` : undefined}
          icon={Eye}
          tone="bg-gradient-to-br from-emerald-500 to-emerald-700"
          active={filter === "read"}
          onClick={() => setFilter("read")}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-auto rounded-lg border bg-white">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading bulk sends…</p>
        ) : visible.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {history.length === 0 ? "No bulk sends in this period. Use Send offer to notify contacts." : "No bulk send matches this filter."}
          </p>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-slate-800">
              <TableRow>
                {["Date", "Offer", "Audience", "Sent", "Failed", "Read"].map((h) => (
                  <TableHead key={h} className="font-bold text-white whitespace-nowrap">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => {
                const open = openId === row.campaignId;
                const q = search.trim().toLowerCase();
                const titleMatch = !q || [row.title, row.body, row.audience].join(" ").toLowerCase().includes(q);
                const digits = q.replace(/\D/g, "");
                const phones = phonesForCampaign(messages, row.campaignId, phoneOf).filter((p) => {
                  if (digits && !titleMatch && !p.phone.includes(digits)) return false;
                  if (filter === "failed") return p.stage === "failed";
                  if (filter === "read") return p.stage === "opened";
                  return true;
                });
                return (
                  <Fragment key={row.campaignId}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setOpenId(open ? null : row.campaignId)}
                    >
                      <TableCell className="whitespace-nowrap">{fmt(row.createdAt)}</TableCell>
                      <TableCell className="max-w-[280px]">
                        <div className="font-medium truncate">{row.title}</div>
                        {row.body ? <div className="text-xs text-muted-foreground truncate">{row.body}</div> : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{row.audience}</TableCell>
                      <TableCell className="font-mono tabular-nums">{row.sent}</TableCell>
                      <TableCell className="font-mono tabular-nums">{row.failed}</TableCell>
                      <TableCell className="font-mono tabular-nums">{row.read}</TableCell>
                    </TableRow>
                    {open ? (
                      <TableRow key={`${row.campaignId}-phones`}>
                        <TableCell colSpan={6} className="bg-slate-50 p-0">
                          {phones.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-muted-foreground">No phones for this send.</p>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  {["Phone", "Status", "Delivered", "Read", "Reason"].map((h) => (
                                    <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {phones.map((p) => (
                                  <TableRow key={p.id}>
                                    <TableCell className="whitespace-nowrap font-mono tabular-nums">{p.phone || "–"}</TableCell>
                                    <TableCell>
                                      <Badge variant="outline" className={STAGE_BADGE[p.stage].className}>{STAGE_BADGE[p.stage].label}</Badge>
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap">{fmt(p.delivered_at)}</TableCell>
                                    <TableCell className="whitespace-nowrap">{fmt(p.opened_at)}</TableCell>
                                    <TableCell className="max-w-[320px] text-xs text-red-700">
                                      {p.stage === "failed" ? pushFailureLabel(p.error_code) : ""}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
