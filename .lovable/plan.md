

## Fix: WappConnect Challenge Parameter Misspelling

### Problem
WappConnect sends its verification challenge with a **misspelled parameter name**: `challange` instead of `challenge`. The logs prove this:

```
params: { echo: "true", challange: "9OIW3C" }
params: { echo: "true", challange: "1H86HK" }
```

Our code only checks for `challenge` (correct spelling), so it never finds the token and returns "OK" instead of echoing back the actual challenge value.

### Fix

**File: `supabase/functions/whatsapp-webhook/index.ts`**

Add `challange` (the misspelled variant) to the challenge parameter lookup:

```typescript
const thirdPartyChallenge = url.searchParams.get('challenge') 
  || url.searchParams.get('challange')  // WappConnect misspelling
  || url.searchParams.get('verify_token')
  || url.searchParams.get('hub.challenge')
  || url.searchParams.get('token');
```

This single line addition will make the webhook correctly echo back `9OIW3C` (or whatever token WappConnect sends), passing verification.

### No Impact on Existing System
- Meta verification path is untouched
- Message sending continues to work
- Only the third-party GET verification fallback is updated

### Files Changed
- **Edit**: `supabase/functions/whatsapp-webhook/index.ts` — add misspelled `challange` param check

