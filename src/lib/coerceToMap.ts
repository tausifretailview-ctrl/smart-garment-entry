/**
 * TanStack Query persist (IndexedDB) serializes Map → plain object.
 * After restore, `.get()` throws — use this before Map access.
 */
export function coerceToMap<K extends string, V>(value: unknown): Map<K, V> {
  if (value instanceof Map) return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return new Map(Object.entries(value) as [K, V][]);
  }
  return new Map();
}

export function lookupMap<V, K extends string = string>(
  value: unknown,
  key: K | null | undefined,
): V | undefined {
  if (key == null || key === "") return undefined;
  return coerceToMap<K, V>(value).get(key);
}

/** Alias used by payment/ledger screens — always safe after persisted-query restore. */
export const safeMapGet = lookupMap;

export function ensureMap<K extends string, V>(value: unknown): Map<K, V> {
  return coerceToMap<K, V>(value);
}
