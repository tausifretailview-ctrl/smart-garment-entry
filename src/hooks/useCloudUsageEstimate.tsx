import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTierBasedRefresh, getTierRefreshDescription } from "./useTierBasedRefresh";

interface UsageCategory {
  name: string;
  queriesPerHour: number;
  isPolling: boolean;
}

interface UsageEstimate {
  totalDailyReads: number;
  beforeOptimization: number;
  savingsPercent: number;
  categories: UsageCategory[];
  tier: string;
  tierDescription: string;
  activeOrgsCount: number;
  activeHoursPerDay: number;
}

/**
 * Constants for usage estimation
 * Based on typical polling patterns before optimization
 */
const ACTIVE_HOURS_PER_DAY = 10; // Assume 10 active business hours

const CATEGORY_BASE_RATES: Record<string, { queriesPerMinute: number; hasPolling: boolean }> = {
  dashboard: { queriesPerMinute: 1, hasPolling: true },
  pos: { queriesPerMinute: 0.5, hasPolling: false }, // On-demand only
  whatsapp: { queriesPerMinute: 2, hasPolling: true },
  reports: { queriesPerMinute: 0.2, hasPolling: false }, // On-demand only
  products: { queriesPerMinute: 0.3, hasPolling: false },
  customers: { queriesPerMinute: 0.2, hasPolling: false },
};

/**
 * Tier multipliers for polling
 * Free tier = 0 background polling, all manual
 */
const TIER_POLLING_MULTIPLIERS: Record<string, number> = {
  enterprise: 1.0,
  professional: 0.5,
  basic: 0.2,
  free: 0,
};

/**
 * Hook to estimate cloud usage based on organization count and tier
 */
export const useCloudUsageEstimate = () => {
  const { tier } = useTierBasedRefresh();

  // Fetch organization count for estimation
  const { data: orgsData } = useQuery({
    queryKey: ["cloud-usage-org-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("organizations")
        .select("id", { count: "exact", head: true });
      
      if (error) throw error;
      return count || 1;
    },
    staleTime: 300000, // 5 minutes
  });

  const activeOrgsCount = orgsData || 1;
  const pollingMultiplier = TIER_POLLING_MULTIPLIERS[tier] || 0;

  // Calculate per-category usage
  const categories: UsageCategory[] = Object.entries(CATEGORY_BASE_RATES).map(([name, config]) => {
    // If category has polling, apply tier multiplier
    const effectiveRate = config.hasPolling
      ? config.queriesPerMinute * pollingMultiplier
      : config.queriesPerMinute;

    const queriesPerHour = effectiveRate * 60 * activeOrgsCount;

    return {
      name: name.charAt(0).toUpperCase() + name.slice(1),
      queriesPerHour: Math.round(queriesPerHour),
      isPolling: config.hasPolling,
    };
  });

  // Total daily reads with current optimization
  const totalDailyReads = categories.reduce(
    (sum, cat) => sum + cat.queriesPerHour * ACTIVE_HOURS_PER_DAY,
    0
  );

  // Calculate what it would be without optimization (enterprise tier, all polling)
  const beforeOptimization = Object.entries(CATEGORY_BASE_RATES).reduce((sum, [, config]) => {
    const baseQueriesPerHour = config.queriesPerMinute * 60 * activeOrgsCount;
    return sum + baseQueriesPerHour * ACTIVE_HOURS_PER_DAY;
  }, 0);

  const savingsPercent = beforeOptimization > 0
    ? Math.round(((beforeOptimization - totalDailyReads) / beforeOptimization) * 100)
    : 0;

  const estimate: UsageEstimate = {
    totalDailyReads: Math.round(totalDailyReads),
    beforeOptimization: Math.round(beforeOptimization),
    savingsPercent,
    categories,
    tier,
    tierDescription: getTierRefreshDescription(tier),
    activeOrgsCount,
    activeHoursPerDay: ACTIVE_HOURS_PER_DAY,
  };

  return estimate;
};

/**
 * Format number with K/M suffix for display
 */
export const formatReadCount = (count: number): string => {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toLocaleString();
};

/**
 * Get color class based on usage level
 */
export const getUsageColor = (percent: number): string => {
  if (percent < 30) return "text-success";
  if (percent < 70) return "text-warning";
  return "text-destructive";
};

/**
 * Get progress color for visual indicator
 */
export const getProgressColor = (percent: number): string => {
  if (percent < 30) return "bg-success";
  if (percent < 70) return "bg-warning";
  return "bg-destructive";
};
