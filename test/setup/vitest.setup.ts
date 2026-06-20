/**
 * Vitest setup — load `.env.test`, mock browser storage for Node (Supabase import chain).
 */

import { loadEnvTest } from "../helpers/loadEnvTest";

loadEnvTest();

const storage = new Map<string, string>();

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
  key: (index: number) => Array.from(storage.keys())[index] ?? null,
  get length() {
    return storage.size;
  },
} as Storage;
