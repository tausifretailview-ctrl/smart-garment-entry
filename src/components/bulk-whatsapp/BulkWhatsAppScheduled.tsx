import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Loader2, Pencil, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { callBulkWhatsApp, fetchCampaignMessage, scheduledStart, useBulkCampaigns, type BulkCampaign } from "./bulkWhatsAppApi";

/** Value for <input type="datetime-local"> in the browser's time (IST for Indian shops). */
export const localInput = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");
export const SCHEDULE_MAX_DAYS = 14;

/** Is this time far enough ahead (over a minute) and within 14 days? */
export function scheduleTimeOk(d: Date | null): boolean {
  if (!d || Number.isNaN(d.getTime())) return false;
  const ms = d.getTime() - Date.now();
  return ms > 60_000 && ms <= SCHEDULE_MAX_DAYS * 24 * 60 * 60 * 1000;
}

/** Campaigns waiting for their start time, soonest first. */
export function upcomingScheduled(list: BulkCampaign[] | undefined): { c: BulkCampaign; at: Date }[] {
  const now = Date.now();
  return (list ?? [])
    .map((c) => ({ c, at: scheduledStart(c) }))
    .filter((x): x is { c: BulkCampaign; at: Date } => x.at !== null && x.at.getTime() > now)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Cancel = stop: no number gets the message. */
export async function cancelScheduled(organizationId: string, c: BulkCampaign): Promise<boolean> {
  if (!window.confirm(`Cancel the scheduled campaign "${c.name}"? No number will get it.`)) return false;
  await callBulkWhatsApp(organizationId, "stop", { campaignId: c.id });
  return true;
}

/** Change a scheduled campaign's time, name or message before it starts. Numbers and poster stay. */
export function EditScheduleDialog({
  organizationId,
  campaign,
  onClose,
}: {
  organizationId: string;
  campaign: BulkCampaign | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [sendAt, setSendAt] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const msg = useQuery({
    queryKey: ["bulk-whatsapp-message", campaign?.id],
    queryFn: () => fetchCampaignMessage(campaign!.id),
    enabled: Boolean(campaign),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!campaign) return;
    setName(campaign.name);
    const at = scheduledStart(campaign);
    setSendAt(at ? localInput(at) : "");
  }, [campaign]);
  useEffect(() => {
    if (msg.data) setMessage(msg.data.message);
  }, [msg.data]);

  const time = sendAt ? new Date(sendAt) : null;
  const timeOk = scheduleTimeOk(time);
  const hasPoster = Boolean(msg.data?.media_url);
  const canSave = Boolean(campaign) && timeOk && msg.isSuccess && (message.trim() !== "" || hasPoster) && !saving;

  const save = async () => {
    if (!campaign || !time) return;
    setSaving(true);
    try {
      await callBulkWhatsApp(organizationId, "reschedule", {
        campaignId: campaign.id,
        startAt: time.toISOString(),
        name: name.trim(),
        // Sent only when changed, so a time-only edit does not resend every number's name.
        message: msg.data && message !== msg.data.message ? message : undefined,
      });
      toast.success(`Scheduled for ${format(time, "dd MMM, hh:mm a")}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bulk-whatsapp-campaigns", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["bulk-whatsapp-message", campaign.id] }),
      ]);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change the schedule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(campaign)} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Edit scheduled campaign</DialogTitle>
        <DialogDescription>
          {campaign ? `${campaign.total_count.toLocaleString("en-IN")} numbers. ` : ""}
          Numbers and poster stay the same. Change the time, name or message.
        </DialogDescription>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Campaign name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Send on (date & time, IST)</Label>
            <Input
              type="datetime-local"
              value={sendAt}
              min={localInput(new Date(Date.now() + 5 * 60 * 1000))}
              max={localInput(new Date(Date.now() + SCHEDULE_MAX_DAYS * 24 * 60 * 60 * 1000))}
              onChange={(e) => setSendAt(e.target.value)}
              className="h-9"
            />
            {!timeOk && <p className="text-[11px] text-red-600">Pick a time later than now, up to {SCHEDULE_MAX_DAYS} days ahead</p>}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Message {hasPoster ? "(poster attached)" : ""}</Label>
            {msg.isLoading ? (
              <div className="flex h-28 items-center justify-center text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : (
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={7} maxLength={4000} className="text-sm" />
            )}
            <p className="text-[11px] text-slate-500">{"{name}"} becomes each customer's name.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            Close
          </Button>
          <Button disabled={!canSave} onClick={() => void save()}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Upcoming scheduled sends, shown on the Send screen so they can be checked, edited or cancelled. */
export function ScheduledCampaigns({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const q = useBulkCampaigns(organizationId);
  const list = useMemo(() => upcomingScheduled(q.data), [q.data]);
  const [editing, setEditing] = useState<BulkCampaign | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  if (!list.length) return null;

  const cancel = async (c: BulkCampaign) => {
    setBusyId(c.id);
    try {
      if (await cancelScheduled(organizationId, c)) {
        toast.success(`"${c.name}" cancelled`);
        await queryClient.invalidateQueries({ queryKey: ["bulk-whatsapp-campaigns", organizationId] });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-xl border border-violet-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-violet-100 px-3 py-2">
        <CalendarClock className="h-4 w-4 text-violet-600" />
        <span className="text-sm font-semibold text-slate-900">Scheduled ({list.length})</span>
      </div>
      <ul className="max-h-72 divide-y divide-slate-100 overflow-auto">
        {list.map(({ c, at }) => (
          <li key={c.id} className="flex items-center gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-800">{c.name}</div>
              <div className="text-[11px] text-violet-700">
                {format(at, "dd MMM yyyy, hh:mm a")} · {c.total_count.toLocaleString("en-IN")} numbers
                {c.status === "paused" ? " · paused" : ""}
              </div>
            </div>
            <Button size="icon" variant="outline" className="h-7 w-7" title="Edit" disabled={busyId === c.id} onClick={() => setEditing(c)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7 text-destructive"
              title="Cancel"
              disabled={busyId === c.id}
              onClick={() => void cancel(c)}
            >
              {busyId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
            </Button>
          </li>
        ))}
      </ul>
      <EditScheduleDialog organizationId={organizationId} campaign={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
