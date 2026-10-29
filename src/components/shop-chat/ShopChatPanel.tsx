import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isYesterday } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft, CornerUpLeft, Loader2, MessagesSquare, Send, Store, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  closeShopChat,
  notifyTeamChatRecipient,
  selectShopChat,
  selectTeamChat,
  shopChatDb,
  shopChatMessagesKey,
  shopChatThreadsKey,
  useShopChatPanel,
  useShopOnlineCount,
  useShopChatThreads,
  useSiblingShopsForChat,
  useTeamChatMembers,
  useTeamUserOnline,
  teamChatMembersKey,
  teamChatMessagesKey,
  type ShopChatMessage,
  type TeamChatMember,
  type TeamChatMessage,
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


function roleLabel(role: string) {
  if (role === "admin") return "Admin";
  if (role === "manager") return "Manager";
  return "Staff";
}

function initials(name: string) {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default function ShopChatPanel() {
  const { currentOrganization, organizationRole } = useOrganization();
  const orgId = currentOrganization?.id;
  const { otherOrgId, otherUserId } = useShopChatPanel();
  const { data: threads = [], isLoading } = useShopChatThreads();
  const { data: members = [], isLoading: membersLoading } = useTeamChatMembers();
  const { data: siblings = [] } = useSiblingShopsForChat();

  const unlinked = siblings.filter((s) => !threads.some((t) => t.organization_id === s.id));
  // With a single linked shop (and nothing else to pick), skip the list and open the chat with the typing box.
  const onlyShop = threads.length === 1 && unlinked.length === 0 && members.length === 0 ? threads[0] : null;
  const activeMember = otherUserId ? members.find((m) => m.user_id === otherUserId) ?? null : null;
  const active = activeMember ? null : threads.find((t) => t.organization_id === otherOrgId) ?? onlyShop;
  // Opened from a phone notification before the people list loaded.
  const waitingForMember = !!otherUserId && !activeMember && membersLoading;

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
      {activeMember && orgId ? (
        <TeamConversation orgId={orgId} member={activeMember} />
      ) : active && orgId ? (
        <ShopConversation
          orgId={orgId}
          otherOrgId={active.organization_id}
          otherName={active.name}
          canUnlink={organizationRole === "admin" && siblings.some((s) => s.id === active.organization_id)}
          showBack={!onlyShop}
        />
      ) : (
        <>
          <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-primary px-3 text-primary-foreground">
            <MessagesSquare className="h-5 w-5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">Shop chat</p>
              <p className="truncate text-xs font-medium text-white">{currentOrganization?.name}</p>
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
            {isLoading || membersLoading || waitingForMember ? (
              <div className="flex justify-center p-6">
                <Loader2 className="h-5 w-5 animate-spin text-slate-600 dark:text-slate-300" />
              </div>
            ) : (
              <>
                {(members.length > 0 || threads.length > 0) && (
                  <p className="border-b bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                    Tap a name to open the chat and type a message
                  </p>
                )}

                {members.length > 0 && <SectionLabel>In this shop</SectionLabel>}
                {members.map((m) => (
                  <MemberRow key={m.user_id} member={m} />
                ))}

                {threads.length > 0 && <SectionLabel>Other shops</SectionLabel>}
                {threads.map((t) => (
                  <button
                    key={t.organization_id}
                    type="button"
                    onClick={() => selectShopChat(t.organization_id)}
                    className="flex w-full items-center gap-3 border-b px-3 py-3 text-left hover:bg-muted/60"
                  >
                    <ShopListAvatar orgId={t.organization_id} />
                    <ListText
                      title={t.name}
                      at={t.last_at}
                      body={t.last_body}
                      fromMe={t.last_from_me}
                      unread={t.unread}
                    />
                  </button>
                ))}

                {threads.length === 0 && unlinked.length === 0 && members.length === 0 && (
                  <p className="p-6 text-center text-sm text-slate-600 dark:text-slate-300">
                    No one to chat with yet. Add users to this shop in Settings → Users, or ask your admin to turn on chat
                    with your other shop.
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

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="border-b px-3 pb-1 pt-2.5 text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-300">
      {children}
    </p>
  );
}

function ListText({
  title,
  tag,
  at,
  body,
  fromMe,
  unread,
}: {
  title: string;
  tag?: string;
  at: string | null;
  body: string | null;
  fromMe: boolean | null;
  unread: number;
}) {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex items-baseline gap-2">
        <span className="truncate text-sm font-bold text-slate-900 dark:text-slate-50">{title}</span>
        {tag && (
          <span className="shrink-0 rounded bg-slate-100 px-1.5 text-[10px] font-semibold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {tag}
          </span>
        )}
        <span className="ml-auto shrink-0 text-xs text-slate-600 dark:text-slate-300">{timeLabel(at)}</span>
      </span>
      <span className="flex items-center gap-2">
        <span className={cn("truncate text-xs", unread > 0 ? "font-semibold text-slate-900 dark:text-slate-50" : "text-slate-600 dark:text-slate-300")}>
          {body ? `${fromMe ? "You: " : ""}${body}` : "No messages yet"}
        </span>
        {unread > 0 && (
          <span className="ml-auto flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-xs font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </span>
    </span>
  );
}

function MemberRow({ member: m }: { member: TeamChatMember }) {
  const online = useTeamUserOnline(m.user_id);
  return (
    <button
      type="button"
      onClick={() => selectTeamChat(m.user_id)}
      className="flex w-full items-center gap-3 border-b px-3 py-3 text-left hover:bg-muted/60"
    >
      <PersonAvatar name={m.name} online={online} />
      <ListText
        title={m.name}
        tag={roleLabel(m.role)}
        at={m.last_at}
        body={m.last_body}
        fromMe={m.last_from_me}
        unread={m.unread}
      />
    </button>
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
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-300">Your other shops</p>
      <p className="mb-3 text-xs text-slate-600 dark:text-slate-300">
        Turn on chat to let staff of both shops message each other.
      </p>
      <div className="space-y-2">
        {shops.map((s) => (
          <div key={s.id} className="flex items-center gap-2 rounded-md border p-2">
            <Store className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-300" />
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

/** One message as the conversation view shows it (shop chat and in-shop chat alike). */
type ChatLine = {
  id: string;
  sender_name: string | null;
  body: string;
  reply_to_id: string | null;
  created_at: string;
  read_at: string | null;
  mine: boolean;
};

const SHOP_MSG_COLUMNS =
  "id, from_organization_id, to_organization_id, sender_user_id, sender_name, body, reply_to_id, created_at, read_at";
const TEAM_MSG_COLUMNS =
  "id, organization_id, sender_user_id, recipient_user_id, sender_name, body, reply_to_id, created_at, read_at";

function ShopConversation({
  orgId,
  otherOrgId,
  otherName,
  canUnlink,
  showBack,
}: {
  orgId: string;
  otherOrgId: string;
  otherName: string;
  canUnlink: boolean;
  showBack: boolean;
}) {
  const online = useShopOnlineCount(otherOrgId);
  const queryClient = useQueryClient();
  const toLine = (m: ShopChatMessage): ChatLine => ({ ...m, mine: m.from_organization_id === orgId });

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

  return (
    <Conversation
      conversationKey={otherOrgId}
      title={otherName}
      status={online > 0 ? (online > 1 ? `Online · ${online} users` : "Online") : "Offline"}
      avatar={<ShopAvatar online={online > 0} onPrimary />}
      onBack={showBack ? () => selectShopChat(null) : undefined}
      backLabel="All chats"
      listKey={shopChatThreadsKey(orgId)}
      messagesKey={shopChatMessagesKey(orgId, otherOrgId)}
      fetchMessages={async () => {
        const { data, error } = await shopChatDb
          .from("shop_chat_messages")
          .select(SHOP_MSG_COLUMNS)
          .or(
            `and(from_organization_id.eq.${orgId},to_organization_id.eq.${otherOrgId}),and(from_organization_id.eq.${otherOrgId},to_organization_id.eq.${orgId})`,
          )
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        return ((data || []) as ShopChatMessage[]).reverse().map(toLine);
      }}
      markRead={() =>
        shopChatDb.rpc("mark_shop_chat_read", { p_organization_id: orgId, p_other_organization_id: otherOrgId })
      }
      sendMessage={async (body, replyToId) => {
        const { data, error } = await shopChatDb.rpc("send_shop_chat_message", {
          p_from_organization_id: orgId,
          p_to_organization_id: otherOrgId,
          p_body: body,
          p_reply_to_id: replyToId,
        });
        if (error) throw error;
        return data ? toLine(data as ShopChatMessage) : null;
      }}
      headerExtra={
        canUnlink && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-white hover:bg-primary-foreground/15 hover:text-primary-foreground"
            disabled={unlink.isPending}
            onClick={() => {
              if (window.confirm(`Turn off chat with ${otherName}? Staff of both shops will stop seeing this chat.`)) {
                unlink.mutate();
              }
            }}
          >
            Turn off
          </Button>
        )
      }
    />
  );
}

function TeamConversation({ orgId, member }: { orgId: string; member: TeamChatMember }) {
  const { user } = useAuth();
  const userId = user?.id;
  const online = useTeamUserOnline(member.user_id);
  const otherId = member.user_id;
  const toLine = (m: TeamChatMessage): ChatLine => ({ ...m, mine: m.sender_user_id === userId });

  return (
    <Conversation
      conversationKey={otherId}
      title={member.name}
      status={`${roleLabel(member.role)} · ${online ? "Online" : "Offline"}`}
      avatar={<PersonAvatar name={member.name} online={online} onPrimary />}
      onBack={() => selectTeamChat(null)}
      backLabel="All chats"
      listKey={teamChatMembersKey(orgId)}
      messagesKey={teamChatMessagesKey(orgId, otherId)}
      fetchMessages={async () => {
        const { data, error } = await shopChatDb
          .from("team_chat_messages")
          .select(TEAM_MSG_COLUMNS)
          .eq("organization_id", orgId)
          .or(
            `and(sender_user_id.eq.${userId},recipient_user_id.eq.${otherId}),and(sender_user_id.eq.${otherId},recipient_user_id.eq.${userId})`,
          )
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        return ((data || []) as TeamChatMessage[]).reverse().map(toLine);
      }}
      markRead={() => shopChatDb.rpc("mark_team_chat_read", { p_organization_id: orgId, p_other_user_id: otherId })}
      sendMessage={async (body, replyToId) => {
        const { data, error } = await shopChatDb.rpc("send_team_chat_message", {
          p_organization_id: orgId,
          p_recipient_user_id: otherId,
          p_body: body,
          p_reply_to_id: replyToId,
        });
        if (error) throw error;
        const row = data as TeamChatMessage | null;
        // Rings the owner's phone when they are out of the shop (Android app with alerts on).
        if (row?.id) notifyTeamChatRecipient(orgId, row);
        return row ? toLine(row) : null;
      }}
    />
  );
}

function Conversation({
  conversationKey,
  title,
  status,
  avatar,
  onBack,
  backLabel,
  headerExtra,
  listKey,
  messagesKey,
  fetchMessages,
  markRead,
  sendMessage,
}: {
  conversationKey: string;
  title: string;
  status: string;
  avatar: ReactNode;
  onBack?: () => void;
  backLabel: string;
  headerExtra?: ReactNode;
  listKey: readonly unknown[];
  messagesKey: readonly unknown[];
  fetchMessages: () => Promise<ChatLine[]>;
  markRead: () => PromiseLike<unknown>;
  sendMessage: (body: string, replyToId: string | null) => Promise<ChatLine | null>;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatLine | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: messagesKey,
    staleTime: 30_000,
    // No keepPreviousData here: switching chat must not show the last chat's messages under the new name.
    placeholderData: undefined,
    queryFn: fetchMessages,
  });

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const unreadIncoming = messages.some((m) => !m.mine && !m.read_at);

  // Opening the conversation (or a new message arriving while open) marks it read.
  const markReadRef = useRef(markRead);
  markReadRef.current = markRead;
  useEffect(() => {
    if (!unreadIncoming) return;
    void Promise.resolve(markReadRef.current()).then(() => {
      void queryClient.invalidateQueries({ queryKey: listKey });
      void queryClient.invalidateQueries({ queryKey: messagesKey });
    });
    // listKey / messagesKey change with conversationKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadIncoming, conversationKey, queryClient]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [conversationKey, replyTo]);

  const send = useMutation({
    mutationFn: (body: string) => sendMessage(body, replyTo?.id ?? null),
    onSuccess: (row) => {
      setDraft("");
      setReplyTo(null);
      if (row?.id) {
        queryClient.setQueryData<ChatLine[]>(messagesKey, (old = []) =>
          old.some((m) => m.id === row.id) ? old : [...old, row],
        );
      }
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
    onError: (e: any) => toast.error(e?.message || "Message not sent"),
  });

  const submit = () => {
    const body = draft.trim();
    if (!body || send.isPending) return;
    send.mutate(body);
  };

  let lastDay = "";

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-primary px-2 text-primary-foreground">
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/15"
            onClick={onBack}
            aria-label={backLabel}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        {avatar}
        <div className="min-w-0 flex-1 pl-0.5">
          <p className="truncate text-sm font-bold leading-tight">{title}</p>
          <p className="truncate text-xs font-medium leading-tight text-white">{status}</p>
        </div>
        {headerExtra}
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

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-slate-100 px-3 py-3 dark:bg-slate-900">
        {isLoading && (
          <div className="flex justify-center p-6">
            <Loader2 className="h-5 w-5 animate-spin text-slate-600 dark:text-slate-300" />
          </div>
        )}
        {!isLoading && messages.length === 0 && (
          <p className="p-6 text-center text-sm text-slate-600 dark:text-slate-300">Say hello to {title}.</p>
        )}
        {messages.map((m) => {
          const mine = m.mine;
          const d = new Date(m.created_at);
          const day = dayLabel(d);
          const showDay = day !== lastDay;
          lastDay = day;
          const quoted = m.reply_to_id ? byId.get(m.reply_to_id) : null;
          return (
            <div key={m.id}>
              {showDay && (
                <div className="my-2 flex justify-center">
                  <span className="rounded-full bg-background px-2.5 py-0.5 text-xs text-slate-600 dark:text-slate-300 shadow-sm">
                    {day}
                  </span>
                </div>
              )}
              <div className={cn("group flex items-end gap-1", mine ? "justify-end" : "justify-start")}>
                {mine && <ReplyButton onClick={() => setReplyTo(m)} />}
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-2.5 py-1.5 text-sm shadow-sm",
                    mine
                      ? "rounded-br-sm bg-emerald-100 text-emerald-950 dark:bg-emerald-900 dark:text-emerald-50"
                      : "rounded-bl-sm border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50",
                  )}
                >
                  {m.sender_name && (
                    <p className={cn("text-xs font-semibold", mine ? "text-emerald-700 dark:text-emerald-300" : "text-primary")}>
                      {m.sender_name}
                    </p>
                  )}
                  {quoted && (
                    <div className="mb-1 rounded border-l-2 border-primary/60 bg-black/5 px-2 py-1 text-xs text-slate-600 dark:text-slate-300 dark:bg-white/10">
                      <p className="font-medium">{quoted.sender_name || "Message"}</p>
                      <p className="line-clamp-2 whitespace-pre-wrap break-words">{quoted.body}</p>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">{m.body}</p>
                  <p className="mt-0.5 text-right text-[11px] text-slate-600 dark:text-slate-300">
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
              <p className="line-clamp-2 whitespace-pre-wrap break-words text-slate-600 dark:text-slate-300">{replyTo.body}</p>
            </div>
            <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="text-slate-600 dark:text-slate-300 hover:text-foreground">
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
            placeholder={`Message ${title}`}
            className="max-h-32 min-h-[44px] flex-1 resize-none border-slate-300 bg-white text-[15px] no-uppercase normal-case text-slate-900 placeholder:normal-case placeholder:text-slate-500 dark:bg-slate-800 dark:text-slate-50"
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
      className="mb-1 rounded-full p-1 text-slate-600 dark:text-slate-300 opacity-60 hover:bg-background hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100"
      aria-label="Reply"
      title="Reply"
    >
      <CornerUpLeft className="h-3.5 w-3.5" />
    </button>
  );
}

function ShopAvatar({ online, onPrimary = false }: { online: boolean; onPrimary?: boolean }) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full",
        onPrimary ? "h-8 w-8 bg-primary-foreground/15" : "h-10 w-10 bg-primary/10 text-primary",
      )}
    >
      <Store className={onPrimary ? "h-4 w-4" : "h-5 w-5"} />
      {online && (
        <span
          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-500"
          aria-label="Online"
        />
      )}
    </span>
  );
}

function ShopListAvatar({ orgId }: { orgId: string }) {
  const online = useShopOnlineCount(orgId);
  return <ShopAvatar online={online > 0} />;
}

function PersonAvatar({ name, online, onPrimary = false }: { name: string; online: boolean; onPrimary?: boolean }) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full font-bold",
        onPrimary ? "h-8 w-8 bg-primary-foreground/15 text-xs" : "h-10 w-10 bg-emerald-600/10 text-sm text-emerald-700 dark:text-emerald-300",
      )}
    >
      {initials(name)}
      {online && (
        <span
          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-500"
          aria-label="Online"
        />
      )}
    </span>
  );
}
