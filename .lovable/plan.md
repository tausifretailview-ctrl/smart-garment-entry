
# Cloud Usage Indicator Widget for Platform Admin Dashboard

## Overview

Add a new "Cloud Usage" widget to the Platform Admin dashboard's Settings tab that displays estimated daily database reads. Since Lovable Cloud doesn't expose direct database read metrics via API, we'll create an **estimated usage tracker** based on:

1. Active query patterns (using query fingerprinting)
2. Connection counts from the current session
3. Historical usage estimates based on user activity

---

## Implementation Approach

### Strategy: Estimate-Based Usage Widget

Since direct database read counts aren't available from the Supabase analytics API, we'll create a **usage estimation system** that:

1. Creates a `cloud_usage_logs` table to track daily aggregated estimates
2. Uses a database trigger to log significant queries (optional - for accurate tracking)
3. Displays estimated vs. actual savings from the tier-based polling optimization

---

## Technical Implementation

### 1. Database Migration

Create a new table to store daily usage metrics:

```sql
CREATE TABLE IF NOT EXISTS cloud_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  organization_id UUID REFERENCES organizations(id),
  metric_type TEXT NOT NULL, -- 'db_reads', 'api_calls', 'storage_bytes'
  count INTEGER DEFAULT 0,
  estimated BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, organization_id, metric_type)
);

-- RLS: Platform admins only
ALTER TABLE cloud_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can view all" ON cloud_usage_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'platform_admin')
  );
```

### 2. New Component: CloudUsageWidget

Create `src/components/dashboard/CloudUsageWidget.tsx`:

```text
Location: src/components/dashboard/CloudUsageWidget.tsx

Features:
- Card with "Cloud Usage" title and Activity icon
- Circular/radial progress indicator showing estimated daily reads
- Breakdown by category (Dashboard, POS, WhatsApp, Reports)
- Comparison: "Before optimization" vs "Current" savings
- Color-coded status (green/yellow/red based on usage level)
```

**Key UI Elements:**
- Daily read estimate with circular progress
- "Savings" badge showing % reduction after tier changes
- Last 7-day trend mini-chart (sparkline)
- Tier indicator showing current optimization mode

### 3. Update PlatformAdmin.tsx

Add the CloudUsageWidget to the Settings tab, alongside the existing Database Statistics section:

```text
Settings Tab Layout:
1. Cloud Usage (NEW) - Shows daily read estimates and savings
2. Audit Log (existing)
3. Database Statistics (existing)
4. Stock Reconciliation (existing)
```

### 4. Usage Estimation Logic

Create a hook `useCloudUsageEstimate.tsx`:

```text
Estimation factors:
- Active organizations count
- Users currently online (from session data)
- Polling tier for each org (free = 0 background reads)
- Historical query patterns

Formula:
  Estimated Daily Reads = 
    (Dashboard polls/hour * active hours * org count) +
    (POS searches * avg transactions) +
    (Report generations * avg complexity)
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/xxx_cloud_usage_logs.sql` | CREATE | New table for usage tracking |
| `src/components/dashboard/CloudUsageWidget.tsx` | CREATE | Main widget component |
| `src/hooks/useCloudUsageEstimate.tsx` | CREATE | Usage estimation logic |
| `src/pages/PlatformAdmin.tsx` | MODIFY | Add widget to Settings tab |

---

## Widget Design

```text
+----------------------------------+
|  Cloud Usage Today        [?]   |
|  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~   |
|                                 |
|     [===   ] 2,450 reads        |
|              ~~~~~~~~~~~~       |
|        Estimated daily usage    |
|                                 |
|  Savings: 85% vs before opt.    |
|  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~   |
|                                 |
|  By Category:                   |
|  - Dashboard: 0 (manual mode)   |
|  - POS: ~800                    |
|  - WhatsApp: 0 (manual mode)    |
|  - Reports: ~1,650 (on-demand)  |
|                                 |
|  Tier: Free (Manual Refresh)    |
+----------------------------------+
```

---

## Key Benefits

1. **Visibility**: Platform admins can monitor estimated cloud usage
2. **Savings Tracking**: Shows the impact of the tier-based optimization
3. **Category Breakdown**: Identifies which features consume the most reads
4. **Trend Analysis**: 7-day sparkline shows usage patterns over time

---

## Alternative Approach (Simpler)

If database-level tracking is too complex, we can implement a **frontend-only estimation** that:

- Counts query keys in React Query cache
- Tracks refetch calls via a global counter
- Stores daily aggregates in localStorage
- Displays approximate values with "estimated" badge

This approach requires no database changes but provides less accurate data.
