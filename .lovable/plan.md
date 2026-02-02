

# Cloud Cost Optimization Plan

## Overview
This plan identifies and addresses remaining opportunities to reduce Lovable Cloud usage costs through query optimization, polling reduction, and smart caching strategies.

## Current State Analysis

Your application already has several optimizations in place:
- **Global QueryClient defaults**: 30s staleTime, 5m gcTime, no window-focus refetch
- **Dashboard intervals**: FAST=60s, MEDIUM=120s, SLOW=300s (previously 15-60s)
- **WhatsApp polling**: Reduced to 30-60s intervals

However, there are still opportunities for further cost reduction.

---

## Phase 1: Visibility-Based Query Pausing

**Problem**: Queries continue polling even when the browser tab is hidden, wasting resources.

**Solution**: Create a custom hook that pauses all auto-refetch when the tab is not visible.

### Implementation Details

1. **Create `useVisibilityPause` hook** - A centralized solution that:
   - Tracks `document.visibilityState`
   - Returns `false` for `refetchInterval` when tab is hidden
   - Triggers refetch when tab becomes visible again

2. **Update high-frequency queries** - Apply to:
   - Dashboard metrics (Index.tsx)
   - WhatsApp inbox polling
   - POS sales product lookups
   - Charts and stats sections

---

## Phase 2: Conditional Polling Based on Data Freshness

**Problem**: Fixed polling intervals waste requests when data hasn't changed.

**Solution**: Implement smart polling that increases intervals when no changes detected.

### Implementation Details

1. **POS Sales Optimizations**:
   - Products query: Increase staleTime from 10s → 60s
   - Invoices query: Reduce refetchInterval from 30s → 60s
   - Held sales: No auto-refresh needed (user-triggered)

2. **Dashboard Optimizations**:
   - Counts (customers, products, suppliers): Remove auto-refetch entirely (only refresh on navigation or manual trigger)
   - Stock value: Increase to SLOW interval (300s)

3. **WhatsApp Inbox**:
   - Rely primarily on Supabase Realtime for instant updates
   - Increase fallback polling to 60s for conversations, 30s for messages

---

## Phase 3: Query Deduplication and Batching

**Problem**: Similar queries being made from multiple components.

**Solution**: Consolidate related queries and use shared query keys.

### Implementation Details

1. **Consolidate settings queries**:
   - Multiple pages fetch `settings` independently
   - Create shared `useOrgSettings` hook with longer cache

2. **Batch customer balance checks**:
   - `useCustomerBalances` already exists but can be optimized
   - Increase staleTime to 60s for balance data

---

## Phase 4: Remove Unnecessary Auto-Refresh

**Problem**: Some data rarely changes but still auto-refreshes.

**Solution**: Convert to on-demand refresh only.

### Queries to Convert

| Query | Current Interval | Recommended |
|-------|-----------------|-------------|
| customers-count | 300s (SLOW) | No auto-refresh |
| suppliers-count | 300s (SLOW) | No auto-refresh |
| products-count | 300s (SLOW) | No auto-refresh |
| top-products | 180s | No auto-refresh |
| whatsapp-api-settings | N/A | Already optimal |

These counts change infrequently and should only update when:
- User navigates to dashboard
- User clicks manual refresh button
- User completes a relevant action (add customer, etc.)

---

## Technical Implementation

### Files to Modify

1. **New Hook**: `src/hooks/useVisibilityRefetch.tsx`
2. **Dashboard**: `src/pages/Index.tsx`
3. **Charts**: `src/components/dashboard/StatsChartsSection.tsx`
4. **WhatsApp**: `src/pages/WhatsAppInbox.tsx`, `src/components/FloatingWhatsAppInbox.tsx`
5. **POS**: `src/pages/POSSales.tsx`

### Code Pattern Example

```typescript
// useVisibilityRefetch.tsx
export const useVisibilityRefetch = (baseInterval: number) => {
  const [isVisible, setIsVisible] = useState(!document.hidden);
  
  useEffect(() => {
    const handler = () => setIsVisible(!document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);
  
  // Return false to disable polling when hidden
  return isVisible ? baseInterval : false;
};
```

---

## Expected Cost Savings

| Optimization | Estimated Reduction |
|--------------|-------------------|
| Visibility-based pausing | 30-50% during idle tabs |
| Removing count auto-refresh | 15-20% |
| Increasing POS cache times | 10-15% |
| Smart WhatsApp polling | 10-15% |
| **Total Estimated Savings** | **40-60%** |

---

## Summary of Changes

1. Create `useVisibilityRefetch` hook for tab-aware polling
2. Remove `refetchInterval` from count queries (customers, products, suppliers)
3. Increase POS product staleTime from 10s to 60s
4. Apply visibility pause to all dashboard queries
5. Increase WhatsApp fallback polling intervals
6. Add visibility pause to chart data queries

These changes maintain real-time feel for active users while dramatically reducing costs when the app is in background or idle.

