import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  clearShopOnlineCounts,
  openShopChat,
  openTeamChat,
  setShopOnlineCount,
  setTeamOnlineUsers,
  shopChatDb,
  shopPresenceTopic,
  shopChatMessagesKey,
  shopChatThreadsKey,
  teamChatMembersKey,
  teamChatMessagesKey,
  useShopChatPanel,
  useShopChatThreads,
  useTeamChatMembers,
  type ShopChatMessage,
  type TeamChatMessage,
} from "@/hooks/useShopChat";

// Bundled with the host, not lazy: a lazy chunk that never finished downloading (stale
// PWA cache after a deploy, slow network) left the window stuck on "Opening chat…".
import ShopChatPanel from "@/components/shop-chat/ShopChatPanel";

/**
 * Always-mounted part of the shop chat: listens for new messages (realtime), refreshes
 * the unread badge, shows a toast for a message from another shop or from another login
 * of this shop, and renders the right-side panel when it is open.
 */
export function ShopChatHost() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { open, otherOrgId, otherUserId } = useShopChatPanel();
  const { data: threads = [] } = useShopChatThreads();
  const { data: members = [] } = useTeamChatMembers();
  const hasThreads = threads.length > 0;
  const hasMembers = members.length > 0;

  // Read inside the realtime handlers without re-subscribing on every change.
  const live = useRef({ open, otherOrgId, otherUserId, threads, members, userId: user?.id });
  live.current = { open, otherOrgId, otherUserId, threads, members, userId: user?.id };

  useEffect(() => {
    if (!orgId || !hasThreads) return;

    const onInsert = (msg: ShopChatMessage) => {
      const otherId = msg.from_organization_id === orgId ? msg.to_organization_id : msg.from_organization_id;
      void queryClient.invalidateQueries({ queryKey: shopChatThreadsKey(orgId) });
      void queryClient.invalidateQueries({ queryKey: shopChatMessagesKey(orgId, otherId) });

      const incoming = msg.to_organization_id === orgId;
      const { open: isOpen, otherOrgId: viewing, threads: list, userId } = live.current;
      if (!incoming || msg.sender_user_id === userId) return;

      if (isOpen && viewing === otherId) {
        void shopChatDb
          .rpc("mark_shop_chat_read", { p_organization_id: orgId, p_other_organization_id: otherId })
          .then(() => queryClient.invalidateQueries({ queryKey: shopChatThreadsKey(orgId) }));
        return;
      }

      const shopName = list.find((t) => t.organization_id === otherId)?.name ?? "Other shop";
      const who = msg.sender_name ? `${msg.sender_name} · ${shopName}` : shopName;
      toast(who, {
        description: msg.body.length > 140 ? `${msg.body.slice(0, 140)}…` : msg.body,
        duration: 8000,
        action: { label: "Reply", onClick: () => openShopChat(otherId) },
      });
    };

    const channel = supabase
      .channel(`shop-chat-${orgId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "shop_chat_messages", filter: `to_organization_id=eq.${orgId}` },
        (payload) => onInsert(payload.new as ShopChatMessage),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "shop_chat_messages", filter: `from_organization_id=eq.${orgId}` },
        (payload) => onInsert(payload.new as ShopChatMessage),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "shop_chat_messages", filter: `from_organization_id=eq.${orgId}` },
        // The other shop read our messages: refresh "Seen".
        (payload) => {
          const msg = payload.new as ShopChatMessage;
          void queryClient.invalidateQueries({ queryKey: shopChatMessagesKey(orgId, msg.to_organization_id) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orgId, hasThreads, queryClient]);

  // One-to-one chat inside this shop: messages to or from this login.
  const userId = user?.id;
  useEffect(() => {
    if (!orgId || !userId || !hasMembers) return;

    const onInsert = (msg: TeamChatMessage) => {
      if (msg.organization_id !== orgId) {
        // Same login in another shop: that shop's list refreshes when it is opened.
        void queryClient.invalidateQueries({ queryKey: teamChatMembersKey(msg.organization_id) });
        return;
      }
      const otherId = msg.sender_user_id === userId ? msg.recipient_user_id : msg.sender_user_id;
      void queryClient.invalidateQueries({ queryKey: teamChatMembersKey(orgId) });
      void queryClient.invalidateQueries({ queryKey: teamChatMessagesKey(orgId, otherId) });
      if (msg.sender_user_id === userId) return;

      const { open: isOpen, otherUserId: viewing, members: list } = live.current;
      if (isOpen && viewing === otherId) {
        void shopChatDb
          .rpc("mark_team_chat_read", { p_organization_id: orgId, p_other_user_id: otherId })
          .then(() => queryClient.invalidateQueries({ queryKey: teamChatMembersKey(orgId) }));
        return;
      }

      const who = list.find((m) => m.user_id === otherId)?.name ?? msg.sender_name ?? "Shop chat";
      toast(who, {
        description: msg.body.length > 140 ? `${msg.body.slice(0, 140)}…` : msg.body,
        duration: 8000,
        action: { label: "Reply", onClick: () => openTeamChat(otherId) },
      });
    };

    const channel = supabase
      .channel(`team-chat-${orgId}-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "team_chat_messages", filter: `recipient_user_id=eq.${userId}` },
        (payload) => onInsert(payload.new as TeamChatMessage),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "team_chat_messages", filter: `sender_user_id=eq.${userId}` },
        // Sent from this login's other device (phone / another PC).
        (payload) => onInsert(payload.new as TeamChatMessage),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "team_chat_messages", filter: `sender_user_id=eq.${userId}` },
        // The other person read our messages: refresh "Seen".
        (payload) => {
          const msg = payload.new as TeamChatMessage;
          if (msg.organization_id !== orgId) return;
          void queryClient.invalidateQueries({ queryKey: teamChatMessagesKey(orgId, msg.recipient_user_id) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orgId, userId, hasMembers, queryClient]);

  // Presence: announce this login in its own shop (and see who of this shop is online),
  // and watch who is online in each linked shop.
  const userName =
    (user?.user_metadata?.full_name as string | undefined)?.trim() || user?.email?.split("@")[0] || "User";
  const linkedIds = threads.map((t) => t.organization_id).sort().join(",");
  useEffect(() => {
    if (!orgId || !userId || (!linkedIds && !hasMembers)) return;

    const own = supabase.channel(shopPresenceTopic(orgId), { config: { presence: { key: userId } } });
    own.on("presence", { event: "sync" }, () => {
      setTeamOnlineUsers(Object.keys(own.presenceState()).filter((k) => k !== userId));
    });
    own.subscribe((status) => {
      if (status === "SUBSCRIBED") void own.track({ name: userName, at: new Date().toISOString() });
    });

    const watchers = (linkedIds ? linkedIds.split(",") : []).map((otherId) => {
      const ch = supabase.channel(shopPresenceTopic(otherId));
      ch.on("presence", { event: "sync" }, () => {
        // Don't count this same login if it is also open in the other shop.
        const keys = Object.keys(ch.presenceState()).filter((k) => k !== userId);
        setShopOnlineCount(otherId, keys.length);
      }).subscribe();
      return ch;
    });

    return () => {
      void supabase.removeChannel(own);
      watchers.forEach((ch) => void supabase.removeChannel(ch));
      clearShopOnlineCounts();
      setTeamOnlineUsers([]);
    };
  }, [orgId, userId, userName, linkedIds, hasMembers]);

  if (!open || !orgId) return null;
  return <ShopChatPanel />;
}
