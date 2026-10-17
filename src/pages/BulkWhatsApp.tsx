import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, ImagePlus, Loader2, MessagesSquare, Plus, Send, ShieldAlert, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type * as XLSXType from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
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
import { BulkWhatsAppLink } from "@/components/bulk-whatsapp/BulkWhatsAppLink";
import { BulkWhatsAppReport } from "@/components/bulk-whatsapp/BulkWhatsAppReport";
import { callBulkWhatsApp } from "@/components/bulk-whatsapp/bulkWhatsAppApi";
import {
  estimateBulkMinutes,
  fillBulkMessage,
  formatBulkPhone,
  mergeContacts,
  parseContactSheet,
  parseTypedContacts,
  type BulkContact,
} from "@/utils/bulkWhatsAppContacts";

let xlsxModulePromise: Promise<typeof XLSXType> | null = null;
const loadXlsx = (): Promise<typeof XLSXType> => (xlsxModulePromise ??= import("xlsx"));

const MAX_CONTACTS = 5000;
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;
const MEDIA_ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,application/pdf";
const SHOWN_CONTACTS = 200;

export default function BulkWhatsApp() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const queryClient = useQueryClient();

  const [linked, setLinked] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [media, setMedia] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [contacts, setContacts] = useState<BulkContact[]>([]);
  const [typed, setTyped] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
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
    if (file && file.size > MAX_MEDIA_BYTES) {
      toast.error("File is too large (max 16 MB)");
      file = null;
    }
    setMedia(file);
    setMediaPreview(file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
  };

  const insertName = () => {
    const el = messageRef.current;
    const at = el?.selectionStart ?? message.length;
    setMessage(`${message.slice(0, at)}{name}${message.slice(at)}`);
  };

  const preview = useMemo(() => fillBulkMessage(message, contacts[0]?.name ?? "Ravi"), [message, contacts]);
  const canSend = linked && contacts.length > 0 && (message.trim() !== "" || media !== null) && !sending;

  const send = async () => {
    if (!orgId) return;
    setSending(true);
    try {
      let mediaUrl: string | null = null;
      if (media) {
        const safe = media.name.replace(/[^\w.-]+/g, "_").slice(-60);
        const path = `${orgId}/${crypto.randomUUID()}-${safe}`;
        const { error } = await supabase.storage
          .from("bulk-whatsapp-media")
          .upload(path, media, { contentType: media.type, upsert: false });
        if (error) throw new Error(`Poster upload failed: ${error.message}`);
        mediaUrl = supabase.storage.from("bulk-whatsapp-media").getPublicUrl(path).data.publicUrl;
      }
      const res = await callBulkWhatsApp<{ total?: number }>(orgId, "create", {
        name: name.trim(),
        message,
        mediaUrl,
        mediaType: media?.type ?? null,
        mediaName: media?.name ?? null,
        recipients: contacts,
      });
      toast.success(`Sending to ${res.total ?? contacts.length} numbers. You can close this page; it keeps sending.`);
      setContacts([]);
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["bulk-whatsapp-campaigns", orgId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start sending");
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  };

  if (!orgId) return null;

  return (
    <div className="flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-full w-full gap-3">
      <div>
        <h1 className="text-xl font-bold text-emerald-700 tracking-tight flex items-center gap-2">
          <MessagesSquare className="h-5 w-5" /> Bulk WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground">
          Send a message and poster from your own WhatsApp to many numbers, one by one, with delivery and read report
        </p>
      </div>

      <BulkWhatsAppLink organizationId={orgId} onChange={setLinked} />

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-3 space-y-3">
          <div className="font-semibold text-sm">1. Message</div>
          <div className="space-y-1">
            <Label className="text-xs">Name for the report (optional)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Diwali offer" maxLength={120} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Message</Label>
              <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={insertName}>
                <Plus className="h-3 w-3 mr-1" /> Customer name
              </Button>
            </div>
            <Textarea
              ref={messageRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={7}
              maxLength={4000}
              placeholder={"Hi {name}, our Diwali sale starts today! Flat 30% off on all items."}
            />
            <p className="text-[11px] text-muted-foreground">
              {"{name}"} becomes each customer's name (or "Customer" when there is none). *bold* and _italic_ work like in WhatsApp.
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Poster (photo, MP4 video or PDF, optional)</Label>
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
              <div className="flex items-center gap-3 rounded-md border p-2">
                {mediaPreview ? (
                  <img src={mediaPreview} alt="Poster" className="h-20 w-20 object-cover rounded" />
                ) : (
                  <div className="h-20 w-20 rounded bg-slate-100 flex items-center justify-center text-xs text-slate-500">
                    {media.type.includes("pdf") ? "PDF" : "Video"}
                  </div>
                )}
                <div className="min-w-0 flex-1 text-sm truncate">{media.name}</div>
                <Button type="button" size="icon" variant="ghost" onClick={() => onMedia(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => mediaRef.current?.click()}>
                <ImagePlus className="h-4 w-4 mr-1" /> Attach poster
              </Button>
            )}
          </div>
          {(message.trim() || mediaPreview) && (
            <div className="rounded-lg bg-[#e7ffdb] p-2 text-sm whitespace-pre-wrap max-w-sm shadow-sm">
              {mediaPreview && <img src={mediaPreview} alt="" className="rounded mb-1 max-h-48 w-full object-cover" />}
              {preview}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-white p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-sm">2. Numbers ({contacts.length})</div>
            {contacts.length > 0 && (
              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => setContacts([])}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear all
              </Button>
            )}
          </div>
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
          <Button type="button" variant="outline" size="sm" onClick={() => excelRef.current?.click()}>
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Import Excel / CSV
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Excel with a Mobile column (and Name column if you want {"{name}"}). Duplicates are removed.
          </p>
          <div className="space-y-1">
            <Label className="text-xs">Or type numbers, one per line (name optional)</Label>
            <Textarea
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              rows={3}
              placeholder={"9876543210\nRavi 9123456789"}
            />
            <Button type="button" size="sm" variant="secondary" onClick={onTypedAdd} disabled={!typed.trim()}>
              <Plus className="h-4 w-4 mr-1" /> Add numbers
            </Button>
          </div>
          {contacts.length > 0 && (
            <div className="max-h-56 overflow-auto rounded-md border divide-y text-sm">
              {contacts.slice(0, SHOWN_CONTACTS).map((c) => (
                <div key={c.phone} className="flex items-center justify-between px-2 py-1">
                  <span className="tabular-nums">{formatBulkPhone(c.phone)}</span>
                  <span className="truncate text-muted-foreground mx-2 flex-1 text-right">{c.name ?? ""}</span>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-destructive"
                    title="Remove"
                    onClick={() => setContacts(contacts.filter((x) => x.phone !== c.phone))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {contacts.length > SHOWN_CONTACTS && (
                <div className="px-2 py-1 text-xs text-muted-foreground">
                  and {contacts.length - SHOWN_CONTACTS} more
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          className="bg-emerald-600 hover:bg-emerald-700"
          disabled={!canSend}
          onClick={() => setConfirmOpen(true)}
        >
          {sending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
          Send to {contacts.length} numbers
        </Button>
        {!linked && <span className="text-xs text-amber-700">Link your WhatsApp above first</span>}
      </div>

      <Alert className="border-amber-200 bg-amber-50">
        <ShieldAlert className="h-4 w-4 text-amber-700" />
        <AlertDescription className="text-xs text-amber-900">
          Messages go one by one with a random 8 to 20 second gap, up to 500 per number per day (the rest continue
          the next day). WhatsApp may block numbers that send bulk messages, especially to people who have not saved
          your number.
        </AlertDescription>
      </Alert>

      <BulkWhatsAppReport organizationId={orgId} userId={user?.id} />

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !sending && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send to {contacts.length} numbers?</AlertDialogTitle>
            <AlertDialogDescription>
              This takes about {estimateBulkMinutes(contacts.length)} minutes. It keeps sending even if you close this
              page or the browser. You can pause or stop it from the report below.
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
              {sending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Start sending
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
