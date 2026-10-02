import { useState } from "react";
import { Megaphone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PushSendResult = {
  ok?: boolean;
  error?: string;
  skipped?: string;
  sent?: number;
  failed?: number;
  completed?: boolean;
  campaignId?: string;
};

/** Safety stop: 100 devices per call → up to 20,000 devices per offer. */
const MAX_BATCHES = 200;

/**
 * Staff: send an offer / promotion notification to every customer phone that turned on
 * notifications. push-send creates the campaign and sends in resumable batches of 100.
 */
export default function SendOfferDialog({
  organizationId,
  disabled,
  onSent,
}: {
  organizationId: string;
  disabled?: boolean;
  onSent?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [offerCode, setOfferCode] = useState("");
  const [validTill, setValidTill] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const invoke = async (payload: Record<string, unknown>): Promise<PushSendResult> => {
    const { data, error } = await supabase.functions.invoke("push-send", { body: { organizationId, ...payload } });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      const detail = ctx ? await ctx.json().catch(() => null) : null;
      throw new Error((detail as { error?: string } | null)?.error ?? error.message);
    }
    return (data ?? {}) as PushSendResult;
  };

  const send = async () => {
    setSending(true);
    setProgress("Sending…");
    let sent = 0;
    let failed = 0;
    try {
      let res = await invoke({
        newCampaign: {
          title: title.trim(),
          body: body.trim(),
          offerCode: offerCode.trim() || null,
          validTill: validTill || null,
          imageUrl: imageUrl.trim() || null,
        },
      });
      if (res.skipped === "push_disabled") throw new Error("Turn on Customer page and Push notifications in Settings first.");
      sent += res.sent ?? 0;
      failed += res.failed ?? 0;
      // push-send returns the campaign via resume; keep calling until the audience is done.
      const campaignId = res.campaignId;
      for (let i = 0; !res.completed && campaignId && i < MAX_BATCHES; i++) {
        setProgress(`Sent to ${sent} phones…`);
        res = await invoke({ campaignId });
        sent += res.sent ?? 0;
        failed += res.failed ?? 0;
      }
      toast.success(`Offer sent to ${sent} phone${sent === 1 ? "" : "s"}${failed ? ` · ${failed} failed` : ""}`);
      setOpen(false);
      setTitle("");
      setBody("");
      setOfferCode("");
      setValidTill("");
      setImageUrl("");
      onSent?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the offer");
    } finally {
      setSending(false);
      setProgress(null);
    }
  };

  return (
    <>
      <Button size="sm" className="h-9 bg-teal-700 hover:bg-teal-800" disabled={disabled} onClick={() => setOpen(true)}>
        <Megaphone className="h-4 w-4 mr-1" />
        Send offer
      </Button>
      <Dialog open={open} onOpenChange={(o) => !sending && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send offer notification</DialogTitle>
            <DialogDescription>
              Goes to every customer phone that turned on notifications. Customers also see it under Offers in their app.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Title</Label>
              <Input maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Diwali Sale — Flat 20% off" />
            </div>
            <div className="space-y-1">
              <Label>Message</Label>
              <Textarea
                maxLength={300}
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="New silk sarees arrived. Visit the shop this weekend."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Offer code (optional)</Label>
                <Input maxLength={40} value={offerCode} onChange={(e) => setOfferCode(e.target.value.toUpperCase())} />
              </div>
              <div className="space-y-1">
                <Label>Valid till (optional)</Label>
                <Input type="date" value={validTill} onChange={(e) => setValidTill(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Image link (optional, https)</Label>
              <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
            </div>
          </div>
          <DialogFooter>
            {progress ? <span className="text-sm text-muted-foreground mr-auto">{progress}</span> : null}
            <Button variant="outline" disabled={sending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={sending || !title.trim() || !body.trim()} onClick={() => void send()}>
              {sending ? "Sending…" : "Send to all"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
