

## Audit: Realtime Channel Pattern

### Current State
The project has exactly **one** realtime subscription in `src/pages/WhatsAppInbox.tsx` (line 222-256).

**What's correct:**
- Cleanup via `return () => { supabase.removeChannel(channel); }` ✓
- Dependency array includes `currentOrganization?.id` ✓
- Early return when no org ✓

**What's missing:**
- No `filter: \`organization_id=eq.${orgId}\`` on either `.on()` listener (lines 228-238 for `whatsapp_messages`, lines 240-249 for `whatsapp_conversations`)
- Channel name is static `'whatsapp-updates'` instead of scoped to org (risk of collision if user switches orgs without unmount)

### Fix (Single File)

**`src/pages/WhatsAppInbox.tsx`** — Two changes:

1. Add `organization_id` filter to both `.on()` calls:
```typescript
.on('postgres_changes', {
  event: '*', schema: 'public', table: 'whatsapp_messages',
  filter: `organization_id=eq.${currentOrganization.id}`
}, ...)
.on('postgres_changes', {
  event: '*', schema: 'public', table: 'whatsapp_conversations',
  filter: `organization_id=eq.${currentOrganization.id}`
}, ...)
```

2. Scope channel name to org:
```typescript
.channel(`whatsapp-updates-${currentOrganization.id}`)
```

No other files in the project use realtime channels.

