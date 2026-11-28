import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { countPlannerDue, fetchMyEmployeeIds, todayIso } from "@/lib/data/planner";

const POLL_MS = 2 * 60 * 1000;

/**
 * Calendar - Planner menu badge: pending entries due today or earlier. Owners and managers count
 * everyone's; other staff count the entries they are tagged on (everyone's when their login has
 * no Employee Master row). One small count read every 2 minutes while the tab is in front.
 */
export function usePlannerDueCount(enabled: boolean): number {
  const { currentOrganization, organizationRole } = useOrganization();
  const { user } = useAuth();
  const orgId = currentOrganization?.id;
  const isBoss = organizationRole === "admin" || organizationRole === "manager";

  const { data: myIds } = useQuery({
    queryKey: ["planner-my-employee-ids", orgId, user?.id],
    enabled: enabled && !!orgId && !!user?.id && !isBoss,
    queryFn: () => fetchMyEmployeeIds(orgId!, user!.id),
    staleTime: 5 * 60 * 1000,
  });
  const employeeId = isBoss ? null : myIds?.[0] ?? null;
  const ready = enabled && !!orgId && (isBoss || myIds !== undefined);
  const today = todayIso();

  const { data } = useQuery({
    queryKey: ["planner-due-count", orgId, today, employeeId],
    enabled: ready,
    queryFn: () => countPlannerDue(orgId!, today, employeeId),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 60 * 1000,
    retry: false,
  });
  return enabled ? data ?? 0 : 0;
}
