/**
 * Markdown % data (src/lib/markdown.ts): the shop's brand markdowns and the products that have
 * their own markdown. Migration 20270510120000_brand_markdown.sql adds the table / columns; until
 * it is run every read here returns "none" and the Sale Bill simply shows no markdown.
 */
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { fetchAllRows } from "@/lib/data/fetchInIdBatches";
import { STALE_FREQUENT } from "@/lib/queryStaleTimes";
import { clampMarkdownPercent, normalizeBrandKey } from "@/lib/markdown";

export type BrandMarkdown = { id: string; brand: string; markdown_percent: number };

/** The table / column is not on the database yet (migration not run). */
export function isMissingMarkdownSchema(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { message?: string; code?: string };
  const message = String(e.message ?? "");
  if (!/brand_markdowns|markdown_percent/.test(message)) return false;
  return (
    e.code === "PGRST204" ||
    e.code === "PGRST205" ||
    e.code === "42P01" ||
    e.code === "42703" ||
    /schema cache|does not exist|could not find/i.test(message)
  );
}

export const brandMarkdownsQueryKey = (orgId: string | undefined) => ["brand-markdowns", orgId] as const;
export const productMarkdownsQueryKey = (orgId: string | undefined) => ["product-markdowns", orgId] as const;

export async function fetchBrandMarkdowns(orgId: string): Promise<BrandMarkdown[]> {
  try {
    const rows = await fetchAllRows<BrandMarkdown>(
      () =>
        supabase
          .from("brand_markdowns")
          .select("id, brand, markdown_percent")
          .eq("organization_id", orgId)
          .order("id") as never,
    );
    return rows
      .map((r) => ({ ...r, markdown_percent: clampMarkdownPercent(r.markdown_percent) }))
      .sort((a, b) => a.brand.localeCompare(b.brand));
  } catch (error) {
    if (isMissingMarkdownSchema(error)) return [];
    throw error;
  }
}

/** Products with their own markdown (0 included: "no markdown for this one"). */
export async function fetchProductMarkdownMap(orgId: string): Promise<Map<string, number>> {
  try {
    const rows = await fetchAllRows<{ id: string; markdown_percent: number | null }>(
      () =>
        supabase
          .from("products")
          .select("id, markdown_percent")
          .eq("organization_id", orgId)
          .not("markdown_percent", "is", null)
          .order("id") as never,
    );
    return new Map(
      rows
        .filter((r) => r.markdown_percent !== null && r.markdown_percent !== undefined)
        .map((r) => [r.id, clampMarkdownPercent(r.markdown_percent)]),
    );
  } catch (error) {
    if (isMissingMarkdownSchema(error)) return new Map();
    throw error;
  }
}

export function brandMarkdownMap(rows: BrandMarkdown[]): Map<string, number> {
  return new Map(rows.map((r) => [normalizeBrandKey(r.brand), clampMarkdownPercent(r.markdown_percent)]));
}

export function useBrandMarkdowns(options: { enabled?: boolean } = {}) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  return useQuery({
    queryKey: brandMarkdownsQueryKey(orgId),
    queryFn: () => fetchBrandMarkdowns(orgId!),
    enabled: !!orgId && options.enabled !== false,
    staleTime: STALE_FREQUENT,
  });
}

export function useProductMarkdownMap(options: { enabled?: boolean } = {}) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  return useQuery({
    queryKey: productMarkdownsQueryKey(orgId),
    queryFn: () => fetchProductMarkdownMap(orgId!),
    enabled: !!orgId && options.enabled !== false,
    staleTime: STALE_FREQUENT,
  });
}

export function invalidateMarkdownQueries(queryClient: QueryClient, orgId: string | undefined) {
  void queryClient.invalidateQueries({ queryKey: brandMarkdownsQueryKey(orgId) });
  void queryClient.invalidateQueries({ queryKey: productMarkdownsQueryKey(orgId) });
}

const MIGRATION_HINT = "Markdown needs the database update 20270510120000_brand_markdown.sql.";

/** Add or change a brand's markdown (one row per brand, matched without case). */
export async function saveBrandMarkdown(
  orgId: string,
  brand: string,
  markdownPercent: number,
  existing: BrandMarkdown[],
): Promise<void> {
  const name = brand.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Enter a brand");
  const pct = clampMarkdownPercent(markdownPercent);
  const same = existing.find((r) => normalizeBrandKey(r.brand) === normalizeBrandKey(name));
  const { error } = same
    ? await supabase
        .from("brand_markdowns")
        .update({ markdown_percent: pct, brand: name })
        .eq("id", same.id)
        .eq("organization_id", orgId)
    : await supabase.from("brand_markdowns").insert({ organization_id: orgId, brand: name, markdown_percent: pct });
  if (error) throw isMissingMarkdownSchema(error) ? new Error(MIGRATION_HINT) : error;
}

export async function deleteBrandMarkdown(orgId: string, id: string): Promise<void> {
  const { error } = await supabase.from("brand_markdowns").delete().eq("id", id).eq("organization_id", orgId);
  if (error) throw isMissingMarkdownSchema(error) ? new Error(MIGRATION_HINT) : error;
}

/**
 * The product's own markdown (null = follow its brand). A separate small write after the product
 * save, so product saves keep working before the migration is run.
 */
export async function saveProductMarkdown(
  orgId: string,
  productId: string,
  markdownPercent: number | null,
): Promise<{ ok: boolean; reason?: string }> {
  const { error } = await supabase
    .from("products")
    .update({ markdown_percent: markdownPercent === null ? null : clampMarkdownPercent(markdownPercent) })
    .eq("id", productId)
    .eq("organization_id", orgId);
  if (!error) return { ok: true };
  return { ok: false, reason: isMissingMarkdownSchema(error) ? MIGRATION_HINT : error.message || "Could not save markdown" };
}
