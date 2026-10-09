import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Megaphone, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ensureFreshSupabaseSession } from "@/lib/jwtRetry";
import { compressImageFile } from "@/lib/compressImage";
import { OfferNotificationPreview } from "@/components/OfferNotificationPreview";
import { getEdgeFunctionErrorMessage } from "@/utils/edgeFunctionError";
import { isHttpsOfferImage } from "../../supabase/functions/_shared/offerAudience";
import {
  filterOfferContacts,
  offerContactsFromSubscriptions,
  offerProbeAuthRejected,
  offerSendBody,
  parseOfferWebsiteDiscount,
  offerSendFailureMessage,
  type OfferContact,
  type OfferCustomerRow,
  type OfferSubscriptionRow,
} from "@/utils/offerNotificationAudience";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  supportsPhoneTarget?: boolean;
};

/** Safety stop: 100 devices per call → up to 20,000 devices per offer. */
const MAX_BATCHES = 200;

async function loadOfferContacts(organizationId: string): Promise<OfferContact[]> {
  const { data, error } = await (supabase as unknown as {
    rpc: (
      fn: string,
      args: { p_organization_id: string },
    ) => Promise<{ data: OfferSubscriptionRow[] | null; error: { message: string } | null }>;
  }).rpc("get_org_push_subscriptions", { p_organization_id: organizationId });
  if (error) throw new Error(error.message);
  const confirmed = (data ?? []).filter((s) => s.status === "confirmed");

  const customers: OfferCustomerRow[] = [];
  const ids = [...new Set(confirmed.map((s) => s.customer_id).filter((id): id is string => !!id))];
  for (let i = 0; i < ids.length; i += 200) {
    const { data: rows, error: customerError } = await supabase
      .from("customers")
      .select("id, customer_name, phone")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .in("id", ids.slice(i, i + 200));
    if (customerError) throw customerError;
    customers.push(...(rows ?? []));
  }

  const namedIds = new Set(customers.map((c) => c.id));
  const preview = offerContactsFromSubscriptions(confirmed, customers);
  const namedPhones = new Set(preview.filter((c) => c.name).map((c) => c.phone));
  const missing = preview.filter((c) => !namedIds.has(c.customerId ?? "") && !namedPhones.has(c.phone)).map((c) => c.phone);
  for (let i = 0; i < missing.length; i += 40) {
    const or = missing.slice(i, i + 40).map((phone) => `phone.ilike.%${phone}`).join(",");
    const { data: rows, error: customerError } = await supabase
      .from("customers")
      .select("id, customer_name, phone")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .or(or);
    if (customerError) throw customerError;
    customers.push(...(rows ?? []));
  }

  return offerContactsFromSubscriptions(confirmed, customers);
}

/**
 * Staff: send an offer to every customer who turned notifications on, or to
 * the contacts they tick. The photo is uploaded from this PC. push-send stores
 * the public https link and sends in resumable batches of 100.
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
  const [discountKind, setDiscountKind] = useState<"percent" | "flat">("percent");
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountMinOrder, setDiscountMinOrder] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [contacts, setContacts] = useState<OfferContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [contactQuery, setContactQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [phoneTargetReady, setPhoneTargetReady] = useState<boolean | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const invoke = useCallback(async (payload: Record<string, unknown>): Promise<PushSendResult> => {
    await ensureFreshSupabaseSession();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const { data, error } = await supabase.functions.invoke("push-send", {
      body: { organizationId, ...payload },
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });
    const dataError = data && typeof data === "object" ? (data as PushSendResult).error : undefined;
    if (error || typeof dataError === "string") {
      const raw = await getEdgeFunctionErrorMessage(error, data, "Could not send the offer");
      throw new Error(offerSendFailureMessage(raw));
    }
    return (data ?? {}) as PushSendResult;
  }, [organizationId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setContactsLoading(true);
    setContactsError(null);
    setPhoneTargetReady(null);
    setProbeError(null);

    void (async () => {
      try {
        const res = await invoke({ probeAudience: true });
        if (!cancelled) setPhoneTargetReady(res.supportsPhoneTarget === true);
      } catch (e) {
        if (!cancelled) {
          setPhoneTargetReady(false);
          setProbeError(e instanceof Error ? e.message : "Could not check the notification service");
        }
      }
    })();

    void (async () => {
      try {
        const list = await loadOfferContacts(organizationId);
        if (cancelled) return;
        setContacts(list);
        setSelected((prev) => {
          const allowed = new Set(list.map((c) => c.phone));
          return new Set([...prev].filter((phone) => allowed.has(phone)));
        });
      } catch (e) {
        if (!cancelled) setContactsError(e instanceof Error ? e.message : "Could not load contacts");
      } finally {
        if (!cancelled) setContactsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, organizationId, invoke]);

  const visible = useMemo(() => filterOfferContacts(contacts, contactQuery), [contacts, contactQuery]);
  const selectedVisible = visible.filter((c) => selected.has(c.phone)).length;
  const allVisibleChecked = visible.length > 0 && selectedVisible === visible.length;
  const canCompose = !!title.trim() && !!body.trim() && !sending && !uploadingPhoto;

  const toggleOne = (phone: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(phone);
      else next.delete(phone);
      return next;
    });
  };

  const toggleVisible = (on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of visible) {
        if (on) next.add(c.phone);
        else next.delete(c.phone);
      }
      return next;
    });
  };

  const importPhoto = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose a photo from this PC");
      return;
    }
    setUploadingPhoto(true);
    try {
      const blob = await compressImageFile(file);
      const path = `${organizationId}/offers/${Date.now()}.jpg`;
      const { error: upError } = await supabase.storage.from("website-photos").upload(path, blob, {
        contentType: "image/jpeg",
        upsert: true,
      });
      if (upError) throw upError;
      const { data } = supabase.storage.from("website-photos").getPublicUrl(path);
      if (!isHttpsOfferImage(data.publicUrl)) throw new Error("The uploaded photo link was not https");
      setImageUrl(data.publicUrl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not import the photo");
    } finally {
      setUploadingPhoto(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const resetForm = () => {
    setTitle("");
    setBody("");
    setOfferCode("");
    setValidTill("");
    setDiscountAmount("");
    setDiscountMinOrder("");
    setImageUrl("");
    setContactQuery("");
    setSelected(new Set());
  };

  const send = async (mode: "all" | "selected") => {
    if (mode === "selected" && phoneTargetReady !== true) {
      toast.error("Send to selected contacts is not available until the notification service is updated.");
      return;
    }
    const built = offerSendBody({
      title,
      body,
      offerCode: offerCode.trim() || null,
      validTill: validTill || null,
      imageUrl: imageUrl.trim() || null,
      phones: mode === "selected" ? [...selected] : null,
      websiteDiscount: parseOfferWebsiteDiscount({
        kind: discountKind,
        amount: discountAmount,
        minOrder: discountMinOrder,
      }),
    });
    if ("error" in built) {
      toast.error(built.error);
      return;
    }
    if (mode === "selected" && !built.newCampaign.phones?.length) {
      toast.error("Select at least one contact");
      return;
    }

    setSending(true);
    setProgress("Sending…");
    let sent = 0;
    let failed = 0;
    try {
      let res = await invoke(built);
      if (res.skipped === "push_disabled") throw new Error("Turn on Customer page and Push notifications in Settings first.");
      sent += res.sent ?? 0;
      failed += res.failed ?? 0;
      const campaignId = res.campaignId;
      for (let i = 0; !res.completed && campaignId && i < MAX_BATCHES; i++) {
        setProgress(`Sent to ${sent} phones…`);
        res = await invoke({ campaignId });
        sent += res.sent ?? 0;
        failed += res.failed ?? 0;
      }
      toast.success(`Offer sent to ${sent} phone${sent === 1 ? "" : "s"}${failed ? ` · ${failed} failed` : ""}`);
      setOpen(false);
      resetForm();
      onSent?.();
    } catch (e) {
      toast.error(offerSendFailureMessage(e instanceof Error ? e.message : null));
    } finally {
      setSending(false);
      setProgress(null);
    }
  };

  const selectedCount = selected.size;

  return (
    <>
      <Button size="sm" className="h-9 bg-teal-700 hover:bg-teal-800" disabled={disabled} onClick={() => setOpen(true)}>
        <Megaphone className="h-4 w-4 mr-1" />
        Send offer
      </Button>
      <Dialog open={open} onOpenChange={(o) => !sending && setOpen(o)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send offer notification</DialogTitle>
            <DialogDescription>
              Customers who turned notifications on also see this under Offers in their app. Send to all reaches every one of those phones. Send notification reaches only the contacts you tick.
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
            {offerCode.trim() ? (
              <div className="space-y-1">
                <Label>Discount when this code is used on your website (optional)</Label>
                <div className="grid grid-cols-[auto_1fr_1fr] gap-2">
                  <select
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                    value={discountKind}
                    onChange={(e) => setDiscountKind(e.target.value === "flat" ? "flat" : "percent")}
                    aria-label="Discount type"
                  >
                    <option value="percent">% off</option>
                    <option value="flat">₹ off</option>
                  </select>
                  <Input
                    inputMode="decimal"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    placeholder={discountKind === "percent" ? "10" : "200"}
                    aria-label="Discount amount"
                  />
                  <Input
                    inputMode="numeric"
                    value={discountMinOrder}
                    onChange={(e) => setDiscountMinOrder(e.target.value)}
                    placeholder="Min order ₹"
                    aria-label="Minimum order"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave empty to apply the offer yourself when you make the bill.
                </p>
              </div>
            ) : null}
            <div className="space-y-1">
              <Label>Photo (optional)</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void importPhoto(e.target.files?.[0])}
              />
              {imageUrl ? (
                <div className="flex items-start gap-2">
                  <img src={imageUrl} alt="Offer" className="h-20 w-20 rounded-md border border-border object-cover" />
                  <Button type="button" variant="outline" size="sm" disabled={sending || uploadingPhoto} onClick={() => setImageUrl("")}>
                    <X className="h-4 w-4 mr-1" />
                    Remove photo
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={sending || uploadingPhoto}
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus className="h-4 w-4 mr-1" />
                  {uploadingPhoto ? "Importing photo…" : "Import photo from this PC"}
                </Button>
              )}
            </div>
            <OfferNotificationPreview title={title} body={body} offerCode={offerCode} imageUrl={imageUrl} />
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label>Contacts</Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {contactsLoading ? "Loading…" : `${contacts.length} with notifications on`}
                </span>
              </div>
              <Input
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
                placeholder="Search name or phone"
              />
              <div className="rounded-md border border-border">
                <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
                  <Checkbox
                    checked={allVisibleChecked ? true : selectedVisible > 0 ? "indeterminate" : false}
                    disabled={visible.length === 0}
                    onCheckedChange={(v) => toggleVisible(v === true)}
                    aria-label="Select contacts in this list"
                  />
                  <span className="text-xs text-muted-foreground">
                    {selectedCount > 0 ? `${selectedCount} selected` : "Select contacts"}
                  </span>
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {contactsError ? (
                    <p className="px-2 py-3 text-sm text-destructive">{contactsError}</p>
                  ) : contactsLoading ? (
                    <p className="px-2 py-3 text-sm text-muted-foreground">Loading contacts…</p>
                  ) : visible.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-muted-foreground">
                      {contacts.length === 0
                        ? "No customers have notifications turned on."
                        : "No contact matches that search."}
                    </p>
                  ) : (
                    visible.map((c) => (
                      <div
                        key={c.phone}
                        className="flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-muted/60"
                        onClick={() => toggleOne(c.phone, !selected.has(c.phone))}
                      >
                        <Checkbox
                          checked={selected.has(c.phone)}
                          onClick={(e) => e.stopPropagation()}
                          onCheckedChange={(v) => toggleOne(c.phone, v === true)}
                          aria-label={c.name || c.phone}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm">{c.name || "No name"}</span>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">{c.phone}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              {phoneTargetReady === false && offerProbeAuthRejected(probeError) ? (
                <p className="text-xs text-destructive">
                  {offerSendFailureMessage(probeError)} Send to all and selected contacts both use that login.
                </p>
              ) : phoneTargetReady === false ? (
                <p className="text-xs text-amber-800">
                  Send to selected contacts is not available until the notification service is updated. Send to all still works.
                </p>
              ) : null}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:flex-wrap">
            {progress ? <span className="text-sm text-muted-foreground mr-auto">{progress}</span> : null}
            <Button variant="outline" disabled={sending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="outline" disabled={!canCompose} onClick={() => void send("all")}>
              {sending ? "Sending…" : "Send to all"}
            </Button>
            <Button
              disabled={!canCompose || selectedCount === 0 || phoneTargetReady !== true}
              onClick={() => void send("selected")}
            >
              {sending ? "Sending…" : "Send notification"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
