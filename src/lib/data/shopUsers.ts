import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { STALE_SETTINGS } from "@/lib/queryStaleTimes";

/**
 * Shop users data module (Plan Phase 4, D6).
 *
 * The billing-user / "created by" filters on the Sales and POS dashboards, the Item-wise
 * sales report, Employee Master's login picker and the Activity Log all need the shop's
 * logins with their emails. Each read organization_members and then called the slow
 * `get-users` edge function itself, under its own cache key. Now there is one member list
 * and one user list per shop, shared by every screen.
 */
export type ShopMember = { user_id: string; role: string | null };
export type ShopUser = { id: string; email: string; role: string | null };

export const shopMembersQueryKey = (orgId: string | undefined) => ["shop-members", orgId] as const;
export const shopUsersQueryKey = (orgId: string | undefined) => ["shop-users", orgId] as const;

/** The shop's logins and roles (one quick table read). Throws on a failed read. */
export async function fetchShopMembers(orgId: string | undefined): Promise<ShopMember[]> {
  if (!orgId) return [];
  const { data, error } = await supabase
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", orgId);
  if (error) throw error;
  return (data || []) as ShopMember[];
}

export function getShopMembers(queryClient: QueryClient, orgId: string): Promise<ShopMember[]> {
  return queryClient.fetchQuery({
    queryKey: shopMembersQueryKey(orgId),
    queryFn: () => fetchShopMembers(orgId),
    staleTime: STALE_SETTINGS,
  });
}

/**
 * Members joined with their login emails from `get-users`. Users the edge function does not
 * return (e.g. the caller may not list users) are left out, as each screen did before.
 * Throws when the edge function fails, so a failure is not cached.
 */
async function fetchShopUsers(queryClient: QueryClient, orgId: string, accessToken: string): Promise<ShopUser[]> {
  const members = await getShopMembers(queryClient, orgId);
  if (members.length === 0) return [];
  const { data, error } = await supabase.functions.invoke("get-users", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (error) throw error;
  const roleById = new Map(members.map((m) => [m.user_id, m.role]));
  const users = ((data as { users?: Array<{ id: string; email?: string | null }> } | null)?.users || []);
  return users
    .filter((u) => roleById.has(u.id))
    .map((u) => ({ id: u.id, email: u.email || "", role: roleById.get(u.id) ?? null }));
}

export function getShopUsers(queryClient: QueryClient, orgId: string, accessToken: string): Promise<ShopUser[]> {
  return queryClient.fetchQuery({
    queryKey: shopUsersQueryKey(orgId),
    queryFn: () => fetchShopUsers(queryClient, orgId, accessToken),
    staleTime: STALE_SETTINGS,
  });
}

export function useShopMembers() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  return useQuery({
    queryKey: shopMembersQueryKey(orgId),
    queryFn: () => fetchShopMembers(orgId),
    enabled: !!orgId,
    staleTime: STALE_SETTINGS,
    refetchOnWindowFocus: false,
  });
}

/** Logins with emails. Waits for a signed-in session (the edge function needs the token). */
export function useShopUsers() {
  const { currentOrganization } = useOrganization();
  const { session } = useAuth();
  const orgId = currentOrganization?.id;
  const token = session?.access_token;
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: shopUsersQueryKey(orgId),
    queryFn: () => fetchShopUsers(queryClient, orgId!, token!),
    enabled: !!orgId && !!token,
    staleTime: STALE_SETTINGS,
    refetchOnWindowFocus: false,
  });
}

/** Call after adding or removing a login, or changing its role. */
export function refreshShopUsersCache(queryClient: QueryClient, orgId?: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: orgId ? shopMembersQueryKey(orgId) : ["shop-members"] }),
    queryClient.invalidateQueries({ queryKey: orgId ? shopUsersQueryKey(orgId) : ["shop-users"] }),
  ]);
}
