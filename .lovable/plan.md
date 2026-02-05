
# Prevent Duplicate WhatsApp Messages on Invoice Edit

## Problem
When a user edits an invoice and saves it, a WhatsApp message is sent **every time**, even if a message was already sent for that invoice. This wastes WhatsApp API credits unnecessarily.

Evidence from logs shows the same invoice ID appearing 2-3 times with identical messages.

---

## Solution

Implement database-first duplicate prevention that checks if a WhatsApp message was already successfully sent for this invoice before sending another one.

---

## Changes

### 1. Edge Function: `send-whatsapp/index.ts`
Add duplicate check logic at the start of the function:

- Before sending any message with `reference_type = 'sale'`, query `whatsapp_logs` to check if a message was already sent for this invoice
- Only block duplicates for the same `template_type` (e.g., `sales_invoice`)
- Allow sending if no successful message exists (status = 'sent', 'delivered', or 'read')
- Add a configurable cooldown period (e.g., 60 minutes) to allow re-sending if customer requests

### 2. Frontend: `SalesInvoice.tsx`
Update the edit flow to NOT send WhatsApp messages automatically on invoice updates:

- On line 1576-1633: Add a check before sending
- Option A: Skip WhatsApp entirely for invoice edits (user can manually resend from dashboard)
- Option B: Add a checkbox "Resend invoice to customer" that defaults to OFF for edits

### 3. Frontend: `useSaveSale.tsx` (POS)
The POS flow only creates NEW sales, so duplicate protection is less critical here. However, for safety:

- Add a frontend ref to prevent double-sends during the same save operation
- The edge function duplicate check will handle any remaining edge cases

---

## Implementation Details

### Edge Function Duplicate Check
```typescript
// Check for existing message to prevent duplicates
if (referenceId && referenceType === 'sale') {
  const { data: existingLog } = await supabase
    .from('whatsapp_logs')
    .select('id, status, created_at')
    .eq('reference_id', referenceId)
    .eq('template_type', templateType || 'sales_invoice')
    .in('status', ['sent', 'delivered', 'read', 'pending'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingLog) {
    const hoursSinceLastSend = (Date.now() - new Date(existingLog.created_at).getTime()) / (1000 * 60 * 60);
    
    // Block if message was sent within last 60 minutes
    if (hoursSinceLastSend < 1) {
      console.log('Duplicate message blocked - message already sent recently');
      return new Response(
        JSON.stringify({ 
          success: true, 
          skipped: true,
          reason: 'Message already sent for this invoice' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }
}
```

### SalesInvoice.tsx Edit Mode
Remove automatic WhatsApp sending for invoice updates. Users can manually resend from the dashboard if needed.

```typescript
// Line ~1576-1633: REMOVE the auto-send for edits
// Instead, show a toast suggesting user can resend from dashboard
```

---

## Summary of File Changes

| File | Change |
|------|--------|
| `supabase/functions/send-whatsapp/index.ts` | Add duplicate check with 60-min cooldown before sending |
| `src/pages/SalesInvoice.tsx` | Remove auto-send WhatsApp on invoice edit |

---

## Benefits
- Prevents unnecessary WhatsApp API costs
- Customers won't receive duplicate messages for the same invoice
- Users can still manually resend from dashboard when needed
- 60-minute cooldown allows intentional re-sends without hitting duplicates
