import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  STOREFRONT_THEME_KEY,
  parseStorefrontTheme,
  type StorefrontThemeId,
} from "@/lib/storefrontThemes";

function asSettings(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function loadStorefrontTheme(orgId: string): Promise<StorefrontThemeId | null> {
  const { data, error } = await supabase.from("organizations").select("settings").eq("id", orgId).maybeSingle();
  if (error) throw error;
  return parseStorefrontTheme(data?.settings);
}

/**
 * Save the theme next to the other organization settings. An update the user is not
 * allowed to make comes back with no error and no rows, so the changed row is read back.
 */
export async function saveStorefrontTheme(orgId: string, theme: StorefrontThemeId): Promise<void> {
  const { data: current, error: readError } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if (readError) throw readError;

  const next = { ...asSettings(current?.settings), [STOREFRONT_THEME_KEY]: theme };
  const { data, error } = await supabase
    .from("organizations")
    .update({ settings: next as Json })
    .eq("id", orgId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Only an organization admin can change the store theme.");
  }
}
