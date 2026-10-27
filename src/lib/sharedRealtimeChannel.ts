/**
 * One realtime channel per topic, shared by every mounted hook that asks for it.
 *
 * supabase-js hands back the existing channel when two callers use the same topic, so
 * when 40+ screens each ran `supabase.channel(topic)…subscribe()` and `removeChannel()`
 * in their own effect, the first screen to unmount closed the channel for everyone
 * (the menu and layout included), and the next screen opened a new one: a websocket
 * leave/join and a fresh database subscription on many page switches, and live updates
 * that stopped arriving until reload. Here the channel is opened by the first caller
 * and closed only when the last one releases it.
 */

type ChannelLike = unknown;

interface ClientLike<C extends ChannelLike> {
  removeChannel: (channel: C) => unknown;
}

interface Shared<C extends ChannelLike> {
  channel: C;
  count: number;
}

const shared = new Map<string, Shared<ChannelLike>>();

/**
 * Returns a release function. `open` runs only for the first caller of `topic`; the
 * channel is removed from `client` once every caller has released it.
 */
export function acquireSharedChannel<C extends ChannelLike>(
  client: ClientLike<C>,
  topic: string,
  open: () => C,
): () => void {
  let entry = shared.get(topic) as Shared<C> | undefined;
  if (!entry) {
    entry = { channel: open(), count: 0 };
    shared.set(topic, entry);
  }
  entry.count += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = shared.get(topic) as Shared<C> | undefined;
    if (!current || current !== entry) return;
    current.count -= 1;
    if (current.count > 0) return;
    shared.delete(topic);
    void client.removeChannel(current.channel);
  };
}

/** Callers of this topic right now (tests and diagnostics). */
export function sharedChannelCount(topic: string): number {
  return shared.get(topic)?.count ?? 0;
}
