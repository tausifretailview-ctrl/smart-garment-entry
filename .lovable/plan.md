

## Fix: Owner WhatsApp Messages Not Routing to Organization

### Problem
When the owner sends a message (like "report" or "hi") to the WhatsApp Business API number, the system needs to first identify **which organization** this owner belongs to. Currently, routing uses customer lookups (`whatsapp_logs`, `whatsapp_conversations`, `customers` table). Since the owner is typically NOT a customer in their own system, the routing fails silently — the message is dropped with "no organization found for customer."

### Root Cause
In `supabase/functions/whatsapp-webhook/index.ts`:
- **Line 840-858**: For platform default numbers, `findOrganizationByCustomerPhone()` is called but it only checks customer-related tables
- The owner's phone number exists in the `settings` table (`owner_phone` column), but the routing function never checks it
- Same issue for shared phone numbers (line 821-837)

### Fix

**File: `supabase/functions/whatsapp-webhook/index.ts`**

1. **Add owner phone lookup** to `findOrganizationByCustomerPhone` as a new priority (Priority 4): Query the `settings` table where `owner_phone` matches the sender phone. If found, use that `organization_id` to fetch the corresponding `whatsapp_api_settings`.

```sql
-- New lookup (added as Priority 4 in the function):
SELECT organization_id FROM settings 
WHERE owner_phone ILIKE '%{cleanPhone}%'
LIMIT 1
```

2. This ensures that when an owner sends "report", "sales", etc., even if they've never been a customer, the system routes the message to their organization and the existing `handleOwnerCommand` function handles it correctly.

### Why This Works
- The `handleOwnerCommand` function (line 300) already works perfectly — it fetches `owner_phone` from settings, compares with the sender, and generates the report
- The only missing piece is the **routing step** that happens before it — the system couldn't figure out which organization the owner belongs to
- Adding the `settings.owner_phone` lookup fills this gap

### No Other Changes Needed
- The cashier report generation logic in `handleOwnerCommand` is already complete
- The `sendWhatsAppMessage` function works correctly
- Only the routing/lookup function needs the fix

