
# Cloud Usage Optimization: Tier-Based Dashboard Polling

## Current Problem Analysis

| Dashboard Component | Current Polling | Queries/Hour | Impact |
|---------------------|-----------------|--------------|--------|
| **Desktop Index.tsx** | 60s-120s intervals | ~30-60/org | HIGH |
| **StatsChartsSection** | 120s interval | ~30/org | MEDIUM |
| **MobileDashboard** | 60s-120s intervals | ~30-60/org | HIGH |
| **MobileDashboardSummary** | 60s interval | ~60/org | HIGH |

With **12 active organizations** and multiple simultaneous users, this creates **2000+ database reads/hour** even with visibility-based pausing.

### Current Refresh Intervals

```text
┌─────────────────────────────────────────────────────────────────┐
│                CURRENT POLLING INTERVALS                        │
├──────────────────────┬─────────┬────────────────────────────────┤
│ Query Type           │Interval │ Auto-Refresh?                  │
├──────────────────────┼─────────┼────────────────────────────────┤
│ Sales/Purchase       │ 60s     │ YES (FAST)                     │
│ Stock/Receivables    │ 120s    │ YES (MEDIUM)                   │
│ Charts               │ 120s    │ YES                            │
│ Customer/Product Cnt │ 300s    │ NO (on-demand)                 │
└──────────────────────┴─────────┴────────────────────────────────┘
```

## Proposed Solution: Tier-Based Polling

### New Strategy

```text
┌─────────────────────────────────────────────────────────────────┐
│              TIER-BASED REFRESH INTERVALS                       │
├──────────────────────┬─────────────────────────────────────────┤
│ Tier                 │ Behavior                                 │
├──────────────────────┼─────────────────────────────────────────┤
│ FREE                 │ Manual refresh only (no auto-polling)   │
│ BASIC                │ 5 minute polling (reduced)              │
│ PROFESSIONAL         │ 2 minute polling (current)              │
│ ENTERPRISE           │ 1 minute polling (fast)                 │
└──────────────────────┴─────────────────────────────────────────┘
```

### Hook: useTierBasedRefresh

Create a reusable hook that determines polling intervals based on subscription tier:

```typescript
// src/hooks/useTierBasedRefresh.tsx

export const useTierBasedRefresh = () => {
  const { currentOrganization } = useOrganization();
  
  const getRefreshInterval = (category: 'fast' | 'medium' | 'slow'): number | false => {
    const tier = currentOrganization?.subscription_tier || 'free';
    
    // Free tier: Manual refresh only (saves ~80% cloud usage)
    if (tier === 'free') return false;
    
    // Tier-based intervals
    const intervals = {
      enterprise: { fast: 60000, medium: 120000, slow: 300000 },
      professional: { fast: 120000, medium: 180000, slow: 300000 },
      basic: { fast: 300000, medium: 300000, slow: 600000 },
      free: { fast: false, medium: false, slow: false },
    };
    
    return intervals[tier]?.[category] ?? false;
  };
  
  return { getRefreshInterval, tier: currentOrganization?.subscription_tier };
};
```

## Implementation Changes

### 1. Create New Hook: useTierBasedRefresh

**File:** `src/hooks/useTierBasedRefresh.tsx` (NEW)

Central hook for tier-aware polling intervals with visibility awareness.

### 2. Update Desktop Dashboard (Index.tsx)

**Lines to modify:** ~190-200, ~296-325, ~380, ~403-434, ~470-507, ~527-549, ~552-600, ~603-620, ~623-645

Replace:
- `REFRESH_INTERVALS.FAST` → `getRefreshInterval('fast')`
- `REFRESH_INTERVALS.MEDIUM` → `getRefreshInterval('medium')`

Add banner for Free tier showing "Manual refresh mode" with refresh button.

### 3. Update Mobile Dashboard

**File:** `src/components/mobile/MobileDashboard.tsx`

Replace `getPollingInterval()` with tier-based logic:
- Free tier: No auto-polling, show "Tap to refresh" indicator
- Other tiers: Use tier-appropriate intervals

### 4. Update Mobile Dashboard Summary

**File:** `src/components/mobile/MobileDashboardSummary.tsx`

Remove `refetchInterval` for Free tier or use tier-based intervals.

### 5. Update Stats Charts Section

**File:** `src/components/dashboard/StatsChartsSection.tsx`

Use tier-based polling for chart data.

## Expected Cloud Savings

| Tier | Current Queries/Hour | After Optimization | Savings |
|------|---------------------|-------------------|---------|
| **Free** (SM HAIR, etc.) | ~120/org | ~0 (manual) | **100%** |
| **Basic** | ~60/org | ~12/org | **80%** |
| **Professional** (KS) | ~60/org | ~30/org | **50%** |
| **Enterprise** | ~60/org | ~60/org | 0% |

**Estimated Total Savings: 60-80% reduction in dashboard polling**

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useTierBasedRefresh.tsx` | NEW - Tier-aware polling hook |
| `src/pages/Index.tsx` | Use tier-based intervals, add Free tier banner |
| `src/components/mobile/MobileDashboard.tsx` | Use tier-based intervals |
| `src/components/mobile/MobileDashboardSummary.tsx` | Use tier-based intervals |
| `src/components/dashboard/StatsChartsSection.tsx` | Use tier-based intervals |

## User Experience for Free Tier

When an organization is on the Free tier:

1. Dashboard shows a subtle info banner: "Manual refresh mode - Data updates on page load or tap refresh"
2. A floating refresh button appears (desktop: top-right, mobile: FAB)
3. Metrics still update immediately after mutations (via `useDashboardInvalidation`)
4. User can upgrade to get real-time updates

## Technical Details

### useTierBasedRefresh Hook Implementation

```typescript
import { useOrganization } from "@/contexts/OrganizationContext";
import { useVisibilityRefetch } from "./useVisibilityRefetch";

type RefreshCategory = 'fast' | 'medium' | 'slow';

interface TierIntervals {
  fast: number | false;
  medium: number | false;
  slow: number | false;
}

const TIER_INTERVALS: Record<string, TierIntervals> = {
  enterprise: { fast: 60000, medium: 120000, slow: 300000 },
  professional: { fast: 120000, medium: 180000, slow: 300000 },
  basic: { fast: 300000, medium: 300000, slow: 600000 },
  free: { fast: false, medium: false, slow: false },
};

export const useTierBasedRefresh = () => {
  const { currentOrganization } = useOrganization();
  const tier = currentOrganization?.subscription_tier || 'free';
  
  const getBaseInterval = (category: RefreshCategory): number | false => {
    return TIER_INTERVALS[tier]?.[category] ?? false;
  };
  
  // Visibility-aware interval
  const getRefreshInterval = (category: RefreshCategory): number | false => {
    const baseInterval = getBaseInterval(category);
    return useVisibilityRefetch(baseInterval);
  };
  
  return {
    getRefreshInterval,
    getBaseInterval,
    tier,
    isManualRefreshOnly: tier === 'free',
  };
};
```

### Dashboard Update Pattern

```typescript
// In Index.tsx - replace current pattern
const { getRefreshInterval, isManualRefreshOnly } = useTierBasedRefresh();

const { data: salesData } = useQuery({
  queryKey: ["total-sales", currentOrganization?.id, startDate, endDate],
  queryFn: async () => { /* ... */ },
  enabled: !!currentOrganization,
  staleTime: 60000,
  refetchInterval: getRefreshInterval('fast'), // Tier-aware
});

// Add Free tier banner
{isManualRefreshOnly && (
  <Alert variant="info" className="mb-4">
    <Info className="h-4 w-4" />
    <AlertDescription>
      Manual refresh mode - Data updates on save or click <RefreshCw className="inline h-3 w-3" /> Refresh
    </AlertDescription>
  </Alert>
)}
```

## Testing Checklist

After implementation:
- [ ] Free tier shows "manual refresh" banner
- [ ] Free tier has no auto-polling (verify via network tab)
- [ ] Professional tier polls every 2 minutes
- [ ] Dashboard still updates immediately after save actions
- [ ] Manual refresh button works on all tiers
- [ ] Mobile dashboard respects tier settings
- [ ] Charts refresh according to tier
