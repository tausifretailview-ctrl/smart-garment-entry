## Fix: Webhook Verification for WappConnect Provider

### Problem

The webhook URL `https://lkbbrqcsbhqjvsxiorvp.supabase.co/functions/v1/whatsapp-webhook` is failing WappConnect's verification challenge because the current code only handles **Meta's verification format** (`hub.mode`, `hub.verify_token`, `hub.challenge` query parameters). WappConnect uses a different verification method.

### Root Cause

In `supabase/functions/whatsapp-webhook/index.ts` (line 716-730):

- GET requests require `hub.mode=subscribe` + a matching `hub.verify_token` — this is Meta-specific
- If those params are missing (as WappConnect sends), it returns **403 Forbidden**
- WappConnect typically sends a simple GET or POST challenge and expects a **200 OK** response

### Fix

**File: `supabase/functions/whatsapp-webhook/index.ts**`

Update the GET handler to support both Meta and WappConnect/generic providers:

1. If Meta-style params (`hub.mode`, `hub.verify_token`) are present → use existing Meta verification logic
2. If no Meta params → return **200 OK** (accept the verification from WappConnect and other third-party providers)
3. Also handle WappConnect's POST-based challenge verification — if the POST body contains a `challenge` or `verify` field, respond with 200

This makes the webhook URL universally compatible with Meta, WappConnect, and similar providers. check do not problem in existing msg system for sending msg is working fine only need to capture customer response organization wise

### Also Provide

Display the correct webhook URL in the WhatsApp Settings page so users can easily copy it for pasting into third-party providers. The URL is:

```
https://lkbbrqcsbhqjvsxiorvp.supabase.co/functions/v1/whatsapp-webhook
```

Add a "Copy Webhook URL" button in the WhatsApp API Settings section.

### Files to Change

- **Edit**: `supabase/functions/whatsapp-webhook/index.ts` — make GET verification provider-agnostic
- **Edit**: `src/components/WhatsAppAPISettings.tsx` — add webhook URL display with copy button