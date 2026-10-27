import { useEffect, useMemo, useRef, useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  Check,
  CheckCheck,
  Clock,
  Loader2,
  Megaphone,
  MessagesSquare,
  Plus,
  Search,
  SendHorizontal,
  Tag,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatBulkPhone } from "@/utils/bulkWhatsAppContacts";
import { describeBulkFailure } from "@/utils/bulkWhatsAppFailure";
import {
  buildChatTimeline,
  filterInboxChats,
  inboxTagList,
  inboxTagTone,
  type TickStatus,
  type TimelineCampaign,
  type TimelineItem,
} from "@/utils/bulkWhatsAppInbox";
import {
  callBulkWhatsApp,
  fetchCampaignMessage,
  fetchInboxMessages,
  fetchPhoneCampaignSends,
  fetchPhoneOptOut,
  useBulkCampaigns,
  useInboxChats,
  type BulkCampaignMessage,
  type InboxChat,
} from "./bulkWhatsAppApi";

const MEDIA_LABEL: Record<string, string> = {
  image: "📷 Photo",
  video: "🎥 Video",
  audio: "🎤 Voice message",
  document: "📄 Document",
  sticker: "Sticker",
  location: "📍 Location",
  contact: "👤 Contact",
};

const AVATAR_TONES = ["bg-emerald-500", "bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-teal-500"];
const avatarTone = (phone: string) => AVATAR_TONES[Number(phone.slice(-2)) % AVATAR_TONES.length];

const listTime = (iso: string) => {
  const d = new Date(iso);
  return isToday(d) ? format(d, "HH:mm") : isYesterday(d) ? "Yesterday" : format(d, "dd/MM/yy");
};
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  return isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "dd MMMM yyyy");
};

function Ticks({ status, error }: { status: TickStatus | "received"; error: string | null }) {
  if (status === "received") return null;
  if (status === "failed") {
    return (
      <span title={describeBulkFailure(error)?.hint ?? error ?? "Not sent"}>
        <AlertCircle className="h-3.5 w-3.5 text-red-500" />
      </span>
    );
  }
  if (status === "pending") return <Clock className="h-3 w-3 text-slate-400" />;
  if (status === "sent") return <Check className="h-3.5 w-3.5 text-slate-400" />;
  return <CheckCheck className={cn("h-3.5 w-3.5", status === "read" ? "text-[#53bdeb]" : "text-slate-400")} />;
}

function TagChip({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", inboxTagTone(tag))}>
      {tag}
      {onRemove && (
        <button type="button" onClick={onRemove} className="opacity-60 hover:opacity-100" title={`Remove ${tag}`}>
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

/**
 * Inbox for bulk messages: customers who replied to a campaign, one chat each, like WhatsApp. A chat
 * shows the campaign messages the customer got (with ticks), their replies, and the shop's answers.
 * Chats can be tagged (Interested, Follow up, …) and answered from the linked bulk number.
 */
export function BulkWhatsAppInbox({
  organizationId,
  userId,
  className,
}: {
  organizationId: string;
  userId: string | undefined;
  className?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const chatsQ = useInboxChats(organizationId, true);
  const chats = useMemo(() => chatsQ.data ?? [], [chatsQ.data]);
  const tags = useMemo(() => inboxTagList(chats), [chats]);
  const shown = useMemo(() => filterInboxChats(chats, filter, search), [chats, filter, search]);
  const unread = chats.reduce((n, c) => n + (c.unread_count > 0 ? 1 : 0), 0);
  const selected = chats.find((c) => c.id === selectedId) ?? null;

  if (chatsQ.data === null) {
    return (
      <div className={cn("flex items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center", className)}>
        <div className="max-w-sm space-y-2">
          <MessagesSquare className="mx-auto h-8 w-8 text-emerald-600" />
          <div className="font-semibold text-slate-800">Inbox is almost ready</div>
          <p className="text-sm text-slate-500">
            The Inbox needs a one-time database update. Once it is done, customer replies to your bulk messages show here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      {/* Chat list */}
      <div className={cn("flex w-full min-w-0 flex-col border-r border-slate-200 md:w-[340px] md:shrink-0", selected && "hidden md:flex")}>
        <div className="space-y-2 border-b border-slate-100 bg-slate-50/80 p-3">
          <div className="flex items-center justify-between">
            <div className="text-base font-semibold text-slate-900">Inbox</div>
            <div className="text-xs text-slate-500">
              {chats.length.toLocaleString("en-IN")} chats{unread ? ` · ${unread} unread` : ""}
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, number or message"
              className="no-uppercase h-9 bg-white pl-8"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {[
              { key: "all", label: "All" },
              { key: "unread", label: `Unread${unread ? ` (${unread})` : ""}` },
              ...tags.map((t) => ({ key: t, label: t })),
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition",
                  filter === f.key ? "bg-emerald-600 text-white" : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {chatsQ.isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : chatsQ.isError ? (
            <p className="p-6 text-center text-sm text-destructive">Could not load chats. Please try again.</p>
          ) : !shown.length ? (
            <p className="p-6 text-center text-sm text-slate-500">
              {chats.length ? "No chats here" : "No replies yet. When customers reply to your bulk messages, their chats show here."}
            </p>
          ) : (
            <ul>
              {shown.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      "flex w-full items-start gap-3 border-b border-slate-100 px-3 py-2.5 text-left transition hover:bg-slate-50",
                      c.id === selectedId && "bg-emerald-50/70 hover:bg-emerald-50",
                    )}
                  >
                    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white", avatarTone(c.phone))}>
                      {(c.name?.trim()[0] ?? "#").toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-semibold text-slate-900">{c.name || formatBulkPhone(c.phone)}</span>
                        <span className={cn("shrink-0 text-[11px]", c.unread_count ? "font-semibold text-emerald-600" : "text-slate-400")}>
                          {listTime(c.last_message_at)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        {c.last_direction === "out" && <CheckCheck className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                        <span className="min-w-0 flex-1 truncate text-[13px] text-slate-500">{c.last_message_preview ?? ""}</span>
                        {c.unread_count > 0 && (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-white">
                            {c.unread_count}
                          </span>
                        )}
                      </span>
                      {c.tags.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {c.tags.map((t) => (
                            <TagChip key={t} tag={t} />
                          ))}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Conversation */}
      <div className={cn("min-w-0 flex-1 flex-col", selected ? "flex" : "hidden md:flex")}>
        {selected ? (
          <ChatPane
            key={selected.id}
            chat={selected}
            organizationId={organizationId}
            userId={userId}
            tags={tags}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-[#f0f2f5] p-8 text-center">
            <MessagesSquare className="h-12 w-12 text-emerald-600/70" />
            <div className="text-lg font-semibold text-slate-700">Customer replies</div>
            <p className="max-w-sm text-sm text-slate-500">
              Open a chat to see the offer they got, their reply, and to answer from your linked WhatsApp.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatPane({
  chat,
  organizationId,
  userId,
  tags,
  onBack,
}: {
  chat: InboxChat;
  organizationId: string;
  userId: string | undefined;
  tags: string[];
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [newTag, setNewTag] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const canReply = chat.user_id === userId;

  const campaigns = useBulkCampaigns(organizationId).data;
  const messagesQ = useQuery({
    queryKey: ["bulk-whatsapp-inbox-messages", chat.id],
    queryFn: () => fetchInboxMessages(chat.id),
    refetchInterval: 5000,
  });
  const campaignIds = useMemo(() => (campaigns ?? []).map((c) => c.id), [campaigns]);
  const sendsQ = useQuery({
    queryKey: ["bulk-whatsapp-inbox-sends", chat.phone, campaignIds.length, campaignIds[0] ?? ""],
    queryFn: () => fetchPhoneCampaignSends(chat.phone, campaignIds),
    enabled: Boolean(campaigns),
    refetchInterval: 30000,
  });
  const optOutQ = useQuery({
    queryKey: ["bulk-whatsapp-optout", organizationId, chat.phone],
    queryFn: () => fetchPhoneOptOut(organizationId, chat.phone),
    refetchInterval: 15000,
  });
  const optOut = optOutQ.data ?? null;
  const [blocking, setBlocking] = useState(false);
  const setBlocked = async (unsubscribe: boolean) => {
    setBlocking(true);
    try {
      await callBulkWhatsApp(organizationId, "inbox-optout", { chatId: chat.id, unsubscribe });
      toast.success(unsubscribe ? "Blocked: no more bulk messages go to this number" : "Unblocked: this number gets bulk messages again");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBlocking(false);
      void queryClient.invalidateQueries({ queryKey: ["bulk-whatsapp-optout", organizationId, chat.phone] });
      void queryClient.invalidateQueries({ queryKey: ["bulk-whatsapp-optouts", organizationId] });
    }
  };
  const sentCampaignIds = useMemo(() => [...new Set((sendsQ.data ?? []).map((s) => s.campaign_id))], [sendsQ.data]);
  const bodies = useQueries({
    queries: sentCampaignIds.map((id) => ({
      queryKey: ["bulk-whatsapp-message", id],
      queryFn: () => fetchCampaignMessage(id),
      staleTime: Infinity,
    })),
  });
  const bodiesKey = bodies.map((b) => (b.data ? "1" : "0")).join("");
  const campaignMap = useMemo(() => {
    const map = new Map<string, TimelineCampaign>();
    sentCampaignIds.forEach((id, i) => {
      const c = campaigns?.find((x) => x.id === id);
      const body = bodies[i]?.data as BulkCampaignMessage | null | undefined;
      if (c) map.set(id, { name: c.name, created_at: c.created_at, message: body?.message ?? "", media_url: body?.media_url ?? null, media_type: body?.media_type ?? null });
    });
    return map;
    // bodiesKey stands for the loaded campaign texts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentCampaignIds, campaigns, bodiesKey]);
  const timeline = useMemo(
    () => buildChatTimeline(messagesQ.data ?? [], sendsQ.data ?? [], campaignMap),
    [messagesQ.data, sendsQ.data, campaignMap],
  );

  // Opening a chat marks it read.
  useEffect(() => {
    if (chat.unread_count <= 0) return;
    void callBulkWhatsApp(organizationId, "inbox-read", { chatId: chat.id })
      .then(() => queryClient.invalidateQueries({ queryKey: ["bulk-whatsapp-inbox", organizationId] }))
      .catch(() => undefined);
  }, [chat.id, chat.unread_count, organizationId, queryClient]);

  // Newest message in view; only the message list scrolls, not the page around it.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [timeline.length]);

  const saveTags = async (next: string[]) => {
    const previous = chat.tags;
    queryClient.setQueryData<InboxChat[] | null>(["bulk-whatsapp-inbox", organizationId], (old) =>
      old?.map((c) => (c.id === chat.id ? { ...c, tags: next } : c)) ?? old,
    );
    try {
      await callBulkWhatsApp(organizationId, "inbox-tags", { chatId: chat.id, tags: next });
    } catch (e) {
      queryClient.setQueryData<InboxChat[] | null>(["bulk-whatsapp-inbox", organizationId], (old) =>
        old?.map((c) => (c.id === chat.id ? { ...c, tags: previous } : c)) ?? old,
      );
      toast.error(e instanceof Error ? e.message : "Could not save the tag");
    }
  };
  const toggleTag = (tag: string) => {
    const has = chat.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
    void saveTags(has ? chat.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase()) : [...chat.tags, tag]);
  };
  const addCustomTag = () => {
    const t = newTag.trim().replace(/\s+/g, " ").slice(0, 24);
    if (!t) return;
    setNewTag("");
    if (!chat.tags.some((x) => x.toLowerCase() === t.toLowerCase())) void saveTags([...chat.tags, t]);
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await callBulkWhatsApp(organizationId, "inbox-send", { chatId: chat.id, text });
      setDraft("");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not send";
      toast.error(/not connected/i.test(message) ? "Your WhatsApp is not linked. Link it on the Send page, then reply again." : message);
    } finally {
      setSending(false);
      void queryClient.invalidateQueries({ queryKey: ["bulk-whatsapp-inbox-messages", chat.id] });
      void queryClient.invalidateQueries({ queryKey: ["bulk-whatsapp-inbox", organizationId] });
    }
  };

  let lastDay = "";
  return (
    <>
      <div className="flex items-center gap-2 border-b border-slate-200 bg-[#f0f2f5] px-3 py-2">
        <Button size="icon" variant="ghost" className="h-8 w-8 md:hidden" onClick={onBack} title="Back to chats">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white", avatarTone(chat.phone))}>
          {(chat.name?.trim()[0] ?? "#").toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-slate-900">{chat.name || formatBulkPhone(chat.phone)}</div>
          <div className="text-xs text-slate-500">{formatBulkPhone(chat.phone)}</div>
        </div>
        <div className="hidden max-w-[40%] flex-wrap justify-end gap-1 sm:flex">
          {chat.tags.map((t) => (
            <TagChip key={t} tag={t} onRemove={() => toggleTag(t)} />
          ))}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 gap-1 bg-white">
              <Tag className="h-3.5 w-3.5" /> Tag
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-60 space-y-2 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tag this customer</div>
            <div className="space-y-1">
              {tags.map((t) => {
                const on = chat.tags.some((x) => x.toLowerCase() === t.toLowerCase());
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTag(t)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded border",
                        on ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300",
                      )}
                    >
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    <TagChip tag={t} />
                  </button>
                );
              })}
            </div>
            <div className="flex gap-1.5">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustomTag()}
                placeholder="New tag"
                maxLength={24}
                className="no-uppercase h-8 text-sm"
              />
              <Button size="icon" className="h-8 w-8 shrink-0" onClick={addCustomTag} disabled={!newTag.trim()} title="Add tag">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        {!optOut && optOutQ.isSuccess && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 bg-white text-rose-700 hover:text-rose-800"
            onClick={() => void setBlocked(true)}
            disabled={blocking}
            title="Stop sending bulk messages to this number"
          >
            <Ban className="h-3.5 w-3.5" /> Block
          </Button>
        )}
      </div>
      {optOut && (
        <div className="flex items-center gap-2 border-b border-rose-100 bg-rose-50 px-3 py-1.5 text-xs text-rose-800">
          <Ban className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            {optOut.source === "manual" ? "Blocked" : "Unsubscribed (replied STOP)"} on {format(new Date(optOut.created_at), "d MMM yyyy")}.
            Bulk messages are not sent to this number.
          </span>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-rose-800" onClick={() => void setBlocked(false)} disabled={blocking}>
            Unblock
          </Button>
        </div>
      )}
      {chat.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-slate-100 bg-white px-3 py-1.5 sm:hidden">
          {chat.tags.map((t) => (
            <TagChip key={t} tag={t} onRemove={() => toggleTag(t)} />
          ))}
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-[#efeae2] px-3 py-3 sm:px-8">
        {messagesQ.isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
          </div>
        ) : (
          <div className="space-y-1.5">
            {timeline.map((item) => {
              const day = dayLabel(item.at);
              const showDay = day !== lastDay;
              lastDay = day;
              return (
                <div key={item.key}>
                  {showDay && (
                    <div className="my-2 flex justify-center">
                      <span className="rounded-md bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm">{day}</span>
                    </div>
                  )}
                  <Bubble item={item} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-[#f0f2f5] px-3 py-2">
        {canReply ? (
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              maxLength={4000}
              placeholder="Type a reply"
              className="no-uppercase max-h-32 min-h-[40px] flex-1 resize-none rounded-lg border-0 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
            <Button
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={!draft.trim() || sending}
              onClick={() => void send()}
              title="Send (Enter)"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
            </Button>
          </div>
        ) : (
          <p className="py-1.5 text-center text-xs text-slate-500">
            This customer replied to another user's WhatsApp. Only that user can answer from their number.
          </p>
        )}
      </div>
    </>
  );
}

function Bubble({ item }: { item: TimelineItem }) {
  const time = format(new Date(item.at), "HH:mm");
  if (item.kind === "campaign") {
    const isImage = item.mediaType?.startsWith("image/");
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg rounded-tr-none bg-[#d9fdd3] p-1.5 shadow-sm sm:max-w-[65%]">
          <div className="mb-1 flex items-center gap-1 px-1 text-[11px] font-semibold text-emerald-800">
            <Megaphone className="h-3 w-3" /> Campaign: {item.campaignName}
          </div>
          {isImage && item.mediaUrl && <img src={item.mediaUrl} alt="" className="mb-1 max-h-56 w-full rounded object-cover" />}
          {!isImage && item.mediaUrl && (
            <div className="mb-1 rounded bg-white/60 px-2 py-1.5 text-xs text-slate-600">
              {item.mediaType?.includes("pdf") ? "📄 PDF attached" : "🎥 Video attached"}
            </div>
          )}
          {item.text && <div className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words px-1 text-[13px] text-slate-800">{item.text}</div>}
          <div className="mt-0.5 flex items-center justify-end gap-1 px-1 text-[10px] text-slate-500">
            {time}
            <Ticks status={item.status} error={item.error} />
          </div>
        </div>
      </div>
    );
  }
  const mine = item.direction === "out";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-2.5 py-1.5 shadow-sm sm:max-w-[65%]",
          mine ? "rounded-tr-none bg-[#d9fdd3]" : "rounded-tl-none bg-white",
        )}
      >
        {item.mediaType && <div className="text-[13px] font-medium text-slate-600">{MEDIA_LABEL[item.mediaType] ?? "Attachment"}</div>}
        {item.text && <div className="whitespace-pre-wrap break-words text-sm text-slate-900">{item.text}</div>}
        {item.mediaType && !item.text && mine === false && (
          <div className="text-[11px] text-slate-400">Open WhatsApp on your phone to see it</div>
        )}
        <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-slate-500">
          {time}
          <Ticks status={item.status} error={item.error} />
        </div>
        {item.status === "failed" && <div className="text-[11px] text-red-600">Not sent{item.error ? `: ${item.error}` : ""}</div>}
      </div>
    </div>
  );
}
