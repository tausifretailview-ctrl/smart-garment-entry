

## Support Third-Party WhatsApp API Providers (Custom Webhook URL)

### Problem
Currently, the WhatsApp integration only supports direct Meta Cloud API with a permanent access token. Some users use third-party providers (like WappConnect, Wati, etc.) that provide:
- A custom API URL (e.g., `https://crmapi.wappconnect.com/api/meta`)
- A configurable API version (e.g., `v19.0`)
- A temporary access token (that may need periodic renewal)
- A Business ID (separate from WABA ID)

These users cannot configure their WhatsApp integration because the edge function hardcodes the Meta Graph API URL.

### Solution

**1. Add new columns to `whatsapp_api_settings` table**
- `api_provider` (text, default `'meta_direct'`) -- values: `meta_direct` or `third_party`
- `custom_api_url` (text, nullable) -- e.g., `https://crmapi.wappconnect.com/api/meta`
- `api_version` (text, default `'v21.0'`) -- e.g., `v19.0`, `v21.0`
- `business_id` (text, nullable) -- Third-party Business ID

**2. Update WhatsApp API Settings UI (`WhatsAppAPISettings.tsx`)**
- Add a provider selection toggle: "Direct Meta API" vs "Third-Party Provider"
- When "Third-Party" is selected, show additional fields:
  - Custom API URL (required)
  - API Version (default v21.0)
  - Business ID
- Show a note that third-party tokens may be temporary and need renewal
- Keep the existing fields (Phone Number ID, WABA ID, Access Token) visible for both modes

**3. Update `send-whatsapp` edge function**
- Instead of hardcoding `https://graph.facebook.com/v21.0/`, build the API URL dynamically:
  - If `custom_api_url` is set: use `{custom_api_url}/{api_version}/{phone_number_id}/messages`
  - If not set (direct Meta): use `https://graph.facebook.com/{api_version}/{phone_number_id}/messages`
- Apply the same logic to all API calls in the function (message sending, media upload, template fetching)

**4. Update Platform Settings (`PlatformWhatsAppSettings.tsx`)**
- Add the same provider selection and custom URL fields for the platform-level default

### Files to Change

| File | Change |
|------|--------|
| Database migration | Add `api_provider`, `custom_api_url`, `api_version`, `business_id` columns |
| `src/components/WhatsAppAPISettings.tsx` | Add provider toggle, custom API URL fields, API version, Business ID |
| `src/hooks/useWhatsAppAPI.tsx` | Add new fields to WhatsAppSettings interface and form data handling |
| `supabase/functions/send-whatsapp/index.ts` | Build API URL dynamically from settings; apply to all Meta API calls |
| `src/components/PlatformWhatsAppSettings.tsx` | Add same fields for platform-level default settings |

### Technical Details

**Dynamic API URL construction (send-whatsapp edge function):**
```text
Current (hardcoded):
  metaApiUrl = "https://graph.facebook.com/v21.0/{phone_number_id}/messages"

New (dynamic):
  baseUrl = settings.custom_api_url || "https://graph.facebook.com"
  version = settings.api_version || "v21.0"
  metaApiUrl = "{baseUrl}/{version}/{phone_number_id}/messages"
```

This applies to 4 locations in the edge function:
1. Main message sending (line 651)
2. Media upload for PDF (line 226)
3. Template metadata fetch (line 62)
4. Document header template sending (line 262)

**UI layout for third-party mode:**
```text
API Provider: [Direct Meta API] [Third-Party Provider]

-- When Third-Party selected --
Custom API URL:  [https://crmapi.wappconnect.com/api/meta]
API Version:     [v19.0]
Business ID:     [24732513237950]
Phone Number ID: [997588563431761]
WABA ID:         [2393068857780985]
Access Token:    [••••••••••••••••] (Note: May be temporary)
```

**Form data additions:**
```typescript
api_provider: "meta_direct" | "third_party",
custom_api_url: "",
api_version: "v21.0",
business_id: "",
```

