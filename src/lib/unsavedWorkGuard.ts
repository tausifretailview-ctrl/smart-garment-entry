/**
 * Registry of entry screens holding unsaved work (purchase bill, sale invoice, order,
 * quotation, return). Automatic reloads — deploy skew recovery, silent update, newer-build
 * checks — consult it so a shop never loses the bill it is typing to a reload it did not ask for.
 *
 * Kept dependency-free so low-level modules (chunkLoadRetry, appReload) can import it.
 */

type UnsavedWorkCheck = () => boolean;

const sources = new Map<string, UnsavedWorkCheck>();
let nextSourceId = 0;

/** Register a live check; returns an unregister function (call on unmount). */
export function registerUnsavedWorkSource(label: string, check: UnsavedWorkCheck): () => void {
  const id = `${label}#${++nextSourceId}`;
  sources.set(id, check);
  return () => {
    sources.delete(id);
  };
}

/** True when any mounted entry screen has work that is not saved as a bill yet. */
export function hasUnsavedEntryWork(): boolean {
  for (const check of sources.values()) {
    try {
      if (check()) return true;
    } catch {
      // A broken check must not block or allow reloads on its own.
    }
  }
  return false;
}

/** Test helper. */
export function resetUnsavedWorkSourcesForTests(): void {
  sources.clear();
}
