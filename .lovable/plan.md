

# Mobile Dashboard Performance Optimization Plan

## Overview

Optimize the Ezzy ERP mobile dashboard for low-memory Android devices and slow networks (3G/4G) with lazy loading, error handling, retry mechanisms, and lightweight data fetching.

---

## Current Issues Identified

| Issue | Current State | Impact |
|-------|---------------|--------|
| **Heavy API calls on load** | 4 parallel queries + summary component queries | Slow initial render on 3G |
| **No error handling in cards** | API failure shows loading forever | Poor UX |
| **No retry mechanism** | Failed queries stay failed | Users must refresh |
| **Summary loads immediately** | MobileDashboardSummary makes 3 DB calls on mount | Extra latency |
| **ErrorBoundary is basic** | No retry button, no friendly message | Confusing for users |
| **Stock value query is heavy** | Fetches all product variants | Memory intensive |

---

## Implementation Plan

### 1. Create Mobile-Optimized Error Boundary

**New File**: `src/components/mobile/MobileErrorBoundary.tsx`

Mobile-friendly error UI with:
- Friendly error message with icon
- Retry button to reload component
- "Go Home" fallback button
- Network status indicator
- Touch-optimized styling

```text
┌────────────────────────────────────┐
│                                    │
│         ⚠️ Oops!                   │
│                                    │
│   Something went wrong.            │
│   Please check your connection.    │
│                                    │
│      [ 🔄 Try Again ]              │
│      [ 🏠 Go Home ]                │
│                                    │
└────────────────────────────────────┘
```

### 2. Add API Error Card Component

**New File**: `src/components/mobile/MobileDashboardErrorCard.tsx`

Fallback UI when individual card API fails:
- Shows card with error state
- Retry button on the card
- Shows last known value if available
- Network offline indicator

### 3. Optimize MobileDashboard with Lazy Loading

**File**: `src/components/mobile/MobileDashboard.tsx`

Changes:
- Remove heavy queries from initial load
- Use lightweight COUNT queries instead of fetching all rows
- Add visibility-aware polling (pause when hidden)
- Implement stale-while-revalidate pattern
- Lazy load MobileDashboardSummary only when scrolled into view

**Optimized Data Fetching Strategy**:
```text
Initial Load (Priority 1 - Instant):
├── Today's Sales → SELECT SUM(net_amount) with date filter
├── Total Products → SELECT COUNT(*) from products
├── Cash Balance → Lightweight aggregation
└── Pending Bills → SELECT COUNT(*) with status filter

Lazy Load (Priority 2 - On Scroll):
└── MobileDashboardSummary → Load when visible
```

### 4. Use Lightweight Aggregate Queries

Replace heavy queries with optimized versions:

| Current Query | Optimized Query |
|---------------|-----------------|
| Fetch all sales → sum | `SELECT COALESCE(SUM(net_amount), 0)` via RPC |
| Fetch all variants → calculate stock | Use pre-aggregated count or limit |
| Fetch all pending sales | `SELECT COUNT(*)` with head:true |

### 5. Implement Query Retry with Fallback

**Update**: `src/components/mobile/MobileDashboardCard.tsx`

Add error state handling:
- `isError` prop for failed queries
- `onRetry` callback for retry button
- Fallback to cached/stale data
- Offline indicator when network unavailable

### 6. Add Network-Aware Loading

**New File**: `src/hooks/useNetworkStatus.tsx`

Hook to detect:
- Online/offline status
- Connection type (3G/4G/WiFi via navigator.connection)
- Slow network mode (reduce polling frequency)

### 7. Wrap Dashboard in Error Boundary

**File**: `src/pages/Index.tsx`

Wrap MobileDashboard with MobileErrorBoundary:
```tsx
if (isMobile) {
  return (
    <MobileErrorBoundary>
      <MobileDashboard />
    </MobileErrorBoundary>
  );
}
```

### 8. Optimize MobileDashboardSummary

**File**: `src/components/mobile/MobileDashboardSummary.tsx`

Changes:
- Accept `isVisible` prop to prevent loading when off-screen
- Reduce query complexity
- Add error/retry state
- Use staleTime to reduce refetches

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/mobile/MobileErrorBoundary.tsx` | Mobile-friendly error boundary with retry |
| `src/components/mobile/MobileDashboardErrorCard.tsx` | Error state for individual metric cards |
| `src/hooks/useNetworkStatus.tsx` | Network detection hook |

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/mobile/MobileDashboard.tsx` | Lightweight queries, lazy loading, error handling |
| `src/components/mobile/MobileDashboardCard.tsx` | Add error state, retry button |
| `src/components/mobile/MobileDashboardSummary.tsx` | Lazy loading, optimized queries |
| `src/pages/Index.tsx` | Wrap with MobileErrorBoundary |
| `src/components/mobile/index.ts` | Export new components |

---

## Technical Implementation Details

### MobileErrorBoundary Component
```tsx
class MobileErrorBoundary extends Component<Props, State> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
          <AlertTriangle className="h-16 w-16 text-warning mb-4" />
          <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
          <p className="text-sm text-muted-foreground text-center mb-6">
            Please check your internet connection and try again.
          </p>
          <Button onClick={this.handleRetry} className="mb-3">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
          <Button variant="outline" onClick={() => window.location.href = '/'}>
            Go to Home
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

### Optimized Dashboard Queries
```tsx
// Lightweight query - uses COUNT instead of fetching rows
const { data: productCount, isLoading, isError, refetch } = useQuery({
  queryKey: ["mobile-product-count", organizationId],
  queryFn: async () => {
    const { count, error } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("deleted_at", null);
    
    if (error) throw error;
    return count || 0;
  },
  enabled: !!organizationId,
  staleTime: 300000, // 5 minutes - products don't change often
  retry: 2, // Retry twice on failure
});
```

### Network Status Hook
```tsx
export const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSlowConnection, setIsSlowConnection] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Check connection speed if available
    const connection = (navigator as any).connection;
    if (connection) {
      const checkSpeed = () => {
        setIsSlowConnection(
          connection.effectiveType === "2g" || 
          connection.effectiveType === "slow-2g"
        );
      };
      connection.addEventListener("change", checkSpeed);
      checkSpeed();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline, isSlowConnection };
};
```

### Enhanced Dashboard Card with Error State
```tsx
export const MobileDashboardCard = ({
  title,
  value,
  icon: Icon,
  color,
  bgColor,
  onClick,
  isCurrency,
  isLoading,
  isError,
  onRetry
}: MobileDashboardCardProps) => {
  if (isError) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center bg-destructive/10")}>
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{title}</p>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={(e) => { e.stopPropagation(); onRetry?.(); }}
            className="mt-1 h-7 text-xs"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }
  // ... existing render logic
};
```

### Lazy Loading Summary with Intersection Observer
```tsx
// In MobileDashboard.tsx
const [summaryVisible, setSummaryVisible] = useState(false);
const summaryRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        setSummaryVisible(true);
        observer.disconnect();
      }
    },
    { threshold: 0.1 }
  );

  if (summaryRef.current) {
    observer.observe(summaryRef.current);
  }

  return () => observer.disconnect();
}, []);

// In render:
<div ref={summaryRef} className="px-4 py-3">
  {summaryVisible ? <MobileDashboardSummary /> : <SummarySkeleton />}
</div>
```

---

## Performance Optimizations Summary

| Optimization | Benefit |
|--------------|---------|
| COUNT queries instead of SELECT * | 90% less data transfer |
| Visibility-aware polling | No background requests when hidden |
| 5-min staleTime for products | Reduces API calls |
| Lazy load summary section | Faster initial render |
| Retry mechanism | Self-healing on failures |
| Network detection | Graceful offline handling |
| Error boundaries | No blank screens |

---

## Mobile/Android WebView Compatibility

1. **HTTPS**: All Supabase calls use HTTPS by default
2. **Token Refresh**: Already implemented in AuthContext with cross-tab coordination
3. **Memory Optimization**: Lighter queries, no chart loading
4. **3G/4G Support**: Network detection adjusts polling frequency
5. **Offline Fallback**: Shows cached data with "Offline" indicator

---

## Metric Cards Configuration

| Card | Query Type | staleTime | Polling |
|------|------------|-----------|---------|
| Today's Sales | SUM aggregate | 60s | 60s (visible only) |
| Total Products | COUNT | 5min | None |
| Cash Balance | SUM aggregate | 60s | 60s (visible only) |
| Pending Bills | COUNT | 2min | 2min (visible only) |

