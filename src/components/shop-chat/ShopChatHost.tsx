import { lazy, Suspense, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  openShopChat,
  shopChatDb,
  shopChatMessagesKey,
  shopChatThreadsKey,
  useShopChatPanel,
  useShopChatThreads,
  type ShopChatMessage,
} from "@/hooks/useShopChat";

const ShopChatPanel = lazy(() => import("@/components/shop-chat/ShopChatPanel"));

/**
 * Always-mounted part of the shop chat: listens for new messages (realtime), refreshes
 * the unread badge, shows a toast for a message from another shop, and renders the
 * right-side panel when it is open.
 */
export function ShopChatHost() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { open, otherOrgId } = useShopChatPanel();
  const { data: threads = [] } = useShopChatThreads();
  const hasThreads = threads.length > 0;

  // Read inside the realtime handler without re-subscribing on every change.
  const live = useRef({ open, otherOrgId, threads, userId: user?.id });
  live.current = { open, otherOrgId, threads, userId: user?.id };

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

  if (!open || !orgId) return null;
  return (
    <Suspense fallback={null}>
      <ShopChatPanel />
    </Suspense>
  );
}
