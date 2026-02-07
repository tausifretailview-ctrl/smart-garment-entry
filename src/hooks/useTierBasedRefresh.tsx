import { useOrganization } from "@/contexts/OrganizationContext";
import { usePageVisibility } from "./useVisibilityRefetch";

type RefreshCategory = 'fast' | 'medium' | 'slow';

interface TierIntervals {
  fast: number | false;
  medium: number | false;
  slow: number | false;
}

/**
 * Tier-based polling intervals to reduce cloud usage
 * 
 * Free: Manual refresh only (saves ~100% cloud polling)
 * Basic: 5 minute polling (saves ~80%)
 * Professional: 2 minute polling (saves ~50%)
 * Enterprise: 1 minute polling (current behavior)
 */
const TIER_INTERVALS: Record<string, TierIntervals> = {
  enterprise: { fast: 60000, medium: 120000, slow: 300000 },
  professional: { fast: 120000, medium: 180000, slow: 300000 },
  basic: { fast: 300000, medium: 300000, slow: 600000 },
  free: { fast: false, medium: false, slow: false },
};

/**
 * Hook for tier-aware query polling intervals
 * 
 * Combines subscription tier with visibility awareness to:
 * 1. Reduce cloud usage based on subscription tier
 * 2. Pause all polling when browser tab is hidden
 * 
 * Usage:
 * ```tsx
 * const { getRefreshInterval, isManualRefreshOnly } = useTierBasedRefresh();
 * 
 * const { data } = useQuery({
 *   queryKey: ["my-data"],
 *   queryFn: async () => { ... },
 *   refetchInterval: getRefreshInterval('fast'),
 * });
 * ```
 */
export const useTierBasedRefresh = () => {
  const { currentOrganization } = useOrganization();
  const isVisible = usePageVisibility();
  
  const tier = (currentOrganization?.subscription_tier as string) || 'free';
  
  /**
   * Get base interval without visibility check
   * Useful for displaying the configured interval to users
   */
  const getBaseInterval = (category: RefreshCategory): number | false => {
    return TIER_INTERVALS[tier]?.[category] ?? false;
  };
  
  /**
   * Get visibility-aware refresh interval
   * Returns false (disabled) when tab is hidden OR tier doesn't allow auto-refresh
   */
  const getRefreshInterval = (category: RefreshCategory): number | false => {
    const baseInterval = getBaseInterval(category);
    
    // If tier doesn't allow auto-refresh, return false
    if (baseInterval === false) return false;
    
    // If tab is hidden, pause polling
    if (!isVisible) return false;
    
    return baseInterval;
  };
  
  return {
    getRefreshInterval,
    getBaseInterval,
    tier,
    isManualRefreshOnly: tier === 'free',
    isVisible,
  };
};

/**
 * Get human-readable description of refresh behavior for current tier
 */
export const getTierRefreshDescription = (tier: string): string => {
  switch (tier) {
    case 'enterprise':
      return 'Real-time updates (1-2 minutes)';
    case 'professional':
      return 'Frequent updates (2-3 minutes)';
    case 'basic':
      return 'Standard updates (5 minutes)';
    case 'free':
    default:
      return 'Manual refresh only';
  }
};
