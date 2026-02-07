

# Convert All Organizations to Free Tier (Manual Refresh Only)

## Current Status

| Organization | Current Tier | Action Needed |
|--------------|--------------|---------------|
| AdTechAgency | free | ✅ Already free |
| Gurukrupa Silk Sarees | free | ✅ Already free |
| SM HAIR REPLACEMENT | free | ✅ Already free |
| Adtech-Accounts | professional | ⚠️ Convert to free |
| BOMBAY COLDCHAIN SOLUTIONS | professional | ⚠️ Convert to free |
| DEMO | professional | ⚠️ Convert to free |
| ELLA NOOR | professional | ⚠️ Convert to free |
| KS FOOTWEAR | professional | ⚠️ Convert to free |
| MIRANOS CLOTHING | professional | ⚠️ Convert to free |
| Pushpak Motor Parts | professional | ⚠️ Convert to free |
| TIRTHA COSMETICS | professional | ⚠️ Convert to free |
| YOJAK | professional | ⚠️ Convert to free |

## Implementation

### SQL Update (Direct Database Update)

```sql
UPDATE organizations 
SET subscription_tier = 'free' 
WHERE subscription_tier != 'free';
```

This will convert all 9 professional-tier organizations to free tier.

## Effect on Dashboard Polling

After this change:

| Metric | Before (9 Professional) | After (All Free) |
|--------|------------------------|------------------|
| Auto-polling queries/hour | ~540 queries | 0 queries |
| Cloud database reads | High | Minimal (on-demand only) |
| Dashboard behavior | Auto-refresh every 2 min | Manual refresh only |

## User Experience

All dashboards will now:
1. Show "Manual refresh mode" banner
2. Require clicking the Refresh button to update data
3. Still update immediately after save actions (via query invalidation)
4. Load fresh data on page load/navigation

## Cloud Savings

**Estimated: ~100% reduction in dashboard polling costs** 

No code changes required - only a database update to change the tier values.

