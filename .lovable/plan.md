

## Fix WhatsApp Inbox Not Showing Messages for Third-Party Providers

### Root Cause Analysis

There are two separate issues preventing messages from appearing in the inbox:

**Issue 1: Outbound messages not saved to inbox**
The `send-whatsapp` edge function saves messages to `whatsapp_logs` but never creates entries in `whatsapp_conversations` or `whatsapp_messages`. This means conversations never appear in the WhatsApp Inbox after sending an invoice.

**Issue 2: Webhook not receiving events from third-party provider**
The third-party provider (WappConnect) needs to be configured with the correct webhook URL to send events to our system. Currently, zero webhook events are being received. Additionally, the webhook URL is not displayed anywhere in the settings UI, making it impossible for users to configure their third-party provider.

### Solution

**1. Save outbound messages to inbox tables (`send-whatsapp` edge function)**

After successfully sending a template message or text message, the function will:
- Get or create a `whatsapp_conversations` record for the recipient phone
- Insert the outbound message into `whatsapp_messages`
- Update `last_message_at` on the conversation

This ensures every sent message creates a conversation visible in the inbox.

**2. Display webhook URL in WhatsApp Settings UI**

Add a "Webhook Configuration" section to the WhatsApp API Settings page that shows:
- The webhook URL the user needs to configure in their third-party provider
- The verify token
- Copy-to-clipboard buttons for easy configuration

### Files to Change

| File | Change |
|------|--------|
| `supabase/functions/send-whatsapp/index.ts` | After successful send, create/update conversation and insert message into `whatsapp_messages` |
| `src/components/WhatsAppAPISettings.tsx` | Add webhook URL display section for third-party providers |

### Technical Details

**send-whatsapp changes (after successful API response):**
```text
1. Get or create whatsapp_conversations record:
   - Look up by organization_id + customer phone
   - Create if not exists (with customer name from saleData)
   - Update last_message_at

2. Insert into whatsapp_messages:
   - direction: 'outbound'
   - message_type: 'template' or 'text'
   - message_text: the message content
   - wamid: from API response
   - status: 'sent'
```

**Webhook URL display:**
```text
Webhook URL: https://lkbbrqcsbhqjvsxiorvp.supabase.co/functions/v1/whatsapp-webhook
Verify Token: lovable_whatsapp_webhook

[Copy URL] [Copy Token]

Note: Configure this URL in your third-party provider's 
webhook settings to receive message delivery updates 
and customer replies.
```

