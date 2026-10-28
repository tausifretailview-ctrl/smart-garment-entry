import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";

const db = supabase as any;

export type ShopChatThread = {
  organization_id: string;
  name: string;
  unread: number;
  last_body: string | null;
  last_at: string | null;
  last_from_me: boolean | null;
};

export type ShopChatMessage = {
  id: string;
  from_organization_id: string;
  to_organization_id: string;
  sender_user_id: string | null;
  sender_name: string | null;
  body: string;
  reply_to_id: string | null;
  created_at: string;
  read_at: string | null;
};

export type SiblingShop = { id: string; name: string; slug: string };

export const shopChatThreadsKey = (orgId: string | undefined) => ["shop-chat-threads", orgId] as const;
export const shopChatMessagesKey = (orgId: string | undefined, otherId: string | null) =>
  ["shop-chat-messages", orgId, otherId] as const;

/** True when the chat SQL has not been run yet (function or table missing). */
export function isShopChatNotSetUp(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  return (
    e.code === "PGRST202" ||
    e.code === "42883" ||
    e.code === "42P01" ||
    /get_shop_chat_threads|shop_chat_messages/.test(e.message ?? "")
  );
}

/** Linked shops for the current shop, with unread counts. Empty when chat SQL is missing. */
export function useShopChatThreads() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  return useQuery({
    queryKey: shopChatThreadsKey(orgId),
    enabled: !!orgId,
    staleTime: 60_000,
    // Realtime (ShopChatHost) keeps an open conversation fresh, but it only runs once this
    // list has a thread: a shop whose admin just turned chat on, or a laptop back from
    // sleep, needs the list read again. Every 3 minutes while the tab is visible, and
    // whenever the window gets focus.
    refetchInterval: 3 * 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<ShopChatThread[]> => {
      const { data, error } = await db.rpc("get_shop_chat_threads", { p_organization_id: orgId });
      if (error) {
        if (isShopChatNotSetUp(error)) return [];
        throw error;
      }
      return (data || []) as ShopChatThread[];
    },
  });
}

/** Other shops this login is admin of (same list Stock Transfer uses). Admins only. */
export function useSiblingShopsForChat() {
  const { currentOrganization, organizationRole } = useOrganization();
  const orgId = currentOrganization?.id;
  return useQuery({
    queryKey: ["sibling-shops", orgId],
    enabled: !!orgId && organizationRole === "admin",
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SiblingShop[]> => {
      const { data, error } = await db.rpc("get_sibling_shops", { p_organization_id: orgId });
      if (error) throw error;
      return (data || []) as SiblingShop[];
    },
  });
}

// --- Panel open state (shared by the header button, toasts and the panel) ---

type PanelState = { open: boolean; otherOrgId: string | null };
let panelState: PanelState = { open: false, otherOrgId: null };
const listeners = new Set<() => void>();

function setPanelState(next: PanelState) {
  panelState = next;
  listeners.forEach((l) => l());
}

/** Download the chat window code ahead of the first click, so it opens at once. */
export const loadShopChatPanel = () => import("@/components/shop-chat/ShopChatPanel");

export function openShopChat(otherOrgId: string | null = null) {
  setPanelState({ open: true, otherOrgId: otherOrgId ?? panelState.otherOrgId });
}

export function closeShopChat() {
  setPanelState({ ...panelState, open: false });
}

export function selectShopChat(otherOrgId: string | null) {
  setPanelState({ ...panelState, otherOrgId });
}

export function useShopChatPanel(): PanelState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => panelState,
    () => panelState,
  );
}

// --- Who is online per shop (Supabase realtime presence, filled by ShopChatHost) ---

let onlineByOrg: Record<string, number> = {};
const onlineListeners = new Set<() => void>();

export function setShopOnlineCount(orgId: string, count: number) {
  if ((onlineByOrg[orgId] ?? 0) === count) return;
  onlineByOrg = { ...onlineByOrg, [orgId]: count };
  onlineListeners.forEach((l) => l());
}

export function clearShopOnlineCounts() {
  onlineByOrg = {};
  onlineListeners.forEach((l) => l());
}

/** Number of other people with the app open in that shop right now. */
export function useShopOnlineCount(orgId: string): number {
  return useSyncExternalStore(
    (cb) => {
      onlineListeners.add(cb);
      return () => onlineListeners.delete(cb);
    },
    () => onlineByOrg[orgId] ?? 0,
    () => 0,
  );
}

export const shopPresenceTopic = (orgId: string) => `shop-chat-presence-${orgId}`;

export const shopChatDb = db;
