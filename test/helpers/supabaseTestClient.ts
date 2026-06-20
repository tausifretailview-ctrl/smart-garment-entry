import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type MoneyTestEnv = {
  url: string;
  serviceRoleKey: string;
  orgId?: string;
};

export function readMoneyTestEnv(): MoneyTestEnv | null {
  const url = process.env.SUPABASE_TEST_URL || "";
  const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY || "";
  if (!url || !serviceRoleKey) return null;
  return {
    url,
    serviceRoleKey,
    orgId: process.env.SUPABASE_TEST_ORG_ID || undefined,
  };
}

export function hasMoneyTestDb(): boolean {
  return readMoneyTestEnv() !== null;
}

export function createMoneyTestClient(): SupabaseClient {
  const env = readMoneyTestEnv();
  if (!env) {
    throw new Error(
      "Missing test DB credentials. Set SUPABASE_TEST_URL and SUPABASE_TEST_SERVICE_ROLE_KEY (see test/README.md).",
    );
  }
  return createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
