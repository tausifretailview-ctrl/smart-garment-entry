import { supabase } from "@/integrations/supabase/client";
import type { PublicStorefrontPayload } from "@/lib/websiteTypes";

type WebsiteTable = "website_products" | "website_enquiries" | "website_settings" | "website_menus";

type WebsiteQuery = {
  select: (columns?: string) => WebsiteQuery;
  insert: (values: Record<string, unknown> | Record<string, unknown>[]) => WebsiteQuery;
  update: (values: Record<string, unknown>) => WebsiteQuery;
  upsert: (values: Record<string, unknown>, options?: { onConflict?: string }) => WebsiteQuery;
  delete: () => WebsiteQuery;
  eq: (column: string, value: unknown) => WebsiteQuery;
  order: (column: string, options?: { ascending?: boolean }) => WebsiteQuery;
  limit: (count: number) => WebsiteQuery;
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
  then: Promise<{ data: unknown; error: { message: string } | null }>["then"];
};

/** Untyped accessor — these tables are not yet in generated `types.ts`. */
export function websiteFrom(table: WebsiteTable): WebsiteQuery {
  return (supabase as unknown as { from: (name: string) => WebsiteQuery }).from(table);
}

export async function fetchPublicStorefront(slug: string): Promise<PublicStorefrontPayload> {
  const { data, error } = await (
    supabase as unknown as {
      rpc: (fn: string, args: { p_slug: string }) => Promise<{ data: unknown; error: { message: string } | null }>;
    }
  ).rpc("get_public_storefront", { p_slug: slug });
  if (error) throw error;
  if (!data || typeof data !== "object") return { published: false };
  return data as PublicStorefrontPayload;
}
