

## Fix: WhatsApp Message Status Incorrectly Marked as Failed

### Problem
The `send-whatsapp` edge function only recognizes the direct Meta API response format (`responseData.messages[0].id`). When using a provider/BSP that wraps the Meta API (returning `{ message: { queue_id, message_status: "queued" } }`), the success check fails and the message is marked as "failed" with "Unknown error from Meta API" — even though the message was actually delivered.

### Solution

**File: `supabase/functions/send-whatsapp/index.ts` (line ~1055)**

Update the success detection logic to handle both response formats:

1. **Direct Meta API format**: `responseData.messages?.[0]?.id` exists
2. **BSP/provider format**: `responseData.message?.message_status === "queued"` or `responseData.message?.queue_id` exists

```
// Current (only handles direct Meta format):
if (response.ok && responseData.messages?.[0]?.id) {
  updateData.status = 'sent';
  updateData.wamid = responseData.messages[0].id;
} else {
  updateData.status = 'failed';
  ...
}

// Fixed (handles both formats):
if (response.ok && responseData.messages?.[0]?.id) {
  updateData.status = 'sent';
  updateData.wamid = responseData.messages[0].id;
} else if (response.ok && responseData.message?.message_status === 'queued') {
  updateData.status = 'sent';
  updateData.wamid = responseData.message.queue_id || '';
} else {
  updateData.status = 'failed';
  ...
}
```

Also apply the same fix to the return response block (~line 1069) so it doesn't return a failure response when the BSP format indicates success.

### Scope
- Only `supabase/functions/send-whatsapp/index.ts` — status detection logic
- No UI, layout, or other file changes

