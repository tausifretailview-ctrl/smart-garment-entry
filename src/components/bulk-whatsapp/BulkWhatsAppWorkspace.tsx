import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCheck,
  FileSpreadsheet,
  FileText,
  ImagePlus,
  Instagram,
  Loader2,
  MapPin,
  MessageCircle,
  MessagesSquare,
  Phone,
  Plus,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type * as XLSXType from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { BulkWhatsAppLink } from "./BulkWhatsAppLink";
import { BulkWhatsAppReport, BulkWhatsAppStats } from "./BulkWhatsAppReport";
import { callBulkWhatsApp, fetchOptOutCount, type BulkCampaignMessage } from "./bulkWhatsAppApi";
import { CustomerMasterPicker } from "./CustomerMasterPicker";
import {
  buildBulkLinkLines,
  EMPTY_BULK_LINKS,
  estimateBulkMinutes,
  fillBulkMessage,
  formatBulkPhone,
  mergeContacts,
  parseContactSheet,
  parseTypedContacts,
  stripBulkExtras,
  type BulkContact,
  type BulkLinks,
} from "@/utils/bulkWhatsAppContacts";

let xlsxModulePromise: Promise<typeof XLSXType> | null = null;
const loadXlsx = (): Promise<typeof XLSXType> => (xlsxModulePromise ??= import("xlsx"));

const MAX_CONTACTS = 5000;
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;
/** Videos made Small / Medium on the WhatsApp server may start bigger; it sends the smaller copy. */
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MEDIA_ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,application/pdf";

type VideoQuality = "small" | "medium" | "original";
const VIDEO_QUALITIES: { id: VideoQuality; label: string; hint: string }[] = [
  { id: "small", label: "Small", hint: "480p, quickest to send and download" },
  { id: "medium", label: "Medium", hint: "720p, clear and light (best)" },
  { id: "original", label: "Original", hint: "As uploaded, MP4 up to 16 MB" },
];
const SHOWN_CONTACTS = 200;
/** Added under the message so customers know how to stop bulk messages (STOP is handled by the WhatsApp server). */
const STOP_LINE = "Reply STOP to stop these messages";
const linksKey = (orgId: string) => `bulk_whatsapp_links_${orgId}`;

/** Shop links are kept per shop in this browser so they are filled in next time. */
function readLinks(orgId: string): BulkLinks {
  try {
    const raw = localStorage.getItem(linksKey(orgId));
    return raw ? { ...EMPTY_BULK_LINKS, ...(JSON.parse(raw) as Partial<BulkLinks>) } : EMPTY_BULK_LINKS;
  } catch {
    return EMPTY_BULK_LINKS;
  }
}

/** Original means WhatsApp gets the file as uploaded: only for MP4s that fit its 16 MB size. */
const canSendOriginal = (file: File) => file.type === "video/mp4" && file.size <= MAX_MEDIA_BYTES;

/** A poster already uploaded for an earlier campaign ("Use this message again"): sent by its link, not uploaded again. */
interface SavedMedia {
  url: string;
  type: string;
  name: string;
}

/** Numbers are checked 50 at a time with a short pause, so WhatsApp sees a slow, normal lookup. */
const CHECK_BATCH = 50;
const CHECK_PAUSE_MS = 1500;
/** datetime-local value (local time, minutes). */
const localInput = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");

export type BulkWhatsAppView = "all" | "send" | "reports";

/**
 * The whole Bulk WhatsApp screen: link, compose, numbers, send and report. Used by the ERP page
 * and by the separate WhatsApp-only site (which has no Customer Master and shows send and reports
 * as separate pages through `view`).
 */
export function BulkWhatsAppWorkspace({
  organizationId: orgId,
  userId,
  showCustomerMaster = true,
  showTitle = true,
  view = "all",
  onOpenReports,
  onOpenSend,
  previewTopClass = "lg:top-20",
}: {
  organizationId: string;
  userId: string | undefined;
  showCustomerMaster?: boolean;
  showTitle?: boolean;
  view?: BulkWhatsAppView;
  /** Site only: where "see report" points after a send. */
  onOpenReports?: () => void;
  /** Site only: back to the send page after "Use this message again" in Reports. */
  onOpenSend?: () => void;
  /** How far below the top the message preview sticks: the site has a top bar, the ERP page has none. */
  previewTopClass?: string;
}) {
  const queryClient = useQueryClient();

  const [linked, setLinked] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [media, setMedia] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [videoQuality, setVideoQuality] = useState<VideoQuality>("medium");
  const [savedMedia, setSavedMedia] = useState<SavedMedia | null>(null);
  const [scheduleOn, setScheduleOn] = useState(false);
  const [sendAt, setSendAt] = useState("");
  const [checking, setChecking] = useState<{ done: number; total: number } | null>(null);
  const [contacts, setContacts] = useState<BulkContact[]>([]);
  const [typed, setTyped] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [addStopLine, setAddStopLine] = useState(true);
  const [links, setLinks] = useState<BulkLinks>(() => readLinks(orgId));
  useEffect(() => {
    try {
      localStorage.setItem(linksKey(orgId), JSON.stringify(links));
    } catch {
      /* private mode: links are typed again next time */
    }
  }, [orgId, links]);
  const optOuts = useQuery({
    queryKey: ["bulk-whatsapp-optouts", orgId],
    queryFn: () => fetchOptOutCount(orgId),
    enabled: Boolean(orgId),
    staleTime: 60_000,
  });
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const excelRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLInputElement>(null);

  const addContacts = (added: BulkContact[], invalid: number, source: string) => {
    const merged = mergeContacts(contacts, added);
    const list = merged.contacts.slice(0, MAX_CONTACTS);
    setContacts(list);
    const parts = [`${list.length - contacts.length} added from ${source}`];
    if (merged.duplicates) parts.push(`${merged.duplicates} duplicate`);
    if (invalid) parts.push(`${invalid} invalid skipped`);
    if (merged.contacts.length > MAX_CONTACTS) parts.push(`limit ${MAX_CONTACTS} numbers`);
    toast.success(parts.join(" · "));
  };

  const onExcel = async (file: File) => {
    try {
      const XLSX = await loadXlsx();
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = book.Sheets[book.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
      const { contacts: found, invalid } = parseContactSheet(rows);
      if (!found.length) {
        toast.error("No mobile numbers found. Keep numbers in one column, e.g. with heading Mobile.");
        return;
      }
      addContacts(found, invalid, "Excel");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the Excel file");
    }
  };

  const onTypedAdd = () => {
    const { contacts: found, invalid } = parseTypedContacts(typed);
    if (!found.length) {
      toast.error("Type at least one 10-digit mobile number");
      return;
    }
    addContacts(found, invalid.length, "typed list");
    setTyped("");
  };

  const onMedia = (file: File | null) => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    const isVideo = Boolean(file?.type.startsWith("video/"));
    if (file && file.size > (isVideo ? MAX_VIDEO_BYTES : MAX_MEDIA_BYTES)) {
      toast.error(isVideo ? "Video is too large (max 50 MB)" : "File is too large (max 16 MB)");
      file = null;
    }
    if (file && isVideo && !canSendOriginal(file)) setVideoQuality((q) => (q === "original" ? "medium" : q));
    if (file) setSavedMedia(null);
    setMedia(file);
    setMediaPreview(file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
  };

  /** "Use this message again" from a report: text without the added footer and links, same poster. */
  const reuse = (m: BulkCampaignMessage) => {
    setMessage(stripBulkExtras(m.message ?? ""));
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMedia(null);
    setMediaPreview(null);
    setSavedMedia(m.media_url ? { url: m.media_url, type: m.media_type ?? "image/jpeg", name: m.media_name ?? "poster" } : null);
    if (onOpenSend) onOpenSend();
    else window.scrollTo({ top: 0, behavior: "smooth" });
    toast.success("Message and poster copied. Add numbers and send.");
  };

  /** Removes numbers that have no WhatsApp before sending, so they do not count as failed. */
  const checkNumbers = async () => {
    if (!orgId || !contacts.length) return;
    const phones = contacts.map((c) => c.phone);
    const missing = new Set<string>();
    setChecking({ done: 0, total: phones.length });
    try {
      for (let i = 0; i < phones.length; i += CHECK_BATCH) {
        const batch = phones.slice(i, i + CHECK_BATCH);
        const res = await callBulkWhatsApp<{ checked?: string[]; onWhatsApp?: string[] }>(orgId, "check-numbers", { phones: batch });
        const ok = new Set(res.onWhatsApp ?? []);
        for (const p of res.checked ?? batch) if (!ok.has(p)) missing.add(p);
        setChecking({ done: Math.min(phones.length, i + batch.length), total: phones.length });
        if (i + CHECK_BATCH < phones.length) await new Promise((r) => setTimeout(r, CHECK_PAUSE_MS));
      }
      setContacts((list) => list.filter((c) => !missing.has(c.phone)));
      toast.success(
        missing.size
          ? `Removed ${missing.size.toLocaleString("en-IN")} ${missing.size === 1 ? "number" : "numbers"} not on WhatsApp`
          : "All numbers are on WhatsApp",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not check the numbers");
    } finally {
      setChecking(null);
    }
  };

  const insertName = () => {
    const el = messageRef.current;
    const at = el?.selectionStart ?? message.length;
    setMessage(`${message.slice(0, at)}{name}${message.slice(at)}`);
  };

  const linkLines = useMemo(() => buildBulkLinkLines(links), [links]);
  const outgoing = useMemo(() => {
    const blocks = [message.trimEnd(), linkLines.join("\n"), addStopLine ? `_${STOP_LINE}_` : ""].filter((b) => b.trim());
    return blocks.join("\n\n");
  }, [message, linkLines, addStopLine]);
  const preview = useMemo(() => fillBulkMessage(outgoing, contacts[0]?.name ?? "Ravi"), [outgoing, contacts]);
  const attachment = media ? { name: media.name, type: media.type } : savedMedia;
  const scheduleTime = scheduleOn && sendAt ? new Date(sendAt) : null;
  const scheduleOk = !scheduleOn || (scheduleTime !== null && scheduleTime.getTime() > Date.now() + 60_000);
  const canSend =
    linked && contacts.length > 0 && (message.trim() !== "" || attachment !== null) && scheduleOk && !sending && !checking;

  const send = async () => {
    if (!orgId) return;
    setSending(true);
    try {
      let mediaUrl: string | null = savedMedia?.url ?? null;
      if (media) {
        const safe = media.name.replace(/[^\w.-]+/g, "_").slice(-60);
        const path = `${orgId}/${crypto.randomUUID()}-${safe}`;
        const { error } = await supabase.storage
          .from("bulk-whatsapp-media")
          .upload(path, media, { contentType: media.type, upsert: false });
        if (error) {
          throw new Error(
            media.size > MAX_MEDIA_BYTES && /size|large/i.test(error.message)
              ? "Videos over 16 MB need the new storage setting (SQL from the update). For now pick a video under 16 MB."
              : `Poster upload failed: ${error.message}`,
          );
        }
        mediaUrl = supabase.storage.from("bulk-whatsapp-media").getPublicUrl(path).data.publicUrl;
      }
      const res = await callBulkWhatsApp<{ total?: number; unsubscribed?: number; alreadySent?: number }>(orgId, "create", {
        name: name.trim(),
        message: outgoing,
        mediaUrl,
        mediaType: attachment?.type ?? null,
        mediaName: attachment?.name ?? null,
        videoQuality: attachment?.type.startsWith("video/") ? videoQuality : null,
        startAt: scheduleTime ? scheduleTime.toISOString() : null,
        recipients: contacts,
      });
      let skipped = res.unsubscribed ? ` ${res.unsubscribed} unsubscribed ${res.unsubscribed === 1 ? "number was" : "numbers were"} left out.` : "";
      if (res.alreadySent) {
        skipped += ` ${res.alreadySent} ${res.alreadySent === 1 ? "number" : "numbers"} are still getting this message from a campaign that is sending, so ${res.alreadySent === 1 ? "it was" : "they were"} left out.`;
      }
      const when = scheduleTime
        ? `Scheduled for ${format(scheduleTime, "dd MMM, hh:mm a")} to ${res.total ?? contacts.length} numbers.`
        : `Sending to ${res.total ?? contacts.length} numbers.`;
      toast.success(`${when}${skipped} You can close this page; it keeps sending.`, {
        action: onOpenReports ? { label: "See report", onClick: onOpenReports } : undefined,
      });
      setContacts([]);
      setName("");
      setScheduleOn(false);
      await queryClient.invalidateQueries({ queryKey: ["bulk-whatsapp-campaigns", orgId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start sending");
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div className="flex min-h-full w-full flex-col gap-3 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 px-2 py-3 sm:px-4">
      {showTitle && (
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md">
            <MessagesSquare className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900">Bulk WhatsApp</h1>
            <p className="text-xs text-slate-500 sm:text-sm">
              Send a message and poster from your own WhatsApp to many numbers, one by one, with delivery and read report
            </p>
          </div>
        </div>
      )}

      <BulkWhatsAppStats organizationId={orgId} />

      {view !== "reports" && (
      <>
      <BulkWhatsAppLink organizationId={orgId} onChange={setLinked} />

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid min-w-0 items-start gap-3 2xl:grid-cols-2">
        {/* Step 1: message */}
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <StepTitle step={1} title="Message" hint="Text, customer name and poster" />
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Campaign name (for the report)</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Diwali offer"
              maxLength={120}
              className="no-uppercase"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-slate-600">Message</Label>
              <div className="flex items-center gap-2">
                <span className="text-[11px] tabular-nums text-slate-400">{message.length}/4000</span>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={insertName}>
                  <Plus className="mr-1 h-3 w-3" /> Customer name
                </Button>
              </div>
            </div>
            <Textarea
              ref={messageRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={7}
              maxLength={4000}
              className="no-uppercase text-sm leading-relaxed"
              placeholder={"Hi {name}, our Diwali sale starts today! Flat 30% off on all items."}
            />
            <p className="text-[11px] text-slate-500">
              {"{name}"} becomes each customer's name (or "Customer" when there is none). *bold* and _italic_ work like in WhatsApp.
            </p>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={addStopLine}
                onChange={(e) => setAddStopLine(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-emerald-600"
              />
              <span>
                Add <b>"{STOP_LINE}"</b> at the end. Customers who reply STOP are never sent bulk messages again (START undoes it).
              </span>
            </label>
          </div>
          <LinksEditor links={links} onChange={setLinks} />
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Poster (photo, video or PDF, optional)</Label>
            <input
              ref={mediaRef}
              type="file"
              accept={MEDIA_ACCEPT}
              className="hidden"
              onChange={(e) => {
                onMedia(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            {media ? (
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
                {mediaPreview ? (
                  <img src={mediaPreview} alt="Poster" className="h-16 w-16 rounded-md object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-md bg-white text-xs font-semibold text-slate-500">
                    {media.type.includes("pdf") ? "PDF" : "Video"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800">{media.name}</div>
                  <div className="text-[11px] text-slate-500">{(media.size / (1024 * 1024)).toFixed(1)} MB</div>
                </div>
                <Button type="button" size="icon" variant="ghost" onClick={() => onMedia(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : savedMedia ? (
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
                {savedMedia.type.startsWith("image/") ? (
                  <img src={savedMedia.url} alt="Poster" className="h-16 w-16 rounded-md object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-md bg-white text-xs font-semibold text-slate-500">
                    {savedMedia.type.includes("pdf") ? "PDF" : "Video"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800">{savedMedia.name}</div>
                  <div className="text-[11px] text-slate-500">From an earlier campaign</div>
                </div>
                <Button type="button" size="icon" variant="ghost" onClick={() => setSavedMedia(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
            {attachment?.type.startsWith("video/") && (
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-slate-600">Video size sent to customers</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {VIDEO_QUALITIES.map((v) => {
                    const disabled = v.id === "original" && media !== null && !canSendOriginal(media);
                    return (
                      <button
                        key={v.id}
                        type="button"
                        disabled={disabled}
                        title={disabled ? "Original works only for MP4 videos up to 16 MB" : v.hint}
                        onClick={() => setVideoQuality(v.id)}
                        className={cn(
                          "rounded-lg border px-2 py-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40",
                          videoQuality === v.id
                            ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20"
                            : "border-slate-200 bg-white hover:border-emerald-300",
                        )}
                      >
                        <div className="text-xs font-semibold text-slate-800">{v.label}</div>
                        <div className="text-[10px] leading-snug text-slate-500">{v.hint}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {attachment ? null : (
              <button
                type="button"
                onClick={() => mediaRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 py-4 text-sm font-medium text-slate-500 transition hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-700"
              >
                <ImagePlus className="h-4 w-4" /> Attach poster
              </button>
            )}
          </div>
        </section>

        {/* Step 2: numbers */}
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <StepTitle
            step={2}
            title="Numbers"
            hint={contacts.length ? `${contacts.length.toLocaleString("en-IN")} ready to send` : showCustomerMaster ? "Customer Master, Excel or type" : "Excel import or type"}
            action={
              contacts.length > 0 && (
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={!linked || Boolean(checking) || sending}
                    title={linked ? "Remove numbers that have no WhatsApp" : "Link your WhatsApp first"}
                    onClick={() => void checkNumbers()}
                  >
                    {checking ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-1 h-3.5 w-3.5" />}
                    {checking ? `Checking ${checking.done}/${checking.total}` : "Check WhatsApp"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-destructive"
                    disabled={Boolean(checking)}
                    onClick={() => setContacts([])}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear all
                  </Button>
                </div>
              )
            }
          />
          <input
            ref={excelRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onExcel(f);
              e.target.value = "";
            }}
          />
          <div className={cn("grid gap-2", showCustomerMaster && "sm:grid-cols-2")}>
            {showCustomerMaster && (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition hover:border-emerald-300 hover:bg-emerald-50/50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                  <Users className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-800">Customer Master</span>
                  <span className="block text-[11px] text-slate-500">Pick your saved customers, or select all</span>
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => excelRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition hover:border-emerald-300 hover:bg-emerald-50/50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <FileSpreadsheet className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-800">Import Excel / CSV</span>
                <span className="block text-[11px] text-slate-500">A Mobile column (and Name for {"{name}"})</span>
              </span>
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Duplicate numbers are removed automatically.
            {optOuts.data ? ` ${optOuts.data.toLocaleString("en-IN")} unsubscribed ${optOuts.data === 1 ? "customer is" : "customers are"} always left out.` : ""}
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Or type numbers, one per line (name optional)</Label>
            <Textarea
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              rows={3}
              className="no-uppercase text-sm"
              placeholder={"9876543210\nRavi 9123456789"}
            />
            <Button type="button" size="sm" variant="secondary" onClick={onTypedAdd} disabled={!typed.trim()}>
              <Plus className="mr-1 h-4 w-4" /> Add numbers
            </Button>
          </div>
          {contacts.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="sticky top-0 bg-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="w-10 px-2 py-1.5">#</th>
                    <th className="px-2 py-1.5">Mobile</th>
                    <th className="px-2 py-1.5">Name</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {contacts.slice(0, SHOWN_CONTACTS).map((c, i) => (
                    <tr key={c.phone} className="hover:bg-slate-50">
                      <td className="px-2 py-1.5 tabular-nums text-slate-400">{i + 1}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-slate-800">{formatBulkPhone(c.phone)}</td>
                      <td className="max-w-[160px] truncate px-2 py-1.5 text-slate-600">{c.name ?? ""}</td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          className="text-slate-400 hover:text-destructive"
                          title="Remove"
                          onClick={() => setContacts(contacts.filter((x) => x.phone !== c.phone))}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {contacts.length > SHOWN_CONTACTS && (
                <div className="border-t px-2 py-1.5 text-xs text-slate-500">
                  and {(contacts.length - SHOWN_CONTACTS).toLocaleString("en-IN")} more
                </div>
              )}
            </div>
          )}
        </section>
      </div>

        <aside className={cn("space-y-3 lg:sticky", previewTopClass)}>
          <MessagePreview
            text={preview}
            mediaName={attachment?.name ?? null}
            mediaPreview={mediaPreview ?? (savedMedia?.type.startsWith("image/") ? savedMedia.url : null)}
          />

          <div className="space-y-2.5 rounded-xl border border-emerald-200 bg-white p-3 shadow-sm">
            <div className="text-sm">
              {!linked ? (
                <span className="font-medium text-amber-700">Link your WhatsApp above first</span>
              ) : contacts.length ? (
                <span className="text-slate-700">
                  <b className="tabular-nums">{contacts.length.toLocaleString("en-IN")}</b> numbers · about{" "}
                  <b className="tabular-nums">{estimateBulkMinutes(contacts.length)}</b> min
                </span>
              ) : (
                <span className="text-slate-500">Add numbers to send</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-xs font-medium">
              {([false, true] as const).map((later) => (
                <button
                  key={String(later)}
                  type="button"
                  onClick={() => {
                    setScheduleOn(later);
                    if (later && !sendAt) setSendAt(localInput(new Date(Date.now() + 60 * 60 * 1000)));
                  }}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md py-1.5 transition",
                    scheduleOn === later ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800",
                  )}
                >
                  {later ? <CalendarClock className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                  {later ? "Schedule" : "Send now"}
                </button>
              ))}
            </div>
            {scheduleOn && (
              <div className="space-y-1">
                <Input
                  type="datetime-local"
                  value={sendAt}
                  min={localInput(new Date(Date.now() + 5 * 60 * 1000))}
                  max={localInput(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000))}
                  onChange={(e) => setSendAt(e.target.value)}
                  className="h-9 text-sm"
                />
                <p className={cn("text-[11px]", scheduleOk ? "text-slate-500" : "text-red-600")}>
                  {scheduleOk ? "Starts by itself at this time, up to 14 days ahead. Keep your phone online." : "Pick a time later than now"}
                </p>
              </div>
            )}
            <Button
              type="button"
              className="h-10 w-full bg-gradient-to-r from-emerald-600 to-teal-600 px-5 text-white shadow-sm hover:from-emerald-700 hover:to-teal-700"
              disabled={!canSend}
              onClick={() => setConfirmOpen(true)}
            >
              {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : scheduleOn ? <CalendarClock className="mr-1.5 h-4 w-4" /> : <Send className="mr-1.5 h-4 w-4" />}
              {scheduleOn ? "Schedule for" : "Send to"} {contacts.length.toLocaleString("en-IN")} numbers
            </Button>
          </div>

          <Alert className="border-amber-200 bg-amber-50">
            <ShieldAlert className="h-4 w-4 text-amber-700" />
            <AlertDescription className="text-xs text-amber-900">
              Messages go one by one with a random 8 to 20 second gap, up to 500 per number per day (the rest continue
              the next day). WhatsApp may block numbers that send bulk messages, especially to people who have not saved
              your number.
            </AlertDescription>
          </Alert>
        </aside>
      </div>
      </>
      )}

      {view !== "send" && (
        <BulkWhatsAppReport organizationId={orgId} userId={userId} fullPage={view === "reports"} onReuse={reuse} />
      )}

      {showCustomerMaster && (
        <CustomerMasterPicker
          organizationId={orgId}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onAdd={(picked) => addContacts(picked, 0, "Customer Master")}
        />
      )}

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !sending && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {scheduleTime ? `Schedule for ${contacts.length} numbers?` : `Send to ${contacts.length} numbers?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {scheduleTime ? `Starts ${format(scheduleTime, "dd MMM yyyy, hh:mm a")} and takes` : "This takes"} about{" "}
              {estimateBulkMinutes(contacts.length)} minutes. It keeps sending even if you close this page or the browser.
              You can pause or stop it from the delivery report.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={sending}
              onClick={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              {sending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              {scheduleTime ? "Schedule" : "Start sending"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StepTitle({ step, title, hint, action }: { step: number; title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-xs font-bold text-white shadow-sm">
          {step}
        </span>
        <div>
          <div className="text-base font-semibold leading-tight text-slate-900">{title}</div>
          <div className="text-[11px] text-slate-500">{hint}</div>
        </div>
      </div>
      {action}
    </div>
  );
}

const LINK_FIELDS: { key: keyof BulkLinks; label: string; placeholder: string; icon: ReactNode; tone: string }[] = [
  { key: "call", label: "Call now", placeholder: "Shop mobile, e.g. 9876543210", icon: <Phone className="h-3.5 w-3.5" />, tone: "bg-sky-100 text-sky-700" },
  { key: "enquire", label: "Enquire now", placeholder: "WhatsApp number for enquiries", icon: <MessageCircle className="h-3.5 w-3.5" />, tone: "bg-emerald-100 text-emerald-700" },
  { key: "location", label: "Shop location", placeholder: "Google Maps link or shop address", icon: <MapPin className="h-3.5 w-3.5" />, tone: "bg-red-100 text-red-700" },
  { key: "instagram", label: "Instagram", placeholder: "@yourshop or Instagram link", icon: <Instagram className="h-3.5 w-3.5" />, tone: "bg-pink-100 text-pink-700" },
];

/** Call / enquire / location / Instagram lines added under the message (filled ones only). */
function LinksEditor({ links, onChange }: { links: BulkLinks; onChange: (next: BulkLinks) => void }) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
      <div>
        <div className="text-xs font-semibold text-slate-700">Buttons and links (optional)</div>
        <p className="text-[11px] text-slate-500">
          Filled ones are added under the message as links customers can tap. WhatsApp does not allow real buttons on
          numbers linked by QR code.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {LINK_FIELDS.map((f) => (
          <div key={f.key} className="space-y-1">
            <Label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
              <span className={cn("flex h-5 w-5 items-center justify-center rounded-md", f.tone)}>{f.icon}</span>
              {f.label}
            </Label>
            <div className="relative">
              <Input
                value={links[f.key]}
                onChange={(e) => onChange({ ...links, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                maxLength={300}
                className="no-uppercase h-8 pr-7 text-xs"
              />
              {links[f.key] && (
                <button
                  type="button"
                  title="Clear"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  onClick={() => onChange({ ...links, [f.key]: "" })}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** WhatsApp-style chat preview of the first customer's message. */
function MessagePreview({ text, mediaName, mediaPreview }: { text: string; mediaName: string | null; mediaPreview: string | null }) {
  const empty = !text.trim() && !mediaName;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 bg-[#075e54] px-3 py-2 text-white">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
          <Users className="h-4 w-4" />
        </span>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Preview</div>
          <div className="text-[10px] text-white/75">How the first customer sees it</div>
        </div>
      </div>
      <div className="min-h-[220px] overflow-auto bg-[#efeae2] p-3 lg:max-h-[calc(100dvh-22rem)]">
        {empty ? (
          <p className="pt-16 text-center text-xs text-slate-500">Write a message or attach a poster to see the preview</p>
        ) : (
          <div className="ml-auto max-w-[92%] rounded-lg rounded-tr-none bg-[#d9fdd3] p-1.5 text-sm shadow-sm">
            {mediaPreview ? (
              <img src={mediaPreview} alt="" className="mb-1 w-full rounded object-cover" />
            ) : mediaName ? (
              <div className="mb-1 flex items-center gap-2 rounded bg-white/70 p-2 text-xs text-slate-700">
                <FileText className="h-5 w-5 shrink-0 text-slate-500" />
                <span className="truncate">{mediaName}</span>
              </div>
            ) : null}
            <div className="whitespace-pre-wrap break-words px-1 text-slate-800">{renderWhatsAppText(text)}</div>
            <div className="mt-0.5 flex items-center justify-end gap-1 px-1 text-[10px] text-slate-500">
              {format(new Date(), "hh:mm a")} <CheckCheck className="h-3 w-3 text-sky-500" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** *bold*, _italic_ and links shown roughly as WhatsApp shows them. */
function renderWhatsAppText(text: string): ReactNode[] {
  return text.split(/(\*[^*\n]+\*|_[^_\n]+_|https?:\/\/\S+)/g).map((part, i) => {
    if (/^\*[^*\n]+\*$/.test(part)) return <b key={i}>{part.slice(1, -1)}</b>;
    if (/^_[^_\n]+_$/.test(part)) return <i key={i}>{part.slice(1, -1)}</i>;
    if (/^https?:\/\//.test(part)) return <span key={i} className="break-all text-sky-700 underline">{part}</span>;
    return part;
  });
}
