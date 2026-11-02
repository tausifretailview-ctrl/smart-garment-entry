import { useQuery } from "@tanstack/react-query";
import { fetchEwayBillAlerts, type EwayBillRegisterRow } from "@/utils/ewayBill";

const NONE: EwayBillRegisterRow[] = [];

/**
 * Active e-way bills that lapse within 8 hours, lapsed in the last 8 hours, or have no
 * vehicle yet (Industrial mode, Phase 2 step 5a). Runs only when enabled, so other shops
 * make no query; refreshes every 10 minutes while a page that shows it stays open.
 */
export function useEwayBillAlerts(organizationId: string | undefined, enabled: boolean) {
  const { data, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["eway-bill-alerts", organizationId ?? ""],
    queryFn: () => fetchEwayBillAlerts(organizationId!),
    enabled: enabled && !!organizationId,
    staleTime: 5 * 60_000,
    refetchInterval: enabled ? 10 * 60_000 : false,
  });
  return { rows: data?.rows ?? NONE, missingSql: data?.missingSql ?? false, refetch, checkedAt: dataUpdatedAt };
}
