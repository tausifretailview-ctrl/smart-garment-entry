

# Cloud Usage Optimization Plan for Ezzy ERP

## Overview

Based on analysis of your codebase, I've identified several areas consuming significant cloud resources. The $60.26 cloud usage is primarily driven by:

1. **Aggressive Dashboard Polling** - 12+ database queries every 15-30 seconds
2. **WhatsApp Inbox Polling** - 5-second refresh intervals  
3. **Chart Data Polling** - Multiple queries every 15 seconds
4. **Unused Realtime Subscriptions** - Active even when not viewing the page
5. **Console Logging in Production** - Over 400 console.log statements

---

## High-Impact Changes (Phase 1)

### 1. Reduce Dashboard Polling Frequency

**Current State:**
- `REFRESH_INTERVALS.FAST = 15000` (15 seconds) - 4 queries
- `REFRESH_INTERVALS.MEDIUM = 30000` (30 seconds) - 5 queries  
- `REFRESH_INTERVALS.SLOW = 60000` (60 seconds) - 3 queries
- **Total: ~12 queries every 15-60 seconds**

**Optimized State:**
```
FAST: 60000 (1 minute) → For sales, purchases
MEDIUM: 120000 (2 minutes) → For stock, profit, receivables  
SLOW: 300000 (5 minutes) → For counts (customers, suppliers, products)
```

**Estimated Savings:** ~70% reduction in dashboard database calls

### 2. Fix WhatsApp Inbox Aggressive Polling

**Current State:**
- Conversations: `refetchInterval: 5000` (every 5 seconds)
- Messages: `refetchInterval: 5000` (every 5 seconds)
- FloatingWhatsAppInbox: `refetchInterval: 30000` (every 30 seconds)

**Optimized State:**
- Conversations: `refetchInterval: 30000` (30 seconds)
- Messages: `refetchInterval: 15000` (15 seconds) - only when conversation is open
- Use Supabase Realtime for instant updates instead of polling

**Estimated Savings:** ~80% reduction in WhatsApp-related queries

### 3. Optimize Chart Section Polling

**Current State:**
- Sales trend: 15 seconds
- Purchase trend: 15 seconds  
- Top products: 30 seconds

**Optimized State:**
- All chart queries: 120 seconds (2 minutes)
- Add `staleTime: 60000` to prevent redundant refetches

**Estimated Savings:** ~75% reduction in chart queries

---

## Medium-Impact Changes (Phase 2)

### 4. Add Visibility-Based Query Pausing

Only poll data when the user is actively viewing the tab:

```typescript
// Add to all polling queries
refetchInterval: document.hidden ? false : 60000,
refetchOnWindowFocus: true,
```

**Benefit:** Zero queries when tab is in background

### 5. Remove Unused console.log Statements

**Current State:** 400+ console.log statements across 24 files

**Action:** Remove or conditionally disable in production:
- `src/hooks/useSaveSale.tsx` - 10 logs
- `src/hooks/useStockValidation.tsx` - 4 logs  
- `src/hooks/useUserRoles.tsx` - 2 logs
- `src/components/BarTenderLabelDesigner.tsx` - 3 logs
- And 20+ other files

### 6. Optimize POS Sales Page Polling

**Current State:**
- Customers query: `staleTime: 10000`, `refetchInterval: 30000`
- Products query: `staleTime: 30000`, `refetchInterval: 60000`
- Timer interval: Updates every 1 second

**Optimized State:**
- Customers: `staleTime: 60000`, `refetchInterval: 120000`
- Products: `staleTime: 120000`, `refetchInterval: 300000`

---

## Low-Impact Changes (Phase 3)

### 7. Implement Query Deduplication

Add global staleTime to QueryClient:

```typescript
const [queryClient] = useState(() => new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 seconds default
      gcTime: 300000, // 5 minutes garbage collection
      refetchOnWindowFocus: false,
    },
  },
}));
```

### 8. Lazy Load Heavy Reports

Reports that consume significant queries:
- ItemWiseSalesReport
- NetProfitAnalysis
- GSTReports
- AccountingReports

These should only fetch data when explicitly requested, not on page load.

### 9. Batch API Calls

Combine multiple dashboard queries into a single aggregated query using a database function or edge function.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Index.tsx` | Increase REFRESH_INTERVALS, add staleTime |
| `src/pages/WhatsAppInbox.tsx` | Reduce polling from 5s to 30s, add realtime |
| `src/components/FloatingWhatsAppInbox.tsx` | Increase refetch interval |
| `src/components/dashboard/StatsChartsSection.tsx` | Reduce chart polling frequency |
| `src/pages/POSSales.tsx` | Increase staleTime and refetch intervals |
| `src/App.tsx` | Add global QueryClient defaults |
| Multiple files | Remove console.log statements |

---

## Technical Details

### Current Query Frequency Analysis

| Query Type | Current Interval | Queries/Hour | Optimized Interval | Queries/Hour |
|------------|-----------------|--------------|-------------------|--------------|
| Dashboard Sales | 15s | 240 | 60s | 60 |
| Dashboard Stock | 30s | 120 | 120s | 30 |
| Dashboard Counts | 60s | 60 | 300s | 12 |
| Charts (3 queries) | 15-30s | 360 | 120s | 90 |
| WhatsApp Conv. | 5s | 720 | 30s | 120 |
| WhatsApp Messages | 5s | 720 | 15s | 240 |
| **Total** | - | **~2,220/hr** | - | **~552/hr** |

**Projected Savings: ~75% reduction in database queries**

### Visibility-Based Optimization

When implementing tab visibility detection, queries will pause completely when:
- User switches to another browser tab
- User minimizes the browser
- Screen is locked

This alone can reduce queries by 50-80% for users who keep the app open in background.

---

## Expected Outcome

After implementing all optimizations:
- **Database queries:** Reduced by ~75%
- **Edge function calls:** Reduced by ~60% (WhatsApp polling)
- **Estimated cloud cost:** $15-20/month (down from $60)

---

## Implementation Priority

1. **Immediate** (Today): Dashboard polling intervals, WhatsApp polling
2. **This Week**: Console.log cleanup, visibility detection
3. **Next Week**: Query batching, lazy loading reports

