

# Cloud Cost Optimization Plan

## ✅ IMPLEMENTATION COMPLETE

All phases have been implemented successfully.

---

## Summary of Changes Made

### 1. Created `useVisibilityRefetch` Hook
**File**: `src/hooks/useVisibilityRefetch.tsx`
- Tracks `document.visibilityState` to pause polling when tab is hidden
- Exports three utilities: `useVisibilityRefetch`, `useVisibilityInvalidate`, `usePageVisibility`
- Returns `false` for `refetchInterval` when tab is hidden, completely stopping background queries

### 2. Dashboard Optimizations
**File**: `src/pages/Index.tsx`
- Applied visibility-based polling to all dashboard queries
- Removed auto-refresh from count queries (customers, products, suppliers) - now on-demand only
- Added 5-minute staleTime to count queries
- Sales, purchases, and returns use `fastRefetchInterval` (60s, pauses when hidden)
- Stock, profit, cash collection, receivables use `mediumRefetchInterval` (120s, pauses when hidden)

### 3. Chart Optimizations
**File**: `src/components/dashboard/StatsChartsSection.tsx`
- Applied visibility-based polling (120s interval, pauses when hidden)
- Removed auto-refresh from top-products query (now on-demand only)

### 4. WhatsApp Optimizations
**Files**: `src/pages/WhatsAppInbox.tsx`, `src/components/FloatingWhatsAppInbox.tsx`
- Applied visibility-based polling
- Conversations: 60s interval (pauses when hidden)
- Messages: 30s interval (pauses when hidden)
- Relies primarily on Supabase Realtime for instant updates

### 5. POS Sales Optimizations
**File**: `src/pages/POSSales.tsx`
- Applied visibility-based polling (60s interval)
- Increased products staleTime from 30s to 60s
- Increased today's sales staleTime from 10s to 30s

### 6. Customer Balance Optimization
**File**: `src/hooks/useCustomerBalance.tsx`
- Increased staleTime from 30s to 60s

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

## How It Works

1. **When tab is visible**: All queries poll at their configured intervals
2. **When tab is hidden**: All polling stops completely (refetchInterval = false)
3. **When tab becomes visible again**: React Query's built-in mechanisms will refetch stale data
4. **Count queries**: Only refresh when user manually triggers or navigates to dashboard

This approach maintains real-time feel for active users while dramatically reducing costs when the app is in background or idle.
