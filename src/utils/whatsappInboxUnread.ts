import { supabase } from '@/integrations/supabase/client';

/** Customer reply types from WhatsApp webhook — excludes outbound/sent rows in inbox. */
export const WHATSAPP_INBOUND_REPLY_TYPES = [
  'text',
  'button',
  'interactive',
  'image',
  'document',
  'audio',
  'video',
] as const;

/** Conversation IDs that have at least one customer reply (inbound). */
export async function fetchConversationIdsWithCustomerReplies(
  organizationId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('conversation_id')
    .eq('organization_id', organizationId)
    .eq('direction', 'inbound')
    .in('message_type', [...WHATSAPP_INBOUND_REPLY_TYPES]);

  if (error) {
    console.error('Error fetching reply conversation ids:', error);
    return new Set();
  }

  const ids = new Set<string>();
  for (const row of data ?? []) {
    if (row.conversation_id) ids.add(row.conversation_id);
  }
  return ids;
}

export function isCustomerReplyMessage(
  direction: string | null | undefined,
  messageType: string | null | undefined,
): boolean {
  return (
    direction === 'inbound' &&
    !!messageType &&
    (WHATSAPP_INBOUND_REPLY_TYPES as readonly string[]).includes(messageType)
  );
}

/** Count unread customer replies only (source of truth for FAB badge). */
export async function fetchActualUnreadMessageCount(organizationId: string): Promise<number> {
  const { count, error } = await supabase
    .from('whatsapp_messages')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('direction', 'inbound')
    .in('message_type', [...WHATSAPP_INBOUND_REPLY_TYPES])
    .is('read_at', null);

  if (error) {
    console.error('Error fetching actual unread message count:', error);
    return 0;
  }
  return count ?? 0;
}

/** Per-conversation inbound unread counts from message rows. */
export async function fetchUnreadCountByConversation(
  organizationId: string,
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('conversation_id')
    .eq('organization_id', organizationId)
    .eq('direction', 'inbound')
    .in('message_type', [...WHATSAPP_INBOUND_REPLY_TYPES])
    .is('read_at', null);

  if (error) {
    console.error('Error fetching unread by conversation:', error);
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    if (!row.conversation_id) continue;
    counts[row.conversation_id] = (counts[row.conversation_id] ?? 0) + 1;
  }
  return counts;
}

export interface WhatsAppConversationRow {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  last_message_at: string;
  unread_count: number;
  status: string;
}

/** Conversations with unread_count synced to actual inbound unread replies. */
export async function fetchConversationsWithActualUnread(
  organizationId: string,
): Promise<WhatsAppConversationRow[]> {
  const [{ data: conversations, error: convError }, unreadByConv, replyConvIds] = await Promise.all([
    supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('organization_id', organizationId)
      .order('last_message_at', { ascending: false }),
    fetchUnreadCountByConversation(organizationId),
    fetchConversationIdsWithCustomerReplies(organizationId),
  ]);

  if (convError) throw convError;

  const rows = (conversations ?? [])
    .filter((conv) => replyConvIds.has(conv.id))
    .map((conv) => ({
    ...(conv as WhatsAppConversationRow),
    unread_count: unreadByConv[conv.id] ?? 0,
  }));

  // Fix stale cached counters in the background (do not block UI).
  const stale = (conversations ?? []).filter(
    (conv) => (conv.unread_count ?? 0) !== (unreadByConv[conv.id] ?? 0),
  );
  if (stale.length > 0) {
    void Promise.all(
      stale.map((conv) =>
        supabase
          .from('whatsapp_conversations')
          .update({ unread_count: unreadByConv[conv.id] ?? 0 })
          .eq('id', conv.id),
      ),
    );
  }

  return sortConversationsUnreadFirst(rows);
}

export function sortConversationsUnreadFirst<T extends { unread_count: number; last_message_at: string }>(
  conversations: T[],
): T[] {
  return [...conversations].sort((a, b) => {
    const aUnread = (a.unread_count ?? 0) > 0 ? 1 : 0;
    const bUnread = (b.unread_count ?? 0) > 0 ? 1 : 0;
    if (bUnread !== aUnread) return bUnread - aUnread;
    return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
  });
}

/** Mark all inbound messages in a conversation as read and zero the cached counter. */
export async function markConversationAsRead(
  organizationId: string,
  conversationId: string,
): Promise<void> {
  const now = new Date().toISOString();

  const { error: msgError } = await supabase
    .from('whatsapp_messages')
    .update({ read_at: now })
    .eq('organization_id', organizationId)
    .eq('conversation_id', conversationId)
    .eq('direction', 'inbound')
    .in('message_type', [...WHATSAPP_INBOUND_REPLY_TYPES])
    .is('read_at', null);

  if (msgError) {
    console.error('Error marking messages read:', msgError);
    throw msgError;
  }

  const { error: convError } = await supabase
    .from('whatsapp_conversations')
    .update({ unread_count: 0 })
    .eq('id', conversationId);

  if (convError) {
    console.error('Error resetting conversation unread_count:', convError);
    throw convError;
  }
}
