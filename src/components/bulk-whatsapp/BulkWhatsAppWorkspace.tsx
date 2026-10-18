import { useMemo, useRef, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, FileSpreadsheet, ImagePlus, Loader2, MessagesSquare, Plus, Send, ShieldAlert, Trash2, Users, X } from "lucide-react";
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
import { callBulkWhatsApp, fetchOptOutCount } from "./bulkWhatsAppApi";
import { CustomerMasterPicker } from "./CustomerMasterPicker";
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
/** Added under the message so customers know how to stop bulk messages (STOP is handled by the WhatsApp server). */
const STOP_LINE = "Reply STOP to stop these messages";

/**
 * The whole Bulk WhatsApp screen: link, compose, numbers, send and report. Used by the ERP page
 * and by the separate WhatsApp-only site (which has no Customer Master).
 */
export function BulkWhatsAppWorkspace({
  organizationId: orgId,
  userId,
  showCustomerMaster = true,
  showTitle = true,
}: {
  organizationId: string;
  userId: string | undefined;
  showCustomerMaster?: boolean;
  showTitle?: boolean;
}) {
  const queryClient = useQueryClient();

  const [linked, setLinked] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [media, setMedia] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [contacts, setContacts] = useState<BulkContact[]>([]);
  const [typed, setTyped] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [addStopLine, setAddStopLine] = useState(true);
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

  const outgoing = addStopLine ? (message.trim() ? `${message.trimEnd()}\n\n_${STOP_LINE}_` : `_${STOP_LINE}_`) : message;
  const preview = useMemo(() => fillBulkMessage(outgoing, contacts[0]?.name ?? "Ravi"), [outgoing, contacts]);
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
      const res = await callBulkWhatsApp<{ total?: number; unsubscribed?: number }>(orgId, "create", {
        name: name.trim(),
        message: outgoing,
        mediaUrl,
        mediaType: media?.type ?? null,
        mediaName: media?.name ?? null,
        recipients: contacts,
      });
      const skipped = res.unsubscribed ? ` ${res.unsubscribed} unsubscribed ${res.unsubscribed === 1 ? "number was" : "numbers were"} left out.` : "";
      toast.success(`Sending to ${res.total ?? contacts.length} numbers.${skipped} You can close this page; it keeps sending.`);
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

      <BulkWhatsAppLink organizationId={orgId} onChange={setLinked} />

      <div className="grid gap-3 lg:grid-cols-2">
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
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Poster (photo, MP4 video or PDF, optional)</Label>
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
            ) : (
              <button
                type="button"
                onClick={() => mediaRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 py-4 text-sm font-medium text-slate-500 transition hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-700"
              >
                <ImagePlus className="h-4 w-4" /> Attach poster
              </button>
            )}
          </div>
          {(message.trim() || mediaPreview) && (
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Preview</div>
              <div className="rounded-xl bg-[#efeae2] p-3">
                <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-[#d9fdd3] p-1.5 text-sm shadow-sm sm:max-w-sm">
                  {mediaPreview && <img src={mediaPreview} alt="" className="mb-1 max-h-48 w-full rounded object-cover" />}
                  <div className="whitespace-pre-wrap px-1 text-slate-800">{preview}</div>
                  <div className="mt-0.5 flex items-center justify-end gap-1 px-1 text-[10px] text-slate-500">
                    {format(new Date(), "hh:mm a")} <CheckCheck className="h-3 w-3 text-sky-500" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Step 2: numbers */}
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <StepTitle
            step={2}
            title="Numbers"
            hint={contacts.length ? `${contacts.length.toLocaleString("en-IN")} ready to send` : showCustomerMaster ? "Customer Master, Excel or type" : "Excel import or type"}
            action={
              contacts.length > 0 && (
                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => setContacts([])}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear all
                </Button>
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

      {/* Send bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-white p-3 shadow-sm">
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
        <Button
          type="button"
          className="h-10 bg-gradient-to-r from-emerald-600 to-teal-600 px-5 text-white shadow-sm hover:from-emerald-700 hover:to-teal-700"
          disabled={!canSend}
          onClick={() => setConfirmOpen(true)}
        >
          {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
          Send to {contacts.length.toLocaleString("en-IN")} numbers
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

      <BulkWhatsAppReport organizationId={orgId} userId={userId} />

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
              {sending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Start sending
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
