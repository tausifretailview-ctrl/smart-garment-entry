
# Convert WhatsApp Polling to Free Tier (Manual Refresh Only)

## Current State Analysis

| Component | Current Polling | Cloud Impact |
|-----------|----------------|--------------|
| WhatsAppInbox.tsx - Conversations | 60s (visibility-aware) | ~60 queries/hour per user |
| WhatsAppInbox.tsx - Messages | 30s (visibility-aware) | ~120 queries/hour when chat open |
| FloatingWhatsAppInbox.tsx - Unread count | 60s (visibility-aware) | ~60 queries/hour per user |
| WhatsAppAPISettings.tsx - Stats | 30s (always on) | ~120 queries/hour on settings page |

**Total estimated savings**: ~360 queries/hour per active user when on WhatsApp pages

---

## Proposed Changes

### 1. WhatsAppInbox.tsx
Replace `useVisibilityRefetch` with `useTierBasedRefresh` for tier-aware polling:

```text
Before:
  const conversationsRefetchInterval = useVisibilityRefetch(60000);
  const messagesRefetchInterval = useVisibilityRefetch(30000);

After:
  const { getRefreshInterval, isManualRefreshOnly } = useTierBasedRefresh();
  
  refetchInterval: getRefreshInterval('fast')  // false for free tier
  refetchInterval: getRefreshInterval('fast')  // false for free tier
```

Add manual refresh functionality for messages (already has Refresh button for conversations).

### 2. FloatingWhatsAppInbox.tsx
Replace visibility-based polling with tier-based polling:

```text
Before:
  const whatsappRefetchInterval = useVisibilityRefetch(60000);

After:
  const { getRefreshInterval } = useTierBasedRefresh();
  refetchInterval: getRefreshInterval('medium')  // false for free tier
```

### 3. WhatsAppAPISettings.tsx
Replace hardcoded 30-second polling with tier-based:

```text
Before:
  refetchInterval: 30000

After:
  const { getRefreshInterval } = useTierBasedRefresh();
  refetchInterval: getRefreshInterval('fast')  // false for free tier
```

---

## Important Notes

### Realtime Updates Still Work
The WhatsAppInbox already has **Supabase Realtime subscriptions** (lines 223-257) that will continue to provide instant updates when messages arrive - these do NOT count as database polling queries.

### Manual Refresh Available
- Conversations list already has a "Refresh" button
- Will add refresh capability for the selected conversation's messages

---

## Technical Summary

| File | Change |
|------|--------|
| `src/pages/WhatsAppInbox.tsx` | Replace `useVisibilityRefetch` with `useTierBasedRefresh`, add manual refresh for messages |
| `src/components/FloatingWhatsAppInbox.tsx` | Replace `useVisibilityRefetch` with `useTierBasedRefresh` |
| `src/components/WhatsAppAPISettings.tsx` | Add `useTierBasedRefresh` for stats query |

**Cloud Savings**: ~100% reduction in WhatsApp background polling for all organizations (since all are now on free tier). Realtime subscriptions continue to provide instant message notifications.
