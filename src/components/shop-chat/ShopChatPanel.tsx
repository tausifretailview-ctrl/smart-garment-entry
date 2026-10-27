import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isYesterday } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft, CornerUpLeft, Loader2, MessagesSquare, Send, Store, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  closeShopChat,
  selectShopChat,
  shopChatDb,
  shopChatMessagesKey,
  shopChatThreadsKey,
  useShopChatPanel,
  useShopChatThreads,
  useSiblingShopsForChat,
  type ShopChatMessage,
} from "@/hooks/useShopChat";

function timeLabel(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "dd MMM");
}

function dayLabel(d: Date) {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "dd MMM yyyy");
}

export default function ShopChatPanel() {
  const { currentOrganization, organizationRole } = useOrganization();
  const orgId = currentOrganization?.id;
  const { otherOrgId } = useShopChatPanel();
  const { data: threads = [], isLoading } = useShopChatThreads();
  const { data: siblings = [] } = useSiblingShopsForChat();

  const active = threads.find((t) => t.organization_id === otherOrgId) ?? null;

  const unlinked = siblings.filter((s) => !threads.some((t) => t.organization_id === s.id));

  return (
    <aside
      className={cn(
        "fixed z-[60] flex flex-col overflow-hidden bg-background shadow-2xl",
        // Phone: full screen. Wider screens: small window in the bottom-right corner, above the status bar.
        "inset-0 h-[var(--ezzy-viewport-h,100dvh)]",
        "sm:inset-auto sm:bottom-12 sm:right-4 sm:h-[480px] sm:max-h-[calc(100dvh-7rem)] sm:w-[340px] sm:rounded-xl sm:border",
      )}
      role="complementary"
      aria-label="Shop chat"
    >
      {active && orgId ? (
        <Conversation
          orgId={orgId}
          otherOrgId={active.organization_id}
          otherName={active.name}
          canUnlink={organizationRole === "admin" && siblings.some((s) => s.id === active.organization_id)}
        />
      ) : (
        <>
          <header className="flex h-14 sm:h-12 shrink-0 items-center gap-2 border-b bg-primary px-3 text-primary-foreground">
            <MessagesSquare className="h-5 w-5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">Shop chat</p>
              <p className="truncate text-[11px] opacity-80">{currentOrganization?.name}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/15"
              onClick={closeShopChat}
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </Button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center p-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {threads.map((t) => (
                  <button
                    key={t.organization_id}
                    type="button"
                    onClick={() => selectShopChat(t.organization_id)}
                    className="flex w-full items-center gap-3 border-b px-3 py-3 text-left hover:bg-muted/60"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Store className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-sm font-semibold">{t.name}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{timeLabel(t.last_at)}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={cn("truncate text-xs", t.unread > 0 ? "font-medium text-foreground" : "text-muted-foreground")}>
                          {t.last_body ? `${t.last_from_me ? "You: " : ""}${t.last_body}` : "No messages yet"}
                        </span>
                        {t.unread > 0 && (
                          <span className="ml-auto flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[11px] font-bold text-white">
                            {t.unread > 99 ? "99+" : t.unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                ))}

                {threads.length === 0 && unlinked.length === 0 && (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    No shop is linked for chat yet. Ask your admin to turn on chat with your other shop.
                  </p>
                )}

                {unlinked.length > 0 && orgId && <LinkShops orgId={orgId} shops={unlinked} />}
              </>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

function LinkShops({ orgId, shops }: { orgId: string; shops: { id: string; name: string }[] }) {
  const queryClient = useQueryClient();
  const link = useMutation({
    mutationFn: async (otherId: string) => {
      const { error } = await shopChatDb.rpc("set_shop_chat_link", {
        p_organization_id: orgId,
        p_other_organization_id: otherId,
        p_enabled: true,
      });
      if (error) throw error;
      return otherId;
    },
    onSuccess: async (otherId) => {
      await queryClient.invalidateQueries({ queryKey: shopChatThreadsKey(orgId) });
      selectShopChat(otherId);
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? "");
      toast.error(
        /set_shop_chat_link|PGRST202/.test(msg) || e?.code === "PGRST202"
          ? "Shop chat is not set up yet. Run the shop chat SQL first."
          : msg || "Could not turn on chat",
      );
    },
  });

  return (
    <div className="p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Your other shops</p>
      <p className="mb-3 text-xs text-muted-foreground">
        Turn on chat to let staff of both shops message each other.
      </p>
      <div className="space-y-2">
        {shops.map((s) => (
          <div key={s.id} className="flex items-center gap-2 rounded-md border p-2">
            <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
            <Button size="sm" variant="outline" disabled={link.isPending} onClick={() => link.mutate(s.id)}>
              Turn on chat
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Conversation({
  orgId,
  otherOrgId,
  otherName,
  canUnlink,
}: {
  orgId: string;
  otherOrgId: string;
  otherName: string;
  canUnlink: boolean;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ShopChatMessage | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: shopChatMessagesKey(orgId, otherOrgId),
    staleTime: 30_000,
    queryFn: async (): Promise<ShopChatMessage[]> => {
      const { data, error } = await shopChatDb
        .from("shop_chat_messages")
        .select("id, from_organization_id, to_organization_id, sender_user_id, sender_name, body, reply_to_id, created_at, read_at")
        .or(
          `and(from_organization_id.eq.${orgId},to_organization_id.eq.${otherOrgId}),and(from_organization_id.eq.${otherOrgId},to_organization_id.eq.${orgId})`,
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return ((data || []) as ShopChatMessage[]).reverse();
    },
  });

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const unreadIncoming = messages.some((m) => m.to_organization_id === orgId && !m.read_at);

  // Opening the conversation (or a new message arriving while open) marks it read.
  useEffect(() => {
    if (!unreadIncoming) return;
    void shopChatDb
      .rpc("mark_shop_chat_read", { p_organization_id: orgId, p_other_organization_id: otherOrgId })
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: shopChatThreadsKey(orgId) });
        void queryClient.invalidateQueries({ queryKey: shopChatMessagesKey(orgId, otherOrgId) });
      });
  }, [unreadIncoming, orgId, otherOrgId, queryClient]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [otherOrgId, replyTo]);

  const send = useMutation({
    mutationFn: async (body: string) => {
      const { data, error } = await shopChatDb.rpc("send_shop_chat_message", {
        p_from_organization_id: orgId,
        p_to_organization_id: otherOrgId,
        p_body: body,
        p_reply_to_id: replyTo?.id ?? null,
      });
      if (error) throw error;
      return data as ShopChatMessage;
    },
    onSuccess: (row) => {
      setDraft("");
      setReplyTo(null);
      if (row?.id) {
        queryClient.setQueryData<ShopChatMessage[]>(shopChatMessagesKey(orgId, otherOrgId), (old = []) =>
          old.some((m) => m.id === row.id) ? old : [...old, row],
        );
      }
      void queryClient.invalidateQueries({ queryKey: shopChatThreadsKey(orgId) });
    },
    onError: (e: any) => toast.error(e?.message || "Message not sent"),
  });

  const unlink = useMutation({
    mutationFn: async () => {
      const { error } = await shopChatDb.rpc("set_shop_chat_link", {
        p_organization_id: orgId,
        p_other_organization_id: otherOrgId,
        p_enabled: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      selectShopChat(null);
      void queryClient.invalidateQueries({ queryKey: shopChatThreadsKey(orgId) });
    },
    onError: (e: any) => toast.error(e?.message || "Could not turn off chat"),
  });

  const submit = () => {
    const body = draft.trim();
    if (!body || send.isPending) return;
    send.mutate(body);
  };

  let lastDay = "";

  return (
    <>
      <header className="flex h-14 sm:h-12 shrink-0 items-center gap-2 border-b bg-primary px-2 text-primary-foreground">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/15"
          onClick={() => selectShopChat(null)}
          aria-label="All shops"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
          <Store className="h-4 w-4" />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{otherName}</p>
        {canUnlink && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-primary-foreground/80 hover:bg-primary-foreground/15 hover:text-primary-foreground"
            disabled={unlink.isPending}
            onClick={() => {
              if (window.confirm(`Turn off chat with ${otherName}? Staff of both shops will stop seeing this chat.`)) {
                unlink.mutate();
              }
            }}
          >
            Turn off
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/15"
          onClick={closeShopChat}
          aria-label="Close chat"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-muted/40 px-3 py-3">
        {isLoading && (
          <div className="flex justify-center p-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!isLoading && messages.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">Say hello to {otherName}.</p>
        )}
        {messages.map((m) => {
          const mine = m.from_organization_id === orgId;
          const d = new Date(m.created_at);
          const day = dayLabel(d);
          const showDay = day !== lastDay;
          lastDay = day;
          const quoted = m.reply_to_id ? byId.get(m.reply_to_id) : null;
          return (
            <div key={m.id}>
              {showDay && (
                <div className="my-2 flex justify-center">
                  <span className="rounded-full bg-background px-2.5 py-0.5 text-[11px] text-muted-foreground shadow-sm">
                    {day}
                  </span>
                </div>
              )}
              <div className={cn("group flex items-end gap-1", mine ? "justify-end" : "justify-start")}>
                {mine && <ReplyButton onClick={() => setReplyTo(m)} />}
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-2.5 py-1.5 text-sm shadow-sm",
                    mine ? "rounded-br-sm bg-emerald-100 text-emerald-950 dark:bg-emerald-900 dark:text-emerald-50" : "rounded-bl-sm bg-background",
                  )}
                >
                  {m.sender_name && (
                    <p className={cn("text-[11px] font-semibold", mine ? "text-emerald-700 dark:text-emerald-300" : "text-primary")}>
                      {m.sender_name}
                    </p>
                  )}
                  {quoted && (
                    <div className="mb-1 rounded border-l-2 border-primary/60 bg-black/5 px-2 py-1 text-xs text-muted-foreground dark:bg-white/10">
                      <p className="font-medium">{quoted.sender_name || "Message"}</p>
                      <p className="line-clamp-2 whitespace-pre-wrap break-words">{quoted.body}</p>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className="mt-0.5 text-right text-[10px] text-muted-foreground">
                    {format(d, "h:mm a")}
                    {mine && m.read_at && <span className="ml-1">· Seen</span>}
                  </p>
                </div>
                {!mine && <ReplyButton onClick={() => setReplyTo(m)} />}
              </div>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 border-t bg-background p-2">
        {replyTo && (
          <div className="mb-2 flex items-start gap-2 rounded-md border-l-2 border-primary bg-muted px-2 py-1.5 text-xs">
            <div className="min-w-0 flex-1">
              <p className="font-medium">Replying to {replyTo.sender_name || "message"}</p>
              <p className="line-clamp-2 whitespace-pre-wrap break-words text-muted-foreground">{replyTo.body}</p>
            </div>
            <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            value={draft}
            maxLength={2000}
            rows={1}
            placeholder={`Message ${otherName}`}
            className="max-h-32 min-h-[40px] flex-1 resize-none"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Keep POS / app shortcuts from firing while typing here.
              e.stopPropagation();
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
              if (e.key === "Escape") {
                if (replyTo) setReplyTo(null);
                else closeShopChat();
              }
            }}
          />
          <Button size="icon" className="h-10 w-10 shrink-0" onClick={submit} disabled={!draft.trim() || send.isPending} aria-label="Send">
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </>
  );
}

function ReplyButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-1 rounded-full p-1 text-muted-foreground opacity-60 hover:bg-background hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100"
      aria-label="Reply"
      title="Reply"
    >
      <CornerUpLeft className="h-3.5 w-3.5" />
    </button>
  );
}
