import { supabase } from "@/integrations/supabase/client";

/**
 * Organisation settings reads used outside React (save, payment and ledger paths). Plan
 * Phase 4, D6: one data module per area instead of the same query copied into many files.
 *
 * `accounting_engine_enabled` was read with its own round trip in 33 places — every
 * receipt, refund, advance, expense, salary and return save asked the database again. It is
 * changed by support only (the Settings page does not write it), so a 60-second cache per
 * organisation is safe; concurrent callers share one request. The row shape is unchanged so
 * callers keep using isAccountingEngineEnabled(row).
 */

export type AccountingEngineSettingsRow = { accounting_engine_enabled: boolean | null } | null;

type SettingsClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
};

export const ACCOUNTING_FLAG_CACHE_MS = 60_000;

type Entry = { at: number; row: AccountingEngineSettingsRow } | { at: number; pending: Promise<AccountingEngineSettingsRow> };
const cache = new Map<string, Entry>();

const cachingEnabled = () => import.meta.env.MODE !== "test" || cacheForcedInTest;
let cacheForcedInTest = false;

async function readRow(organizationId: string, client: SettingsClient): Promise<AccountingEngineSettingsRow> {
  const { data, error } = await client
    .from("settings")
    .select("accounting_engine_enabled")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  return (data as AccountingEngineSettingsRow) ?? null;
}

/**
 * The org's `accounting_engine_enabled` settings row (null when the org has no settings row
 * or the read failed — callers treat that as "on", as before). Cached for the default client.
 */
export async function getAccountingEngineSettingsRow(
  organizationId: string,
  client: unknown = supabase,
  now: () => number = Date.now,
): Promise<AccountingEngineSettingsRow> {
  const c = client as SettingsClient;
  const useCache = client === supabase && cachingEnabled();
  if (!useCache) {
    try {
      return await readRow(organizationId, c);
    } catch {
      return null;
    }
  }
  const hit = cache.get(organizationId);
  if (hit && now() - hit.at < ACCOUNTING_FLAG_CACHE_MS) {
    return "pending" in hit ? hit.pending : hit.row;
  }
  const pending = readRow(organizationId, c).then(
    (row) => {
      cache.set(organizationId, { at: now(), row });
      return row;
    },
    () => {
      cache.delete(organizationId); // do not keep a failure; next caller retries
      return null;
    },
  );
  cache.set(organizationId, { at: now(), pending });
  return pending;
}

/** Forget the cached flag (after support changes it, or between tests). */
export function clearAccountingEngineFlagCache(organizationId?: string): void {
  if (organizationId) cache.delete(organizationId);
  else cache.clear();
}

/** Test hook: exercise the cache under Vitest. */
export function forceAccountingFlagCacheInTests(on: boolean): void {
  cacheForcedInTest = on;
}
