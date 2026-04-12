

## Add Organization Logo to WhatsApp Messages

### Current State
- **Logo storage**: Already uploaded by users in Settings → stored in `settings.bill_barcode_settings.logo_url` (public Supabase storage URL)
- **Edge function**: `send-whatsapp` already handles `imageUrl` + `imageCaption` — sends the image before the text/document message
- **Hook**: `useWhatsAppAPI` already accepts `imageUrl` param
- **Gap**: The auto-send flow in `useSaveSale.tsx` never fetches or passes the logo URL

### Changes

**File: `src/hooks/useSaveSale.tsx`**

1. In the WhatsApp auto-send block (~line 418), the code already fetches `companySettings` from the `settings` table. Extend that query to also select `bill_barcode_settings` (which contains `logo_url`).

2. Extract `logoUrl` from `companySettings.bill_barcode_settings?.logo_url`.

3. Pass `imageUrl: logoUrl` in both Flow A (utility template, ~line 467) and Flow B (PDF document template, ~line 544) `supabase.functions.invoke('send-whatsapp')` calls. The edge function will send the logo image before the main message automatically.

### Result
- If the org has a logo uploaded → it's sent as a WhatsApp image before the invoice message
- If no logo → nothing changes (imageUrl is undefined, edge function skips it)
- No new settings needed — uses existing logo upload

