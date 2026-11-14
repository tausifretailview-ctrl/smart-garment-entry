import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { STALE_SETTINGS } from "@/lib/queryStaleTimes";
import type { Tables } from "@/integrations/supabase/types";

/**
 * Size groups (Plan Phase 4, D6): one cached list per shop for every screen. Product entry,
 * purchase search, sales invoice, size stock, the invoice print and Settings all read this
 * list; every create / rename / delete refreshes it, so a new group shows up everywhere.
 */
export type SizeGroupRow = Tables<"size_groups">;

export const sizeGroupsQueryKey = (orgId: string | undefined) => ["size-groups", orgId] as const;

/** All the shop's size groups, A→Z by name. Throws on a failed read. */
export async function fetchSizeGroupRows(orgId: string | undefined): Promise<SizeGroupRow[]> {
  if (!orgId) return [];
  const { data, error } = await supabase
    .from("size_groups")
    .select("*")
    .eq("organization_id", orgId)
    .order("group_name");
  if (error) throw error;
  return data || [];
}

export function useSizeGroups(orgId?: string) {
  const { currentOrganization } = useOrganization();
  const id = orgId ?? currentOrganization?.id;
  return useQuery({
    queryKey: sizeGroupsQueryKey(id),
    queryFn: () => fetchSizeGroupRows(id),
    staleTime: STALE_SETTINGS,
    refetchOnWindowFocus: false,
    enabled: !!id,
  });
}

/** The list for code outside render: from the cache when fresh, else read once and cached. */
export function getSizeGroups(queryClient: QueryClient, orgId: string): Promise<SizeGroupRow[]> {
  return queryClient.fetchQuery({
    queryKey: sizeGroupsQueryKey(orgId),
    queryFn: () => fetchSizeGroupRows(orgId),
    staleTime: STALE_SETTINGS,
  });
}

/** Call after creating, renaming or deleting a size group. */
export function refreshSizeGroupsCache(queryClient: QueryClient, orgId: string | undefined) {
  if (!orgId) return Promise.resolve();
  return queryClient.invalidateQueries({ queryKey: sizeGroupsQueryKey(orgId) });
}

/**
 * The groups with these ids, by id. Served from the cached list; if any id is not in it
 * (made in another tab or by another user since), the list is re-read once.
 */
export async function getSizeGroupsByIds(
  queryClient: QueryClient,
  orgId: string,
  ids: readonly string[],
): Promise<Map<string, SizeGroupRow>> {
  const wanted = [...new Set(ids.filter(Boolean))];
  const byId = (rows: SizeGroupRow[]) => new Map(rows.map((g) => [g.id, g]));
  if (wanted.length === 0) return new Map();
  let map = byId(await getSizeGroups(queryClient, orgId));
  if (wanted.some((id) => !map.has(id))) {
    await refreshSizeGroupsCache(queryClient, orgId);
    map = byId(await getSizeGroups(queryClient, orgId));
  }
  return new Map(wanted.filter((id) => map.has(id)).map((id) => [id, map.get(id)!]));
}


/** getSizeGroups in the `{ data, error }` shape of a Supabase read, for older call sites. */
export function readSizeGroups(
  queryClient: QueryClient,
  orgId: string,
): Promise<{ data: SizeGroupRow[] | null; error: { message: string } | null }> {
  return getSizeGroups(queryClient, orgId).then(
    (data) => ({ data, error: null }),
    (error: unknown) => ({
      data: null,
      error: error instanceof Error ? error : { ...(error as object), message: String((error as { message?: unknown })?.message ?? error) },
    }),
  );
}
