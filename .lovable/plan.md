

## Fix: WappConnect Webhook Verification Challenge Echo

### Problem
WappConnect sends a GET request with a challenge token (as a query parameter) and expects that exact token echoed back in the response body. Our current code returns the string `"OK"` for non-Meta providers, which WappConnect interprets as a failed challenge.

The logs confirm:
- Requests ARE reaching the function (`Webhook verification accepted (third-party provider)`)
- Function returns 200 OK
- But WappConnect still shows "Failed to verify challenge" because the challenge value isn't echoed

### Fix

**File: `supabase/functions/whatsapp-webhook/index.ts`** (lines 733-735)

Update the third-party GET verification handler to:
1. Check for any `challenge` or `token` query parameter
2. Echo back that value in the response body
3. If no challenge param found, return `"OK"` as fallback

```typescript
// Replace the current simple "OK" response:
const challenge = url.searchParams.get('challenge') 
  || url.searchParams.get('verify_token')
  || url.searchParams.get('hub.challenge')
  || url.searchParams.get('token');

console.log('Webhook verification accepted (third-party provider)', 
  { params: Object.fromEntries(url.searchParams) });

return new Response(challenge || 'OK', { 
  status: 200,
  headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
});
```

Also update the POST challenge handler to properly echo back the challenge value with correct format.

### No Impact on Existing System
- Meta verification path (lines 722-730) is untouched — existing message sending continues to work
- Only the third-party verification fallback path is improved
- POST message processing is unchanged

### Files Changed
- **Edit**: `supabase/functions/whatsapp-webhook/index.ts` — echo challenge token in GET and POST verification responses

