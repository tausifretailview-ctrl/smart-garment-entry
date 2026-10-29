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

/** Another login of the current shop (owner, manager, staff), for one-to-one chat. */
export type TeamChatMember = {
  user_id: string;
  name: string;
  role: string;
  unread: number;
  last_body: string | null;
  last_at: string | null;
  last_from_me: boolean | null;
};

export type TeamChatMessage = {
  id: string;
  organization_id: string;
  sender_user_id: string;
  recipient_user_id: string;
  sender_name: string | null;
  body: string;
  reply_to_id: string | null;
  created_at: string;
  read_at: string | null;
};

export const shopChatThreadsKey = (orgId: string | undefined) => ["shop-chat-threads", orgId] as const;
export const shopChatMessagesKey = (orgId: string | undefined, otherId: string | null) =>
  ["shop-chat-messages", orgId, otherId] as const;

export const teamChatMembersKey = (orgId: string | undefined) => ["team-chat-members", orgId] as const;
export const teamChatMessagesKey = (orgId: string | undefined, otherUserId: string | null) =>
  ["team-chat-messages", orgId, otherUserId] as const;

/** True when the chat SQL has not been run yet (function or table missing). */
export function isShopChatNotSetUp(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  return (
    e.code === "PGRST202" ||
    e.code === "42883" ||
    e.code === "42P01" ||
    /get_shop_chat_threads|shop_chat_messages|get_team_chat_members|team_chat_messages/.test(e.message ?? "")
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

/** Other logins of the current shop, with unread counts. Empty when the team chat SQL is missing. */
export function useTeamChatMembers() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  return useQuery({
    queryKey: teamChatMembersKey(orgId),
    enabled: !!orgId,
    staleTime: 60_000,
    // Same as the shop list: realtime keeps it fresh, this catches a laptop back from sleep.
    refetchInterval: 3 * 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<TeamChatMember[]> => {
      const { data, error } = await db.rpc("get_team_chat_members", { p_organization_id: orgId });
      if (error) {
        if (isShopChatNotSetUp(error)) return [];
        throw error;
      }
      return (data || []) as TeamChatMember[];
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

type PanelState = { open: boolean; otherOrgId: string | null; otherUserId: string | null };
let panelState: PanelState = { open: false, otherOrgId: null, otherUserId: null };
const listeners = new Set<() => void>();

function setPanelState(next: PanelState) {
  panelState = next;
  listeners.forEach((l) => l());
}

export function openShopChat(otherOrgId: string | null = null) {
  setPanelState(
    otherOrgId
      ? { open: true, otherOrgId, otherUserId: null }
      : { ...panelState, open: true },
  );
}

/** Open the one-to-one chat with another login of this shop. */
export function openTeamChat(otherUserId: string) {
  setPanelState({ open: true, otherOrgId: null, otherUserId });
}

export function closeShopChat() {
  setPanelState({ ...panelState, open: false });
}

export function selectShopChat(otherOrgId: string | null) {
  setPanelState({ ...panelState, otherOrgId, otherUserId: null });
}

export function selectTeamChat(otherUserId: string | null) {
  setPanelState({ ...panelState, otherOrgId: null, otherUserId });
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

// --- Who of this shop is online (same presence channel, keyed by user id) ---

let teamOnline: ReadonlySet<string> = new Set();
const teamOnlineListeners = new Set<() => void>();

export function setTeamOnlineUsers(userIds: string[]) {
  const next = new Set(userIds);
  if (next.size === teamOnline.size && userIds.every((id) => teamOnline.has(id))) return;
  teamOnline = next;
  teamOnlineListeners.forEach((l) => l());
}

/** True while that login has the app open in this shop. */
export function useTeamUserOnline(userId: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      teamOnlineListeners.add(cb);
      return () => teamOnlineListeners.delete(cb);
    },
    () => teamOnline.has(userId),
    () => false,
  );
}

export const shopPresenceTopic = (orgId: string) => `shop-chat-presence-${orgId}`;

export const shopChatDb = db;

// --- Phone push for a team chat message (owner out of the shop) ---

const PUSH_DEVICE_TTL_MS = 10 * 60_000;
const pushDeviceCache = new Map<string, { at: number; has: boolean }>();

/** Whether that login has a phone with owner alerts on (owner_push_devices). Cached 10 min. */
async function recipientHasPhone(orgId: string, userId: string): Promise<boolean> {
  const key = `${orgId}:${userId}`;
  const hit = pushDeviceCache.get(key);
  if (hit && Date.now() - hit.at < PUSH_DEVICE_TTL_MS) return hit.has;
  const { data, error } = await db
    .from("owner_push_devices")
    .select("id")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1);
  const has = !error && Array.isArray(data) && data.length > 0;
  pushDeviceCache.set(key, { at: Date.now(), has });
  return has;
}

/**
 * Fire-and-forget: ring the recipient's phone (EzzyERP Android app) for a message just sent.
 * Skipped when they have no phone registered, so most sends make no extra call.
 */
export function notifyTeamChatRecipient(orgId: string, msg: Pick<TeamChatMessage, "id" | "recipient_user_id">): void {
  void (async () => {
    try {
      if (!(await recipientHasPhone(orgId, msg.recipient_user_id))) return;
      await supabase.functions.invoke("owner-alerts", {
        body: { type: "chat", organizationId: orgId, messageId: msg.id },
      });
    } catch {
      /* a push must never affect sending */
    }
  })();
}
