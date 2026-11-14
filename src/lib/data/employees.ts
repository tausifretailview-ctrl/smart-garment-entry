import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { STALE_SETTINGS } from "@/lib/queryStaleTimes";

/**
 * Staff (employees) data module (Plan Phase 4, D6).
 *
 * Every salesman dropdown (POS, mobile POS, Sales Invoice, Quotation, Sale Order, Delivery
 * Challan, POS dashboard filter) reads ONE cached list: active staff who are not in the
 * recycle bin. Before, four of those screens skipped the recycle-bin check (deleted staff
 * could be picked) and shared the cache key ["employees", orgId] with Employee Master's
 * all-staff list, so whichever screen loaded first decided what the other showed.
 *
 * Keys all start with "employees", so the existing invalidate(["employees"]) after an
 * Employee Master save refreshes every list.
 */
export const ACTIVE_STAFF_COLUMNS = "id, employee_name, designation, commission_percent, status";

export type ActiveStaffMember = {
  id: string;
  employee_name: string;
  designation: string | null;
  commission_percent: number | null;
  status: string | null;
};

export const activeStaffQueryKey = (orgId: string | undefined) => ["employees", "active", orgId] as const;
/** Employee Master's full list (every status, recycle bin excluded). */
export const staffMasterQueryKey = (orgId: string | undefined) => ["employees", "master", orgId] as const;

/** Active staff not in the recycle bin, A→Z. Throws on a failed read. */
export async function fetchActiveStaff(orgId: string | undefined): Promise<ActiveStaffMember[]> {
  if (!orgId) return [];
  const { data, error } = await supabase
    .from("employees")
    .select(ACTIVE_STAFF_COLUMNS)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .eq("status", "active")
    .order("employee_name");
  if (error) throw error;
  return (data || []) as ActiveStaffMember[];
}

/** The salesman list. `enabled: false` defers the read (e.g. until a sheet opens). */
export function useActiveStaff(options: { enabled?: boolean } = {}) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  return useQuery({
    queryKey: activeStaffQueryKey(orgId),
    queryFn: () => fetchActiveStaff(orgId),
    enabled: !!orgId && options.enabled !== false,
    staleTime: STALE_SETTINGS,
    refetchOnWindowFocus: false,
  });
}

/** Call after adding, editing, deleting or restoring staff (any screen). */
export function refreshStaffCache(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ["employees"] });
}
