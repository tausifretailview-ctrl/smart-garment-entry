import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Download, Loader2, Pause, Play, Send, Square, XCircle } from "lucide-react";
import { toast } from "sonner";
import type * as XLSXType from "xlsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatBulkPhone } from "@/utils/bulkWhatsAppContacts";
import {
  callBulkWhatsApp,
  fetchCampaigns,
  fetchRecipients,
  type BulkCampaign,
  type BulkRecipient,
} from "./bulkWhatsAppApi";

let xlsxModulePromise: Promise<typeof XLSXType> | null = null;
const loadXlsx = (): Promise<typeof XLSXType> => (xlsxModulePromise ??= import("xlsx"));

const fmt = (iso: string | null | undefined) => (iso ? format(new Date(iso), "dd-MM-yy HH:mm") : "–");

const CAMPAIGN_BADGE: Record<BulkCampaign["status"], { label: string; className: string }> = {
  running: { label: "Sending", className: "bg-blue-100 text-blue-800 border-blue-200" },
  paused: { label: "Paused", className: "bg-amber-100 text-amber-800 border-amber-200" },
  stopped: { label: "Stopped", className: "bg-slate-100 text-slate-700 border-slate-200" },
  completed: { label: "Done", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800 border-red-200" },
};

const RECIPIENT_BADGE: Record<BulkRecipient["status"], { label: string; className: string }> = {
  pending: { label: "Waiting", className: "bg-slate-100 text-slate-700 border-slate-200" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-800 border-blue-200" },
  delivered: { label: "Delivered", className: "bg-sky-100 text-sky-800 border-sky-200" },
  read: { label: "Read", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800 border-red-200" },
  skipped: { label: "Not sent", className: "bg-slate-100 text-slate-500 border-slate-200" },
};

type Filter = "all" | "sent" | "delivered" | "read" | "failed" | "pending";

const matches = (r: BulkRecipient, f: Filter) =>
  f === "all" ||
  (f === "sent" && ["sent", "delivered", "read"].includes(r.status)) ||
  (f === "delivered" && ["delivered", "read"].includes(r.status)) ||
  (f === "read" && r.status === "read") ||
  (f === "failed" && r.status === "failed") ||
  (f === "pending" && (r.status === "pending" || r.status === "skipped"));

function Tile({
  label,
  value,
  tone,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: string;
  icon: typeof Send;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("rounded-lg px-3 py-2 text-left text-white shadow-sm", tone, active && "ring-2 ring-offset-1 ring-slate-700")}
    >
      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide opacity-90">
        {label}
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </button>
  );
}

function CampaignDetail({ campaign, onClose }: { campaign: BulkCampaign; onClose: () => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const q = useQuery({
    queryKey: ["bulk-whatsapp-recipients", campaign.id],
    queryFn: () => fetchRecipients(campaign.id),
    refetchInterval: campaign.status === "running" || campaign.status === "paused" ? 8000 : 30000,
  });
  const rows = useMemo(() => (q.data ?? []).filter((r) => matches(r, filter)), [q.data, filter]);

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
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{campaign.name}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Tile label="Total" value={campaign.total_count} tone="bg-slate-600" icon={Send} active={filter === "all"} onClick={() => setFilter("all")} />
          <Tile label="Sent" value={campaign.sent_count} tone="bg-blue-600" icon={Send} active={filter === "sent"} onClick={() => setFilter("sent")} />
          <Tile label="Delivered" value={campaign.delivered_count} tone="bg-sky-600" icon={CheckCheck} active={filter === "delivered"} onClick={() => setFilter("delivered")} />
          <Tile label="Read" value={campaign.read_count} tone="bg-emerald-600" icon={CheckCheck} active={filter === "read"} onClick={() => setFilter("read")} />
          <Tile label="Failed" value={campaign.failed_count} tone="bg-red-600" icon={XCircle} active={filter === "failed"} onClick={() => setFilter("failed")} />
        </div>
        <p className="text-xs text-muted-foreground">
          Read shows only when the customer has read receipts (blue ticks) on; otherwise it stays Delivered.
        </p>
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => void exportExcel()} disabled={!q.data?.length}>
            <Download className="h-4 w-4 mr-1" /> Excel
          </Button>
        </div>
        <div className="overflow-auto flex-1 min-h-0 border rounded-md">
          {q.isLoading ? (
            <div className="p-6 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Delivered</TableHead>
                  <TableHead>Read</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums">{r.position}</TableCell>
                    <TableCell>{r.name ?? "–"}</TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">{formatBulkPhone(r.phone)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={RECIPIENT_BADGE[r.status].className}>
                        {RECIPIENT_BADGE[r.status].label}
                      </Badge>
                      {r.error ? <div className="text-[11px] text-red-600 mt-0.5">{r.error}</div> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{fmt(r.sent_at)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{fmt(r.delivered_at)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{fmt(r.read_at)}</TableCell>
                  </TableRow>
                ))}
                {!rows.length && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                      No numbers here
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
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
  const q = useQuery({
    queryKey: ["bulk-whatsapp-campaigns", organizationId],
    queryFn: () => fetchCampaigns(organizationId),
    refetchInterval: (query) =>
      (query.state.data as BulkCampaign[] | undefined)?.some((c) => c.status === "running") ? 6000 : 30000,
  });
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
    <div className="rounded-xl border bg-white p-3 space-y-2">
      <div className="font-semibold text-sm">Delivery report</div>
      {q.isLoading ? (
        <div className="p-4 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !q.data?.length ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No bulk messages sent yet</p>
      ) : (
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead className="text-right">Read</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.map((c) => {
                const done = c.sent_count + c.failed_count;
                const live = c.status === "running" || c.status === "paused";
                return (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => setOpenId(c.id)}>
                    <TableCell className="whitespace-nowrap text-xs">{fmt(c.created_at)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{c.name}</div>
                      {c.sender_number ? (
                        <div className="text-[11px] text-muted-foreground">
                          from {formatBulkPhone(c.sender_number)}
                          {c.user_id !== userId ? " (other user)" : ""}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={CAMPAIGN_BADGE[c.status].className}>
                        {CAMPAIGN_BADGE[c.status].label}
                        {live ? ` ${done}/${c.total_count}` : ""}
                      </Badge>
                      {c.status_note ? <div className="text-[11px] text-amber-700 mt-0.5">{c.status_note}</div> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.total_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.sent_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.delivered_count}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-700 font-semibold">{c.read_count}</TableCell>
                    <TableCell className="text-right tabular-nums text-red-600">{c.failed_count}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()} className="whitespace-nowrap">
                      {live && (
                        <div className="flex gap-1 justify-end">
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
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {open && <CampaignDetail campaign={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}
